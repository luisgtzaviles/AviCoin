import { PublicKey } from "@solana/web3.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { fetchAndAssertMint, revokeMintAuthorityPlan, signAndSend, simulateUnsigned } from "../lib/mainnet-token.js";
import { assertOnlyArguments, confirmMutation, executeAfterDryRunRequested, executeGuarded, safeOperationSummary } from "../lib/safety.js";
import { assertStateAllows, loadMainnetState, writeMainnetState } from "../lib/state.js";
import { mainnetRuntime } from "./common.js";
import { assertMainnetMetadata } from "../lib/mainnet-metadata.js";

export async function main(): Promise<void> {
  assertOnlyArguments(process.argv.slice(2), ["--dry-run", "--execute-after-dry-run"]);
  const state = await loadMainnetState();
  assertStateAllows(state, "revoke-mint-authority");
  if (!state.metadata_created || !state.metadata_pda) throw new Error("La metadata mainnet debe estar confirmada antes de revocar.");
  if (!state.supply_minted) throw new Error("No se puede revocar antes de confirmar el supply fijo.");
  if (state.mint_authority_revoked) throw new Error("La mint authority ya figura revocada.");
  const mint = new PublicKey(state.avi_mint as string);
  const runtime = await mainnetRuntime("revoke-mint-authority", { mintAddress: mint.toBase58(), newMintAuthority: null });
  const metadataPda = await assertMainnetMetadata(runtime.config.SOLANA_RPC_URL, mint.toBase58(), runtime.config.TOKEN_METADATA_URI);
  if (metadataPda !== state.metadata_pda) throw new Error("La metadata PDA on-chain no coincide con el estado registrado.");
  const instructions = await revokeMintAuthorityPlan(runtime.connection, runtime.operator.publicKey, mint);
  console.table(safeOperationSummary(runtime.context));
  const guarded = await executeGuarded({
    dryRun: runtime.dryRun,
    executeAfterDryRun: executeAfterDryRunRequested(),
    context: runtime.context,
    simulate: async () => `Simulación correcta (${(await simulateUnsigned(runtime.connection, runtime.operator.publicKey, instructions)).length} logs)`,
    confirm: () => confirmMutation(runtime.config, "REVOCAR MINT AUTHORITY"),
    execute: async () => {
      const signature = await signAndSend(runtime.connection, runtime.operator, instructions);
      await fetchAndAssertMint(runtime.connection, mint, { authority: null, supply: 1_000_000_000_000n });
      await writeMainnetState({ ...state, mint_authority_revoked: true });
      return signature;
    },
  });
  console.log(guarded.mode === "dry-run" ? `Dry-run PASS. Recibo: ${guarded.receipt}` : `Transacción enviada: ${guarded.result}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
