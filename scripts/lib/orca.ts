import { PublicKey } from "@solana/web3.js";
import { getInitializableTickIndex, priceToTickIndex as orcaPriceToTickIndex } from "@orca-so/whirlpools-core";
import { MAINNET_USDC_MINT } from "../../config/mainnet.js";

export const ORCA_WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
export const ORCA_MAINNET_CONFIG = "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ";
export const ORCA_TICK_SPACING = 64;
export const ORCA_FEE_RATE_PERCENT = 0.30;
export const INITIAL_AVI_USDC_PRICE = 0.01;
export const INITIAL_USDC_AVI_PRICE = 100;
export const LOWER_AVI_USDC_PRICE = 0.005;
export const UPPER_AVI_USDC_PRICE = 0.02;
export const MAX_AVI_BASE_UNITS = 1_000_000_000_000n;
export const MAX_USDC_BASE_UNITS = 10_000_000n;
export const MAX_BUY_USDC_BASE_UNITS = 100_000n;
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_PRICE_IMPACT_PERCENT = 10;

export interface OrderedPair {
  readonly mintA: string;
  readonly mintB: string;
  readonly decimalsA: number;
  readonly decimalsB: number;
  readonly initialPriceBPerA: number;
  readonly lowerPriceBPerA: number;
  readonly upperPriceBPerA: number;
  readonly maxTokenA: bigint;
  readonly maxTokenB: bigint;
}

export function canonicalMintOrder(aviMint: string, usdcMint = MAINNET_USDC_MINT): readonly [string, string] {
  const avi = new PublicKey(aviMint);
  const usdc = new PublicKey(usdcMint);
  return Buffer.compare(avi.toBuffer(), usdc.toBuffer()) < 0 ? [avi.toBase58(), usdc.toBase58()] : [usdc.toBase58(), avi.toBase58()];
}

export function orderedPoolPair(aviMint: string): OrderedPair {
  const [mintA, mintB] = canonicalMintOrder(aviMint);
  const aviIsA = mintA === aviMint;
  return {
    mintA,
    mintB,
    decimalsA: aviIsA ? 9 : 6,
    decimalsB: aviIsA ? 6 : 9,
    initialPriceBPerA: aviIsA ? INITIAL_AVI_USDC_PRICE : INITIAL_USDC_AVI_PRICE,
    lowerPriceBPerA: aviIsA ? LOWER_AVI_USDC_PRICE : 1 / UPPER_AVI_USDC_PRICE,
    upperPriceBPerA: aviIsA ? UPPER_AVI_USDC_PRICE : 1 / LOWER_AVI_USDC_PRICE,
    maxTokenA: aviIsA ? MAX_AVI_BASE_UNITS : MAX_USDC_BASE_UNITS,
    maxTokenB: aviIsA ? MAX_USDC_BASE_UNITS : MAX_AVI_BASE_UNITS,
  };
}

export function priceToTickIndex(priceBPerA: number, decimalsA: number, decimalsB: number): number {
  if (!Number.isFinite(priceBPerA) || priceBPerA <= 0) throw new Error("El precio debe ser finito y positivo.");
  return orcaPriceToTickIndex(priceBPerA, decimalsA, decimalsB);
}

export function initializableTick(priceBPerA: number, decimalsA: number, decimalsB: number, tickSpacing = ORCA_TICK_SPACING): number {
  return getInitializableTickIndex(priceToTickIndex(priceBPerA, decimalsA, decimalsB), tickSpacing);
}

export function poolDesign(aviMint: string) {
  const pair = orderedPoolPair(aviMint);
  return {
    ...pair,
    economicPriceAviUsdc: INITIAL_AVI_USDC_PRICE,
    inversePriceUsdcAvi: INITIAL_USDC_AVI_PRICE,
    tickSpacing: ORCA_TICK_SPACING,
    feeRatePercent: ORCA_FEE_RATE_PERCENT,
    initialTick: initializableTick(pair.initialPriceBPerA, pair.decimalsA, pair.decimalsB),
    lowerTick: initializableTick(pair.lowerPriceBPerA, pair.decimalsA, pair.decimalsB),
    upperTick: initializableTick(pair.upperPriceBPerA, pair.decimalsA, pair.decimalsB),
    slippageBps: DEFAULT_SLIPPAGE_BPS,
  };
}

export function assertDepositWithinLimits(tokenA: bigint, tokenB: bigint, pair: OrderedPair): void {
  if (tokenA < 0n || tokenB < 0n) throw new Error("Los depósitos no pueden ser negativos.");
  if (tokenA > pair.maxTokenA || tokenB > pair.maxTokenB) throw new Error("La cotización excede el máximo de 1,000 AVI o 10 USDC.");
}

export function assertUsdcMint(mint: string): void {
  if (mint !== MAINNET_USDC_MINT) throw new Error("Se requiere el mint oficial exacto de USDC en Solana Mainnet.");
}

export function assertSwapLimits(inputMint: string, inputAmount: bigint, priceImpactPercent: number): void {
  assertUsdcMint(inputMint);
  if (inputAmount <= 0n || inputAmount > MAX_BUY_USDC_BASE_UNITS) throw new Error("La compra educativa no puede exceder 0.10 USDC.");
  if (!Number.isFinite(priceImpactPercent) || priceImpactPercent > MAX_PRICE_IMPACT_PERCENT) throw new Error("Price impact mayor a 10%; operación cancelada antes de firmar.");
}

export function buyPriceImpactPercent(usdcInput: bigint, aviOutput: bigint): number {
  if (usdcInput <= 0n || aviOutput < 0n) throw new Error("Cantidades inválidas para calcular price impact.");
  const expectedAvi = Number(usdcInput) / 10 ** 6 * INITIAL_USDC_AVI_PRICE;
  const actualAvi = Number(aviOutput) / 10 ** 9;
  return Math.max(0, (expectedAvi - actualAvi) / expectedAvi * 100);
}

export function sellPriceImpactPercent(aviInput: bigint, usdcOutput: bigint): number {
  if (aviInput <= 0n || usdcOutput < 0n) throw new Error("Cantidades inválidas para calcular price impact.");
  const expectedUsdc = Number(aviInput) / 10 ** 9 * INITIAL_AVI_USDC_PRICE;
  const actualUsdc = Number(usdcOutput) / 10 ** 6;
  return Math.max(0, (expectedUsdc - actualUsdc) / expectedUsdc * 100);
}

export function assertReturnSaleAmount(amount: bigint, exactPurchasedAvi: bigint): void {
  if (amount <= 0n || amount !== exactPurchasedAvi) throw new Error("La venta de regreso debe usar exactamente los AVI obtenidos en la compra educativa.");
}
