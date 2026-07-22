import { address, createNoopSigner } from "@solana/kit";
import { createConcentratedLiquidityPoolInstructions, fetchWhirlpoolsByTokenPair, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { MAINNET_USDC_MINT } from "../../config/mainnet.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { ORCA_TICK_SPACING, poolDesign } from "../lib/orca.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState, writeMainnetState } from "../lib/state.js";
import { runOrcaOperation } from "./guarded-operation.js";

export async function main(): Promise<void> {
  const state = await loadMainnetState();
  if (!state.mint_authority_revoked || !state.avi_mint) throw new Error("El pool requiere mint confirmado y mint authority revocada.");
  if (state.pool_created || state.pool) throw new Error("El estado ya registra un pool; no se creará otro.");
  const design = poolDesign(state.avi_mint);
  let plannedPool: string | null = null;
  await runOrcaOperation("create-pool", { aviMint: state.avi_mint, usdcMint: MAINNET_USDC_MINT, initialPrice: design.initialPriceBPerA, tickSpacing: ORCA_TICK_SPACING }, async (runtime) => {
    const rpc = kitRpc(runtime.config.SOLANA_RPC_URL);
    const pools = await fetchWhirlpoolsByTokenPair(rpc, address(state.avi_mint as string), address(MAINNET_USDC_MINT), WhirlpoolDeployment.mainnet);
    if (pools.some((pool) => pool.initialized && pool.tickSpacing === ORCA_TICK_SPACING)) throw new Error("Ya existe un pool para el par y fee tier; creación detenida sin agregar liquidez.");
    const plan = await createConcentratedLiquidityPoolInstructions(rpc, address(design.mintA), address(design.mintB), ORCA_TICK_SPACING, {
      initialPrice: design.initialPriceBPerA,
      funder: createNoopSigner(address(runtime.operator.publicKey.toBase58())),
      whirlpoolDeployment: WhirlpoolDeployment.mainnet,
    });
    plannedPool = plan.poolAddress;
    console.table({ pool_derivado: plan.poolAddress, renta_lamports: plan.initializationCost.toString(), transacciones: 1 });
    return plan.instructions;
  }, async () => {
    if (!plannedPool) throw new Error("No se conservó la dirección derivada del pool.");
    await writeMainnetState({ ...state, pool: plannedPool, pool_created: true });
  });
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
