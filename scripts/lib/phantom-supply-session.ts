import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import { createMintToCheckedInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, type VersionedMessage } from "@solana/web3.js";
import { MAINNET_CONFIG, MAINNET_INITIAL_LAUNCH_BASE_UNITS } from "../../config/index.js";
import { assertMintSnapshot, type MintSnapshot } from "./mainnet-token.js";
import { solanaTransactionSignature, type PhantomRuntimeAuthorization } from "./phantom-mint-session.js";
import { AVICOIN_MAINNET_ATA, AVICOIN_MAINNET_MINT } from "./phantom-ata-session.js";

export const FIXED_SUPPLY_CONFIRMATION_TOKEN = "CONFIRMO-MAINNET-EMITIR-1000-AVI";
export const FIXED_SUPPLY_SIGNATURE_BLOCK_HEIGHT_MARGIN = 40;
export const FIXED_SUPPLY_SEND_BLOCK_HEIGHT_MARGIN = 20;
export const FIXED_SUPPLY_COMPUTE_UNIT_LIMIT = 50_000;
export const FIXED_SUPPLY_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1_000n;
export const FIXED_SUPPLY_MAX_PRIORITY_FEE_LAMPORTS = 50n;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ZERO_SIGNATURE = new Uint8Array(64);

export type FixedSupplyStatus = "plan_built" | "plan_reviewed" | "simulated" | "signature_requested" | "signed" | "send_locked" | "sent" | "finalized" | "ambiguous" | "cancelled";

export interface SupplyTokenAccount {
  readonly address: string;
  readonly programOwner: string;
  readonly mint: string;
  readonly owner: string;
  readonly amount: bigint;
}

export interface SupplyRpc {
  getGenesisHash(): Promise<string>;
  getBalance(wallet: PublicKey): Promise<bigint>;
  getLatestBlockhash(): Promise<{ readonly blockhash: string; readonly lastValidBlockHeight: number }>;
  getFeeForMessage(message: VersionedMessage): Promise<bigint>;
  simulate(transaction: VersionedTransaction): Promise<{ readonly logs: readonly string[]; readonly unitsConsumed: number | null }>;
  getBlockHeight(): Promise<number>;
  sendRawTransaction(transaction: Uint8Array): Promise<string>;
  confirmFinalized(input: { readonly signature: string; readonly blockhash: string; readonly lastValidBlockHeight: number }): Promise<void>;
  getSignatureStatus(signature: string): Promise<string | null>;
  readMint(address: PublicKey): Promise<{ readonly owner: string; readonly snapshot: MintSnapshot }>;
  readAta(address: PublicKey): Promise<SupplyTokenAccount | null>;
  listMintAccounts(mint: PublicKey): Promise<readonly SupplyTokenAccount[]>;
}

export interface SupplyRecoveryRecord {
  readonly operation: "mint-fixed-supply";
  readonly status: "sending" | "sent" | "ambiguous" | "finalized";
  readonly mintAddress: string;
  readonly ata: string;
  readonly amountBaseUnits: "1000000000000";
  readonly messageHash: string;
  readonly planHash: string;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  readonly signature: string | null;
  readonly updatedAt: string;
}

export interface SupplyRecoveryStore {
  load(): Promise<SupplyRecoveryRecord | null>;
  save(record: SupplyRecoveryRecord): Promise<void>;
}

export interface SupplyPlan {
  readonly operation: "mint-fixed-supply";
  readonly network: "mainnet-beta";
  readonly genesisHash: string;
  readonly rpcHost: string;
  readonly payer: string;
  readonly mintAuthority: string;
  readonly mintAddress: typeof AVICOIN_MAINNET_MINT;
  readonly destinationAta: typeof AVICOIN_MAINNET_ATA;
  readonly destinationOwner: string;
  readonly tokenProgram: string;
  readonly instruction: "spl-token:mintToChecked";
  readonly amountAvi: "1000";
  readonly amountBaseUnits: "1000000000000";
  readonly decimals: 9;
  readonly computeUnitLimit: typeof FIXED_SUPPLY_COMPUTE_UNIT_LIMIT;
  readonly computeUnitPriceMicroLamports: string;
  readonly maximumPriorityFeeLamports: string;
  readonly writableAccounts: readonly string[];
  readonly signerAccounts: readonly string[];
  readonly tokenAccountCountBefore: 1;
  readonly balanceBeforeLamports: string;
  readonly estimatedFeeLamports: string;
  readonly expectedBalanceChangeLamports: string;
  readonly planHash: string;
  readonly stopConditions: readonly string[];
}

export interface SupplyFreshSummary {
  readonly stablePlanHash: string;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  readonly currentBlockHeight: number;
  readonly remainingBlockHeights: number;
  readonly canRequestSignature: boolean;
  readonly canSend: boolean;
  readonly feeLamports: string;
  readonly balanceBeforeLamports: string;
  readonly expectedBalanceAfterLamports: string;
  readonly messageHash: string;
  readonly simulation: { readonly logs: readonly string[]; readonly unitsConsumed: number | null };
}

export interface SupplyPublicSession {
  readonly sessionId: string;
  readonly status: FixedSupplyStatus;
  readonly planReviewed: boolean;
  readonly plan: SupplyPlan;
  readonly freshTransaction: SupplyFreshSummary | null;
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
  readonly simulation: { readonly logs: readonly string[]; readonly unitsConsumed: number | null };
}

interface Session {
  readonly id: string;
  status: FixedSupplyStatus;
  planReviewed: boolean;
  readonly plan: SupplyPlan;
  readonly configFingerprint: string;
  fresh: FreshReceipt | null;
  signature: string | null;
  expectedSignature: string | null;
  sendInFlight: boolean;
}

interface CommonInput { readonly sessionId: string; readonly connectedWallet: string; readonly planHash: string }

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
}

function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }

function fingerprint(runtime: PhantomRuntimeAuthorization): string {
  return sha256(stable({ network: runtime.network, rpcUrl: runtime.rpcUrl, expectedGenesisHash: runtime.expectedGenesisHash, productionWallet: runtime.productionWallet, allowMainnet: runtime.allowMainnet, operation: runtime.operation ?? null }));
}

function assertRuntime(runtime: PhantomRuntimeAuthorization, wallet: string): void {
  if (runtime.network !== "mainnet-beta") throw new Error("La sesión Phantom exige mainnet-beta.");
  if (runtime.expectedGenesisHash !== MAINNET_CONFIG.genesisHash) throw new Error("Genesis Mainnet configurado incorrectamente.");
  if (runtime.productionWallet !== wallet) throw new Error("La wallet Phantom no coincide con production_wallet.");
  if (runtime.operation !== "mint-fixed-supply") throw new Error("La operación debe ser exactamente mint-fixed-supply.");
  const url = new URL(runtime.rpcUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("El RPC Mainnet debe ser HTTPS sin credenciales.");
}

function assertAuthorization(runtime: PhantomRuntimeAuthorization, token: string): void {
  if (!runtime.allowMainnet) throw new Error("ALLOW_MAINNET debe ser true sólo durante la sesión deliberada.");
  if (runtime.operation !== "mint-fixed-supply") throw new Error("AVICOIN_MAINNET_OPERATION debe ser mint-fixed-supply.");
  if (runtime.confirmationToken !== FIXED_SUPPLY_CONFIRMATION_TOKEN || token !== FIXED_SUPPLY_CONFIRMATION_TOKEN) throw new Error("Token de confirmación de emisión inválido.");
}

function verifyWalletSignature(wallet: PublicKey, message: Uint8Array, signature: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, wallet.toBuffer()]), format: "der", type: "spki" });
  return verify(null, message, key, signature);
}

export function fixedSupplyInstruction(wallet: PublicKey, mint: PublicKey, ata: PublicKey) {
  return createMintToCheckedInstruction(mint, ata, wallet, MAINNET_INITIAL_LAUNCH_BASE_UNITS, 9, [], TOKEN_PROGRAM_ID);
}

function transactionInstructions(wallet: PublicKey, mint: PublicKey, ata: PublicKey) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: FIXED_SUPPLY_COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: FIXED_SUPPLY_COMPUTE_UNIT_PRICE_MICROLAMPORTS }),
    fixedSupplyInstruction(wallet, mint, ata),
  ];
}

function publicSession(session: Session): SupplyPublicSession {
  const fresh = session.fresh;
  const freshTransaction = fresh ? {
    stablePlanHash: session.plan.planHash,
    blockhash: fresh.blockhash,
    lastValidBlockHeight: fresh.lastValidBlockHeight,
    currentBlockHeight: fresh.currentBlockHeight,
    remainingBlockHeights: fresh.lastValidBlockHeight - fresh.currentBlockHeight,
    canRequestSignature: fresh.lastValidBlockHeight - fresh.currentBlockHeight >= FIXED_SUPPLY_SIGNATURE_BLOCK_HEIGHT_MARGIN,
    canSend: fresh.lastValidBlockHeight - fresh.currentBlockHeight >= FIXED_SUPPLY_SEND_BLOCK_HEIGHT_MARGIN,
    feeLamports: fresh.feeLamports.toString(),
    balanceBeforeLamports: fresh.balanceBeforeLamports.toString(),
    expectedBalanceAfterLamports: fresh.expectedBalanceAfterLamports.toString(),
    messageHash: fresh.messageHash,
    simulation: fresh.simulation,
  } : null;
  return { sessionId: session.id, status: session.status, planReviewed: session.planReviewed, plan: session.plan, freshTransaction, signature: session.signature, expectedSignature: session.expectedSignature };
}

export class PhantomFixedSupplyCoordinator {
  private session: Session | null = null;

  constructor(
    private readonly rpc: SupplyRpc,
    private readonly runtime: () => PhantomRuntimeAuthorization,
    private readonly recovery: SupplyRecoveryStore,
    private readonly assertExpectedState: () => Promise<void> = async () => undefined,
    private readonly assertMetadata: () => Promise<void> = async () => undefined,
    private readonly onFinalized: () => Promise<void> = async () => undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  diagnostics() {
    return this.session
      ? { hasSession: true, sessionId: this.session.id, status: this.session.status, planHash: this.session.plan.planHash, planReviewed: this.session.planReviewed }
      : { hasSession: false, sessionId: null, status: null, planHash: null, planReviewed: false };
  }

  async build(input: { readonly connectedWallet: string; readonly operation: string }): Promise<SupplyPublicSession> {
    if (input.operation !== "mint-fixed-supply") throw new Error("Sólo mint-fixed-supply está habilitado.");
    if (this.session) throw new Error("Ya existe una sesión mint-fixed-supply; no se construirá otra.");
    const recovery = await this.recovery.load();
    if (recovery && recovery.status !== "finalized") throw new Error(`Existe una emisión ${recovery.status}; debe resolverse antes de continuar.`);
    const runtime = this.runtime();
    assertRuntime(runtime, input.connectedWallet);
    await this.assertExpectedState();
    await this.assertMetadata();
    const genesis = await this.rpc.getGenesisHash();
    if (genesis !== runtime.expectedGenesisHash) throw new Error("El genesis real no corresponde a Mainnet.");
    const wallet = new PublicKey(input.connectedWallet);
    const mint = new PublicKey(AVICOIN_MAINNET_MINT);
    const ataAddress = new PublicKey(AVICOIN_MAINNET_ATA);
    const mintAccount = await this.rpc.readMint(mint);
    if (mintAccount.owner !== TOKEN_PROGRAM_ID.toBase58()) throw new Error("El mint no pertenece al SPL Token Program.");
    assertMintSnapshot(mintAccount.snapshot, { authority: wallet.toBase58(), supply: 0n });
    const ata = await this.rpc.readAta(ataAddress);
    if (!ata || ata.programOwner !== TOKEN_PROGRAM_ID.toBase58() || ata.mint !== mint.toBase58() || ata.owner !== wallet.toBase58() || ata.amount !== 0n) throw new Error("El ATA oficial no existe o no está vacío y exacto.");
    const accounts = await this.rpc.listMintAccounts(mint);
    if (accounts.length !== 1 || accounts[0]?.address !== ataAddress.toBase58() || accounts[0].amount !== 0n) throw new Error("Existe otra cuenta SPL del mint o la distribución inicial no está vacía.");
    const balance = await this.rpc.getBalance(wallet);
    const estimatedFee = 5_000n + FIXED_SUPPLY_MAX_PRIORITY_FEE_LAMPORTS;
    if (balance < estimatedFee) throw new Error("Saldo SOL insuficiente para el fee estimado.");
    const instruction = fixedSupplyInstruction(wallet, mint, ataAddress);
    const base = {
      operation: "mint-fixed-supply" as const,
      network: "mainnet-beta" as const,
      genesisHash: genesis,
      rpcHost: new URL(runtime.rpcUrl).hostname,
      payer: wallet.toBase58(),
      mintAuthority: wallet.toBase58(),
      mintAddress: AVICOIN_MAINNET_MINT as typeof AVICOIN_MAINNET_MINT,
      destinationAta: AVICOIN_MAINNET_ATA as typeof AVICOIN_MAINNET_ATA,
      destinationOwner: wallet.toBase58(),
      tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
      instruction: "spl-token:mintToChecked" as const,
      amountAvi: "1000" as const,
      amountBaseUnits: "1000000000000" as const,
      decimals: 9 as const,
      computeUnitLimit: FIXED_SUPPLY_COMPUTE_UNIT_LIMIT as typeof FIXED_SUPPLY_COMPUTE_UNIT_LIMIT,
      computeUnitPriceMicroLamports: FIXED_SUPPLY_COMPUTE_UNIT_PRICE_MICROLAMPORTS.toString(),
      maximumPriorityFeeLamports: FIXED_SUPPLY_MAX_PRIORITY_FEE_LAMPORTS.toString(),
      writableAccounts: instruction.keys.filter((key) => key.isWritable).map((key) => key.pubkey.toBase58()),
      signerAccounts: [wallet.toBase58()],
      tokenAccountCountBefore: 1 as const,
      balanceBeforeLamports: balance.toString(),
      estimatedFeeLamports: estimatedFee.toString(),
      expectedBalanceChangeLamports: (-estimatedFee).toString(),
      stopConditions: ["wallet, mint, ATA, genesis, RPC or plan changed", "supply or ATA balance is not zero", "another token account exists", "metadata or authorities changed", "blockhash margin insufficient", "send started or result ambiguous"] as const,
    };
    const planHash = sha256(stable(base));
    const session: Session = { id: randomUUID(), status: "plan_built", planReviewed: false, plan: { ...base, planHash }, configFingerprint: fingerprint(runtime), fresh: null, signature: null, expectedSignature: null, sendInFlight: false };
    this.session = session;
    return publicSession(session);
  }

  async review(input: CommonInput): Promise<SupplyPublicSession> {
    const session = await this.assertCurrent(input, ["plan_built"]);
    session.planReviewed = true;
    session.status = "plan_reviewed";
    return publicSession(session);
  }

  async prepareFreshTransaction(input: CommonInput & { readonly confirmationToken: string; readonly explicitlyConfirmed: boolean }): Promise<SupplyPublicSession> {
    const session = await this.assertCurrent(input, ["plan_reviewed", "simulated", "signature_requested", "signed"]);
    if (!session.planReviewed) throw new Error("El servidor no confirma Review del stable plan.");
    if (!input.explicitlyConfirmed) throw new Error("Confirma Mainnet, supply 0, ATA 0 y emisión exacta de 1,000 AVI.");
    assertAuthorization(this.runtime(), input.confirmationToken);
    await this.assertMetadata();
    session.fresh = null; session.signature = null; session.expectedSignature = null;
    try {
      const wallet = new PublicKey(session.plan.payer);
      const mint = new PublicKey(session.plan.mintAddress);
      const ata = new PublicKey(session.plan.destinationAta);
      const [balance, lifetime] = await Promise.all([this.rpc.getBalance(wallet), this.rpc.getLatestBlockhash()]);
      const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: lifetime.blockhash, instructions: transactionInstructions(wallet, mint, ata) }).compileToV0Message();
      const fee = await this.rpc.getFeeForMessage(message);
      if (balance < fee) throw new Error("Saldo SOL insuficiente para la emisión fresca.");
      const transaction = new VersionedTransaction(message);
      const simulation = await this.rpc.simulate(transaction);
      const blockHeight = await this.rpc.getBlockHeight();
      session.fresh = { transaction, signedTransaction: null, blockhash: lifetime.blockhash, lastValidBlockHeight: lifetime.lastValidBlockHeight, currentBlockHeight: blockHeight, feeLamports: fee, balanceBeforeLamports: balance, expectedBalanceAfterLamports: balance - fee, messageHash: sha256(message.serialize()), simulation };
      session.status = "simulated";
      return publicSession(session);
    } catch (error) {
      session.fresh = null; session.status = "plan_reviewed";
      throw error;
    }
  }

  async freshStatus(input: CommonInput): Promise<SupplyPublicSession> {
    const session = await this.assertCurrent(input, ["simulated", "signature_requested", "signed"]);
    if (!session.fresh) throw new Error("No existe mensaje fresco.");
    session.fresh.currentBlockHeight = await this.rpc.getBlockHeight();
    return publicSession(session);
  }

  async signingPayload(input: CommonInput & { readonly confirmationToken: string; readonly explicitlyConfirmed: boolean }) {
    const session = await this.assertCurrent(input, ["simulated"]);
    if (!session.planReviewed || !input.explicitlyConfirmed) throw new Error("Falta Review o primera confirmación manual.");
    assertAuthorization(this.runtime(), input.confirmationToken);
    await this.assertMetadata();
    await this.assertMargin(session, FIXED_SUPPLY_SIGNATURE_BLOCK_HEIGHT_MARGIN, "solicitar firma");
    if (!session.fresh) throw new Error("El mensaje fresco fue invalidado.");
    session.status = "signature_requested";
    return { transactionBase64: Buffer.from(session.fresh.transaction.serialize()).toString("base64"), messageHash: session.fresh.messageHash, planHash: session.plan.planHash };
  }

  async abortSignatureRequest(input: CommonInput): Promise<SupplyPublicSession> {
    const session = await this.assertCurrent(input, ["signature_requested"]);
    if (session.signature || session.expectedSignature || session.fresh?.signedTransaction) throw new Error("Existe evidencia de firma; no se revertirá la solicitud.");
    if (!session.fresh) throw new Error("No existe mensaje fresco.");
    session.fresh.currentBlockHeight = await this.rpc.getBlockHeight();
    if (session.fresh.lastValidBlockHeight - session.fresh.currentBlockHeight >= FIXED_SUPPLY_SIGNATURE_BLOCK_HEIGHT_MARGIN) session.status = "simulated";
    else { session.fresh = null; session.status = "plan_reviewed"; }
    return publicSession(session);
  }

  async acceptSignedTransaction(input: CommonInput & { readonly messageHash: string; readonly transactionBase64: string }): Promise<SupplyPublicSession> {
    const session = await this.assertCurrent(input, ["signature_requested"]);
    const fresh = session.fresh;
    if (!fresh || input.messageHash !== fresh.messageHash) throw new Error("El hash firmado no coincide con el mensaje fresco.");
    const signed = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
    const message = signed.message.serialize();
    if (sha256(message) !== fresh.messageHash || signed.message.recentBlockhash !== fresh.blockhash) throw new Error("Phantom devolvió un mensaje o blockhash distinto.");
    const wallet = new PublicKey(session.plan.payer);
    if (!signed.message.staticAccountKeys[0]?.equals(wallet) || signed.message.header.numRequiredSignatures !== 1) throw new Error("Payer o signers inesperados.");
    const signature = signed.signatures[0];
    if (!signature || Buffer.from(signature).equals(Buffer.from(ZERO_SIGNATURE)) || !verifyWalletSignature(wallet, message, signature)) throw new Error("Firma Phantom inválida para la emisión exacta.");
    await this.assertMargin(session, FIXED_SUPPLY_SEND_BLOCK_HEIGHT_MARGIN, "aceptar firma");
    if (!session.fresh) throw new Error("La firma llegó fuera de margen.");
    session.fresh.signedTransaction = signed;
    session.expectedSignature = solanaTransactionSignature(signed);
    session.status = "signed";
    return publicSession(session);
  }

  async send(input: CommonInput & { readonly confirmationToken: string; readonly explicitlyConfirmed: boolean }): Promise<SupplyPublicSession> {
    const session = await this.assertCurrent(input, ["signed"]);
    if (!input.explicitlyConfirmed) throw new Error("Falta la segunda confirmación manual.");
    if (session.sendInFlight) throw new Error("La emisión ya se está enviando.");
    assertAuthorization(this.runtime(), input.confirmationToken);
    await this.assertMetadata();
    await this.assertMargin(session, FIXED_SUPPLY_SEND_BLOCK_HEIGHT_MARGIN, "enviar");
    const fresh = session.fresh;
    if (!fresh?.signedTransaction) throw new Error("Falta la transacción firmada.");
    await this.assertExpectedState();
    await this.assertPreIssuanceOnChain(session);
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
      throw new Error("Resultado ambiguo. No reenvíes ni construyas otra emisión; consulta firma, supply y ATA.", { cause: error });
    } finally { session.sendInFlight = false; }
  }

  async verifyFinalized(input: CommonInput): Promise<SupplyPublicSession & { readonly resolution?: { readonly signatureStatus: string | null; readonly supplyBaseUnits: string; readonly ataAmountBaseUnits: string } }> {
    const session = await this.assertCurrent(input, ["sent", "ambiguous"]);
    const fresh = session.fresh;
    if (!fresh || !session.signature) return this.ambiguousResolution(session);
    try {
      await this.rpc.confirmFinalized({ signature: session.signature, blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight });
      const mint = await this.rpc.readMint(new PublicKey(session.plan.mintAddress));
      if (mint.owner !== TOKEN_PROGRAM_ID.toBase58()) throw new Error("Owner del mint cambió.");
      assertMintSnapshot(mint.snapshot, { authority: session.plan.payer, supply: MAINNET_INITIAL_LAUNCH_BASE_UNITS });
      const ata = await this.rpc.readAta(new PublicKey(session.plan.destinationAta));
      if (!ata || ata.programOwner !== TOKEN_PROGRAM_ID.toBase58() || ata.mint !== session.plan.mintAddress || ata.owner !== session.plan.destinationOwner || ata.amount !== MAINNET_INITIAL_LAUNCH_BASE_UNITS) throw new Error("El ATA final no contiene exactamente 1,000 AVI.");
      const accounts = await this.rpc.listMintAccounts(new PublicKey(session.plan.mintAddress));
      if (accounts.length !== 1 || accounts[0]?.address !== session.plan.destinationAta || accounts[0].amount !== MAINNET_INITIAL_LAUNCH_BASE_UNITS) throw new Error("La distribución final contiene otra cuenta o un balance inesperado.");
      await this.assertMetadata();
      await this.onFinalized();
      session.status = "finalized";
      await this.saveRecovery(session, "finalized");
      return publicSession(session);
    } catch {
      return this.ambiguousResolution(session);
    }
  }

  async cancel(input: CommonInput): Promise<SupplyPublicSession> {
    const session = await this.assertCurrent(input, ["plan_built", "plan_reviewed", "simulated", "signature_requested", "signed"]);
    session.fresh = null; session.signature = null; session.expectedSignature = null; session.planReviewed = false; session.status = "cancelled";
    return publicSession(session);
  }

  private async assertCurrent(input: CommonInput, statuses: readonly FixedSupplyStatus[]): Promise<Session> {
    const session = this.session;
    if (!session || session.id !== input.sessionId) throw new Error("Sesión mint-fixed-supply desconocida.");
    if (!statuses.includes(session.status)) throw new Error(`Transición inválida desde ${session.status}.`);
    if (input.planHash !== session.plan.planHash) throw new Error("El stable plan cambió.");
    const runtime = this.runtime();
    assertRuntime(runtime, input.connectedWallet);
    if (fingerprint(runtime) !== session.configFingerprint) throw new Error("La configuración cambió desde Build.");
    await this.assertExpectedState();
    if (await this.rpc.getGenesisHash() !== runtime.expectedGenesisHash) throw new Error("Genesis Mainnet cambió.");
    if (!statuses.includes("sent") && !statuses.includes("ambiguous")) await this.assertPreIssuanceOnChain(session);
    return session;
  }

  private async assertPreIssuanceOnChain(session: Session): Promise<void> {
    const mintAddress = new PublicKey(session.plan.mintAddress);
    const mint = await this.rpc.readMint(mintAddress);
    assertMintSnapshot(mint.snapshot, { authority: session.plan.payer, supply: 0n });
    const ata = await this.rpc.readAta(new PublicKey(session.plan.destinationAta));
    if (!ata || ata.programOwner !== TOKEN_PROGRAM_ID.toBase58() || ata.mint !== session.plan.mintAddress || ata.owner !== session.plan.destinationOwner || ata.amount !== 0n) throw new Error("El ATA o su balance cambió antes de Send.");
    const accounts = await this.rpc.listMintAccounts(mintAddress);
    if (accounts.length !== 1 || accounts[0]?.address !== session.plan.destinationAta || accounts[0].amount !== 0n) throw new Error("La distribución cambió antes de Send.");
  }

  private invalidate(session: Session): void {
    session.fresh = null; session.signature = null; session.expectedSignature = null; session.status = "plan_reviewed";
  }

  private async assertMargin(session: Session, required: number, action: string): Promise<void> {
    if (!session.fresh) throw new Error("No existe mensaje fresco.");
    session.fresh.currentBlockHeight = await this.rpc.getBlockHeight();
    const remaining = session.fresh.lastValidBlockHeight - session.fresh.currentBlockHeight;
    if (remaining < required) { this.invalidate(session); throw new Error(`Blockhash sin margen para ${action}: quedan ${remaining}, se requieren ${required}.`); }
  }

  private async ambiguousResolution(session: Session) {
    session.status = "ambiguous" as const;
    const mint = await this.rpc.readMint(new PublicKey(session.plan.mintAddress));
    const ata = await this.rpc.readAta(new PublicKey(session.plan.destinationAta));
    const resolution = { signatureStatus: session.signature ? await this.rpc.getSignatureStatus(session.signature) : null, supplyBaseUnits: mint.snapshot.supply.toString(), ataAmountBaseUnits: ata?.amount.toString() ?? "missing" };
    await this.saveRecovery(session, "ambiguous");
    return { ...publicSession(session), resolution };
  }

  private async saveRecovery(session: Session, status: SupplyRecoveryRecord["status"]): Promise<void> {
    if (!session.fresh) throw new Error("No existe mensaje fresco para recovery.");
    await this.recovery.save({ operation: "mint-fixed-supply", status, mintAddress: session.plan.mintAddress, ata: session.plan.destinationAta, amountBaseUnits: "1000000000000", messageHash: session.fresh.messageHash, planHash: session.plan.planHash, blockhash: session.fresh.blockhash, lastValidBlockHeight: session.fresh.lastValidBlockHeight, signature: session.signature ?? session.expectedSignature, updatedAt: this.now().toISOString() });
  }
}
