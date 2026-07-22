import { address, createNoopSigner } from "@solana/kit";
import { increaseLiquidityInstructions, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertDepositWithinLimits, poolDesign } from "../lib/orca.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState, writeMainnetState } from "../lib/state.js";
import { runOrcaOperation } from "./guarded-operation.js";

export async function main(): Promise<void> {
  const state = await loadMainnetState();
  if (!state.position_opened || !state.position || !state.avi_mint) throw new Error("Se requiere una posición confirmada.");
  if (state.liquidity_added) throw new Error("El estado ya registra liquidez; una ampliación requiere una decisión nueva y parámetros explícitos.");
  const design = poolDesign(state.avi_mint);
  assertDepositWithinLimits(design.maxTokenA, design.maxTokenB, design);
  await runOrcaOperation("increase-liquidity", { position: state.position, maxTokenA: design.maxTokenA.toString(), maxTokenB: design.maxTokenB.toString(), slippageBps: design.slippageBps }, async (runtime) => {
    const plan = await increaseLiquidityInstructions(kitRpc(runtime.config.SOLANA_RPC_URL), address(state.position as string), { tokenMaxA: design.maxTokenA, tokenMaxB: design.maxTokenB }, {
      slippageToleranceBps: design.slippageBps,
      authority: createNoopSigner(address(runtime.operator.toBase58())),
      whirlpoolDeployment: WhirlpoolDeployment.mainnet,
    });
    return plan.instructions;
  }, async () => writeMainnetState({ ...state, liquidity_added: true }));
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
