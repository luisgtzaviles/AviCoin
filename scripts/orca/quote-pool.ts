import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { poolDesign } from "../lib/orca.js";
import { mainnetPoolLookup } from "./read-only.js";

export async function main(): Promise<void> {
  const { state, pools } = await mainnetPoolLookup();
  const design = poolDesign(state.avi_mint as string);
  const existing = pools.find((pool) => pool.initialized && pool.tickSpacing === design.tickSpacing);
  console.table({
    fee_tier_percent: design.feeRatePercent,
    tick_spacing: design.tickSpacing,
    initial_tick: design.initialTick,
    precio_AVI_USDC: design.economicPriceAviUsdc,
    precio_USDC_AVI: design.inversePriceUsdcAvi,
    rango_inferior_AVI_USDC: 0.005,
    rango_superior_AVI_USDC: 0.02,
    max_token_A_base_units: design.maxTokenA.toString(),
    max_token_B_base_units: design.maxTokenB.toString(),
    slippage_bps: design.slippageBps,
    pool_existente: existing?.address ?? "ninguno",
    transacciones_estimadas: 2,
  });
  console.log("Las cantidades consumidas, remanentes, renta y comisiones se deben releer del SDK/RPC inmediatamente antes del dry-run; nunca se asume consumo total.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
