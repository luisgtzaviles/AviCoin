import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { estimateMainnetLaunchCosts } from "../scripts/lib/mainnet-costs.js";

describe("estimación de costos Mainnet", () => {
  it("calcula mínimo, máximo, margen y faltante de forma determinística", async () => {
    const estimate = await estimateMainnetLaunchCosts(async (size) => BigInt(size * 10), 100_000n);
    assert.ok(estimate.minimumLamports > 0n);
    assert.ok(estimate.maximumBeforeMarginLamports >= estimate.minimumLamports);
    assert.ok(estimate.maximumWithMarginLamports > estimate.maximumBeforeMarginLamports);
    assert.equal(estimate.requiresMoreSol, estimate.maximumWithMarginLamports > 100_000n);
  });
  it("el preflight usa SDK y no depende de solana o spl-token CLI", async () => {
    const source = await readFile("scripts/mainnet/preflight-plan.ts", "utf8");
    assert.equal(/execFile|spawn|solana\s|spl-token\s/u.test(source), false);
    assert.match(source, /Connection/);
  });
});
