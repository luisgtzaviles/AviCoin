import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAINNET_INITIAL_LAUNCH_BASE_UNITS, MAINNET_PRODUCTION_WALLET, MAINNET_USDC_MINT } from "../config/index.js";
import { assertMintAuthorityPolicy, assertPoolLaunchReady, type PoolLaunchEvidence } from "../scripts/lib/launch-policy.js";
import type { MainnetLaunchState } from "../scripts/lib/state.js";

const state: MainnetLaunchState = {
  schema_version: 2, network: "mainnet-beta", production_wallet: MAINNET_PRODUCTION_WALLET,
  initial_launch_supply: "1000", initial_launch_base_units: "1000000000000", launch_mint_operations_allowed: 1,
  launch_mint_operations_completed: 1, permanent_max_supply: null, mint_authority_policy: "retained_temporarily",
  avi_mint: "8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK", metadata_pda: "metadata", avi_ata: "ata", pool: null, position: null,
  mint_created: true, metadata_created: true, supply_minted: true, mint_authority_revoked: false, pool_created: false,
  position_opened: false, liquidity_added: false, swaps_tested: false,
};
const evidence: PoolLaunchEvidence = {
  decimals: 9, supplyBaseUnits: MAINNET_INITIAL_LAUNCH_BASE_UNITS, mintAuthority: MAINNET_PRODUCTION_WALLET,
  freezeAuthority: null, metadataMatches: true, productionWallet: MAINNET_PRODUCTION_WALLET,
  usdcMint: MAINNET_USDC_MINT, poolExists: false, additionalIssuanceObserved: false,
  operationAuthorized: true, dryRunValid: true,
};

describe("política de autoridad y gate del pool", () => {
  it("admite retained_temporarily y revoked, y rechaza valores desconocidos", () => {
    assert.doesNotThrow(() => assertMintAuthorityPolicy("retained_temporarily"));
    assert.doesNotThrow(() => assertMintAuthorityPolicy("revoked"));
    assert.throws(() => assertMintAuthorityPolicy("open_mint"), /desconocida/);
  });
  it("permite pool con autoridad retenida y supply exacto", () => assert.doesNotThrow(() => assertPoolLaunchReady(state, evidence)));
  it("permite la política futura revoked sólo con authority none", () => assert.doesNotThrow(() => assertPoolLaunchReady({ ...state, mint_authority_policy: "revoked", mint_authority_revoked: true }, { ...evidence, mintAuthority: null })));
  it("rechaza supply menor o mayor", () => {
    assert.throws(() => assertPoolLaunchReady(state, { ...evidence, supplyBaseUnits: MAINNET_INITIAL_LAUNCH_BASE_UNITS - 1n }), /exactamente 1,000/);
    assert.throws(() => assertPoolLaunchReady(state, { ...evidence, supplyBaseUnits: MAINNET_INITIAL_LAUNCH_BASE_UNITS + 1n, additionalIssuanceObserved: true }), /exactamente 1,000/);
  });
  it("rechaza metadata ausente", () => assert.throws(() => assertPoolLaunchReady({ ...state, metadata_created: false }, evidence), /metadata/));
  it("rechaza freeze authority", () => assert.throws(() => assertPoolLaunchReady(state, { ...evidence, freezeAuthority: MAINNET_PRODUCTION_WALLET }), /Freeze authority/));
  it("rechaza mint authority distinta", () => assert.throws(() => assertPoolLaunchReady(state, { ...evidence, mintAuthority: "OtraWallet" }), /mint authority/));
});
