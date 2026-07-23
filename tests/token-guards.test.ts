import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAINNET_INITIAL_LAUNCH_BASE_UNITS } from "../config/mainnet.js";
import { assertMetadataSnapshot } from "../scripts/lib/mainnet-metadata.js";
import { assertMintSnapshot } from "../scripts/lib/mainnet-token.js";
import { humanToBaseUnits } from "../scripts/lib/safety.js";
import { assertInitialLaunchMintAllowed } from "../scripts/lib/launch-policy.js";
import { assertStateAllows, type MainnetLaunchState } from "../scripts/lib/state.js";

const wallet = "WalletEsperada";
const baseState: MainnetLaunchState = {
  schema_version: 2, network: "mainnet-beta", production_wallet: "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq",
  initial_launch_supply: "1000", initial_launch_base_units: "1000000000000", launch_mint_operations_allowed: 1,
  launch_mint_operations_completed: 0, permanent_max_supply: null, mint_authority_policy: "retained_temporarily",
  avi_mint: null, metadata_pda: null, avi_ata: null, ata_created: false,
  pool: null, position: null, mint_created: false, metadata_created: false, supply_minted: false,
  mint_authority_revoked: false, pool_created: false, position_opened: false, liquidity_added: false, swaps_tested: false,
};

describe("invariantes del token Mainnet", () => {
  it("convierte 1,000 AVI exactamente a unidades base", () => {
    assert.equal(humanToBaseUnits("1000", 9), MAINNET_INITIAL_LAUNCH_BASE_UNITS);
  });

  it("rechaza emisión si el supply no es cero", () => {
    assert.throws(() => assertMintSnapshot({ decimals: 9, supply: 1n, mintAuthority: wallet, freezeAuthority: null }, { authority: wallet, supply: 0n }), /Supply inesperado/);
  });

  it("revocación sólo acepta supply exacto", () => {
    assert.throws(() => assertMintSnapshot({ decimals: 9, supply: MAINNET_INITIAL_LAUNCH_BASE_UNITS - 1n, mintAuthority: wallet, freezeAuthority: null }, { authority: wallet, supply: MAINNET_INITIAL_LAUNCH_BASE_UNITS }), /Supply inesperado/);
  });

  it("freeze authority debe ser siempre none", () => {
    assert.throws(() => assertMintSnapshot({ decimals: 9, supply: 0n, mintAuthority: wallet, freezeAuthority: wallet }, { authority: wallet, supply: 0n }), /Freeze authority/);
  });

  it("rechaza crear un segundo mint", () => {
    assert.throws(() => assertStateAllows({ ...baseState, avi_mint: wallet, mint_created: true }, "create-mint"), /no se permite crear otro/);
  });

  it("rechaza una segunda emisión y una cantidad configurable", () => {
    assert.throws(() => assertInitialLaunchMintAllowed({ ...baseState, launch_mint_operations_completed: 1, supply_minted: true }, MAINNET_INITIAL_LAUNCH_BASE_UNITS, 0n), /ya fue consumida/);
    assert.throws(() => assertInitialLaunchMintAllowed(baseState, MAINNET_INITIAL_LAUNCH_BASE_UNITS - 1n, 0n), /exactamente 1,000 AVI/);
    assert.throws(() => assertInitialLaunchMintAllowed(baseState, MAINNET_INITIAL_LAUNCH_BASE_UNITS, 1n), /supply on-chain igual a cero/);
  });

  it("metadata exige identidad, URI, fee cero y mutable=true", () => {
    const base = { mint: wallet, name: "AVICOIN", symbol: "AVI", uri: "https://avicoin.avicell.com.mx/metadata-mainnet.json", sellerFeeBasisPoints: 0, updateAuthority: wallet, hasCreators: false, hasCollection: false, hasUses: false };
    assert.doesNotThrow(() => assertMetadataSnapshot({ ...base, isMutable: true }, wallet, "https://avicoin.avicell.com.mx/metadata-mainnet.json", wallet));
    assert.throws(() => assertMetadataSnapshot({ ...base, isMutable: false }, wallet, "https://avicoin.avicell.com.mx/metadata-mainnet.json", wallet), /mutable/);
  });
});
