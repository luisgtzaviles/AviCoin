import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAINNET_FIXED_SUPPLY_BASE_UNITS } from "../config/mainnet.js";
import { assertMetadataSnapshot } from "../scripts/lib/mainnet-metadata.js";
import { assertMintSnapshot } from "../scripts/lib/mainnet-token.js";
import { humanToBaseUnits } from "../scripts/lib/safety.js";
import { assertStateAllows, type MainnetLaunchState } from "../scripts/lib/state.js";

const wallet = "WalletEsperada";
const baseState: MainnetLaunchState = {
  schema_version: 1, network: "mainnet-beta", production_wallet: null, avi_mint: null, metadata_pda: null, avi_ata: null,
  pool: null, position: null, mint_created: false, metadata_created: false, supply_minted: false,
  mint_authority_revoked: false, pool_created: false, position_opened: false, liquidity_added: false, swaps_tested: false,
};

describe("invariantes del token Mainnet", () => {
  it("convierte 1,000 AVI exactamente a unidades base", () => {
    assert.equal(humanToBaseUnits("1000", 9), MAINNET_FIXED_SUPPLY_BASE_UNITS);
  });

  it("rechaza emisión si el supply no es cero", () => {
    assert.throws(() => assertMintSnapshot({ decimals: 9, supply: 1n, mintAuthority: wallet, freezeAuthority: null }, { authority: wallet, supply: 0n }), /Supply inesperado/);
  });

  it("revocación sólo acepta supply exacto", () => {
    assert.throws(() => assertMintSnapshot({ decimals: 9, supply: MAINNET_FIXED_SUPPLY_BASE_UNITS - 1n, mintAuthority: wallet, freezeAuthority: null }, { authority: wallet, supply: MAINNET_FIXED_SUPPLY_BASE_UNITS }), /Supply inesperado/);
  });

  it("freeze authority debe ser siempre none", () => {
    assert.throws(() => assertMintSnapshot({ decimals: 9, supply: 0n, mintAuthority: wallet, freezeAuthority: wallet }, { authority: wallet, supply: 0n }), /Freeze authority/);
  });

  it("rechaza crear un segundo mint", () => {
    assert.throws(() => assertStateAllows({ ...baseState, avi_mint: wallet, mint_created: true }, "create-mint"), /no se permite crear otro/);
  });

  it("metadata exige identidad, URI, fee cero e inmutabilidad", () => {
    assert.doesNotThrow(() => assertMetadataSnapshot({ mint: wallet, name: "AVICOIN", symbol: "AVI", uri: "https://avicoin.avicell.com.mx/metadata-mainnet.json", sellerFeeBasisPoints: 0, isMutable: false }, wallet, "https://avicoin.avicell.com.mx/metadata-mainnet.json"));
    assert.throws(() => assertMetadataSnapshot({ mint: wallet, name: "AVICOIN", symbol: "AVI", uri: "https://avicoin.avicell.com.mx/metadata-mainnet.json", sellerFeeBasisPoints: 0, isMutable: true }, wallet, "https://avicoin.avicell.com.mx/metadata-mainnet.json"), /inmutable/);
  });
});
