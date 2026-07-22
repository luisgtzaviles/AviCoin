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
  it("mantiene firma y envío explícitamente pendientes", () => assert.throws(() => assertPhantomSigningAdapterPending(), /pendiente/));
  it("la UI importa sin ejecutar y no contiene métodos de firma o envío", async () => {
    const app = await import(pathToFileURL(resolve("tools/phantom/app.js")).href) as { PRODUCTION_WALLET: string };
    assert.equal(app.PRODUCTION_WALLET, MAINNET_PRODUCTION_WALLET);
    const source = await readFile("tools/phantom/app.js", "utf8");
    assert.equal(/signTransaction|signAndSendTransaction|sendTransaction/u.test(source), false);
  });
});
