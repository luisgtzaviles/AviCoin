import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ComputeBudgetProgram, Keypair, PublicKey, VersionedTransaction, type VersionedMessage } from "@solana/web3.js";
import { MAINNET_CONFIG } from "../config/index.js";
import { MAINNET_METADATA_URI, createMainnetMetadataInstruction } from "../scripts/lib/mainnet-metadata.js";
import {
  CREATE_METADATA_CONFIRMATION_TOKEN,
  CREATE_METADATA_COMPUTE_UNIT_LIMIT,
  CREATE_METADATA_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  CREATE_METADATA_MAX_PRIORITY_FEE_LAMPORTS,
  CREATE_METADATA_SEND_BLOCK_HEIGHT_MARGIN,
  CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN,
  PhantomCreateMetadataCoordinator,
  type MetadataPublicSession,
  type MetadataRecoveryRecord,
  type MetadataRecoveryStore,
  type MetadataRpc,
} from "../scripts/lib/phantom-metadata-session.js";
import { solanaTransactionSignature, type PhantomRuntimeAuthorization } from "../scripts/lib/phantom-mint-session.js";

const MINT = "GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC";

class Store implements MetadataRecoveryStore {
  record: MetadataRecoveryRecord | null = null;
  async load() { return this.record; }
  async save(record: MetadataRecoveryRecord) { this.record = structuredClone(record); }
}

class FakeRpc implements MetadataRpc {
  genesis: string = MAINNET_CONFIG.genesisHash;
  blockHeight = 100;
  lifetimes = [
    { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 250 },
    { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 350 },
  ];
  latestCalls = 0;
  simulateCalls = 0;
  onSimulate: (() => void) | null = null;
  sent = 0;
  sendFails = false;
  confirmFails = false;
  metadataAvailable = false;
  constructor(readonly wallet: PublicKey, readonly metadataPda: string) {}
  async getGenesisHash() { return this.genesis; }
  async getBalance() { return 338_092_619n; }
  async getAccountOwner(address: PublicKey) { return address.toBase58() === this.metadataPda && this.metadataAvailable ? MAINNET_CONFIG.programs.tokenMetadata : null; }
  async getMinimumBalanceForRentExemption() { return 5_616_720n; }
  async getLatestBlockhash() { const value = this.lifetimes[Math.min(this.latestCalls, this.lifetimes.length - 1)]!; this.latestCalls += 1; return value; }
  async getFeeForMessage(_message: VersionedMessage) { return 5_200n; }
  async simulate(transaction: VersionedTransaction) {
    this.simulateCalls += 1;
    const instructions = transaction.message.compiledInstructions;
    assert.equal(instructions.length, 3);
    assert.equal(transaction.message.staticAccountKeys[instructions[0]!.programIdIndex]?.toBase58(), ComputeBudgetProgram.programId.toBase58());
    assert.equal(transaction.message.staticAccountKeys[instructions[1]!.programIdIndex]?.toBase58(), ComputeBudgetProgram.programId.toBase58());
    assert.equal(transaction.message.staticAccountKeys[instructions[2]!.programIdIndex]?.toBase58(), MAINNET_CONFIG.programs.tokenMetadata);
    const limitData = Buffer.from(instructions[0]!.data);
    const priceData = Buffer.from(instructions[1]!.data);
    assert.equal(limitData.readUInt8(0), 2); assert.equal(limitData.readUInt32LE(1), CREATE_METADATA_COMPUTE_UNIT_LIMIT);
    assert.equal(priceData.readUInt8(0), 3); assert.equal(priceData.readBigUInt64LE(1), CREATE_METADATA_COMPUTE_UNIT_PRICE_MICROLAMPORTS);
    this.onSimulate?.();
    return { logs: ["Program log: metadata simulation"], unitsConsumed: 20_000 };
  }
  async getBlockHeight() { return this.blockHeight; }
  async sendRawTransaction(transaction: Uint8Array) { this.sent += 1; if (this.sendFails) throw new Error("timeout"); return solanaTransactionSignature(VersionedTransaction.deserialize(transaction)); }
  async confirmFinalized() { if (this.confirmFails) throw new Error("timeout"); }
  async getSignatureStatus() { return this.confirmFails ? "processed" : "finalized"; }
  async readMint() { return { owner: MAINNET_CONFIG.programs.splToken, snapshot: { decimals: 9, supply: 0n, mintAuthority: this.wallet.toBase58(), freezeAuthority: null } }; }
  async readMetadata() {
    if (!this.metadataAvailable) return null;
    return { publicKey: this.metadataPda, owner: MAINNET_CONFIG.programs.tokenMetadata, mint: MINT, name: "AVICOIN", symbol: "AVI", uri: MAINNET_METADATA_URI, sellerFeeBasisPoints: 0, isMutable: true, updateAuthority: this.wallet.toBase58(), hasCreators: false, hasCollection: false, hasUses: false };
  }
}

function fixture(overrides: Partial<PhantomRuntimeAuthorization> = {}) {
  const wallet = Keypair.generate();
  const metadataPda = createMainnetMetadataInstruction(MAINNET_CONFIG.rpcUrl, wallet.publicKey.toBase58(), MINT).metadataPda;
  const rpc = new FakeRpc(wallet.publicKey, metadataPda);
  const store = new Store();
  const runtime: PhantomRuntimeAuthorization = { network: "mainnet-beta", rpcUrl: MAINNET_CONFIG.rpcUrl, expectedGenesisHash: MAINNET_CONFIG.genesisHash, productionWallet: wallet.publicKey.toBase58(), allowMainnet: true, operation: "create-metadata", confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, ...overrides };
  let finalizedPda: string | null = null;
  const coordinator = new PhantomCreateMetadataCoordinator(rpc, () => runtime, store, async () => undefined, async () => undefined, async (pda) => { finalizedPda = pda; }, () => new Date("2026-07-23T00:00:00Z"), () => 1_000);
  return { wallet, rpc, store, runtime, coordinator, finalizedPda: () => finalizedPda };
}

type Fixture = ReturnType<typeof fixture>;
function common(subject: Fixture, session: MetadataPublicSession) { return { sessionId: session.sessionId, connectedWallet: subject.wallet.publicKey.toBase58(), planHash: session.plan.planHash }; }
async function reviewed(subject: Fixture) { const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-metadata" }); return subject.coordinator.review(common(subject, built)); }
async function prepared(subject: Fixture) { const session = await reviewed(subject); return subject.coordinator.prepareFreshTransaction({ ...common(subject, session), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }); }
async function signed(subject: Fixture) {
  const session = await prepared(subject);
  const payload = await subject.coordinator.signingPayload({ ...common(subject, session), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
  const transaction = VersionedTransaction.deserialize(Buffer.from(payload.transactionBase64, "base64"));
  transaction.sign([subject.wallet]);
  return subject.coordinator.acceptSignedTransaction({ ...common(subject, session), messageHash: payload.messageHash, transactionBase64: Buffer.from(transaction.serialize()).toString("base64") });
}
async function send(subject: Fixture, session: MetadataPublicSession) { return subject.coordinator.send({ ...common(subject, session), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }); }

describe("coordinador Phantom create-metadata", () => {
  it("Build produce plan estable sin blockhash y con metadata exacta", async () => {
    const subject = fixture();
    const session = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-metadata" });
    assert.equal(session.freshTransaction, null); assert.equal(subject.rpc.latestCalls, 0); assert.equal(subject.rpc.simulateCalls, 0);
    assert.equal(session.plan.mintAddress, MINT); assert.equal(session.plan.metadataProgram, MAINNET_CONFIG.programs.tokenMetadata); assert.equal(session.plan.uri, MAINNET_METADATA_URI);
    assert.equal(session.plan.isMutable, true); assert.equal(session.plan.sellerFeeBasisPoints, 0); assert.equal(session.plan.creators, null);
    assert.equal(session.plan.computeUnitLimit, CREATE_METADATA_COMPUTE_UNIT_LIMIT);
    assert.equal(session.plan.computeUnitPriceMicroLamports, CREATE_METADATA_COMPUTE_UNIT_PRICE_MICROLAMPORTS.toString());
    assert.equal(session.plan.maximumPriorityFeeLamports, CREATE_METADATA_MAX_PRIORITY_FEE_LAMPORTS.toString());
  });

  it("rechaza wallet, red, genesis y operación incorrectos", async () => {
    const subject = fixture();
    await assert.rejects(subject.coordinator.build({ connectedWallet: Keypair.generate().publicKey.toBase58(), operation: "create-metadata" }), /wallet Phantom/);
    const network = fixture({ network: "devnet" }); await assert.rejects(network.coordinator.build({ connectedWallet: network.wallet.publicKey.toBase58(), operation: "create-metadata" }), /mainnet-beta/);
    const genesis = fixture(); genesis.rpc.genesis = "incorrecto"; await assert.rejects(genesis.coordinator.build({ connectedWallet: genesis.wallet.publicKey.toBase58(), operation: "create-metadata" }), /genesis real/);
    const operation = fixture(); await assert.rejects(operation.coordinator.build({ connectedWallet: operation.wallet.publicKey.toBase58(), operation: "create-mint" }), /Sólo create-metadata/);
  });

  it("se detiene si la metadata PDA ya existe", async () => {
    const subject = fixture(); subject.rpc.metadataAvailable = true;
    await assert.rejects(subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-metadata" }), /metadata ya existe/);
  });

  it("Prepare exige Review, token exacto y confirmación", async () => {
    const subject = fixture(); const built = await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-metadata" });
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, built), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /Transición inválida/);
    const review = await subject.coordinator.review(common(subject, built));
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, review), confirmationToken: "incorrecto", explicitlyConfirmed: true }), /Token/);
    const compatibilityVariant = CREATE_METADATA_CONFIRMATION_TOKEN.replace("C", "Ｃ");
    assert.equal(compatibilityVariant.normalize("NFKC"), CREATE_METADATA_CONFIRMATION_TOKEN);
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, review), confirmationToken: compatibilityVariant, explicitlyConfirmed: true }), /Token/);
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, review), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: false }), /Confirma Mainnet/);
  });

  it("rechaza whitespace exterior y no firma ni envía", async () => {
    const subject = fixture(); const review = await reviewed(subject);
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, review), confirmationToken: `\n ${CREATE_METADATA_CONFIRMATION_TOKEN}\t`, explicitlyConfirmed: true }), /Token/);
    assert.equal(subject.rpc.sent, 0); assert.equal(subject.rpc.latestCalls, 0);
  });

  it("Prepare usa latest blockhash y simula presupuesto determinístico más metadata", async () => {
    const subject = fixture();
    const reviewedSession = await reviewed(subject);
    assert.equal(subject.coordinator.diagnostics().planReviewed, true);
    subject.rpc.onSimulate = () => {
      const diagnostics = subject.coordinator.diagnostics();
      assert.equal(diagnostics.status, "fresh_message_prepared");
      assert.equal(diagnostics.planReviewed, true);
    };
    const session = await subject.coordinator.prepareFreshTransaction({ ...common(subject, reviewedSession), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
    assert.equal(session.status, "simulated"); assert.equal(subject.rpc.latestCalls, 1); assert.equal(subject.rpc.simulateCalls, 1);
    assert.equal(session.planReviewed, true); assert.equal(subject.coordinator.diagnostics().planReviewed, true); assert.equal(subject.rpc.sent, 0);
    assert.equal(session.freshTransaction?.blockhash, subject.rpc.lifetimes[0]!.blockhash); assert.equal(session.freshTransaction?.stablePlanHash, session.plan.planHash);
    assert.equal(session.freshTransaction?.feeLamports, "5200");
  });

  it("polling conserva Review autoritativo después de simulación sin firmar ni enviar", async () => {
    const subject = fixture(); const session = await prepared(subject);
    const polled = await subject.coordinator.freshStatus(common(subject, session));
    assert.equal(polled.status, "simulated"); assert.equal(polled.planReviewed, true);
    assert.equal(subject.coordinator.diagnostics().planReviewed, true);
    assert.equal(subject.rpc.sent, 0); assert.equal(polled.signature, null); assert.equal(polled.expectedSignature, null);
  });

  it("revierte signature_requested a simulated cuando Phantom no devuelve firma", async () => {
    const subject = fixture(); const session = await prepared(subject);
    await subject.coordinator.signingPayload({ ...common(subject, session), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
    assert.equal(subject.coordinator.diagnostics().status, "signature_requested");
    const recovered = await subject.coordinator.abortSignatureRequest(common(subject, session));
    assert.equal(recovered.status, "simulated"); assert.equal(recovered.planReviewed, true); assert.notEqual(recovered.freshTransaction, null);
    assert.equal(recovered.signature, null); assert.equal(recovered.expectedSignature, null); assert.equal(subject.rpc.sent, 0);
  });

  it("invalida el mensaje si Phantom no firma y ya no existe margen", async () => {
    const subject = fixture(); const session = await prepared(subject);
    await subject.coordinator.signingPayload({ ...common(subject, session), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
    subject.rpc.blockHeight = subject.rpc.lifetimes[0]!.lastValidBlockHeight - CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN + 1;
    const recovered = await subject.coordinator.abortSignatureRequest(common(subject, session));
    assert.equal(recovered.status, "plan_reviewed"); assert.equal(recovered.planReviewed, true); assert.equal(recovered.freshTransaction, null);
    assert.equal(recovered.signature, null); assert.equal(recovered.expectedSignature, null); assert.equal(subject.rpc.sent, 0);
  });

  it("refresh previo conserva plan/PDA e invalida firma", async () => {
    const subject = fixture(); const first = await signed(subject);
    const second = await subject.coordinator.prepareFreshTransaction({ ...common(subject, first), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
    assert.equal(second.plan.planHash, first.plan.planHash); assert.equal(second.plan.metadataPda, first.plan.metadataPda); assert.equal(second.signatureInvalidated, true); assert.notEqual(second.freshTransaction?.blockhash, first.freshTransaction?.blockhash);
  });

  it("márgenes bloquean firma y Send", async () => {
    const signSubject = fixture(); signSubject.rpc.lifetimes[0] = { ...signSubject.rpc.lifetimes[0]!, lastValidBlockHeight: 139 };
    const preparedSession = await prepared(signSubject);
    await assert.rejects(signSubject.coordinator.signingPayload({ ...common(signSubject, preparedSession), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), new RegExp(`${CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN}`));
    const sendSubject = fixture(); const signedSession = await signed(sendSubject); sendSubject.rpc.blockHeight = sendSubject.rpc.lifetimes[0]!.lastValidBlockHeight - CREATE_METADATA_SEND_BLOCK_HEIGHT_MARGIN + 1;
    await assert.rejects(send(sendSubject, signedSession), /se requieren 20/); assert.equal(sendSubject.rpc.sent, 0);
  });

  it("rechaza firma de mensaje distinto", async () => {
    const subject = fixture(); const session = await prepared(subject);
    const payload = await subject.coordinator.signingPayload({ ...common(subject, session), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
    const transaction = VersionedTransaction.deserialize(Buffer.from(payload.transactionBase64, "base64")); transaction.message.recentBlockhash = Keypair.generate().publicKey.toBase58(); transaction.sign([subject.wallet]);
    await assert.rejects(subject.coordinator.acceptSignedTransaction({ ...common(subject, session), messageHash: payload.messageHash, transactionBase64: Buffer.from(transaction.serialize()).toString("base64") }), /mensaje o blockhash distinto/);
  });

  it("Send es único y bloquea refresh posterior", async () => {
    const subject = fixture(); const sent = await send(subject, await signed(subject));
    assert.equal(sent.status, "sent"); assert.equal(subject.rpc.sent, 1);
    await assert.rejects(send(subject, sent), /Transición inválida/);
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, sent), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /Transición inválida/);
  });

  it("timeout queda ambiguo sin segundo envío", async () => {
    const subject = fixture(); const session = await signed(subject); subject.rpc.sendFails = true;
    await assert.rejects(send(subject, session), /ambiguo/); assert.equal(subject.rpc.sent, 1); assert.equal(subject.store.record?.status, "ambiguous");
    await assert.rejects(subject.coordinator.prepareFreshTransaction({ ...common(subject, session), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /Transición inválida/);
  });

  it("Verify relee metadata y mint antes de finalized", async () => {
    const subject = fixture(); const sent = await send(subject, await signed(subject)); subject.rpc.metadataAvailable = true;
    const finalized = await subject.coordinator.verifyFinalized(common(subject, sent));
    assert.equal(finalized.status, "finalized"); assert.equal(subject.finalizedPda(), finalized.plan.metadataPda); assert.equal(subject.store.record?.status, "finalized");
  });

  it("ALLOW_MAINNET=false y doble Build permanecen bloqueados", async () => {
    const disabled = fixture({ allowMainnet: false }); const review = await reviewed(disabled);
    await assert.rejects(disabled.coordinator.prepareFreshTransaction({ ...common(disabled, review), confirmationToken: CREATE_METADATA_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /ALLOW_MAINNET/);
    const subject = fixture(); await subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-metadata" });
    await assert.rejects(subject.coordinator.build({ connectedWallet: subject.wallet.publicKey.toBase58(), operation: "create-metadata" }), /Ya existe/);
  });
});
