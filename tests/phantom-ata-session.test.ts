import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PublicKey, type VersionedMessage, type VersionedTransaction } from "@solana/web3.js";
import { MAINNET_CONFIG, MAINNET_PRODUCTION_WALLET } from "../config/index.js";
import {
  AVICOIN_MAINNET_ATA,
  AVICOIN_MAINNET_MINT,
  CREATE_ATA_CONFIRMATION_TOKEN,
  PhantomCreateAtaCoordinator,
  type AtaRecoveryRecord,
  type AtaRecoveryStore,
  type AtaRpc,
} from "../scripts/lib/phantom-ata-session.js";

class MemoryRecovery implements AtaRecoveryStore {
  record: AtaRecoveryRecord | null = null;
  async load() { return this.record; }
  async save(record: AtaRecoveryRecord) { this.record = record; }
}

class FakeAtaRpc implements AtaRpc {
  ata: { readonly programOwner: string; readonly mint: string; readonly owner: string; readonly amount: bigint } | null = null;
  simulated = 0;
  sent = 0;
  blockHeight = 100;
  async getGenesisHash() { return MAINNET_CONFIG.genesisHash; }
  async getBalance() { return 300_000_000n; }
  async getMinimumBalanceForRentExemption() { return 2_039_280n; }
  async getLatestBlockhash() { return { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 250 }; }
  async getFeeForMessage(_message: VersionedMessage) { return 5_100n; }
  async simulate(_transaction: VersionedTransaction) { this.simulated += 1; return { logs: ["associated-token:createIdempotent success"], unitsConsumed: 20_000 }; }
  async getBlockHeight() { return this.blockHeight; }
  async sendRawTransaction() { this.sent += 1; return "unused"; }
  async confirmFinalized() {}
  async getSignatureStatus() { return null; }
  async readMint(_address: PublicKey) { return { owner: MAINNET_CONFIG.programs.splToken, snapshot: { decimals: 9, supply: 0n, mintAuthority: MAINNET_PRODUCTION_WALLET, freezeAuthority: null } }; }
  async readAta() { return this.ata; }
}

function runtime(overrides: Record<string, unknown> = {}) {
  return {
    network: "mainnet-beta",
    rpcUrl: MAINNET_CONFIG.rpcUrl,
    expectedGenesisHash: MAINNET_CONFIG.genesisHash,
    productionWallet: MAINNET_PRODUCTION_WALLET,
    allowMainnet: true,
    operation: "create-ata",
    confirmationToken: CREATE_ATA_CONFIRMATION_TOKEN,
    ...overrides,
  };
}

function coordinator(rpc = new FakeAtaRpc(), runtimeOverrides: Record<string, unknown> = {}) {
  let metadataChecks = 0;
  const instance = new PhantomCreateAtaCoordinator(rpc, () => runtime(runtimeOverrides), new MemoryRecovery(), async () => undefined, async () => { metadataChecks += 1; });
  return { instance, rpc, metadataChecks: () => metadataChecks };
}

async function reviewed(instance: PhantomCreateAtaCoordinator) {
  const built = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "create-ata" });
  return instance.review({ sessionId: built.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: built.plan.planHash });
}

describe("coordinador Phantom create-ata", () => {
  it("deriva exclusivamente la ATA oficial y mantiene supply cero", async () => {
    const { instance, rpc, metadataChecks } = coordinator();
    const session = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "create-ata" });
    assert.equal(session.plan.operation, "create-ata");
    assert.equal(session.plan.mintAddress, AVICOIN_MAINNET_MINT);
    assert.equal(session.plan.ata, AVICOIN_MAINNET_ATA);
    assert.equal(session.plan.owner, MAINNET_PRODUCTION_WALLET);
    assert.equal(session.plan.instruction, "associated-token:createIdempotent");
    assert.equal(session.plan.signerAccounts.length, 1);
    assert.equal(rpc.sent, 0);
    assert.equal(metadataChecks(), 1);
  });

  it("Prepare exige Review, token exacto y confirmación manual", async () => {
    const { instance } = coordinator();
    const built = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "create-ata" });
    const common = { sessionId: built.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: built.plan.planHash };
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: CREATE_ATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /Transición inválida/);
    const reviewedSession = await instance.review(common);
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: `${CREATE_ATA_CONFIRMATION_TOKEN} `, explicitlyConfirmed: true }), /Token/);
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: CREATE_ATA_CONFIRMATION_TOKEN, explicitlyConfirmed: false }), /Confirma/);
    assert.equal(reviewedSession.planReviewed, true);
  });

  it("simula un mensaje fresco sin firmar ni enviar", async () => {
    const { instance, rpc } = coordinator();
    const session = await reviewed(instance);
    const prepared = await instance.prepareFreshTransaction({ sessionId: session.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: session.plan.planHash, confirmationToken: CREATE_ATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
    assert.equal(prepared.status, "simulated");
    assert.equal(prepared.planReviewed, true);
    assert.equal(prepared.freshTransaction?.canRequestSignature, true);
    assert.equal(rpc.simulated, 1);
    assert.equal(rpc.sent, 0);
  });

  it("rechaza red, operación, wallet, ATA existente y ALLOW_MAINNET falso", async () => {
    await assert.rejects(coordinator(new FakeAtaRpc(), { network: "devnet" }).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "create-ata" }), /mainnet-beta/);
    await assert.rejects(coordinator().instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "create-metadata" }), /Sólo create-ata/);
    await assert.rejects(coordinator().instance.build({ connectedWallet: "11111111111111111111111111111111", operation: "create-ata" }), /wallet Phantom/);
    const rpc = new FakeAtaRpc(); rpc.ata = { programOwner: MAINNET_CONFIG.programs.splToken, mint: AVICOIN_MAINNET_MINT, owner: MAINNET_PRODUCTION_WALLET, amount: 0n };
    await assert.rejects(coordinator(rpc).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "create-ata" }), /ya existe/);
    const { instance } = coordinator(new FakeAtaRpc(), { allowMainnet: false });
    const session = await reviewed(instance);
    await assert.rejects(instance.prepareFreshTransaction({ sessionId: session.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: session.plan.planHash, confirmationToken: CREATE_ATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /ALLOW_MAINNET/);
  });

  it("frontend y servidor no contienen mintTo ni operaciones posteriores", async () => {
    const sources = await Promise.all([
      readFile("scripts/lib/phantom-ata-session.ts", "utf8"),
      readFile("scripts/phantom/ata-server.ts", "utf8"),
      readFile("tools/phantom-ata/app.js", "utf8"),
    ]);
    assert.doesNotMatch(sources[0], /createMintTo|mintToChecked|mintToInstruction/);
    assert.doesNotMatch(sources[1], /createMintTo|mintToChecked|mintToInstruction/);
    assert.match(sources[2], /"mintTo"/);
    assert.match(sources[2], /— bloqueada/);
    assert.doesNotMatch(sources.join("\n"), /Keypair|secretKey|seed phrase/iu);
  });
});
