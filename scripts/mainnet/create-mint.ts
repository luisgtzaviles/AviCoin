import { loadExternalKeypair } from "../lib/solana.js";
import { assertOnlyArguments, confirmMutation, executeAfterDryRunRequested, executeGuarded, safeOperationSummary } from "../lib/safety.js";
import { createMintPlan, fetchAndAssertMint, signAndSend, simulateUnsigned } from "../lib/mainnet-token.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertStateAllows, loadMainnetState, writeMainnetState } from "../lib/state.js";
import { mainnetRuntime } from "./common.js";

export async function main(): Promise<void> {
  assertOnlyArguments(process.argv.slice(2), ["--dry-run", "--execute-after-dry-run"]);
  const state = await loadMainnetState();
  assertStateAllows(state, "create-mint");
  const runtime = await mainnetRuntime("create-mint", { decimals: 9, supply: "0", freezeAuthority: null });
  if (!runtime.config.AVICOIN_MINT_KEYPAIR_PATH) throw new Error("Falta AVICOIN_MINT_KEYPAIR_PATH; el programa no generará un mint keypair.");
  const mint = await loadExternalKeypair(runtime.config.AVICOIN_MINT_KEYPAIR_PATH);
  const existing = await runtime.connection.getAccountInfo(mint.publicKey, "confirmed");
  if (existing) throw new Error("La dirección de mint propuesta ya tiene una cuenta; no se intentará reemplazarla.");
  const instructions = await createMintPlan(runtime.connection, runtime.operator.publicKey, mint.publicKey);
  console.table(safeOperationSummary({ ...runtime.context, parameters: { ...runtime.context.parameters, mintAddress: mint.publicKey.toBase58() } }));
  const guarded = await executeGuarded({
    dryRun: runtime.dryRun,
    executeAfterDryRun: executeAfterDryRunRequested(),
    context: { ...runtime.context, parameters: { ...runtime.context.parameters, mintAddress: mint.publicKey.toBase58() } },
    simulate: async () => `Simulación correcta (${(await simulateUnsigned(runtime.connection, runtime.operator.publicKey, instructions)).length} logs)`,
    confirm: () => confirmMutation(runtime.config, "CREAR MINT MAINNET"),
    execute: async () => {
      const signature = await signAndSend(runtime.connection, runtime.operator, instructions, [mint]);
      await fetchAndAssertMint(runtime.connection, mint.publicKey, { authority: runtime.operator.publicKey.toBase58(), supply: 0n });
      await writeMainnetState({ ...state, production_wallet: runtime.operator.publicKey.toBase58(), avi_mint: mint.publicKey.toBase58(), mint_created: true });
      return signature;
    },
  });
  console.log(guarded.mode === "dry-run" ? `Dry-run PASS. Recibo: ${guarded.receipt}` : `Transacción enviada: ${guarded.result}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
