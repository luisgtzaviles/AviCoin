import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppConfig } from "../scripts/lib/config.js";
import {
  assertClusterMatchesConfig,
  DEVNET_GENESIS_HASH,
  identifyCluster,
  MAINNET_GENESIS_HASH,
  TESTNET_GENESIS_HASH,
} from "../scripts/lib/solana.js";

const TRUNCATED_DEVNET_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    SOLANA_NETWORK: "devnet",
    SOLANA_RPC_URL: "https://api.devnet.solana.com",
    SOLANA_KEYPAIR_PATH: "",
    ALLOW_MAINNET: false,
    TOKEN_NAME: "AVICOIN",
    TOKEN_SYMBOL: "AVI",
    TOKEN_DECIMALS: 9,
    TOKEN_SUPPLY: "100000000",
    TOKEN_MINT_ADDRESS: "",
    TOKEN_METADATA_URI: "",
    ...overrides,
  };
}

describe("Solana cluster genesis gate", () => {
  it("acepta el hash completo y exacto de devnet", () => {
    assert.equal(assertClusterMatchesConfig(DEVNET_GENESIS_HASH, config()), "devnet");
  });

  it("rechaza el hash truncado anterior", () => {
    assert.throws(() => identifyCluster(TRUNCATED_DEVNET_HASH), /Genesis hash desconocido/);
  });

  it("rechaza un hash de devnet con un carácter alterado", () => {
    const altered = `${DEVNET_GENESIS_HASH.slice(0, -1)}H`;
    assert.throws(() => identifyCluster(altered), /Genesis hash desconocido/);
  });

  it("rechaza un hash desconocido", () => {
    assert.throws(() => identifyCluster("hash-desconocido"), /Genesis hash desconocido/);
  });

  it("rechaza devnet declarada cuando el RPC es de mainnet-beta", () => {
    assert.throws(() => assertClusterMatchesConfig(MAINNET_GENESIS_HASH, config()), /RPC corresponde a mainnet-beta/);
  });

  it("rechaza devnet declarada cuando el RPC es de testnet", () => {
    assert.throws(() => assertClusterMatchesConfig(TESTNET_GENESIS_HASH, config()), /RPC corresponde a testnet/);
  });

  it("rechaza ALLOW_MAINNET=true cuando el RPC real es devnet", () => {
    assert.throws(
      () => assertClusterMatchesConfig(DEVNET_GENESIS_HASH, config({ SOLANA_NETWORK: "mainnet-beta", ALLOW_MAINNET: true })),
      /requiere que el RPC real corresponda a mainnet-beta/,
    );
  });

  it("no permite que una comparación parcial sea aceptada", () => {
    for (let length = 1; length < DEVNET_GENESIS_HASH.length; length += 1) {
      assert.throws(() => identifyCluster(DEVNET_GENESIS_HASH.slice(0, length)), /Genesis hash desconocido/);
    }
  });
});
