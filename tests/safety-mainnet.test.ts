import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { loadConfig } from "../scripts/lib/config.js";
import {
  assertFreshDryRunReceipt,
  assertLegacyDevnetOnly,
  assertMainnetAuthorization,
  assertOnlyArguments,
  buildOperationContext,
  executeGuarded,
  operationFingerprint,
  writeDryRunReceipt,
} from "../scripts/lib/safety.js";
import { MAINNET_GENESIS_HASH } from "../scripts/lib/solana.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

function mainnetConfig(operation = "create-mint") {
  return loadConfig({
    SOLANA_NETWORK: "mainnet-beta",
    SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
    ALLOW_MAINNET: "true",
    AVICOIN_MAINNET_OPERATION: operation,
    AVICOIN_PRODUCTION_WALLET: "WalletEsperada",
  });
}

describe("autorización Mainnet por operación", () => {
  it("rechaza Mainnet sin ALLOW_MAINNET", () => {
    const config = loadConfig({ SOLANA_NETWORK: "mainnet-beta", AVICOIN_MAINNET_OPERATION: "create-mint", AVICOIN_PRODUCTION_WALLET: "WalletEsperada" });
    assert.throws(() => assertMainnetAuthorization(config, "create-mint", "WalletEsperada"), /ALLOW_MAINNET/);
  });

  it("rechaza una operación distinta", () => {
    assert.throws(() => assertMainnetAuthorization(mainnetConfig("create-metadata"), "create-mint", "WalletEsperada"), /debe ser exactamente create-mint/);
  });

  it("rechaza una wallet distinta", () => {
    assert.throws(() => assertMainnetAuthorization(mainnetConfig(), "create-mint", "OtraWallet"), /no coincide exactamente/);
  });

  it("acepta sólo la combinación exacta", () => {
    assert.doesNotThrow(() => assertMainnetAuthorization(mainnetConfig(), "create-mint", "WalletEsperada"));
  });

  it("bloquea todos los entrypoints históricos en Mainnet", () => {
    assert.throws(() => assertLegacyDevnetOnly(mainnetConfig()), /limitado a devnet/);
  });

  it("rechaza cantidades u otros argumentos en la emisión fija", () => {
    assert.throws(() => assertOnlyArguments(["1000"], ["--dry-run"]), /Argumentos no permitidos/);
    assert.doesNotThrow(() => assertOnlyArguments(["--dry-run"], ["--dry-run"]));
  });
});

describe("recibos dry-run", () => {
  it("liga configuración, wallet, operación y parámetros", () => {
    const context = buildOperationContext(mainnetConfig(), MAINNET_GENESIS_HASH, "WalletEsperada", "create-mint", { decimals: 9 });
    assert.notEqual(operationFingerprint(context), operationFingerprint({ ...context, parameters: { decimals: 8 } }));
    assert.notEqual(operationFingerprint(context), operationFingerprint({ ...context, wallet: "OtraWallet" }));
  });

  it("acepta un recibo fresco exactamente coincidente", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avicoin-receipt-")); temporaryDirectories.push(directory);
    const context = buildOperationContext(mainnetConfig(), MAINNET_GENESIS_HASH, "WalletEsperada", "create-mint", { decimals: 9 });
    await writeDryRunReceipt(context, directory, new Date("2026-07-22T12:00:00Z"));
    await assert.doesNotReject(assertFreshDryRunReceipt(context, directory, new Date("2026-07-22T12:10:00Z")));
  });

  it("rechaza un recibo expirado", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avicoin-receipt-")); temporaryDirectories.push(directory);
    const context = buildOperationContext(mainnetConfig(), MAINNET_GENESIS_HASH, "WalletEsperada", "create-mint", { decimals: 9 });
    await writeDryRunReceipt(context, directory, new Date("2026-07-22T12:00:00Z"));
    await assert.rejects(assertFreshDryRunReceipt(context, directory, new Date("2026-07-22T13:00:00Z")), /expiró/);
  });

  it("dry-run simula pero jamás alcanza la función de firma/ejecución", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avicoin-receipt-")); temporaryDirectories.push(directory);
    const context = buildOperationContext(mainnetConfig(), MAINNET_GENESIS_HASH, "WalletEsperada", "create-mint", { decimals: 9 });
    let signed = false;
    const result = await executeGuarded({ dryRun: true, context, receiptDirectory: directory, simulate: async () => "simulado", execute: async () => { signed = true; return "firmado"; } });
    assert.equal(result.mode, "dry-run");
    assert.equal(signed, false);
  });

  it("la ejecución en un proceso simula y escribe recibo antes de ejecutar", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avicoin-receipt-")); temporaryDirectories.push(directory);
    const context = buildOperationContext(mainnetConfig(), MAINNET_GENESIS_HASH, "WalletEsperada", "create-mint", { decimals: 9 });
    const calls: string[] = [];
    const result = await executeGuarded({
      dryRun: false, executeAfterDryRun: true, context, receiptDirectory: directory,
      simulate: async () => { calls.push("simulate"); return "ok"; },
      confirm: async () => { calls.push("confirm"); },
      execute: async () => { calls.push("execute"); return "signature"; },
    });
    assert.equal(result.mode, "execute");
    assert.deepEqual(calls, ["simulate", "confirm", "execute"]);
  });
});
