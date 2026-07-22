import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { MAINNET_PRODUCTION_WALLET } from "../config/index.js";
import { assertConnectedSigner, assertExpectedPhantomWallet, assertNoSecretMaterial, assertPhantomSigningAdapterPending } from "../scripts/lib/phantom.js";

describe("frontera Phantom no custodial", () => {
  it("acepta sólo la wallet Phantom oficial", () => {
    assert.doesNotThrow(() => assertExpectedPhantomWallet(MAINNET_PRODUCTION_WALLET));
    assert.throws(() => assertExpectedPhantomWallet("OtraWallet"), /no coincide/);
  });
  it("rechaza signer conectado distinto", () => assert.throws(() => assertConnectedSigner(MAINNET_PRODUCTION_WALLET, "OtraWallet"), /signer/));
  it("rechaza cualquier campo de material secreto", () => {
    assert.doesNotThrow(() => assertNoSecretMaterial({ wallet: MAINNET_PRODUCTION_WALLET }));
    assert.throws(() => assertNoSecretMaterial({ seedPhrase: "prohibido" }), /material secreto/);
  });
  it("mantiene bloqueadas las operaciones posteriores", () => assert.throws(() => assertPhantomSigningAdapterPending(), /sólo create-mint/));
  it("la UI importa sin ejecutar y usa el proveedor inyectado sin firmar al cargar", async () => {
    const app = await import(pathToFileURL(resolve("tools/phantom/app.js")).href) as { PRODUCTION_WALLET: string };
    assert.equal(app.PRODUCTION_WALLET, MAINNET_PRODUCTION_WALLET);
    const source = await readFile("tools/phantom/app.js", "utf8");
    assert.match(source, /provider\.signTransaction/);
    assert.equal(/signAndSendTransaction|provider\.sendTransaction/u.test(source), false);
    assert.match(source, /if \(typeof window !== "undefined"/);
  });
  it("el diagnóstico local sólo expone connect y no contiene primitivas transaccionales", async () => {
    const diagnostic = await import(pathToFileURL(resolve("tools/phantom/diagnostic.js")).href) as {
      PRODUCTION_WALLET: string;
      collectDiagnostics: (windowRef: unknown, documentRef: unknown) => Record<string, unknown>;
    };
    assert.equal(diagnostic.PRODUCTION_WALLET, MAINNET_PRODUCTION_WALLET);
    const source = await readFile("tools/phantom/diagnostic.js", "utf8");
    assert.match(source, /phantom\.solana\.connect\(\)/);
    assert.equal(/signTransaction|signMessage|VersionedTransaction|Keypair|createAccount/u.test(source), false);
    assert.match(source, /INJECTION_TIMEOUT_MS = 30_000/);
  });
  it("el servidor diagnóstico escucha sólo en loopback y rechaza ALLOW_MAINNET=true", async () => {
    const source = await readFile("scripts/phantom/diagnostic-server.ts", "utf8");
    assert.match(source, /server\.listen\(port, "127\.0\.0\.1"/);
    assert.match(source, /ALLOW_MAINNET === "true"/);
    assert.match(source, /server\.closeAllConnections\(\)/);
    assert.equal(/@solana|Keypair|create-mint|signTransaction/u.test(source), false);
  });
});
