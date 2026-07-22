import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { MAINNET_USDC_MINT } from "../config/mainnet.js";
import {
  assertDepositWithinLimits,
  assertReturnSaleAmount,
  assertSwapLimits,
  buyPriceImpactPercent,
  canonicalMintOrder,
  INITIAL_AVI_USDC_PRICE,
  INITIAL_USDC_AVI_PRICE,
  MAX_AVI_BASE_UNITS,
  MAX_USDC_BASE_UNITS,
  orderedPoolPair,
  poolDesign,
  sellPriceImpactPercent,
} from "../scripts/lib/orca.js";

const aviMint = "8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK";

describe("diseño AVI/USDC", () => {
  it("mantiene precio 0.01 e inverso 100", () => {
    assert.equal(INITIAL_AVI_USDC_PRICE, 0.01);
    assert.equal(INITIAL_USDC_AVI_PRICE, 100);
    const design = poolDesign(aviMint);
    assert.equal(design.economicPriceAviUsdc * design.inversePriceUsdcAvi, 1);
  });

  it("ordena mints canónicamente por bytes", () => {
    const [a, b] = canonicalMintOrder(aviMint);
    assert.ok(Buffer.compare(new PublicKey(a).toBuffer(), new PublicKey(b).toBuffer()) < 0);
  });

  it("maneja correctamente 9/6 decimales y máximos según orden", () => {
    const pair = orderedPoolPair(aviMint);
    assert.deepEqual(new Set([pair.decimalsA, pair.decimalsB]), new Set([9, 6]));
    assert.deepEqual(new Set([pair.maxTokenA, pair.maxTokenB]), new Set([MAX_AVI_BASE_UNITS, MAX_USDC_BASE_UNITS]));
  });

  it("rechaza depósitos por encima de 1,000 AVI o 10 USDC", () => {
    const pair = orderedPoolPair(aviMint);
    assert.doesNotThrow(() => assertDepositWithinLimits(pair.maxTokenA, pair.maxTokenB, pair));
    assert.throws(() => assertDepositWithinLimits(pair.maxTokenA + 1n, pair.maxTokenB, pair), /excede/);
  });

  it("limita compra a 0.10 USDC y price impact a 10%", () => {
    assert.doesNotThrow(() => assertSwapLimits(MAINNET_USDC_MINT, 100_000n, 10));
    assert.throws(() => assertSwapLimits(MAINNET_USDC_MINT, 100_001n, 1), /0.10 USDC/);
    assert.throws(() => assertSwapLimits(MAINNET_USDC_MINT, 100_000n, 10.0001), /mayor a 10%/);
  });

  it("calcula price impact y obliga a vender exactamente lo comprado", () => {
    assert.equal(buyPriceImpactPercent(100_000n, 10_000_000_000n), 0);
    assert.equal(sellPriceImpactPercent(10_000_000_000n, 100_000n), 0);
    assert.throws(() => assertReturnSaleAmount(9n, 10n), /exactamente/);
    assert.doesNotThrow(() => assertReturnSaleAmount(10n, 10n));
  });
});
