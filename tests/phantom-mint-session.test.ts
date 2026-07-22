import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, VersionedTransaction, type VersionedMessage } from "@solana/web3.js";
import { MAINNET_CONFIG } from "../config/index.js";
import {
  CREATE_MINT_SEND_BLOCK_HEIGHT_MARGIN,
  CREATE_MINT_SIGNATURE_BLOCK_HEIGHT_MARGIN,
  CREATE_MINT_CONFIRMATION_TOKEN,
  PhantomCreateMintCoordinator,
  solanaTransactionSignature,
  type CreateMintPublicSession,
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
  lifetimes = [
    { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 250 },
    { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 350 },
    { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 450 },
  ];
  latestBlockhashCalls = 0;
  feeCalls = 0;
  simulateCalls = 0;
  simulatedMessageHash: string | null = null;
  simulatedBlockhash: string | null = null;
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
  async getLatestBlockhash() {
    const lifetime = this.lifetimes[Math.min(this.latestBlockhashCalls, this.lifetimes.length - 1)]!;
    this.latestBlockhashCalls += 1;
    return lifetime;
  }
  async getFeeForMessage(_message: VersionedMessage) { this.feeCalls += 1; return 10_000n; }
  async simulate(transaction: VersionedTransaction) {
    this.simulateCalls += 1;
    this.simulatedMessageHash = createHash("sha256").update(transaction.message.serialize()).digest("hex");
    this.simulatedBlockhash = transaction.message.recentBlockhash;
    return { logs: ["Program log: create-mint deterministic simulation"], unitsConsumed: 2_000 };
  }
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
  const mint = Keypair.generate();
  const rpc = new FakeCreateMintRpc(wallet.publicKey);
  const store = new MemoryRecoveryStore();
  const runtime: PhantomRuntimeAuthorization = {
    network: "mainnet-beta",
    rpcUrl: MAINNET_CONFIG.rpcUrl,
    expectedGenesisHash: MAINNET_CONFIG.genesisHash,
    productionWallet: wallet.publicKey.toBase58(),
    allowMainnet: true,
    operation: "create-mint",
    confirmationToken: CREATE_MINT_CONFIRMATION_TOKEN,
    ...overrides,
  };
  let keypairCreations = 0;
  let monotonic = 1_000;
  const coordinator = new PhantomCreateMintCoordinator(
    rpc,
    () => runtime,
    store,
    async () => undefined,
    () => new Date("2026-07-22T20:00:00Z"),
    () => { keypairCreations += 1; return mint; },
    async () => undefined,
    () => { monotonic += 1; return monotonic; },
  );
  return { wallet, mint, rpc, store, runtime, coordinator, keypairCreations: () => keypairCreations };
}

type Fixture = ReturnType<typeof fixture>;

function common(subject: Fixture, session: CreateMintPublicSession) {
  return { sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash };
}

async function reviewed(subject: Fixture) {
  const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
  return subject.coordinator.review(common(subject, built));
}

async function prepared(subject: Fixture) {
  const session = await reviewed(subject);
  return subject.coordinator.prepareFreshTransaction({
    ...common(subject, session),
    confirmationToken: subject.runtime.confirmationToken as string,
    explicitlyConfirmed: true,
  });
}

async function signPayload(subject: Fixture, session: CreateMintPublicSession) {
  const payload = await subject.coordinator.signingPayload({
    ...common(subject, session),
    confirmationToken: subject.runtime.confirmationToken as string,
    explicitlyConfirmed: true,
  });
  const transaction = VersionedTransaction.deserialize(Buffer.from(payload.transactionBase64, "base64"));
  transaction.sign([subject.wallet]);
  return { payload, transaction };
}

async function signed(subject: Fixture) {
  const session = await prepared(subject);
  const { payload, transaction } = await signPayload(subject, session);
  return subject.coordinator.acceptSignedTransaction({
    ...common(subject, session),
    messageHash: payload.messageHash,
    transactionBase64: Buffer.from(transaction.serialize()).toString("base64"),
  });
}

async function send(subject: Fixture, session: CreateMintPublicSession) {
  return subject.coordinator.send({
    ...common(subject, session),
    confirmationToken: subject.runtime.confirmationToken as string,
    explicitlyConfirmed: true,
  });
}

describe("coordinador Phantom create-mint con blockhash fresco", () => {
  it("rechaza wallet, red y genesis incorrectos", async () => {
    const wrongWallet = fixture();
    await assert.rejects(wrongWallet.coordinator.build({ connectedWallet: Keypair.generate().publicKey.toBase58(), operation: "create-mint" }), /wallet Phantom/);
    const wrongNetwork = fixture({ network: "devnet" });
    await assert.rejects(wrongNetwork.coordinator.build({ connectedWallet: wrongNetwork.wallet.publicKey.toBase58(), operation: "create-mint" }), /mainnet-beta/);
    const wrongGenesis = fixture();
    wrongGenesis.rpc.genesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    await assert.rejects(wrongGenesis.coordinator.build({ connectedWallet: wrongGenesis.wallet.publicKey.toBase58(), operation: "create-mint" }), /genesis hash real/);
  });

  it("Build crea sólo un plan estable y no obtiene blockhash, fee ni simulación", async () => {
    const subject = fixture();
    const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
    assert.equal(built.status, "plan_built");
    assert.equal(built.freshTransaction, null);
    assert.equal(subject.rpc.latestBlockhashCalls, 0);
    assert.equal(subject.rpc.feeCalls, 0);
    assert.equal(subject.rpc.simulateCalls, 0);
    assert.equal(Object.hasOwn(built.plan, "blockhash"), false);
    assert.equal(Object.hasOwn(built.plan, "lastValidBlockHeight"), false);
    assert.equal(Object.hasOwn(built.plan, "messageHash"), false);
  });

  it("exige Review, autorización y confirmación antes de preparar", async () => {
    const subject = fixture();
    const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, built), confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true }), /Transición inválida/);
    const review = await subject.coordinator.review(common(subject, built));
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, review), confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: false }), /confirmar Mainnet/);
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, review), confirmationToken: "incorrecto", explicitlyConfirmed: true }), /Token efímero/);
  });

  it("Prepare obtiene el blockhash más reciente y simula exactamente el mensaje mostrado", async () => {
    const subject = fixture();
    const session = await prepared(subject);
    assert.equal(session.status, "simulated");
    assert.equal(subject.rpc.latestBlockhashCalls, 1);
    assert.equal(subject.rpc.simulateCalls, 1);
    assert.equal(session.freshTransaction?.blockhash, subject.rpc.lifetimes[0]!.blockhash);
    assert.equal(session.freshTransaction?.blockhash, subject.rpc.simulatedBlockhash);
    assert.equal(session.freshTransaction?.messageHash, subject.rpc.simulatedMessageHash);
    assert.equal(session.freshTransaction?.stablePlanHash, session.plan.planHash);
    assert.equal(session.freshTransaction?.wallet, session.plan.wallet);
    assert.equal(session.freshTransaction?.mintAddress, session.plan.mintAddress);
    assert.equal(session.freshTransaction?.preparedAtMonotonicMs, 1_001);
  });

  it("mantiene plan hash y mint estables al refrescar el mensaje", async () => {
    const subject = fixture();
    const first = await prepared(subject);
    const second = await subject.coordinator.prepareFreshTransaction({ ...common(subject, first), confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
    assert.equal(first.plan.planHash, second.plan.planHash);
    assert.equal(first.plan.mintAddress, second.plan.mintAddress);
    assert.notEqual(first.freshTransaction?.blockhash, second.freshTransaction?.blockhash);
    assert.notEqual(first.freshTransaction?.messageHash, second.freshTransaction?.messageHash);
    assert.equal(second.refreshCount, 1);
    assert.equal(subject.keypairCreations(), 1);
  });

  it("invalida la firma anterior al refrescar antes del envío", async () => {
    const subject = fixture();
    const first = await signed(subject);
    const refreshed = await subject.coordinator.prepareFreshTransaction({ ...common(subject, first), confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
    assert.equal(refreshed.status, "simulated");
    assert.equal(refreshed.signatureInvalidated, true);
    assert.equal(refreshed.expectedSignature, null);
    assert.equal(refreshed.signature, null);
    assert.equal(refreshed.plan.mintAddress, first.plan.mintAddress);
  });

  it("rechaza firma si quedan menos de 40 block heights y permite preparar de nuevo", async () => {
    const subject = fixture();
    subject.rpc.lifetimes[0] = { ...subject.rpc.lifetimes[0]!, lastValidBlockHeight: 139 };
    const session = await prepared(subject);
    assert.equal(session.freshTransaction?.remainingBlockHeights, 39);
    await assert.rejects(signPayload(subject, session), new RegExp(`se requieren ${CREATE_MINT_SIGNATURE_BLOCK_HEIGHT_MARGIN}`));
    const refreshed = await subject.coordinator.prepareFreshTransaction({ ...common(subject, session), confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true });
    assert.equal(refreshed.status, "simulated");
    assert.equal(refreshed.plan.mintAddress, session.plan.mintAddress);
  });

  it("rechaza una firma que llega con menos de 20 block heights", async () => {
    const subject = fixture();
    const session = await prepared(subject);
    const { payload, transaction } = await signPayload(subject, session);
    subject.rpc.blockHeight = subject.rpc.lifetimes[0]!.lastValidBlockHeight - CREATE_MINT_SEND_BLOCK_HEIGHT_MARGIN + 1;
    await assert.rejects(subject.coordinator.acceptSignedTransaction({ ...common(subject, session), messageHash: payload.messageHash, transactionBase64: Buffer.from(transaction.serialize()).toString("base64") }), /aceptar la firma/);
  });

  it("rechaza el envío si el margen cae por debajo de 20", async () => {
    const subject = fixture();
    const session = await signed(subject);
    subject.rpc.blockHeight = subject.rpc.lifetimes[0]!.lastValidBlockHeight - CREATE_MINT_SEND_BLOCK_HEIGHT_MARGIN + 1;
    await assert.rejects(send(subject, session), /se requieren 20/);
    assert.equal(subject.rpc.sent, 0);
  });

  it("rechaza una firma de un mensaje o blockhash distinto", async () => {
    const subject = fixture();
    const session = await prepared(subject);
    const { payload, transaction } = await signPayload(subject, session);
    transaction.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
    transaction.sign([subject.wallet]);
    await assert.rejects(subject.coordinator.acceptSignedTransaction({ ...common(subject, session), messageHash: payload.messageHash, transactionBase64: Buffer.from(transaction.serialize()).toString("base64") }), /mensaje o blockhash distinto/);
  });

  it("bloquea doble Build y doble Send", async () => {
    const subject = fixture();
    const session = await signed(subject);
    await assert.rejects(subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" }), /segundo mint/);
    subject.rpc.blockNextSend();
    const first = send(subject, session);
    await subject.rpc.sendStarted;
    await assert.rejects(send(subject, session), /Transición inválida|no se duplicará/);
    subject.rpc.releaseSend?.();
    await first;
    assert.equal(subject.rpc.sent, 1);
  });

  it("prohíbe refresh después de Send", async () => {
    const subject = fixture();
    const sent = await send(subject, await signed(subject));
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, sent), confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true }), /Transición inválida/);
  });

  it("un timeout de envío queda ambiguo y prohíbe refresh", async () => {
    const subject = fixture();
    const session = await signed(subject);
    subject.rpc.sendFails = true;
    await assert.rejects(send(subject, session), /ambiguo/);
    assert.equal(subject.rpc.sent, 1);
    assert.equal(subject.store.record?.status, "ambiguous");
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, session), confirmationToken: subject.runtime.confirmationToken as string, explicitlyConfirmed: true }), /Transición inválida/);
  });

  it("una confirmación ambigua conserva evidencia y bloquea otro mint", async () => {
    const subject = fixture();
    const sent = await send(subject, await signed(subject));
    subject.rpc.confirmFails = true;
    const resolution = await subject.coordinator.verifyFinalized(common(subject, sent));
    assert.equal(resolution.status, "ambiguous");
    const restarted = new PhantomCreateMintCoordinator(subject.rpc, () => subject.runtime, subject.store);
    await assert.rejects(restarted.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" }), /resuélvela antes/);
  });

  it("cancelar descarta mensaje, firmas y material secreto en memoria", async () => {
    const subject = fixture();
    const session = await signed(subject);
    const cancelled = await subject.coordinator.cancel(common(subject, session));
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.freshTransaction, null);
    assert.equal(cancelled.signature, null);
    assert.equal(cancelled.expectedSignature, null);
    assert.equal(subject.mint.secretKey.every((byte) => byte === 0), true);
  });

  it("el plan contiene sólo createAccount e initializeMint2, freeze none y supply 0", async () => {
    const subject = fixture();
    const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-mint" });
    assert.deepEqual(built.plan.instructions, ["system:createAccount", "spl-token:initializeMint2"]);
    assert.deepEqual(built.plan.programs, ["11111111111111111111111111111111", TOKEN_PROGRAM_ID.toBase58()]);
    assert.equal(built.plan.freezeAuthority, null);
    assert.equal(built.plan.supply, "0");
    assert.equal(/metadata|associated|mintTo/iu.test(JSON.stringify(built.plan.instructions)), false);
  });

  it("ALLOW_MAINNET=false bloquea Prepare y una configuración mutada bloquea Send", async () => {
    const disabled = fixture({ allowMainnet: false });
    const review = await reviewed(disabled);
    await assert.rejects(disabled.coordinator.prepareFreshTransaction({ ...common(disabled, review), confirmationToken: disabled.runtime.confirmationToken as string, explicitlyConfirmed: true }), /ALLOW_MAINNET/);
    const enabled = fixture();
    const signedSession = await signed(enabled);
    Object.assign(enabled.runtime, { allowMainnet: false });
    await assert.rejects(send(enabled, signedSession), /configuración cambió|ALLOW_MAINNET/);
  });

  it("no persiste secretos ni imprime el keypair efímero", async () => {
    const subject = fixture();
    await send(subject, await signed(subject));
    const persisted = JSON.stringify(subject.store.record);
    assert.equal(/secret|private|seed|transactionBase64|keypair/iu.test(persisted), false);
    const source = await readFile("scripts/lib/phantom-mint-session.ts", "utf8");
    assert.equal(/console\./u.test(source), false);
  });
});
