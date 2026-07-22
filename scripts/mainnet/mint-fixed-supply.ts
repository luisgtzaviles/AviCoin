import { PublicKey } from "@solana/web3.js";
import { MAINNET_FIXED_SUPPLY_BASE_UNITS } from "../../config/mainnet.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { fetchAndAssertMint, fixedSupplyPlan, signAndSend, simulateUnsigned } from "../lib/mainnet-token.js";
import { assertOnlyArguments, confirmMutation, executeAfterDryRunRequested, executeGuarded, safeOperationSummary } from "../lib/safety.js";
import { assertStateAllows, loadMainnetState, writeMainnetState } from "../lib/state.js";
import { mainnetRuntime } from "./common.js";
import { assertMainnetMetadata } from "../lib/mainnet-metadata.js";

export async function main(): Promise<void> {
  assertOnlyArguments(process.argv.slice(2), ["--dry-run", "--execute-after-dry-run"]);
  const state = await loadMainnetState();
  assertStateAllows(state, "mint-fixed-supply");
  if (!state.metadata_created || !state.metadata_pda) throw new Error("La metadata mainnet debe estar confirmada antes de emitir.");
  if (state.supply_minted) throw new Error("El estado ya registra el supply fijo; se rechaza una segunda emisión.");
  const mint = new PublicKey(state.avi_mint as string);
  const runtime = await mainnetRuntime("mint-fixed-supply", { mintAddress: mint.toBase58(), amountBaseUnits: MAINNET_FIXED_SUPPLY_BASE_UNITS.toString() });
  const metadataPda = await assertMainnetMetadata(runtime.config.SOLANA_RPC_URL, mint.toBase58(), runtime.config.TOKEN_METADATA_URI);
  if (metadataPda !== state.metadata_pda) throw new Error("La metadata PDA on-chain no coincide con el estado registrado.");
  const plan = await fixedSupplyPlan(runtime.connection, runtime.operator.publicKey, mint);
  console.table(safeOperationSummary({ ...runtime.context, parameters: { ...runtime.context.parameters, destinationAta: plan.ata.toBase58() } }));
  const guarded = await executeGuarded({
    dryRun: runtime.dryRun,
    executeAfterDryRun: executeAfterDryRunRequested(),
    context: { ...runtime.context, parameters: { ...runtime.context.parameters, destinationAta: plan.ata.toBase58() } },
    simulate: async () => `Simulación correcta (${(await simulateUnsigned(runtime.connection, runtime.operator.publicKey, plan.instructions)).length} logs)`,
    confirm: () => confirmMutation(runtime.config, "EMITIR SUPPLY FIJO 1000 AVI"),
    execute: async () => {
      const signature = await signAndSend(runtime.connection, runtime.operator, plan.instructions);
      await fetchAndAssertMint(runtime.connection, mint, { authority: runtime.operator.publicKey.toBase58(), supply: MAINNET_FIXED_SUPPLY_BASE_UNITS });
      await writeMainnetState({ ...state, avi_ata: plan.ata.toBase58(), supply_minted: true });
      return signature;
    },
  });
  console.log(guarded.mode === "dry-run" ? `Dry-run PASS. Recibo: ${guarded.receipt}` : `Transacción enviada: ${guarded.result}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
