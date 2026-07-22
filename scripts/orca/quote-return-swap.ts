import { address, createNoopSigner } from "@solana/kit";
import { swapInstructions, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertReturnSaleAmount, DEFAULT_SLIPPAGE_BPS, MAX_PRICE_IMPACT_PERCENT, sellPriceImpactPercent } from "../lib/orca.js";
import { loadConfig } from "../lib/config.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState } from "../lib/state.js";
import { createConnection, verifiedGenesisHash } from "../lib/solana.js";

function bigintArgument(name: string): bigint {
  const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value || !/^\d+$/.test(value)) throw new Error(`--${name} requiere unidades base enteras positivas.`);
  return BigInt(value);
}

export async function quoteEducationalReturn() {
  const amount = bigintArgument("avi-amount-base-units");
  const purchased = bigintArgument("purchased-avi-base-units");
  assertReturnSaleAmount(amount, purchased);
  const config = loadConfig();
  if (config.SOLANA_NETWORK !== "mainnet-beta") throw new Error("La cotización requiere mainnet-beta.");
  await verifiedGenesisHash(createConnection(config), config);
  if (!config.AVICOIN_TEST_WALLET) throw new Error("Falta AVICOIN_TEST_WALLET expresamente autorizada.");
  const state = await loadMainnetState();
  if (!state.pool_created || !state.pool || !state.avi_mint) throw new Error("Se requiere pool y mint confirmados.");
  const plan = await swapInstructions(kitRpc(config.SOLANA_RPC_URL), { inputAmount: amount, mint: address(state.avi_mint) }, address(state.pool), {
    slippageToleranceBps: DEFAULT_SLIPPAGE_BPS,
    signer: createNoopSigner(address(config.AVICOIN_TEST_WALLET)),
    whirlpoolDeployment: WhirlpoolDeployment.mainnet,
  });
  const priceImpact = sellPriceImpactPercent(plan.quote.tokenIn, plan.quote.tokenEstOut);
  if (priceImpact > MAX_PRICE_IMPACT_PERCENT) throw new Error("Price impact mayor a 10%; venta cancelada antes de firmar.");
  return { config, state, plan, priceImpact, purchased };
}

export async function main(): Promise<void> {
  const { plan, priceImpact } = await quoteEducationalReturn();
  console.table({ entrada_AVI_base_units: plan.quote.tokenIn.toString(), salida_USDC_estimada_base_units: plan.quote.tokenEstOut.toString(), salida_USDC_mínima_base_units: plan.quote.tokenMinOut.toString(), price_impact_percent: priceImpact });
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
