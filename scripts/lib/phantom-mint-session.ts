import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMint2Instruction } from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type VersionedMessage,
} from "@solana/web3.js";
import { MAINNET_CONFIG, MAINNET_PRODUCTION_WALLET } from "../../config/index.js";
import type { MintSnapshot } from "./mainnet-token.js";
import { assertMintSnapshot } from "./mainnet-token.js";

export const CREATE_MINT_DRY_RUN_TTL_MS = 10 * 60 * 1_000;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ZERO_SIGNATURE = new Uint8Array(64);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export type CreateMintSessionStatus =
  | "built"
  | "simulated"
  | "reviewed"
  | "signature_requested"
  | "signed"
  | "sending"
  | "sent"
  | "finalized"
  | "ambiguous";

export interface PhantomRuntimeAuthorization {
  readonly network: string;
  readonly rpcUrl: string;
  readonly expectedGenesisHash: string;
  readonly productionWallet: string;
  readonly allowMainnet: boolean;
  readonly operation: string | undefined;
  readonly confirmationToken: string | undefined;
}

export interface CreateMintRpc {
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
}

export interface PublicRecoveryRecord {
  readonly operation: "create-mint";
  readonly status: "sending" | "sent" | "ambiguous" | "finalized";
  readonly mintAddress: string;
  readonly messageHash: string;
  readonly planHash: string;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  readonly signature: string | null;
  readonly updatedAt: string;
}

export interface PublicRecoveryStore {
  load(): Promise<PublicRecoveryRecord | null>;
  save(record: PublicRecoveryRecord): Promise<void>;
}

export interface CreateMintPlanSummary {
  readonly operation: "create-mint";
  readonly network: "mainnet-beta";
  readonly genesisHash: string;
  readonly rpcHost: string;
  readonly wallet: string;
  readonly mintAddress: string;
  readonly decimals: 9;
  readonly supply: "0";
  readonly mintAuthority: string;
  readonly freezeAuthority: null;
  readonly instructions: readonly ["system:createAccount", "spl-token:initializeMint2"];
  readonly programs: readonly string[];
  readonly writableAccounts: readonly string[];
  readonly signerAccounts: readonly string[];
  readonly balanceBeforeLamports: string;
  readonly expectedBalanceChangeLamports: string;
  readonly rentLamports: string;
  readonly estimatedFeeLamports: string;
  readonly messageHash: string;
  readonly planHash: string;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  readonly stopConditions: readonly string[];
}

export interface CreateMintPublicSession {
  readonly sessionId: string;
  readonly status: CreateMintSessionStatus;
  readonly plan: CreateMintPlanSummary;
  readonly simulatedAt: string | null;
  readonly dryRunValidUntil: string | null;
  readonly simulation: { readonly logs: readonly string[]; readonly unitsConsumed: number | null } | null;
  readonly signature: string | null;
  readonly expectedSignature: string | null;
}

interface PrivateSession {
  readonly id: string;
  status: CreateMintSessionStatus;
  readonly mint: Keypair;
  readonly transaction: VersionedTransaction;
  signedTransaction: VersionedTransaction | null;
  readonly plan: CreateMintPlanSummary;
  readonly configFingerprint: string;
  simulatedAt: Date | null;
  simulation: { readonly logs: readonly string[]; readonly unitsConsumed: number | null } | null;
  signature: string | null;
  expectedSignature: string | null;
  sendInFlight: boolean;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function base58Encode(bytes: Uint8Array): string {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let output = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    output = `${BASE58_ALPHABET[remainder]}${output}`;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    output = `1${output}`;
  }
  return output || "1";
}

export function solanaTransactionSignature(transaction: VersionedTransaction): string {
  const signature = transaction.signatures[0];
  if (!signature || Buffer.from(signature).equals(Buffer.from(ZERO_SIGNATURE))) throw new Error("La transacción no contiene firma del fee payer.");
  return base58Encode(signature);
}

function runtimeFingerprint(runtime: PhantomRuntimeAuthorization): string {
  return sha256(stable({
    network: runtime.network,
    rpcUrl: runtime.rpcUrl,
    expectedGenesisHash: runtime.expectedGenesisHash,
    productionWallet: runtime.productionWallet,
    allowMainnet: runtime.allowMainnet,
    operation: runtime.operation ?? null,
  }));
}

function assertRuntimeShape(runtime: PhantomRuntimeAuthorization, connectedWallet: string): void {
  if (runtime.network !== "mainnet-beta") throw new Error("La sesión Phantom exige mainnet-beta.");
  if (runtime.expectedGenesisHash !== MAINNET_CONFIG.genesisHash) throw new Error("Genesis Mainnet configurado incorrectamente.");
  if (runtime.productionWallet !== connectedWallet) throw new Error("La wallet Phantom conectada no coincide con production_wallet.");
  if (runtime.operation !== "create-mint") throw new Error("La operación seleccionada debe ser exactamente create-mint.");
  const url = new URL(runtime.rpcUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("El RPC Mainnet debe ser HTTPS y no contener credenciales.");
}

function assertExecutionAuthorization(runtime: PhantomRuntimeAuthorization, token: string): void {
  if (!runtime.allowMainnet) throw new Error("Envío bloqueado: ALLOW_MAINNET debe ser true sólo durante la sesión deliberada.");
  if (runtime.operation !== "create-mint") throw new Error("AVICOIN_MAINNET_OPERATION debe ser exactamente create-mint.");
  if (!runtime.confirmationToken || runtime.confirmationToken.length < 16 || token !== runtime.confirmationToken) {
    throw new Error("Token efímero de confirmación inválido.");
  }
}

function publicSession(session: PrivateSession): CreateMintPublicSession {
  const validUntil = session.simulatedAt ? new Date(session.simulatedAt.getTime() + CREATE_MINT_DRY_RUN_TTL_MS) : null;
  return {
    sessionId: session.id,
    status: session.status,
    plan: session.plan,
    simulatedAt: session.simulatedAt?.toISOString() ?? null,
    dryRunValidUntil: validUntil?.toISOString() ?? null,
    simulation: session.simulation,
    signature: session.signature,
    expectedSignature: session.expectedSignature,
  };
}

function verifyEd25519Signature(publicKey: PublicKey, message: Uint8Array, signature: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey.toBuffer()]), format: "der", type: "spki" });
  return verify(null, message, key, signature);
}

export class PhantomCreateMintCoordinator {
  private session: PrivateSession | null = null;

  constructor(
    private readonly rpc: CreateMintRpc,
    private readonly runtime: () => PhantomRuntimeAuthorization,
    private readonly recoveryStore: PublicRecoveryStore,
    private readonly assertExpectedState: () => Promise<void> = async () => undefined,
    private readonly now: () => Date = () => new Date(),
    private readonly createMintKeypair: () => Keypair = () => Keypair.generate(),
    private readonly onFinalized: (mintAddress: string) => Promise<void> = async () => undefined,
  ) {}

  async build(input: { readonly connectedWallet: string; readonly operation: string }): Promise<CreateMintPublicSession> {
    if (input.operation !== "create-mint") throw new Error("Sólo create-mint está habilitado; las demás operaciones permanecen bloqueadas.");
    if (this.session) throw new Error("Ya existe una sesión create-mint en memoria; no se construirá un segundo mint.");
    const recovery = await this.recoveryStore.load();
    if (recovery && recovery.status !== "finalized") throw new Error(`Existe una operación ${recovery.status} para ${recovery.mintAddress}; resuélvela antes de construir otro mint.`);
    const runtime = this.runtime();
    assertRuntimeShape(runtime, input.connectedWallet);
    await this.assertExpectedState();
    const genesisHash = await this.rpc.getGenesisHash();
    if (genesisHash !== runtime.expectedGenesisHash) throw new Error("El genesis hash real no corresponde a Mainnet.");
    const wallet = new PublicKey(input.connectedWallet);
    const mint = this.createMintKeypair();
    if (await this.rpc.getAccountOwner(mint.publicKey)) throw new Error("La dirección efímera del mint ya existe; sesión detenida.");
    const [balance, rent, lifetime] = await Promise.all([
      this.rpc.getBalance(wallet),
      this.rpc.getMinimumBalanceForRentExemption(MINT_SIZE),
      this.rpc.getLatestBlockhash(),
    ]);
    const rentLamports = Number(rent);
    if (!Number.isSafeInteger(rentLamports) || BigInt(rentLamports) !== rent) throw new Error("La renta del mint excede el rango numérico seguro.");
    const instructions = [
      SystemProgram.createAccount({ fromPubkey: wallet, newAccountPubkey: mint.publicKey, lamports: rentLamports, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(mint.publicKey, 9, wallet, null, TOKEN_PROGRAM_ID),
    ];
    const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: lifetime.blockhash, instructions }).compileToV0Message();
    const fee = await this.rpc.getFeeForMessage(message);
    if (balance < rent + fee) throw new Error("El balance SOL no cubre renta y fee estimado de create-mint.");
    const transaction = new VersionedTransaction(message);
    transaction.sign([mint]);
    const messageHash = sha256(message.serialize());
    const basePlan = {
      operation: "create-mint" as const,
      network: "mainnet-beta" as const,
      genesisHash,
      rpcHost: new URL(runtime.rpcUrl).hostname,
      wallet: wallet.toBase58(),
      mintAddress: mint.publicKey.toBase58(),
      decimals: 9 as const,
      supply: "0" as const,
      mintAuthority: wallet.toBase58(),
      freezeAuthority: null,
      instructions: ["system:createAccount", "spl-token:initializeMint2"] as const,
      programs: [SystemProgram.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58()],
      writableAccounts: [wallet.toBase58(), mint.publicKey.toBase58()],
      signerAccounts: [wallet.toBase58(), mint.publicKey.toBase58()],
      balanceBeforeLamports: balance.toString(),
      expectedBalanceChangeLamports: (-(rent + fee)).toString(),
      rentLamports: rent.toString(),
      estimatedFeeLamports: fee.toString(),
      messageHash,
      blockhash: lifetime.blockhash,
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
      stopConditions: [
        "wallet, network, genesis, RPC, operation or plan changed",
        "dry-run expired or blockhash expired",
        "mint address already exists",
        "ALLOW_MAINNET is false or confirmation token is invalid",
        "signature does not match the exact message",
        "send outcome is ambiguous",
      ],
    };
    const planHash = sha256(stable(basePlan));
    const session: PrivateSession = {
      id: randomUUID(),
      status: "built",
      mint,
      transaction,
      signedTransaction: null,
      plan: { ...basePlan, planHash },
      configFingerprint: runtimeFingerprint(runtime),
      simulatedAt: null,
      simulation: null,
      signature: null,
      expectedSignature: null,
      sendInFlight: false,
    };
    this.session = session;
    return publicSession(session);
  }

  async simulate(input: { readonly sessionId: string; readonly connectedWallet: string; readonly planHash: string }): Promise<CreateMintPublicSession> {
    const session = await this.assertCurrent(input, ["built"]);
    const result = await this.rpc.simulate(session.transaction);
    session.status = "simulated";
    session.simulatedAt = this.now();
    session.simulation = result;
    return publicSession(session);
  }

  async review(input: { readonly sessionId: string; readonly connectedWallet: string; readonly planHash: string }): Promise<CreateMintPublicSession> {
    const session = await this.assertCurrent(input, ["simulated"]);
    this.assertDryRunFresh(session);
    session.status = "reviewed";
    return publicSession(session);
  }

  async signingPayload(input: {
    readonly sessionId: string;
    readonly connectedWallet: string;
    readonly planHash: string;
    readonly confirmationToken: string;
    readonly explicitlyConfirmed: boolean;
  }): Promise<{ readonly transactionBase64: string; readonly messageHash: string; readonly planHash: string }> {
    const session = await this.assertCurrent(input, ["reviewed"]);
    if (!input.explicitlyConfirmed) throw new Error("Debes confirmar explícitamente la revisión antes de solicitar firma.");
    this.assertDryRunFresh(session);
    const runtime = this.runtime();
    assertExecutionAuthorization(runtime, input.confirmationToken);
    await this.assertBlockhashFresh(session);
    session.status = "signature_requested";
    return {
      transactionBase64: Buffer.from(session.transaction.serialize()).toString("base64"),
      messageHash: session.plan.messageHash,
      planHash: session.plan.planHash,
    };
  }

  async acceptSignedTransaction(input: {
    readonly sessionId: string;
    readonly connectedWallet: string;
    readonly planHash: string;
    readonly messageHash: string;
    readonly transactionBase64: string;
  }): Promise<CreateMintPublicSession> {
    const session = await this.assertCurrent(input, ["signature_requested"]);
    if (input.messageHash !== session.plan.messageHash) throw new Error("El hash del mensaje firmado no coincide con el construido.");
    const signed = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
    const signedMessage = signed.message.serialize();
    if (sha256(signedMessage) !== session.plan.messageHash) throw new Error("Phantom devolvió una transacción con un mensaje distinto.");
    const keys = signed.message.staticAccountKeys;
    const walletIndex = keys.findIndex((key) => key.equals(new PublicKey(session.plan.wallet)));
    const mintIndex = keys.findIndex((key) => key.equals(session.mint.publicKey));
    if (walletIndex < 0 || mintIndex < 0 || walletIndex >= signed.message.header.numRequiredSignatures || mintIndex >= signed.message.header.numRequiredSignatures) {
      throw new Error("Los signers del mensaje no coinciden con el plan create-mint.");
    }
    const walletSignature = signed.signatures[walletIndex];
    const mintSignature = signed.signatures[mintIndex];
    const originalMintSignature = session.transaction.signatures[mintIndex];
    if (!walletSignature || Buffer.from(walletSignature).equals(Buffer.from(ZERO_SIGNATURE)) || !verifyEd25519Signature(keys[walletIndex] as PublicKey, signedMessage, walletSignature)) {
      throw new Error("La firma Phantom no es válida para el mensaje exacto.");
    }
    if (!mintSignature || !originalMintSignature || !Buffer.from(mintSignature).equals(Buffer.from(originalMintSignature)) || !verifyEd25519Signature(session.mint.publicKey, signedMessage, mintSignature)) {
      throw new Error("La firma efímera del mint fue alterada.");
    }
    session.signedTransaction = signed;
    session.expectedSignature = solanaTransactionSignature(signed);
    session.status = "signed";
    return publicSession(session);
  }

  async send(input: {
    readonly sessionId: string;
    readonly connectedWallet: string;
    readonly planHash: string;
    readonly confirmationToken: string;
    readonly explicitlyConfirmed: boolean;
  }): Promise<CreateMintPublicSession> {
    const session = await this.assertCurrent(input, ["signed"]);
    if (!input.explicitlyConfirmed) throw new Error("Debes confirmar nuevamente antes de enviar.");
    if (session.sendInFlight) throw new Error("La transacción ya está enviándose; no se duplicará.");
    assertExecutionAuthorization(this.runtime(), input.confirmationToken);
    this.assertDryRunFresh(session);
    await this.assertBlockhashFresh(session);
    if (!session.signedTransaction) throw new Error("Falta la transacción firmada por Phantom.");
    await this.assertExpectedState();
    if (await this.rpc.getAccountOwner(session.mint.publicKey)) throw new Error("La dirección esperada del mint ya existe; no se enviará otra creación.");
    session.sendInFlight = true;
    session.status = "sending";
    await this.saveRecovery(session, "sending");
    try {
      const returnedSignature = await this.rpc.sendRawTransaction(session.signedTransaction.serialize());
      if (returnedSignature !== session.expectedSignature) throw new Error("El RPC devolvió una firma distinta de la transacción firmada.");
      session.signature = returnedSignature;
      session.status = "sent";
      await this.saveRecovery(session, "sent");
      return publicSession(session);
    } catch (error) {
      session.signature = session.expectedSignature;
      session.status = "ambiguous";
      await this.saveRecovery(session, "ambiguous");
      throw new Error("El resultado del envío es ambiguo. No reintentes ni construyas otro mint; consulta la firma y la dirección esperada.", { cause: error });
    } finally {
      session.sendInFlight = false;
    }
  }

  async verifyFinalized(input: { readonly sessionId: string; readonly connectedWallet: string; readonly planHash: string }): Promise<CreateMintPublicSession & { readonly resolution?: { readonly signatureStatus: string | null; readonly accountExists: boolean } }> {
    const session = await this.assertCurrent(input, ["sent", "ambiguous"]);
    if (!session.signature) {
      session.status = "ambiguous";
      await this.saveRecovery(session, "ambiguous");
      return { ...publicSession(session), resolution: { signatureStatus: null, accountExists: (await this.rpc.getAccountOwner(session.mint.publicKey)) !== null } };
    }
    try {
      await this.rpc.confirmFinalized({ signature: session.signature, blockhash: session.plan.blockhash, lastValidBlockHeight: session.plan.lastValidBlockHeight });
      const mint = await this.rpc.readMint(session.mint.publicKey);
      if (mint.owner !== TOKEN_PROGRAM_ID.toBase58()) throw new Error("La cuenta creada no pertenece al SPL Token Program.");
      assertMintSnapshot(mint.snapshot, { authority: session.plan.wallet, supply: 0n });
      await this.onFinalized(session.plan.mintAddress);
      session.status = "finalized";
      await this.saveRecovery(session, "finalized");
      return publicSession(session);
    } catch (error) {
      session.status = "ambiguous";
      const resolution = {
        signatureStatus: await this.rpc.getSignatureStatus(session.signature),
        accountExists: (await this.rpc.getAccountOwner(session.mint.publicKey)) !== null,
      };
      await this.saveRecovery(session, "ambiguous");
      return { ...publicSession(session), resolution };
    }
  }

  private async assertCurrent(
    input: { readonly sessionId: string; readonly connectedWallet: string; readonly planHash: string },
    allowedStatuses: readonly CreateMintSessionStatus[],
  ): Promise<PrivateSession> {
    const session = this.session;
    if (!session || session.id !== input.sessionId) throw new Error("Sesión create-mint desconocida o expirada.");
    if (!allowedStatuses.includes(session.status)) throw new Error(`Transición inválida desde ${session.status}.`);
    if (input.planHash !== session.plan.planHash) throw new Error("El plan cambió; la autorización anterior queda invalidada.");
    const runtime = this.runtime();
    assertRuntimeShape(runtime, input.connectedWallet);
    if (runtimeFingerprint(runtime) !== session.configFingerprint) throw new Error("La configuración cambió desde Build; reconstruye en una sesión nueva.");
    await this.assertExpectedState();
    if (await this.rpc.getGenesisHash() !== runtime.expectedGenesisHash) throw new Error("El genesis hash real cambió o no corresponde a Mainnet.");
    if (session.status !== "sent" && session.status !== "ambiguous" && await this.rpc.getAccountOwner(session.mint.publicKey)) {
      throw new Error("La dirección esperada del mint apareció antes del envío; sesión detenida.");
    }
    return session;
  }

  private assertDryRunFresh(session: PrivateSession): void {
    if (!session.simulatedAt || this.now().getTime() - session.simulatedAt.getTime() > CREATE_MINT_DRY_RUN_TTL_MS) {
      throw new Error("El dry-run expiró; no se puede firmar ni enviar.");
    }
  }

  private async assertBlockhashFresh(session: PrivateSession): Promise<void> {
    if (await this.rpc.getBlockHeight() > session.plan.lastValidBlockHeight) throw new Error("El blockhash expiró; envío rechazado.");
  }

  private async saveRecovery(session: PrivateSession, status: PublicRecoveryRecord["status"]): Promise<void> {
    await this.recoveryStore.save({
      operation: "create-mint",
      status,
      mintAddress: session.plan.mintAddress,
      messageHash: session.plan.messageHash,
      planHash: session.plan.planHash,
      blockhash: session.plan.blockhash,
      lastValidBlockHeight: session.plan.lastValidBlockHeight,
      signature: session.signature ?? session.expectedSignature,
      updatedAt: this.now().toISOString(),
    });
  }
}

export const OFFICIAL_MAINNET_PHANTOM_WALLET = MAINNET_PRODUCTION_WALLET;
