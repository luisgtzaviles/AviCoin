import { address, createNoopSigner } from "@solana/kit";
import { swapInstructions, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { MAINNET_USDC_MINT } from "../../config/mainnet.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertSwapLimits, buyPriceImpactPercent, DEFAULT_SLIPPAGE_BPS, MAX_BUY_USDC_BASE_UNITS } from "../lib/orca.js";
import { loadConfig } from "../lib/config.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState } from "../lib/state.js";
import { createConnection, verifiedGenesisHash } from "../lib/solana.js";

export async function quoteEducationalBuy() {
  const config = loadConfig();
  if (config.SOLANA_NETWORK !== "mainnet-beta") throw new Error("La cotización requiere mainnet-beta.");
  await verifiedGenesisHash(createConnection(config), config);
  if (!config.AVICOIN_TEST_WALLET) throw new Error("Falta AVICOIN_TEST_WALLET expresamente autorizada.");
  if (config.AVICOIN_TEST_WALLET === config.AVICOIN_PRODUCTION_WALLET) throw new Error("La wallet educativa debe ser distinta de la wallet de producción.");
  const state = await loadMainnetState();
  if (!state.pool_created || !state.pool) throw new Error("Se requiere pool confirmado.");
  const plan = await swapInstructions(kitRpc(config.SOLANA_RPC_URL), { inputAmount: MAX_BUY_USDC_BASE_UNITS, mint: address(MAINNET_USDC_MINT) }, address(state.pool), {
    slippageToleranceBps: DEFAULT_SLIPPAGE_BPS,
    signer: createNoopSigner(address(config.AVICOIN_TEST_WALLET)),
    whirlpoolDeployment: WhirlpoolDeployment.mainnet,
  });
  const priceImpact = buyPriceImpactPercent(plan.quote.tokenIn, plan.quote.tokenEstOut);
  assertSwapLimits(MAINNET_USDC_MINT, plan.quote.tokenIn, priceImpact);
  return { config, state, plan, priceImpact };
}

export async function main(): Promise<void> {
  const { plan, priceImpact } = await quoteEducationalBuy();
  console.table({ entrada_USDC_base_units: plan.quote.tokenIn.toString(), salida_AVI_estimada_base_units: plan.quote.tokenEstOut.toString(), salida_AVI_mínima_base_units: plan.quote.tokenMinOut.toString(), fee_base_units: plan.quote.tradeFee.toString(), slippage_bps: DEFAULT_SLIPPAGE_BPS, price_impact_percent: priceImpact });
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
