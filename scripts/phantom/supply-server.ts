import { build as bundle } from "esbuild";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { AccountLayout, getAccount, getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey, type VersionedMessage, type VersionedTransaction } from "@solana/web3.js";
import { MAINNET_CONFIG, MAINNET_INITIAL_LAUNCH_BASE_UNITS, MAINNET_PRODUCTION_WALLET } from "../../config/index.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertMainnetMetadata, MAINNET_METADATA_URI } from "../lib/mainnet-metadata.js";
import { mintSnapshot } from "../lib/mainnet-token.js";
import { AVICOIN_MAINNET_ATA, AVICOIN_MAINNET_MINT } from "../lib/phantom-ata-session.js";
import type { PhantomRuntimeAuthorization } from "../lib/phantom-mint-session.js";
import {
  FIXED_SUPPLY_CONFIRMATION_TOKEN,
  PhantomFixedSupplyCoordinator,
  type SupplyRecoveryRecord,
  type SupplyRecoveryStore,
  type SupplyRpc,
  type SupplyTokenAccount,
} from "../lib/phantom-supply-session.js";
import { assertStateAllows, loadMainnetState, writeMainnetState } from "../lib/state.js";

const METADATA_PDA = "4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2";
const RECOVERY_PATH = resolve(".avicoin-phantom-sessions/mint-fixed-supply-recovery.json");
const MAX_REQUEST_BYTES = 1_000_000;

class FileSupplyRecoveryStore implements SupplyRecoveryStore {
  constructor(private readonly path = RECOVERY_PATH) {}
  async load(): Promise<SupplyRecoveryRecord | null> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as SupplyRecoveryRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async save(record: SupplyRecoveryRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export function supplyRuntimeAuthorization(environment: NodeJS.ProcessEnv = process.env): PhantomRuntimeAuthorization {
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

class Web3SupplyRpc implements SupplyRpc {
  constructor(private readonly connection: Connection) {}
  async getGenesisHash() { return this.connection.getGenesisHash(); }
  async getBalance(wallet: PublicKey) { return BigInt(await this.connection.getBalance(wallet, "confirmed")); }
  async getLatestBlockhash() { return this.connection.getLatestBlockhash("confirmed"); }
  async getFeeForMessage(message: VersionedMessage) {
    const fee = await this.connection.getFeeForMessage(message, "confirmed");
    if (fee.value === null) throw new Error("El RPC no pudo estimar el fee de emisión.");
    return BigInt(fee.value);
  }
  async simulate(transaction: VersionedTransaction) {
    const result = await this.connection.simulateTransaction(transaction, { sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" });
    if (result.value.err) throw new Error(`Simulación de emisión falló: ${JSON.stringify(result.value.err)}`);
    return { logs: result.value.logs ?? [], unitsConsumed: result.value.unitsConsumed ?? null };
  }
  async getBlockHeight() { return this.connection.getBlockHeight("confirmed"); }
  async sendRawTransaction(transaction: Uint8Array) {
    return this.connection.sendRawTransaction(transaction, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 });
  }
  async confirmFinalized(input: { readonly signature: string; readonly blockhash: string; readonly lastValidBlockHeight: number }) {
    const result = await this.connection.confirmTransaction(input, "finalized");
    if (result.value.err) throw new Error(`La emisión finalizó con error: ${JSON.stringify(result.value.err)}`);
  }
  async getSignatureStatus(signature: string) {
    const status = (await this.connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    return status ? (status.err ? `error:${JSON.stringify(status.err)}` : status.confirmationStatus ?? "processed") : null;
  }
  async readMint(address: PublicKey) {
    const account = await this.connection.getAccountInfo(address, "finalized");
    if (!account) throw new Error("Mint Mainnet no existe.");
    return { owner: account.owner.toBase58(), snapshot: mintSnapshot(await getMint(this.connection, address, "finalized", TOKEN_PROGRAM_ID)) };
  }
  async readAta(address: PublicKey): Promise<SupplyTokenAccount | null> {
    const accountInfo = await this.connection.getAccountInfo(address, "finalized");
    if (!accountInfo) return null;
    const account = await getAccount(this.connection, address, "finalized", TOKEN_PROGRAM_ID);
    return {
      address: address.toBase58(),
      programOwner: accountInfo.owner.toBase58(),
      mint: account.mint.toBase58(),
      owner: account.owner.toBase58(),
      amount: account.amount,
    };
  }
  async listMintAccounts(mint: PublicKey): Promise<readonly SupplyTokenAccount[]> {
    const accounts = await this.connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      commitment: "finalized",
      filters: [{ dataSize: AccountLayout.span }, { memcmp: { offset: 0, bytes: mint.toBase58() } }],
    });
    return accounts.map(({ pubkey, account }) => {
      const decoded = AccountLayout.decode(account.data);
      return {
        address: pubkey.toBase58(),
        programOwner: account.owner.toBase58(),
        mint: new PublicKey(decoded.mint).toBase58(),
        owner: new PublicKey(decoded.owner).toBase58(),
        amount: decoded.amount,
      };
    });
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(payload);
}

async function requestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-type"] !== "application/json") throw new Error("Content-Type debe ser application/json.");
  const chunks: Buffer[] = []; let size = 0;
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

function assertLocal(request: IncomingMessage, port: number): void {
  if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) throw new Error("Host local no autorizado.");
}

function assertOrigin(request: IncomingMessage, port: number): void {
  if (request.headers.origin !== `http://127.0.0.1:${port}` && request.headers.origin !== `http://localhost:${port}`) throw new Error("Origen local no autorizado.");
}

export async function startSupplyPhantomServer(options: { readonly port?: number; readonly environment?: NodeJS.ProcessEnv } = {}) {
  const environment = options.environment ?? process.env;
  const port = options.port ?? Number(environment.AVICOIN_PHANTOM_PORT ?? "4177");
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("Puerto local inválido.");
  const runtime = () => supplyRuntimeAuthorization(environment);
  const connection = new Connection(runtime().rpcUrl, "confirmed");
  const rpc = new Web3SupplyRpc(connection);
  const recovery = new FileSupplyRecoveryStore();
  const assertExpectedState = async () => {
    const state = await loadMainnetState();
    assertStateAllows(state, "mint-fixed-supply");
    if (state.avi_mint !== AVICOIN_MAINNET_MINT || state.avi_ata !== AVICOIN_MAINNET_ATA || !state.ata_created) throw new Error("Mint o ATA local no coincide con el estado confirmado.");
    if (!state.metadata_created || state.metadata_pda !== METADATA_PDA) throw new Error("Metadata local no está confirmada.");
    if (state.supply_minted || state.launch_mint_operations_completed !== 0) throw new Error("La emisión fija ya fue consumida.");
    if (state.pool_created || state.position_opened || state.liquidity_added || state.swaps_tested || state.mint_authority_revoked) throw new Error("Estado posterior fuera del alcance mint-fixed-supply.");
  };
  const assertMetadata = async () => {
    const pda = await assertMainnetMetadata(runtime().rpcUrl, AVICOIN_MAINNET_MINT, MAINNET_METADATA_URI);
    if (pda !== METADATA_PDA) throw new Error("Metadata PDA inesperada.");
  };
  const coordinator = new PhantomFixedSupplyCoordinator(rpc, runtime, recovery, assertExpectedState, assertMetadata, async () => {
    const state = await loadMainnetState();
    if (state.supply_minted || state.launch_mint_operations_completed !== 0) throw new Error("El estado de emisión ya fue actualizado.");
    await writeMainnetState({ ...state, supply_minted: true, launch_mint_operations_completed: 1 });
  });
  const bundleDirectory = await mkdtemp(join(tmpdir(), "avicoin-phantom-supply-ui-"));
  const bundlePath = join(bundleDirectory, "app.js");
  await bundle({ entryPoints: [resolve("tools/phantom-supply/app.js")], outfile: bundlePath, bundle: true, platform: "browser", format: "esm", target: ["es2022"], minify: false, sourcemap: false, logLevel: "silent" });
  const assets = new Map([
    ["/", { path: resolve("tools/phantom-supply/index.html"), type: "text/html; charset=utf-8" }],
    ["/styles.css", { path: resolve("tools/phantom/styles.css"), type: "text/css; charset=utf-8" }],
    ["/app.js", { path: bundlePath, type: "text/javascript; charset=utf-8" }],
  ]);
  const server = createServer(async (request, response) => {
    try {
      assertLocal(request, port);
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        const auth = runtime();
        const state = await loadMainnetState();
        const mint = await rpc.readMint(new PublicKey(AVICOIN_MAINNET_MINT));
        const ata = await rpc.readAta(new PublicKey(AVICOIN_MAINNET_ATA));
        const accounts = await rpc.listMintAccounts(new PublicKey(AVICOIN_MAINNET_MINT));
        let metadataValid = true; try { await assertMetadata(); } catch { metadataValid = false; }
        json(response, 200, {
          network: auth.network,
          rpcHost: new URL(auth.rpcUrl).hostname,
          expectedGenesisHash: auth.expectedGenesisHash,
          productionWallet: auth.productionWallet,
          mint: AVICOIN_MAINNET_MINT,
          ata: AVICOIN_MAINNET_ATA,
          amountAvi: "1000",
          amountBaseUnits: MAINNET_INITIAL_LAUNCH_BASE_UNITS.toString(),
          selectedOperation: auth.operation ?? null,
          executionEnabled: auth.allowMainnet && auth.operation === "mint-fixed-supply" && auth.confirmationToken === FIXED_SUPPLY_CONFIRMATION_TOKEN,
          recovery: await recovery.load(),
          preflight: {
            supplyZero: mint.snapshot.supply === 0n && !state.supply_minted && state.launch_mint_operations_completed === 0,
            ataZero: ata?.amount === 0n,
            onlyOfficialAta: accounts.length === 1 && accounts[0]?.address === AVICOIN_MAINNET_ATA && accounts[0].amount === 0n,
            mintInvariantsValid: mint.owner === TOKEN_PROGRAM_ID.toBase58() && mint.snapshot.decimals === 9 && mint.snapshot.mintAuthority === MAINNET_PRODUCTION_WALLET && mint.snapshot.freezeAuthority === null,
            metadataValid,
          },
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/session-status") { json(response, 200, coordinator.diagnostics()); return; }
      if (request.method === "POST" && url.pathname.startsWith("/api/")) {
        assertOrigin(request, port);
        const body = await requestBody(request);
        if (url.pathname === "/api/build") {
          const input = strings(body, ["connectedWallet", "operation"]);
          json(response, 200, await coordinator.build(input as { connectedWallet: string; operation: string }));
          return;
        }
        const common = strings(body, ["sessionId", "connectedWallet", "planHash"]) as { sessionId: string; connectedWallet: string; planHash: string };
        if (url.pathname === "/api/review") { json(response, 200, await coordinator.review(common)); return; }
        if (url.pathname === "/api/prepare") {
          const value = strings(body, ["confirmationToken"]);
          json(response, 200, await coordinator.prepareFreshTransaction({ ...common, confirmationToken: value.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true }));
          return;
        }
        if (url.pathname === "/api/fresh-status") { json(response, 200, await coordinator.freshStatus(common)); return; }
        if (url.pathname === "/api/signing-payload") {
          const value = strings(body, ["confirmationToken"]);
          json(response, 200, await coordinator.signingPayload({ ...common, confirmationToken: value.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true }));
          return;
        }
        if (url.pathname === "/api/signature-aborted") { json(response, 200, await coordinator.abortSignatureRequest(common)); return; }
        if (url.pathname === "/api/signed") {
          const value = strings(body, ["messageHash", "transactionBase64"]);
          json(response, 200, await coordinator.acceptSignedTransaction({ ...common, messageHash: value.messageHash as string, transactionBase64: value.transactionBase64 as string }));
          return;
        }
        if (url.pathname === "/api/send") {
          const value = strings(body, ["confirmationToken"]);
          json(response, 200, await coordinator.send({ ...common, confirmationToken: value.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true }));
          return;
        }
        if (url.pathname === "/api/verify") { json(response, 200, await coordinator.verifyFinalized(common)); return; }
        if (url.pathname === "/api/cancel") { json(response, 200, await coordinator.cancel(common)); return; }
        json(response, 404, { error: "Endpoint desconocido." });
        return;
      }
      const asset = assets.get(url.pathname);
      if (request.method !== "GET" || !asset) { json(response, 404, { error: "Recurso no encontrado." }); return; }
      const content = await readFile(asset.path);
      response.writeHead(200, {
        "Content-Type": asset.type,
        "Content-Length": content.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(content);
    } catch (error) {
      json(response, 409, { error: error instanceof Error ? error.message : "Error local inesperado." });
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return {
    server,
    port,
    close: async () => {
      await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
      await rm(bundleDirectory, { recursive: true, force: true });
    },
  };
}

export async function main(): Promise<void> {
  const instance = await startSupplyPhantomServer();
  const shutdown = () => { void instance.close().catch(reportFailure); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.log("OPEN THIS URL MANUALLY IN YOUR NORMAL CHROME PROFILE");
  console.log(`AVICOIN Phantom fixed supply: http://127.0.0.1:${instance.port}/`);
  console.log("No se solicita firma al iniciar. Única operación: mint-fixed-supply de exactamente 1,000 AVI.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
