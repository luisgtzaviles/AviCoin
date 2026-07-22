import { address, createNoopSigner } from "@solana/kit";
import { openPositionInstructionsWithTickBounds, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertDepositWithinLimits, poolDesign } from "../lib/orca.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState, writeMainnetState } from "../lib/state.js";
import { runOrcaOperation } from "./guarded-operation.js";

export async function main(): Promise<void> {
  const state = await loadMainnetState();
  if (!state.pool_created || !state.pool || !state.avi_mint) throw new Error("Se requiere un pool confirmado.");
  if (state.position_opened || state.position) throw new Error("El estado ya registra una posición.");
  const design = poolDesign(state.avi_mint);
  let plannedPosition: string | null = null;
  assertDepositWithinLimits(design.maxTokenA, design.maxTokenB, design);
  await runOrcaOperation("open-position", { pool: state.pool, lowerTick: design.lowerTick, upperTick: design.upperTick, maxTokenA: design.maxTokenA.toString(), maxTokenB: design.maxTokenB.toString(), slippageBps: design.slippageBps }, async (runtime) => {
    const plan = await openPositionInstructionsWithTickBounds(kitRpc(runtime.config.SOLANA_RPC_URL), address(state.pool as string), { tokenMaxA: design.maxTokenA, tokenMaxB: design.maxTokenB }, design.lowerTick, design.upperTick, {
      slippageToleranceBps: design.slippageBps,
      funder: createNoopSigner(address(runtime.operator.publicKey.toBase58())),
      whirlpoolDeployment: WhirlpoolDeployment.mainnet,
    });
    plannedPosition = plan.positionMint;
    console.table({ position_mint: plan.positionMint, renta_lamports: plan.initializationCost.toString(), nota: "Los importes reales cotizados deben quedar bajo los máximos; no se asume consumo total." });
    return plan.instructions;
  }, async (_signature, runtime) => {
    if (!plannedPosition) throw new Error("No se conservó el mint de posición derivado.");
    const account = await runtime.connection.getAccountInfo(new (await import("@solana/web3.js")).PublicKey(plannedPosition), "confirmed");
    if (!account) throw new Error("La posición no fue encontrada tras confirmar la transacción.");
    await writeMainnetState({ ...state, position: plannedPosition, position_opened: true, liquidity_added: true });
  });
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
