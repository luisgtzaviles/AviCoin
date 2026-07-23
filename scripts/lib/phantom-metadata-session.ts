import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction, type VersionedMessage } from "@solana/web3.js";
import { MAINNET_CONFIG } from "../../config/index.js";
import { MAINNET_METADATA_SHA256, MAINNET_METADATA_URI, createMainnetMetadataInstruction, type MetadataSnapshot, assertMetadataSnapshot } from "./mainnet-metadata.js";
import { assertMintSnapshot, type MintSnapshot } from "./mainnet-token.js";
import { solanaTransactionSignature, type PhantomRuntimeAuthorization } from "./phantom-mint-session.js";

export const CREATE_METADATA_CONFIRMATION_TOKEN = "CONFIRMO-MAINNET-METADATA-PERMANENTE";
export const CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN = 40;
export const CREATE_METADATA_SEND_BLOCK_HEIGHT_MARGIN = 20;
export const CREATE_METADATA_ACCOUNT_SPACE_ESTIMATE = 679;
export const CREATE_METADATA_COMPUTE_UNIT_LIMIT = 200_000;
export const CREATE_METADATA_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1_000n;
export const CREATE_METADATA_MAX_PRIORITY_FEE_LAMPORTS = 200n;
export const CREATE_METADATA_APPROXIMATE_FEE_LAMPORTS = 5_000n + CREATE_METADATA_MAX_PRIORITY_FEE_LAMPORTS;
const METADATA_PROGRAM = MAINNET_CONFIG.programs.tokenMetadata;
const MINT_ADDRESS = "GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ZERO_SIGNATURE = new Uint8Array(64);

export type CreateMetadataStatus = "plan_built" | "plan_reviewed" | "fresh_message_prepared" | "simulated" | "signature_requested" | "signed" | "send_locked" | "sent" | "finalized" | "ambiguous" | "cancelled";

export interface MetadataRpc {
  getGenesisHash(): Promise<string>;
  getBalance(wallet: PublicKey): Promise<bigint>;
  getAccountOwner(address: PublicKey): Promise<string | null>;
  getMinimumBalanceForRentExemption(size: number): Promise<bigint>;
  getLatestBlockhash(): Promise<{ readonly blockhash: string; readonly lastValidBlockHeight: number }>;
  getFeeForMessage(message: VersionedMessage): Promise<bigint>;
  simulate(transaction: VersionedTransaction): Promise<{ readonly logs: readonly string[]; readonly unitsConsumed: number | null }>;
  getBlockHeight(): Promise<number>;
  sendRawTransaction(transaction: Uint8Array): Promise<string>;
  confirmFinalized(input: { readonly signature: string; readonly blockhash: string; readonly lastValidBlockHeight: number }): Promise<void>;
  getSignatureStatus(signature: string): Promise<string | null>;
  readMint(address: PublicKey): Promise<{ readonly owner: string; readonly snapshot: MintSnapshot }>;
  readMetadata(mint: PublicKey): Promise<(MetadataSnapshot & { readonly publicKey: string; readonly owner: string }) | null>;
}

export interface MetadataRecoveryRecord {
  readonly operation: "create-metadata";
  readonly status: "sending" | "sent" | "ambiguous" | "finalized";
  readonly mintAddress: string;
  readonly metadataPda: string;
  readonly messageHash: string;
  readonly planHash: string;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  readonly signature: string | null;
  readonly updatedAt: string;
}

export interface MetadataRecoveryStore {
  load(): Promise<MetadataRecoveryRecord | null>;
  save(record: MetadataRecoveryRecord): Promise<void>;
}

export interface MetadataPlan {
  readonly operation: "create-metadata";
  readonly network: "mainnet-beta";
  readonly genesisHash: string;
  readonly rpcHost: string;
  readonly payer: string;
  readonly updateAuthority: string;
  readonly mintAddress: string;
  readonly metadataPda: string;
  readonly metadataProgram: string;
  readonly instruction: "token-metadata:createMetadataAccountV3";
  readonly computeUnitLimit: typeof CREATE_METADATA_COMPUTE_UNIT_LIMIT;
  readonly computeUnitPriceMicroLamports: string;
  readonly maximumPriorityFeeLamports: string;
  readonly instructionDataSha256: string;
  readonly name: "AVICOIN";
  readonly symbol: "AVI";
  readonly uri: typeof MAINNET_METADATA_URI;
  readonly sellerFeeBasisPoints: 0;
  readonly isMutable: true;
  readonly creators: null;
  readonly collection: null;
  readonly uses: null;
  readonly writableAccounts: readonly string[];
  readonly signerAccounts: readonly string[];
  readonly balanceBeforeLamports: string;
  readonly estimatedRentLamports: string;
  readonly estimatedFeeLamports: string;
  readonly expectedBalanceChangeLamports: string;
  readonly publicMetadataSha256: typeof MAINNET_METADATA_SHA256;
  readonly planHash: string;
  readonly stopConditions: readonly string[];
}

export interface MetadataFreshSummary {
  readonly stablePlanHash: string;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  readonly currentBlockHeight: number;
  readonly remainingBlockHeights: number;
  readonly signatureMarginRequired: number;
  readonly sendMarginRequired: number;
  readonly canRequestSignature: boolean;
  readonly canSend: boolean;
  readonly feeLamports: string;
  readonly balanceBeforeLamports: string;
  readonly expectedBalanceAfterLamports: string;
  readonly messageHash: string;
  readonly preparedAt: string;
  readonly preparedAtMonotonicMs: number;
  readonly simulation: { readonly logs: readonly string[]; readonly unitsConsumed: number | null };
}

export interface MetadataPublicSession {
  readonly sessionId: string;
  readonly status: CreateMetadataStatus;
  readonly planReviewed: boolean;
  readonly plan: MetadataPlan;
  readonly freshTransaction: MetadataFreshSummary | null;
  readonly refreshCount: number;
  readonly signatureInvalidated: boolean;
  readonly signature: string | null;
  readonly expectedSignature: string | null;
}

interface FreshReceipt {
  readonly transaction: VersionedTransaction;
  signedTransaction: VersionedTransaction | null;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  currentBlockHeight: number;
  readonly feeLamports: bigint;
  readonly balanceBeforeLamports: bigint;
  readonly expectedBalanceAfterLamports: bigint;
  readonly messageHash: string;
  readonly preparedAt: Date;
  readonly preparedAtMonotonicMs: number;
  readonly simulation: { readonly logs: readonly string[]; readonly unitsConsumed: number | null };
}

interface Session {
  readonly id: string;
  status: CreateMetadataStatus;
  planReviewed: boolean;
  readonly plan: MetadataPlan;
  readonly configFingerprint: string;
  fresh: FreshReceipt | null;
  refreshCount: number;
  signatureInvalidated: boolean;
  signature: string | null;
  expectedSignature: string | null;
  sendInFlight: boolean;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
}

function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }

function metadataTransactionInstructions(instruction: TransactionInstruction): readonly TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CREATE_METADATA_COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CREATE_METADATA_COMPUTE_UNIT_PRICE_MICROLAMPORTS }),
    instruction,
  ];
}

function fingerprint(runtime: PhantomRuntimeAuthorization): string {
  return sha256(stable({ network: runtime.network, rpcUrl: runtime.rpcUrl, expectedGenesisHash: runtime.expectedGenesisHash, productionWallet: runtime.productionWallet, allowMainnet: runtime.allowMainnet, operation: runtime.operation ?? null }));
}

function assertRuntime(runtime: PhantomRuntimeAuthorization, wallet: string): void {
  if (runtime.network !== "mainnet-beta") throw new Error("La sesión Phantom exige mainnet-beta.");
  if (runtime.expectedGenesisHash !== MAINNET_CONFIG.genesisHash) throw new Error("Genesis Mainnet configurado incorrectamente.");
  if (runtime.productionWallet !== wallet) throw new Error("La wallet Phantom no coincide con production_wallet.");
  if (runtime.operation !== "create-metadata") throw new Error("La operación debe ser exactamente create-metadata.");
  const url = new URL(runtime.rpcUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("El RPC Mainnet debe ser HTTPS sin credenciales.");
}

function assertAuthorization(runtime: PhantomRuntimeAuthorization, token: string): void {
  if (!runtime.allowMainnet) throw new Error("ALLOW_MAINNET debe ser true sólo durante la sesión deliberada.");
  if (runtime.operation !== "create-metadata") throw new Error("AVICOIN_MAINNET_OPERATION debe ser create-metadata.");
  if (runtime.confirmationToken !== CREATE_METADATA_CONFIRMATION_TOKEN || token !== CREATE_METADATA_CONFIRMATION_TOKEN) throw new Error("Token de confirmación metadata inválido.");
}

function verifyWalletSignature(wallet: PublicKey, message: Uint8Array, signature: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, wallet.toBuffer()]), format: "der", type: "spki" });
  return verify(null, message, key, signature);
}

function publicSession(session: Session): MetadataPublicSession {
  const fresh = session.fresh;
  const freshTransaction = fresh ? {
    stablePlanHash: session.plan.planHash,
    blockhash: fresh.blockhash,
    lastValidBlockHeight: fresh.lastValidBlockHeight,
    currentBlockHeight: fresh.currentBlockHeight,
    remainingBlockHeights: fresh.lastValidBlockHeight - fresh.currentBlockHeight,
    signatureMarginRequired: CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN,
    sendMarginRequired: CREATE_METADATA_SEND_BLOCK_HEIGHT_MARGIN,
    canRequestSignature: fresh.lastValidBlockHeight - fresh.currentBlockHeight >= CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN,
    canSend: fresh.lastValidBlockHeight - fresh.currentBlockHeight >= CREATE_METADATA_SEND_BLOCK_HEIGHT_MARGIN,
    feeLamports: fresh.feeLamports.toString(),
    balanceBeforeLamports: fresh.balanceBeforeLamports.toString(),
    expectedBalanceAfterLamports: fresh.expectedBalanceAfterLamports.toString(),
    messageHash: fresh.messageHash,
    preparedAt: fresh.preparedAt.toISOString(),
    preparedAtMonotonicMs: fresh.preparedAtMonotonicMs,
    simulation: fresh.simulation,
  } : null;
  return { sessionId: session.id, status: session.status, planReviewed: session.planReviewed, plan: session.plan, freshTransaction, refreshCount: session.refreshCount, signatureInvalidated: session.signatureInvalidated, signature: session.signature, expectedSignature: session.expectedSignature };
}

export class PhantomCreateMetadataCoordinator {
  private session: Session | null = null;

  constructor(
    private readonly rpc: MetadataRpc,
    private readonly runtime: () => PhantomRuntimeAuthorization,
    private readonly recovery: MetadataRecoveryStore,
    private readonly assertExpectedState: () => Promise<void> = async () => undefined,
    private readonly assertPublishedMetadata: () => Promise<void> = async () => undefined,
    private readonly onFinalized: (metadataPda: string) => Promise<void> = async () => undefined,
    private readonly now: () => Date = () => new Date(),
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {}

  diagnostics(): { readonly hasSession: boolean; readonly sessionId: string | null; readonly status: CreateMetadataStatus | null; readonly planHash: string | null; readonly planReviewed: boolean } {
    return this.session
      ? { hasSession: true, sessionId: this.session.id, status: this.session.status, planHash: this.session.plan.planHash, planReviewed: this.session.planReviewed }
      : { hasSession: false, sessionId: null, status: null, planHash: null, planReviewed: false };
  }

  async build(input: { readonly connectedWallet: string; readonly operation: string }): Promise<MetadataPublicSession> {
    if (input.operation !== "create-metadata") throw new Error("Sólo create-metadata está habilitado.");
    if (this.session) throw new Error("Ya existe una sesión create-metadata; no se construirá otra.");
    const recovery = await this.recovery.load();
    if (recovery && recovery.status !== "finalized") throw new Error(`Existe una operación ${recovery.status}; debe resolverse antes de continuar.`);
    const runtime = this.runtime();
    assertRuntime(runtime, input.connectedWallet);
    await this.assertExpectedState();
    await this.assertPublishedMetadata();
    const genesis = await this.rpc.getGenesisHash();
    if (genesis !== runtime.expectedGenesisHash) throw new Error("El genesis real no corresponde a Mainnet.");
    const wallet = new PublicKey(input.connectedWallet);
    const mint = new PublicKey(MINT_ADDRESS);
    const { metadataPda, instruction } = createMainnetMetadataInstruction(runtime.rpcUrl, wallet.toBase58(), mint.toBase58());
    if (instruction.programId.toBase58() !== METADATA_PROGRAM) throw new Error("Programa de metadata inesperado.");
    const pda = new PublicKey(metadataPda);
    if (await this.rpc.getAccountOwner(pda)) throw new Error(`La metadata ya existe en ${metadataPda}; no se creará otra.`);
    const mintAccount = await this.rpc.readMint(mint);
    if (mintAccount.owner !== MAINNET_CONFIG.programs.splToken) throw new Error("El mint no pertenece al SPL Token Program.");
    assertMintSnapshot(mintAccount.snapshot, { authority: wallet.toBase58(), supply: 0n });
    const [balance, rent] = await Promise.all([this.rpc.getBalance(wallet), this.rpc.getMinimumBalanceForRentExemption(CREATE_METADATA_ACCOUNT_SPACE_ESTIMATE)]);
    if (balance < rent + CREATE_METADATA_APPROXIMATE_FEE_LAMPORTS) throw new Error("Saldo insuficiente para renta y fee estimados de metadata.");
    const base = {
      operation: "create-metadata" as const, network: "mainnet-beta" as const, genesisHash: genesis, rpcHost: new URL(runtime.rpcUrl).hostname,
      payer: wallet.toBase58(), updateAuthority: wallet.toBase58(), mintAddress: mint.toBase58(), metadataPda,
      metadataProgram: METADATA_PROGRAM, instruction: "token-metadata:createMetadataAccountV3" as const,
      computeUnitLimit: CREATE_METADATA_COMPUTE_UNIT_LIMIT as typeof CREATE_METADATA_COMPUTE_UNIT_LIMIT,
      computeUnitPriceMicroLamports: CREATE_METADATA_COMPUTE_UNIT_PRICE_MICROLAMPORTS.toString(),
      maximumPriorityFeeLamports: CREATE_METADATA_MAX_PRIORITY_FEE_LAMPORTS.toString(),
      instructionDataSha256: sha256(instruction.data), name: "AVICOIN" as const, symbol: "AVI" as const, uri: MAINNET_METADATA_URI as typeof MAINNET_METADATA_URI,
      sellerFeeBasisPoints: 0 as const, isMutable: true as const, creators: null, collection: null, uses: null,
      writableAccounts: instruction.keys.filter((key) => key.isWritable).map((key) => key.pubkey.toBase58()),
      signerAccounts: [wallet.toBase58()], balanceBeforeLamports: balance.toString(), estimatedRentLamports: rent.toString(),
      estimatedFeeLamports: CREATE_METADATA_APPROXIMATE_FEE_LAMPORTS.toString(), expectedBalanceChangeLamports: (-(rent + CREATE_METADATA_APPROXIMATE_FEE_LAMPORTS)).toString(),
      publicMetadataSha256: MAINNET_METADATA_SHA256 as typeof MAINNET_METADATA_SHA256,
      stopConditions: ["wallet, mint, genesis, RPC, URI or plan changed", "metadata PDA exists", "mint invariants changed", "public metadata hash changed", "blockhash margin insufficient", "send started or result ambiguous"] as const,
    };
    const planHash = sha256(stable(base));
    const session: Session = { id: randomUUID(), status: "plan_built", planReviewed: false, plan: { ...base, planHash }, configFingerprint: fingerprint(runtime), fresh: null, refreshCount: 0, signatureInvalidated: false, signature: null, expectedSignature: null, sendInFlight: false };
    this.session = session;
    return publicSession(session);
  }

  async review(input: CommonInput): Promise<MetadataPublicSession> {
    const session = await this.assertCurrent(input, ["plan_built"]);
    session.planReviewed = true;
    session.status = "plan_reviewed";
    return publicSession(session);
  }

  async prepareFreshTransaction(input: CommonInput & { readonly confirmationToken: string; readonly explicitlyConfirmed: boolean }): Promise<MetadataPublicSession> {
    const session = await this.assertCurrent(input, ["plan_reviewed", "simulated", "signature_requested", "signed"]);
    if (!session.planReviewed) throw new Error("El servidor no confirma Review del stable plan.");
    if (!input.explicitlyConfirmed) throw new Error("Confirma Mainnet, mint, PDA, URI, mutable y supply 0 antes de preparar.");
    assertAuthorization(this.runtime(), input.confirmationToken);
    await this.assertPublishedMetadata();
    if (session.status !== "plan_reviewed") {
      session.refreshCount += 1;
      session.signatureInvalidated = session.status === "signature_requested" || session.status === "signed" || session.expectedSignature !== null;
    }
    session.fresh = null; session.signature = null; session.expectedSignature = null;
    try {
      const wallet = new PublicKey(session.plan.payer);
      const { metadataPda, instruction } = createMainnetMetadataInstruction(this.runtime().rpcUrl, wallet.toBase58(), session.plan.mintAddress);
      if (metadataPda !== session.plan.metadataPda || sha256(instruction.data) !== session.plan.instructionDataSha256) throw new Error("La instrucción metadata cambió respecto del plan estable.");
      const [balance, lifetime] = await Promise.all([this.rpc.getBalance(wallet), this.rpc.getLatestBlockhash()]);
      const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: lifetime.blockhash, instructions: [...metadataTransactionInstructions(instruction)] }).compileToV0Message();
      const fee = await this.rpc.getFeeForMessage(message);
      const rent = BigInt(session.plan.estimatedRentLamports);
      if (balance < rent + fee) throw new Error("Saldo insuficiente para la transacción metadata fresca.");
      const transaction = new VersionedTransaction(message);
      session.status = "fresh_message_prepared";
      const simulation = await this.rpc.simulate(transaction);
      const blockHeight = await this.rpc.getBlockHeight();
      session.fresh = { transaction, signedTransaction: null, blockhash: lifetime.blockhash, lastValidBlockHeight: lifetime.lastValidBlockHeight, currentBlockHeight: blockHeight, feeLamports: fee, balanceBeforeLamports: balance, expectedBalanceAfterLamports: balance - rent - fee, messageHash: sha256(message.serialize()), preparedAt: this.now(), preparedAtMonotonicMs: this.monotonicNow(), simulation };
      session.status = "simulated";
      return publicSession(session);
    } catch (error) {
      session.fresh = null; session.status = "plan_reviewed";
      throw error;
    }
  }

  async freshStatus(input: CommonInput): Promise<MetadataPublicSession> {
    const session = await this.assertCurrent(input, ["simulated", "signature_requested", "signed"]);
    if (!session.fresh) throw new Error("No existe mensaje fresco.");
    session.fresh.currentBlockHeight = await this.rpc.getBlockHeight();
    return publicSession(session);
  }

  async signingPayload(input: CommonInput & { readonly confirmationToken: string; readonly explicitlyConfirmed: boolean }): Promise<{ readonly transactionBase64: string; readonly messageHash: string; readonly planHash: string }> {
    const session = await this.assertCurrent(input, ["simulated"]);
    if (!session.planReviewed) throw new Error("El servidor no confirma Review del stable plan.");
    if (!input.explicitlyConfirmed) throw new Error("Falta la primera confirmación manual.");
    assertAuthorization(this.runtime(), input.confirmationToken);
    await this.assertPublishedMetadata();
    await this.assertMargin(session, CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN, "solicitar firma");
    if (!session.fresh) throw new Error("El mensaje fresco fue invalidado.");
    session.status = "signature_requested";
    return { transactionBase64: Buffer.from(session.fresh.transaction.serialize()).toString("base64"), messageHash: session.fresh.messageHash, planHash: session.plan.planHash };
  }

  async abortSignatureRequest(input: CommonInput): Promise<MetadataPublicSession> {
    const session = await this.assertCurrent(input, ["signature_requested"]);
    if (session.signature !== null || session.expectedSignature !== null || session.fresh?.signedTransaction) throw new Error("Existe evidencia de firma; no se revertirá la solicitud.");
    const fresh = session.fresh;
    if (!fresh) throw new Error("No existe mensaje fresco para recuperar.");
    fresh.currentBlockHeight = await this.rpc.getBlockHeight();
    const remaining = fresh.lastValidBlockHeight - fresh.currentBlockHeight;
    if (remaining >= CREATE_METADATA_SIGNATURE_BLOCK_HEIGHT_MARGIN) {
      session.status = "simulated";
    } else {
      session.fresh = null;
      session.signature = null;
      session.expectedSignature = null;
      session.signatureInvalidated = false;
      session.status = "plan_reviewed";
    }
    return publicSession(session);
  }

  async acceptSignedTransaction(input: CommonInput & { readonly messageHash: string; readonly transactionBase64: string }): Promise<MetadataPublicSession> {
    const session = await this.assertCurrent(input, ["signature_requested"]);
    const fresh = session.fresh;
    if (!fresh || input.messageHash !== fresh.messageHash) throw new Error("El hash firmado no coincide con el mensaje fresco.");
    const signed = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
    const message = signed.message.serialize();
    if (sha256(message) !== fresh.messageHash || signed.message.recentBlockhash !== fresh.blockhash) throw new Error("Phantom devolvió un mensaje o blockhash distinto.");
    const wallet = new PublicKey(session.plan.payer);
    if (!signed.message.staticAccountKeys[0]?.equals(wallet) || signed.message.header.numRequiredSignatures !== 1) throw new Error("Payer o signers inesperados.");
    const signature = signed.signatures[0];
    if (!signature || Buffer.from(signature).equals(Buffer.from(ZERO_SIGNATURE)) || !verifyWalletSignature(wallet, message, signature)) throw new Error("Firma Phantom inválida para el mensaje metadata exacto.");
    await this.assertMargin(session, CREATE_METADATA_SEND_BLOCK_HEIGHT_MARGIN, "aceptar firma");
    if (!session.fresh) throw new Error("La firma llegó fuera de margen y fue invalidada.");
    session.fresh.signedTransaction = signed;
    session.expectedSignature = solanaTransactionSignature(signed);
    session.status = "signed";
    return publicSession(session);
  }

  async send(input: CommonInput & { readonly confirmationToken: string; readonly explicitlyConfirmed: boolean }): Promise<MetadataPublicSession> {
    const session = await this.assertCurrent(input, ["signed"]);
    if (!input.explicitlyConfirmed) throw new Error("Falta la segunda confirmación manual.");
    if (session.sendInFlight) throw new Error("La transacción ya se está enviando.");
    assertAuthorization(this.runtime(), input.confirmationToken);
    await this.assertPublishedMetadata();
    await this.assertMargin(session, CREATE_METADATA_SEND_BLOCK_HEIGHT_MARGIN, "enviar");
    const fresh = session.fresh;
    if (!fresh?.signedTransaction) throw new Error("Falta la transacción firmada.");
    await this.assertExpectedState();
    if (await this.rpc.getAccountOwner(new PublicKey(session.plan.metadataPda))) throw new Error("La metadata apareció antes de Send; no se enviará.");
    session.sendInFlight = true; session.status = "send_locked";
    await this.saveRecovery(session, "sending");
    try {
      const signature = await this.rpc.sendRawTransaction(fresh.signedTransaction.serialize());
      if (signature !== session.expectedSignature) throw new Error("El RPC devolvió una firma distinta.");
      session.signature = signature; session.status = "sent";
      await this.saveRecovery(session, "sent");
      return publicSession(session);
    } catch (error) {
      session.signature = session.expectedSignature; session.status = "ambiguous";
      await this.saveRecovery(session, "ambiguous");
      throw new Error("Resultado ambiguo. No refresques, reenvíes ni crees otra metadata; consulta firma y PDA.", { cause: error });
    } finally { session.sendInFlight = false; }
  }

  async verifyFinalized(input: CommonInput): Promise<MetadataPublicSession & { readonly resolution?: { readonly signatureStatus: string | null; readonly metadataExists: boolean } }> {
    const session = await this.assertCurrent(input, ["sent", "ambiguous"]);
    const fresh = session.fresh;
    if (!fresh || !session.signature) return this.ambiguousResolution(session);
    try {
      await this.rpc.confirmFinalized({ signature: session.signature, blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight });
      const metadata = await this.rpc.readMetadata(new PublicKey(session.plan.mintAddress));
      if (!metadata || metadata.publicKey !== session.plan.metadataPda || metadata.owner !== METADATA_PROGRAM) throw new Error("Metadata PDA ausente o owner incorrecto.");
      assertMetadataSnapshot(metadata, session.plan.mintAddress, session.plan.uri, session.plan.updateAuthority);
      const mint = await this.rpc.readMint(new PublicKey(session.plan.mintAddress));
      if (mint.owner !== MAINNET_CONFIG.programs.splToken) throw new Error("Owner del mint cambió.");
      assertMintSnapshot(mint.snapshot, { authority: session.plan.payer, supply: 0n });
      await this.onFinalized(session.plan.metadataPda);
      session.status = "finalized";
      await this.saveRecovery(session, "finalized");
      return publicSession(session);
    } catch {
      return this.ambiguousResolution(session);
    }
  }

  async cancel(input: CommonInput): Promise<MetadataPublicSession> {
    const session = await this.assertCurrent(input, ["plan_built", "plan_reviewed", "fresh_message_prepared", "simulated", "signature_requested", "signed"]);
    session.fresh = null; session.signature = null; session.expectedSignature = null; session.planReviewed = false; session.status = "cancelled";
    return publicSession(session);
  }

  private async assertCurrent(input: CommonInput, statuses: readonly CreateMetadataStatus[]): Promise<Session> {
    const session = this.session;
    if (!session || session.id !== input.sessionId) throw new Error("Sesión create-metadata desconocida.");
    if (!statuses.includes(session.status)) throw new Error(`Transición inválida desde ${session.status}.`);
    if (input.planHash !== session.plan.planHash) throw new Error("El stable plan cambió.");
    const runtime = this.runtime();
    assertRuntime(runtime, input.connectedWallet);
    if (fingerprint(runtime) !== session.configFingerprint) throw new Error("La configuración cambió desde Build.");
    await this.assertExpectedState();
    if (await this.rpc.getGenesisHash() !== runtime.expectedGenesisHash) throw new Error("Genesis Mainnet cambió.");
    const mint = await this.rpc.readMint(new PublicKey(session.plan.mintAddress));
    assertMintSnapshot(mint.snapshot, { authority: session.plan.payer, supply: 0n });
    if (!(statuses.includes("sent") || statuses.includes("ambiguous")) && await this.rpc.getAccountOwner(new PublicKey(session.plan.metadataPda))) throw new Error("La metadata PDA apareció antes del envío.");
    return session;
  }

  private invalidate(session: Session): void {
    session.signatureInvalidated = session.status === "signature_requested" || session.status === "signed" || session.expectedSignature !== null;
    session.fresh = null; session.signature = null; session.expectedSignature = null; session.status = "plan_reviewed";
  }

  private async assertMargin(session: Session, required: number, action: string): Promise<void> {
    if (!session.fresh) throw new Error("No existe mensaje fresco.");
    session.fresh.currentBlockHeight = await this.rpc.getBlockHeight();
    const remaining = session.fresh.lastValidBlockHeight - session.fresh.currentBlockHeight;
    if (remaining < required) {
      this.invalidate(session);
      throw new Error(`Blockhash sin margen para ${action}: quedan ${remaining}, se requieren ${required}.`);
    }
  }

  private async ambiguousResolution(session: Session): Promise<MetadataPublicSession & { readonly resolution: { readonly signatureStatus: string | null; readonly metadataExists: boolean } }> {
    session.status = "ambiguous";
    const resolution = { signatureStatus: session.signature ? await this.rpc.getSignatureStatus(session.signature) : null, metadataExists: (await this.rpc.getAccountOwner(new PublicKey(session.plan.metadataPda))) !== null };
    await this.saveRecovery(session, "ambiguous");
    return { ...publicSession(session), resolution };
  }

  private async saveRecovery(session: Session, status: MetadataRecoveryRecord["status"]): Promise<void> {
    if (!session.fresh) throw new Error("No existe mensaje fresco para recovery.");
    await this.recovery.save({ operation: "create-metadata", status, mintAddress: session.plan.mintAddress, metadataPda: session.plan.metadataPda, messageHash: session.fresh.messageHash, planHash: session.plan.planHash, blockhash: session.fresh.blockhash, lastValidBlockHeight: session.fresh.lastValidBlockHeight, signature: session.signature ?? session.expectedSignature, updatedAt: this.now().toISOString() });
  }
}

interface CommonInput { readonly sessionId: string; readonly connectedWallet: string; readonly planHash: string }
