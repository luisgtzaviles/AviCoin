import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { Keypair, PublicKey, VersionedTransaction, type VersionedMessage } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MAINNET_CONFIG } from "../config/index.js";
import {
  PhantomCreateMintCoordinator,
  solanaTransactionSignature,
  type CreateMintRpc,
  type PhantomRuntimeAuthorization,
  type PublicRecoveryRecord,
  type PublicRecoveryStore,
} from "../scripts/lib/phantom-mint-session.js";

class MemoryRecoveryStore implements PublicRecoveryStore {
  record: PublicRecoveryRecord | null = null;
  async load() { return this.record; }
  async save(record: PublicRecoveryRecord) { this.record = structuredClone(record); }
}

class FakeCreateMintRpc implements CreateMintRpc {
  genesis: string = MAINNET_CONFIG.genesisHash;
  blockHeight = 100;
  readonly lifetime = { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 200 };
  confirmFails = false;
  sendFails = false;
  sent = 0;
  sendStarted: Promise<void> | null = null;
  releaseSend: (() => void) | null = null;
  private startSend: (() => void) | null = null;

  constructor(readonly wallet: PublicKey) {}
  async getGenesisHash() { return this.genesis; }
  async getBalance() { return 1_000_000_000n; }
  async getAccountOwner() { return null; }
  async getMinimumBalanceForRentExemption() { return 1_461_600n; }
  async getLatestBlockhash() { return this.lifetime; }
  async getFeeForMessage(_message: VersionedMessage) { return 5_000n; }
  async simulate() { return { logs: ["Program log: create-mint simulation"], unitsConsumed: 2_000 }; }
  async getBlockHeight() { return this.blockHeight; }
  async sendRawTransaction(transaction: Uint8Array) {
    this.sent += 1;
    this.startSend?.();
    if (this.sendStarted) await new Promise<void>((resolve) => { this.releaseSend = resolve; });
    if (this.sendFails) throw new Error("timeout");
    return solanaTransactionSignature(VersionedTransaction.deserialize(transaction));
  }
  async confirmFinalized() { if (this.confirmFails) throw new Error("timeout"); }
  async getSignatureStatus() { return this.confirmFails ? "processed" : "finalized"; }
  async readMint() {
    return { owner: TOKEN_PROGRAM_ID.toBase58(), snapshot: { decimals: 9, supply: 0n, mintAuthority: this.wallet.toBase58(), freezeAuthority: null } };
  }
  blockNextSend() {
    this.sendStarted = new Promise<void>((resolve) => { this.startSend = resolve; });
  }
}

function fixture(overrides: Partial<PhantomRuntimeAuthorization> = {}) {
  const wallet = Keypair.generate();
  const rpc = new FakeCreateMintRpc(wallet.publicKey);
  const store = new MemoryRecoveryStore();
  const runtime: PhantomRuntimeAuthorization = {
    network: "mainnet-beta",
    rpcUrl: MAINNET_CONFIG.rpcUrl,
    expectedGenesisHash: MAINNET_CONFIG.genesisHash,
    productionWallet: wallet.publicKey.toBase58(),
    allowMainnet: true,
    operation: "create-mint",
    confirmationToken: "confirmacion-efimera-2026",
    ...overrides,
  };
  let clock = new Date("2026-07-22T20:00:00Z");
  const coordinator = new PhantomCreateMintCoordinator(rpc, () => runtime, store, async () => undefined, () => clock, () => Keypair.generate());
  return { wallet, rpc, store, runtime, coordinator, setClock: (value: Date) => { clock = value; } };
}

async function reviewed(subject: ReturnType<typeof fixture>) {
  const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
  const simulated = await subject.coordinator.simulate({ sessionId: built.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: built.plan.planHash });
  return subject.coordinator.review({ sessionId: simulated.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: simulated.plan.planHash });
}

async function signed(subject: ReturnType<typeof fixture>) {
  const session = await reviewed(subject);
  const payload = await subject.coordinator.signingPayload({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
  const transaction = VersionedTransaction.deserialize(Buffer.from(payload.transactionBase64, "base64"));
  transaction.sign([subject.wallet]);
  return subject.coordinator.acceptSignedTransaction({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, messageHash: payload.messageHash, transactionBase64: Buffer.from(transaction.serialize()).toString("base64") });
}

describe("adaptador Phantom create-mint", () => {
  it("rechaza wallet incorrecta", async () => {
    const subject = fixture();
    await assert.rejects(subject.coordinator.build({ connectedWallet: Keypair.generate().publicKey.toBase58(), operation: "create-mint" }), /wallet Phantom/);
  });

  it("rechaza red y genesis incorrectos", async () => {
    const wrongNetwork = fixture({ network: "devnet" });
    await assert.rejects(wrongNetwork.coordinator.build({ connectedWallet: wrongNetwork.wallet.publicKey.toBase58(), operation: "create-mint" }), /mainnet-beta/);
    const wrongGenesis = fixture();
    wrongGenesis.rpc.genesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    await assert.rejects(wrongGenesis.coordinator.build({ connectedWallet: wrongGenesis.wallet.publicKey.toBase58(), operation: "create-mint" }), /genesis hash real/);
  });

  it("impide solicitar firma antes de simulación y enviar antes de firma", async () => {
    const subject = fixture();
    const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
    await assert.rejects(subject.coordinator.signingPayload({ sessionId: built.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: built.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true }), /Transición inválida/);
    const unsigned = fixture();
    const session = await reviewed(unsigned);
    assert.equal(session.status, "reviewed");
    await assert.rejects(unsigned.coordinator.send({ sessionId: session.sessionId, connectedWallet: unsigned.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: unsigned.runtime.confirmationToken as string, explicitlyConfirmed: true }), /Transición inválida/);
  });

  it("un cambio del plan invalida la autorización", async () => {
    const subject = fixture();
    const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
    await assert.rejects(subject.coordinator.simulate({ sessionId: built.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: `${built.plan.planHash}00` }), /plan cambió/);
  });

  it("rechaza envío con blockhash vencido", async () => {
    const subject = fixture();
    const session = await signed(subject);
    subject.rpc.blockHeight = subject.rpc.lifetime.lastValidBlockHeight + 1;
    await assert.rejects(subject.coordinator.send({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true }), /blockhash expiró/);
  });

  it("un doble clic no duplica el envío", async () => {
    const subject = fixture();
    const session = await signed(subject);
    subject.rpc.blockNextSend();
    const first = subject.coordinator.send({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
    await subject.rpc.sendStarted;
    await assert.rejects(subject.coordinator.send({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true }), /Transición inválida|no se duplicará/);
    subject.rpc.releaseSend?.();
    await first;
    assert.equal(subject.rpc.sent, 1);
  });

  it("timeout conserva evidencia pública y no construye un segundo mint", async () => {
    const subject = fixture();
    const session = await signed(subject);
    const sent = await subject.coordinator.send({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
    subject.rpc.confirmFails = true;
    const resolution = await subject.coordinator.verifyFinalized({ sessionId: sent.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: sent.plan.planHash });
    assert.equal(resolution.status, "ambiguous");
    const restarted = new PhantomCreateMintCoordinator(subject.rpc, () => subject.runtime, subject.store);
    await assert.rejects(restarted.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" }), /resuélvela antes/);
  });

  it("timeout del RPC conserva la firma derivada sin reintentar", async () => {
    const subject = fixture();
    const session = await signed(subject);
    subject.rpc.sendFails = true;
    await assert.rejects(subject.coordinator.send({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true }), /ambiguo/);
    assert.equal(subject.rpc.sent, 1);
    assert.equal(subject.store.record?.status, "ambiguous");
    assert.ok(subject.store.record?.signature);
    assert.equal(subject.store.record?.mintAddress, session.plan.mintAddress);
  });

  it("rechaza una firma de mensaje distinto", async () => {
    const subject = fixture();
    const session = await reviewed(subject);
    const payload = await subject.coordinator.signingPayload({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
    const transaction = VersionedTransaction.deserialize(Buffer.from(payload.transactionBase64, "base64"));
    transaction.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
    transaction.sign([subject.wallet]);
    await assert.rejects(subject.coordinator.acceptSignedTransaction({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, messageHash: payload.messageHash, transactionBase64: Buffer.from(transaction.serialize()).toString("base64") }), /mensaje distinto/);
  });

  it("no persiste secretos ni imprime el keypair efímero", async () => {
    const subject = fixture();
    const session = await signed(subject);
    await subject.coordinator.send({ sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
    const persisted = JSON.stringify(subject.store.record);
    assert.equal(/secret|private|seed|transactionBase64|keypair/iu.test(persisted), false);
    const source = await readFile("scripts/lib/phantom-mint-session.ts", "utf8");
    assert.equal(/console\./u.test(source), false);
  });

  it("create-mint contiene sólo createAccount e initializeMint2, con freeze none y supply 0", async () => {
    const subject = fixture();
    const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
    assert.deepEqual(built.plan.instructions, ["system:createAccount", "spl-token:initializeMint2"]);
    assert.deepEqual(built.plan.programs, ["11111111111111111111111111111111", TOKEN_PROGRAM_ID.toBase58()]);
    assert.equal(built.plan.freezeAuthority, null);
    assert.equal(built.plan.supply, "0");
    assert.equal(/metadata|associated|mintTo/iu.test(JSON.stringify(built.plan.instructions)), false);
  });

  it("ALLOW_MAINNET=false bloquea la solicitud de firma y el envío", async () => {
    const disabled = fixture({ allowMainnet: false });
    const session = await reviewed(disabled);
    await assert.rejects(disabled.coordinator.signingPayload({ sessionId: session.sessionId, connectedWallet: disabled.wallet.publicKey.toBase58(), planHash: session.plan.planHash, confirmationToken: disabled.runtime.confirmationToken as string, explicitlyConfirmed: true }), /ALLOW_MAINNET/);
    const enabled = fixture();
    const signedSession = await signed(enabled);
    Object.assign(enabled.runtime, { allowMainnet: false });
    await assert.rejects(enabled.coordinator.send({ sessionId: signedSession.sessionId, connectedWallet: enabled.wallet.publicKey.toBase58(), planHash: signedSession.plan.planHash, confirmationToken: enabled.runtime.confirmationToken as string, explicitlyConfirmed: true }), /configuración cambió|ALLOW_MAINNET/);
  });
});
