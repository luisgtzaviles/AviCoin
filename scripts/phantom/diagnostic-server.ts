import { build as bundle } from "esbuild";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";

const PRODUCTION_WALLET = "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq";
const MAX_RESULT_BYTES = 64_000;

function assertLocalHost(request: IncomingMessage, port: number): void {
  const host = request.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new Error("Host local no autorizado.");
}

function assertLocalOrigin(request: IncomingMessage, port: number): void {
  const origin = request.headers.origin;
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) throw new Error("Origen local no autorizado.");
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-type"] !== "application/json") throw new Error("Content-Type inválido.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_RESULT_BYTES) throw new Error("Resultado demasiado grande.");
    chunks.push(bytes);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Resultado inválido.");
  return value as Record<string, unknown>;
}

function send(response: ServerResponse, status: number, contentType: string, body: Buffer | string): void {
  const payload = typeof body === "string" ? Buffer.from(body) : body;
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "Connection": "close",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(payload);
}

export async function startPhantomDiagnosticServer(options: { readonly port?: number; readonly environment?: NodeJS.ProcessEnv } = {}) {
  const environment = options.environment ?? process.env;
  if (environment.ALLOW_MAINNET === "true") throw new Error("El diagnóstico exige ALLOW_MAINNET=false.");
  const port = options.port ?? Number(environment.AVICOIN_PHANTOM_PORT ?? "4173");
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("Puerto local inválido.");

  const bundleDirectory = await mkdtemp(join(tmpdir(), "avicoin-phantom-diagnostic-"));
  const bundlePath = join(bundleDirectory, "diagnostic.js");
  await bundle({ entryPoints: [resolve("tools/phantom/diagnostic.js")], outfile: bundlePath, bundle: true, platform: "browser", format: "esm", target: ["es2022"], minify: false, sourcemap: false, logLevel: "silent" });
  const assets = new Map([
    ["/", { path: resolve("tools/phantom/diagnostic.html"), type: "text/html; charset=utf-8" }],
    ["/styles.css", { path: resolve("tools/phantom/styles.css"), type: "text/css; charset=utf-8" }],
    ["/diagnostic.js", { path: bundlePath, type: "text/javascript; charset=utf-8" }],
  ]);

  let resultReceived = false;
  const server = createServer(async (request, response) => {
    try {
      assertLocalHost(request, port);
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (request.method === "POST" && url.pathname === "/result") {
        assertLocalOrigin(request, port);
        if (resultReceived) throw new Error("El resultado ya fue recibido.");
        const result = await readJson(request);
        const status = result.status === "PASS" ? "PASS" : "FAIL";
        const publicKey = typeof result.publicKey === "string" ? result.publicKey : null;
        if (status === "PASS" && publicKey !== PRODUCTION_WALLET) throw new Error("La wallet conectada no coincide con la wallet oficial.");
        resultReceived = true;
        send(response, 200, "application/json; charset=utf-8", JSON.stringify({ accepted: true }));
        console.log(status === "PASS" ? "PASS — PHANTOM MANUAL LOCAL CONNECTION VERIFIED" : "FAIL — PHANTOM LOCAL CONNECTION FAILED");
        console.log(JSON.stringify({ publicKey, waitedMs: result.waitedMs, diagnostics: result.diagnostics }, null, 2));
        setTimeout(() => {
          server.close();
          server.closeIdleConnections();
          server.closeAllConnections();
        }, 50);
        return;
      }
      const asset = assets.get(url.pathname);
      if (request.method !== "GET" || !asset) {
        send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Recurso no encontrado." }));
        return;
      }
      send(response, 200, asset.type, await readFile(asset.path));
    } catch (error) {
      send(response, 409, "application/json; charset=utf-8", JSON.stringify({ error: error instanceof Error ? error.message : "Error local inesperado." }));
    }
  });
  server.on("close", () => void rm(bundleDirectory, { recursive: true, force: true }));
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return { server, port, close: () => new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())) };
}

export async function main(): Promise<void> {
  const instance = await startPhantomDiagnosticServer();
  console.log("OPEN THIS URL MANUALLY IN YOUR NORMAL CHROME PROFILE");
  console.log(`http://127.0.0.1:${instance.port}/`);
  console.log("No automated browser was opened. Waiting up to 30 seconds after the page loads.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
