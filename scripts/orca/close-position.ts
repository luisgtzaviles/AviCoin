import { address, createNoopSigner } from "@solana/kit";
import { closePositionInstructions, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState, writeMainnetState } from "../lib/state.js";
import { runOrcaOperation } from "./guarded-operation.js";

export async function main(): Promise<void> {
  const state = await loadMainnetState();
  if (!state.position_opened || !state.position) throw new Error("No hay una posición confirmada para cerrar.");
  await runOrcaOperation("close-position", { position: state.position, closeOnlyWhenFullyWithdrawn: true }, async (runtime) => {
    const plan = await closePositionInstructions(kitRpc(runtime.config.SOLANA_RPC_URL), address(state.position as string), {
      slippageToleranceBps: 100,
      authority: createNoopSigner(address(runtime.operator.toBase58())),
      whirlpoolDeployment: WhirlpoolDeployment.mainnet,
    });
    if (plan.quote.liquidityDelta > 0n) throw new Error("La posición aún tiene liquidez; disminúyela mediante una operación separada antes de cerrar.");
    return plan.instructions;
  }, async () => writeMainnetState({ ...state, position: null, position_opened: false, liquidity_added: false }));
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
