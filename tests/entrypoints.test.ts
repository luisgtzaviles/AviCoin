import assert from "node:assert/strict";
import { describe, it } from "node:test";

const entrypoints = [
  "../scripts/create-token.js",
  "../scripts/create-metadata.js",
  "../scripts/mint.js",
  "../scripts/transfer.js",
  "../scripts/mainnet/create-mint.js",
  "../scripts/mainnet/create-metadata.js",
  "../scripts/mainnet/mint-fixed-supply.js",
  "../scripts/mainnet/revoke-mint-authority.js",
  "../scripts/orca/detect-pool.js",
  "../scripts/orca/quote-pool.js",
  "../scripts/orca/create-pool.js",
  "../scripts/orca/open-position.js",
  "../scripts/orca/increase-liquidity.js",
  "../scripts/orca/decrease-liquidity.js",
  "../scripts/orca/quote-swap.js",
  "../scripts/orca/execute-swap.js",
  "../scripts/orca/quote-return-swap.js",
  "../scripts/orca/execute-return-swap.js",
  "../scripts/orca/close-position.js",
] as const;

describe("entrypoints import-safe", () => {
  for (const entrypoint of entrypoints) {
    it(`importa ${entrypoint} sin ejecutar main`, async () => {
      const module = await import(entrypoint);
      assert.equal(typeof module.main, "function");
    });
  }
});
