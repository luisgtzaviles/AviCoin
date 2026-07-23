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
  it("la UI revisa el plan antes de preparar el blockhash y separa los dos paneles", async () => {
    const html = await readFile("tools/phantom/index.html", "utf8");
    const build = html.indexOf('id="build"');
    const review = html.indexOf('id="review"');
    const prepare = html.indexOf('id="prepare"');
    const requestSignature = html.indexOf('id="request-signature"');
    assert.ok(build > 0 && build < review && review < prepare && prepare < requestSignature);
    assert.match(html, /Plan estable, sin blockhash final/);
    assert.match(html, /Mensaje exacto recién preparado/);
    assert.equal(/id="simulate"/u.test(html), false);
  });
  it("el servidor expone Prepare y vigencia sin conservar el endpoint Simulate anterior", async () => {
    const source = await readFile("scripts/phantom/server.ts", "utf8");
    assert.match(source, /"\/api\/prepare"/);
    assert.match(source, /"\/api\/fresh-status"/);
    assert.equal(/"\/api\/simulate"/u.test(source), false);
    assert.match(source, /maxRetries: 0/);
  });
  it("el frontend metadata sólo firma manualmente create-metadata", async () => {
    const frontend = await import(pathToFileURL(resolve("tools/phantom-metadata/app.js")).href) as {
      deriveMetadataSignatureGate: (input: Record<string, unknown>) => { enabled: boolean };
      diagnoseConfirmationToken: (input: unknown) => { matches: boolean; rawMatches: boolean; trimmedMatches: boolean; nfc: string; nfkc: string; nfkcMatches: boolean; firstDifference: string; condition: string };
      isSendConfirmationEnabled: (input: Record<string, unknown>) => boolean;
    };
    const source = await readFile("tools/phantom-metadata/app.js", "utf8");
    const html = await readFile("tools/phantom-metadata/index.html", "utf8");
    const server = await readFile("scripts/phantom/metadata-server.ts", "utf8");
    assert.match(source, /provider\.signTransaction/);
    assert.equal(/signAndSendTransaction|provider\.sendTransaction/u.test(source), false);
    assert.match(source, /create-metadata/);
    assert.match(html, /ninguna emisión de AVI/);
    assert.match(server, /server\.listen\(port, "127\.0\.0\.1"/);
    assert.match(server, /maxRetries: 0/);
    assert.match(server, /process\.once\("SIGINT", shutdown\)/);
    assert.match(server, /process\.once\("SIGTERM", shutdown\)/);
    assert.match(server, /await rm\(bundleDirectory/);
    assert.match(source, /Prepare bloqueado por:/);
    assert.match(source, /\["input", "change"\]/);
    assert.match(server, /"\/api\/session-status"/);
    assert.match(server, /"\/api\/signature-aborted"/);
    assert.match(source, /provider\.signTransaction/);
    assert.match(source, /"\/api\/signature-aborted"/);
    const exactToken = frontend.diagnoseConfirmationToken("CONFIRMO-MAINNET-METADATA-PERMANENTE");
    assert.equal(exactToken.matches, true); assert.equal(exactToken.rawMatches, true);
    const pastedToken = frontend.diagnoseConfirmationToken("  CONFIRMO-MAINNET-METADATA-PERMANENTE\n");
    assert.equal(pastedToken.matches, false); assert.equal(pastedToken.rawMatches, false); assert.equal(pastedToken.trimmedMatches, true); assert.equal(pastedToken.nfc, "CONFIRMO-MAINNET-METADATA-PERMANENTE");
    const compatibilityToken = frontend.diagnoseConfirmationToken("ＣONFIRMO-MAINNET-METADATA-PERMANENTE");
    assert.equal(compatibilityToken.nfkc, "CONFIRMO-MAINNET-METADATA-PERMANENTE"); assert.equal(compatibilityToken.nfkcMatches, true); assert.equal(compatibilityToken.matches, false); assert.match(compatibilityToken.firstDifference, /U\+FF23/); assert.match(compatibilityToken.condition, /received === EXPECTED/);
    const simulated = frontend.deriveMetadataSignatureGate({ busy: false, status: "simulated", serverStatus: "simulated", serverSessionMatches: true, stablePlanHashMatches: true, serverPlanReviewed: true, fresh: { simulation: { logs: [] }, messageHash: "hash", canRequestSignature: true }, tokenExact: true, firstConfirmationChecked: true, executionEnabled: true });
    assert.equal(simulated.enabled, true);
    assert.equal(frontend.isSendConfirmationEnabled({ busy: false, status: "simulated", serverStatus: "simulated", expectedSignature: null }), false);
    assert.equal(frontend.isSendConfirmationEnabled({ busy: false, status: "signed", serverStatus: "signed", expectedSignature: "firma-esperada" }), true);
    assert.equal(frontend.isSendConfirmationEnabled({ busy: true, status: "signed", serverStatus: "signed", expectedSignature: "firma-esperada" }), true);
    assert.match(source, /if \(!sendConfirmationEnabled\) elements\.sendConfirm\.checked = false/);
    assert.match(source, /const explicitlyConfirmed = elements\.sendConfirm\.checked/);
    assert.match(source, /const confirmationToken = elements\.token\.value/);
    assert.match(source, /Request signature bloqueado por:/);
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
