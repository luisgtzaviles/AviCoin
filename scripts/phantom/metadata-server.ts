import { build as bundle } from "esbuild";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Connection, PublicKey, type VersionedMessage, type VersionedTransaction } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { isSome, publicKey } from "@metaplex-foundation/umi";
import { mplTokenMetadata, safeFetchMetadataFromSeeds } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { MAINNET_CONFIG, MAINNET_PRODUCTION_WALLET } from "../../config/index.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { validatePublishedMainnetMetadata } from "../lib/mainnet-metadata.js";
import { mintSnapshot } from "../lib/mainnet-token.js";
import { type PhantomRuntimeAuthorization } from "../lib/phantom-mint-session.js";
import { CREATE_METADATA_CONFIRMATION_TOKEN, PhantomCreateMetadataCoordinator, type MetadataRecoveryRecord, type MetadataRecoveryStore, type MetadataRpc } from "../lib/phantom-metadata-session.js";
import { assertStateAllows, loadMainnetState, writeMainnetState } from "../lib/state.js";

const RECOVERY_PATH = resolve(".avicoin-phantom-sessions/create-metadata-recovery.json");
const MAX_REQUEST_BYTES = 1_000_000;

class FileMetadataRecoveryStore implements MetadataRecoveryStore {
  constructor(private readonly path = RECOVERY_PATH) {}
  async load(): Promise<MetadataRecoveryRecord | null> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as MetadataRecoveryRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async save(record: MetadataRecoveryRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export function metadataRuntimeAuthorization(environment: NodeJS.ProcessEnv = process.env): PhantomRuntimeAuthorization {
  return { network: environment.SOLANA_NETWORK ?? "mainnet-beta", rpcUrl: environment.SOLANA_RPC_URL ?? MAINNET_CONFIG.rpcUrl, expectedGenesisHash: MAINNET_CONFIG.genesisHash, productionWallet: MAINNET_PRODUCTION_WALLET, allowMainnet: environment.ALLOW_MAINNET === "true", operation: environment.AVICOIN_MAINNET_OPERATION, confirmationToken: environment.AVICOIN_CONFIRMATION_TOKEN };
}

class Web3MetadataRpc implements MetadataRpc {
  constructor(private readonly connection: Connection, private readonly rpcUrl: string) {}
  async getGenesisHash() { return this.connection.getGenesisHash(); }
  async getBalance(wallet: PublicKey) { return BigInt(await this.connection.getBalance(wallet, "confirmed")); }
  async getAccountOwner(address: PublicKey) { return (await this.connection.getAccountInfo(address, "confirmed"))?.owner.toBase58() ?? null; }
  async getMinimumBalanceForRentExemption(size: number) { return BigInt(await this.connection.getMinimumBalanceForRentExemption(size, "confirmed")); }
  async getLatestBlockhash() { return this.connection.getLatestBlockhash("confirmed"); }
  async getFeeForMessage(message: VersionedMessage) {
    const fee = await this.connection.getFeeForMessage(message, "confirmed");
    if (fee.value === null) throw new Error("El RPC no pudo estimar el fee metadata.");
    return BigInt(fee.value);
  }
  async simulate(transaction: VersionedTransaction) {
    const result = await this.connection.simulateTransaction(transaction, { sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" });
    if (result.value.err) throw new Error(`Simulación metadata falló: ${JSON.stringify(result.value.err)}`);
    return { logs: result.value.logs ?? [], unitsConsumed: result.value.unitsConsumed ?? null };
  }
  async getBlockHeight() { return this.connection.getBlockHeight("confirmed"); }
  async sendRawTransaction(transaction: Uint8Array) { return this.connection.sendRawTransaction(transaction, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 }); }
  async confirmFinalized(input: { readonly signature: string; readonly blockhash: string; readonly lastValidBlockHeight: number }) {
    const result = await this.connection.confirmTransaction(input, "finalized");
    if (result.value.err) throw new Error(`Metadata finalizó con error: ${JSON.stringify(result.value.err)}`);
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
  async readMetadata(mint: PublicKey) {
    const umi = createUmi(this.rpcUrl).use(mplTokenMetadata());
    const metadata = await safeFetchMetadataFromSeeds(umi, { mint: publicKey(mint.toBase58()) });
    if (!metadata) return null;
    const account = await this.connection.getAccountInfo(new PublicKey(metadata.publicKey), "finalized");
    return { publicKey: metadata.publicKey, owner: account?.owner.toBase58() ?? "", mint: metadata.mint, name: metadata.name, symbol: metadata.symbol, uri: metadata.uri, sellerFeeBasisPoints: metadata.sellerFeeBasisPoints, isMutable: metadata.isMutable, updateAuthority: metadata.updateAuthority, hasCreators: isSome(metadata.creators), hasCollection: isSome(metadata.collection), hasUses: isSome(metadata.uses) };
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
  for await (const chunk of request) { const value = Buffer.from(chunk as Uint8Array); size += value.length; if (size > MAX_REQUEST_BYTES) throw new Error("Solicitud demasiado grande."); chunks.push(value); }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Cuerpo JSON inválido.");
  return parsed as Record<string, unknown>;
}

function strings(body: Record<string, unknown>, names: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) { if (typeof body[name] !== "string") throw new Error(`Falta ${name}.`); result[name] = body[name] as string; }
  return result;
}

function assertLocal(request: IncomingMessage, port: number): void {
  if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) throw new Error("Host local no autorizado.");
}

function assertOrigin(request: IncomingMessage, port: number): void {
  if (request.headers.origin !== `http://127.0.0.1:${port}` && request.headers.origin !== `http://localhost:${port}`) throw new Error("Origen local no autorizado.");
}

export async function startMetadataPhantomServer(options: { readonly port?: number; readonly environment?: NodeJS.ProcessEnv } = {}) {
  const environment = options.environment ?? process.env;
  const port = options.port ?? Number(environment.AVICOIN_PHANTOM_PORT ?? "4174");
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("Puerto local inválido.");
  const runtime = () => metadataRuntimeAuthorization(environment);
  const connection = new Connection(runtime().rpcUrl, "confirmed");
  const recovery = new FileMetadataRecoveryStore();
  const coordinator = new PhantomCreateMetadataCoordinator(
    new Web3MetadataRpc(connection, runtime().rpcUrl), runtime, recovery,
    async () => {
      const state = await loadMainnetState();
      assertStateAllows(state, "create-metadata");
      if (state.avi_mint !== "GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC" || state.metadata_created || state.metadata_pda) throw new Error("Estado local no permite create-metadata.");
    },
    async () => { await validatePublishedMainnetMetadata(); },
    async (metadataPda) => {
      const state = await loadMainnetState();
      if (state.metadata_created || state.metadata_pda) throw new Error("Estado metadata ya fue actualizado.");
      await writeMainnetState({ ...state, metadata_pda: metadataPda, metadata_created: true });
    },
  );
  const bundleDirectory = await mkdtemp(join(tmpdir(), "avicoin-phantom-metadata-ui-"));
  const bundlePath = join(bundleDirectory, "app.js");
  await bundle({ entryPoints: [resolve("tools/phantom-metadata/app.js")], outfile: bundlePath, bundle: true, platform: "browser", format: "esm", target: ["es2022"], minify: false, sourcemap: false, logLevel: "silent" });
  const assets = new Map([
    ["/", { path: resolve("tools/phantom-metadata/index.html"), type: "text/html; charset=utf-8" }],
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
        const pda = new PublicKey("4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2");
        const mint = await new Web3MetadataRpc(connection, auth.rpcUrl).readMint(new PublicKey("GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC"));
        let publicMetadataHashMatches = true;
        try { await validatePublishedMainnetMetadata(); } catch { publicMetadataHashMatches = false; }
        json(response, 200, {
          network: auth.network, rpcHost: new URL(auth.rpcUrl).hostname, expectedGenesisHash: auth.expectedGenesisHash,
          productionWallet: auth.productionWallet, selectedOperation: auth.operation ?? null,
          executionEnabled: auth.allowMainnet && auth.operation === "create-metadata" && auth.confirmationToken === CREATE_METADATA_CONFIRMATION_TOKEN,
          recovery: await recovery.load(),
          preflight: {
            metadataPdaStillAbsent: (await connection.getAccountInfo(pda, "confirmed")) === null && state.metadata_pda === null && !state.metadata_created,
            mintInvariantsValid: mint.owner === MAINNET_CONFIG.programs.splToken && mint.snapshot.decimals === 9 && mint.snapshot.supply === 0n && mint.snapshot.mintAuthority === MAINNET_PRODUCTION_WALLET && mint.snapshot.freezeAuthority === null,
            publicMetadataHashMatches,
          },
        }); return;
      }
      if (request.method === "GET" && url.pathname === "/api/session-status") { json(response, 200, coordinator.diagnostics()); return; }
      if (request.method === "POST" && url.pathname.startsWith("/api/")) {
        assertOrigin(request, port);
        const body = await requestBody(request);
        if (url.pathname === "/api/build") { const input = strings(body, ["connectedWallet", "operation"]); json(response, 200, await coordinator.build(input as { connectedWallet: string; operation: string })); return; }
        const common = strings(body, ["sessionId", "connectedWallet", "planHash"]) as { sessionId: string; connectedWallet: string; planHash: string };
        if (url.pathname === "/api/review") { json(response, 200, await coordinator.review(common)); return; }
        if (url.pathname === "/api/prepare") { const value = strings(body, ["confirmationToken"]); json(response, 200, await coordinator.prepareFreshTransaction({ ...common, confirmationToken: value.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true })); return; }
        if (url.pathname === "/api/fresh-status") { json(response, 200, await coordinator.freshStatus(common)); return; }
        if (url.pathname === "/api/signing-payload") { const value = strings(body, ["confirmationToken"]); json(response, 200, await coordinator.signingPayload({ ...common, confirmationToken: value.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true })); return; }
        if (url.pathname === "/api/signed") { const value = strings(body, ["messageHash", "transactionBase64"]); json(response, 200, await coordinator.acceptSignedTransaction({ ...common, messageHash: value.messageHash as string, transactionBase64: value.transactionBase64 as string })); return; }
        if (url.pathname === "/api/send") { const value = strings(body, ["confirmationToken"]); json(response, 200, await coordinator.send({ ...common, confirmationToken: value.confirmationToken as string, explicitlyConfirmed: body.explicitlyConfirmed === true })); return; }
        if (url.pathname === "/api/verify") { json(response, 200, await coordinator.verifyFinalized(common)); return; }
        if (url.pathname === "/api/cancel") { json(response, 200, await coordinator.cancel(common)); return; }
        json(response, 404, { error: "Endpoint desconocido." }); return;
      }
      const asset = assets.get(url.pathname);
      if (request.method !== "GET" || !asset) { json(response, 404, { error: "Recurso no encontrado." }); return; }
      const content = await readFile(asset.path);
      response.writeHead(200, { "Content-Type": asset.type, "Content-Length": content.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(content);
    } catch (error) { json(response, 409, { error: error instanceof Error ? error.message : "Error local inesperado." }); }
  });
  server.on("close", () => void rm(bundleDirectory, { recursive: true, force: true }));
  await new Promise<void>((resolveListen, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolveListen); });
  return { server, port, close: () => new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())) };
}

export async function main(): Promise<void> {
  const instance = await startMetadataPhantomServer();
  console.log(`OPEN THIS URL MANUALLY IN YOUR NORMAL CHROME PROFILE`);
  console.log(`AVICOIN Phantom metadata: http://127.0.0.1:${instance.port}/`);
  console.log("No se solicita firma al iniciar. Única operación: create-metadata.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
