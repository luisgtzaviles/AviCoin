import { build as bundle } from "esbuild";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Connection, Keypair, PublicKey, type VersionedMessage, type VersionedTransaction } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MAINNET_CONFIG, MAINNET_PRODUCTION_WALLET } from "../../config/index.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { mintSnapshot } from "../lib/mainnet-token.js";
import {
  CREATE_MINT_CONFIRMATION_TOKEN,
  PhantomCreateMintCoordinator,
  type CreateMintRpc,
  type PhantomRuntimeAuthorization,
  type PublicRecoveryRecord,
  type PublicRecoveryStore,
} from "../lib/phantom-mint-session.js";
import { assertStateAllows, loadMainnetState, writeMainnetState } from "../lib/state.js";

const RECOVERY_PATH = resolve(".avicoin-phantom-sessions/create-mint-recovery.json");
const MAX_REQUEST_BYTES = 1_000_000;

export class FilePublicRecoveryStore implements PublicRecoveryStore {
  constructor(private readonly path = RECOVERY_PATH) {}

  async load(): Promise<PublicRecoveryRecord | null> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as PublicRecoveryRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(record: PublicRecoveryRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export function runtimeAuthorization(environment: NodeJS.ProcessEnv = process.env): PhantomRuntimeAuthorization {
  return {
    network: environment.SOLANA_NETWORK ?? "mainnet-beta",
    rpcUrl: environment.SOLANA_RPC_URL ?? MAINNET_CONFIG.rpcUrl,
    expectedGenesisHash: MAINNET_CONFIG.genesisHash,
    productionWallet: MAINNET_PRODUCTION_WALLET,
    allowMainnet: environment.ALLOW_MAINNET === "true",
    operation: environment.AVICOIN_MAINNET_OPERATION,
    confirmationToken: environment.AVICOIN_CONFIRMATION_TOKEN,
  };
}

export class Web3CreateMintRpc implements CreateMintRpc {
  constructor(private readonly connection: Connection) {}

  async getGenesisHash(): Promise<string> {
    return this.connection.getGenesisHash();
  }

  async getBalance(wallet: PublicKey): Promise<bigint> {
    return BigInt(await this.connection.getBalance(wallet, "confirmed"));
  }

  async getAccountOwner(address: PublicKey): Promise<string | null> {
    return (await this.connection.getAccountInfo(address, "confirmed"))?.owner.toBase58() ?? null;
  }

  async getMinimumBalanceForRentExemption(size: number): Promise<bigint> {
    return BigInt(await this.connection.getMinimumBalanceForRentExemption(size, "confirmed"));
  }

  async getLatestBlockhash(): Promise<{ readonly blockhash: string; readonly lastValidBlockHeight: number }> {
    return this.connection.getLatestBlockhash("confirmed");
  }

  async getFeeForMessage(message: VersionedMessage): Promise<bigint> {
    const fee = await this.connection.getFeeForMessage(message, "confirmed");
    if (fee.value === null) throw new Error("El RPC no pudo estimar el fee del mensaje.");
    return BigInt(fee.value);
  }

  async simulate(transaction: VersionedTransaction): Promise<{ readonly logs: readonly string[]; readonly unitsConsumed: number | null }> {
    const result = await this.connection.simulateTransaction(transaction, { sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" });
    if (result.value.err) throw new Error(`La simulación create-mint falló: ${JSON.stringify(result.value.err)}`);
    return { logs: result.value.logs ?? [], unitsConsumed: result.value.unitsConsumed ?? null };
  }

  async getBlockHeight(): Promise<number> {
    return this.connection.getBlockHeight("confirmed");
  }

  async sendRawTransaction(transaction: Uint8Array): Promise<string> {
    return this.connection.sendRawTransaction(transaction, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 });
  }

  async confirmFinalized(input: { readonly signature: string; readonly blockhash: string; readonly lastValidBlockHeight: number }): Promise<void> {
    const result = await this.connection.confirmTransaction(input, "finalized");
    if (result.value.err) throw new Error(`La transacción finalizó con error: ${JSON.stringify(result.value.err)}`);
  }

  async getSignatureStatus(signature: string): Promise<string | null> {
    const result = await this.connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = result.value[0];
    if (!status) return null;
    return status.err ? `error:${JSON.stringify(status.err)}` : (status.confirmationStatus ?? "processed");
  }

  async readMint(address: PublicKey) {
    const account = await this.connection.getAccountInfo(address, "finalized");
    if (!account) throw new Error("La cuenta del mint no existe después de finalized.");
    const mint = await getMint(this.connection, address, "finalized", TOKEN_PROGRAM_ID);
    return { owner: account.owner.toBase58(), snapshot: mintSnapshot(mint) };
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(payload);
}

async function requestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-type"] !== "application/json") throw new Error("Content-Type debe ser application/json.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk as Uint8Array);
    size += value.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("Solicitud demasiado grande.");
    chunks.push(value);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Cuerpo JSON inválido.");
  return parsed as Record<string, unknown>;
}

function strings(body: Record<string, unknown>, names: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    if (typeof body[name] !== "string") throw new Error(`Falta ${name}.`);
    result[name] = body[name] as string;
  }
  return result;
}

function assertLocalOrigin(request: IncomingMessage, port: number): void {
  const origin = request.headers.origin;
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) throw new Error("Origen local no autorizado.");
}

function assertLocalHost(request: IncomingMessage, port: number): void {
  const host = request.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new Error("Host local no autorizado.");
}

export async function startPhantomServer(options: { readonly port?: number; readonly environment?: NodeJS.ProcessEnv } = {}) {
  const port = options.port ?? Number(options.environment?.AVICOIN_PHANTOM_PORT ?? process.env.AVICOIN_PHANTOM_PORT ?? "4173");
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("Puerto local inválido.");
  const environment = options.environment ?? process.env;
  const runtime = () => runtimeAuthorization(environment);
  const connection = new Connection(runtime().rpcUrl, "confirmed");
  const recoveryStore = new FilePublicRecoveryStore();
  const coordinator = new PhantomCreateMintCoordinator(
    new Web3CreateMintRpc(connection),
    runtime,
    recoveryStore,
    async () => {
      const state = await loadMainnetState();
      assertStateAllows(state, "create-mint");
      if (state.production_wallet !== MAINNET_PRODUCTION_WALLET) throw new Error("production_wallet no coincide con la wallet Phantom oficial.");
    },
    () => new Date(),
    () => Keypair.generate(),
    async (mintAddress) => {
      const state = await loadMainnetState();
      assertStateAllows(state, "create-mint");
      await writeMainnetState({ ...state, avi_mint: mintAddress, mint_created: true });
    },
  );
  const bundleDirectory = await mkdtemp(join(tmpdir(), "avicoin-phantom-ui-"));
  const bundlePath = join(bundleDirectory, "app.js");
  await bundle({ entryPoints: [resolve("tools/phantom/app.js")], outfile: bundlePath, bundle: true, platform: "browser", format: "esm", target: ["es2022"], minify: false, sourcemap: false, logLevel: "silent" });
  const assets = new Map([
    ["/", { path: resolve("tools/phantom/index.html"), type: "text/html; charset=utf-8" }],
    ["/styles.css", { path: resolve("tools/phantom/styles.css"), type: "text/css; charset=utf-8" }],
    ["/app.js", { path: bundlePath, type: "text/javascript; charset=utf-8" }],
  ]);

  const server = createServer(async (request, response) => {
    try {
      assertLocalHost(request, port);
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        const auth = runtime();
        json(response, 200, {
          network: auth.network,
          rpcHost: new URL(auth.rpcUrl).hostname,
          expectedGenesisHash: auth.expectedGenesisHash,
          productionWallet: auth.productionWallet,
          selectedOperation: auth.operation ?? null,
          executionEnabled: auth.allowMainnet && auth.operation === "create-mint" && auth.confirmationToken === CREATE_MINT_CONFIRMATION_TOKEN,
          recovery: await recoveryStore.load(),
        });
        return;
      }
      if (request.method === "POST" && url.pathname.startsWith("/api/")) {
        assertLocalOrigin(request, port);
        const body = await requestBody(request);
        if (url.pathname === "/api/build") {
          const buildInput = strings(body, ["connectedWallet", "operation"]);
          json(response, 200, await coordinator.build({ connectedWallet: buildInput.connectedWallet as string, operation: buildInput.operation as string }));
          return;
        }
        const common = strings(body, ["sessionId", "connectedWallet", "planHash"]);
        if (url.pathname === "/api/review") {
          json(response, 200, await coordinator.review(common as { sessionId: string; connectedWallet: string; planHash: string }));
          return;
        }
        if (url.pathname === "/api/prepare") {
          const confirmation = strings(body, ["confirmationToken"]);
          json(response, 200, await coordinator.prepareFreshTransaction({ ...common as { sessionId: string; connectedWallet: string; planHash: string }, confirmationToken: confirmation.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true }));
          return;
        }
        if (url.pathname === "/api/fresh-status") {
          json(response, 200, await coordinator.freshStatus(common as { sessionId: string; connectedWallet: string; planHash: string }));
          return;
        }
        if (url.pathname === "/api/signing-payload") {
          const confirmation = strings(body, ["confirmationToken"]);
          json(response, 200, await coordinator.signingPayload({ ...common as { sessionId: string; connectedWallet: string; planHash: string }, confirmationToken: confirmation.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true }));
          return;
        }
        if (url.pathname === "/api/signed") {
          const signed = strings(body, ["messageHash", "transactionBase64"]);
          json(response, 200, await coordinator.acceptSignedTransaction({ ...common as { sessionId: string; connectedWallet: string; planHash: string }, messageHash: signed.messageHash as string, transactionBase64: signed.transactionBase64 as string }));
          return;
        }
        if (url.pathname === "/api/send") {
          const confirmation = strings(body, ["confirmationToken"]);
          json(response, 200, await coordinator.send({ ...common as { sessionId: string; connectedWallet: string; planHash: string }, confirmationToken: confirmation.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true }));
          return;
        }
        if (url.pathname === "/api/verify") {
          json(response, 200, await coordinator.verifyFinalized(common as { sessionId: string; connectedWallet: string; planHash: string }));
          return;
        }
        if (url.pathname === "/api/cancel") {
          json(response, 200, await coordinator.cancel(common as { sessionId: string; connectedWallet: string; planHash: string }));
          return;
        }
        json(response, 404, { error: "Endpoint desconocido." });
        return;
      }
      const asset = assets.get(url.pathname);
      if (request.method !== "GET" || !asset) {
        json(response, 404, { error: "Recurso no encontrado." });
        return;
      }
      const content = await readFile(asset.path);
      response.writeHead(200, { "Content-Type": asset.type, "Content-Length": content.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(content);
    } catch (error) {
      json(response, 409, { error: error instanceof Error ? error.message : "Error local inesperado." });
    }
  });
  server.on("close", () => void rm(bundleDirectory, { recursive: true, force: true }));
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolveListen());
  });
  return { server, port, close: () => new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())) };
}

export async function main(): Promise<void> {
  const instance = await startPhantomServer();
  console.log(`AVICOIN Phantom local: http://127.0.0.1:${instance.port}`);
  console.log("No se solicita firma al iniciar. Cada paso requiere interacción explícita en la UI.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
