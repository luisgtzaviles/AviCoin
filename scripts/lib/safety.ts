import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { MainnetOperation } from "../../config/index.js";
import type { AppConfig } from "./config.js";

const U64_MAX = 18_446_744_073_709_551_615n;
export const DRY_RUN_RECEIPT_TTL_MS = 30 * 60 * 1_000;

export interface OperationContext {
  readonly network: AppConfig["SOLANA_NETWORK"];
  readonly genesisHash: string;
  readonly rpcHost: string;
  readonly wallet: string;
  readonly operation: MainnetOperation;
  readonly parameters: Readonly<Record<string, string | number | boolean | null>>;
}

interface DryRunReceipt {
  readonly schemaVersion: 1;
  readonly fingerprint: string;
  readonly simulatedAt: string;
  readonly context: OperationContext;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

export function operationFingerprint(context: OperationContext): string {
  return createHash("sha256").update(canonical(context)).digest("hex");
}

export function rpcHostname(rpcUrl: string): string {
  return new URL(rpcUrl).hostname;
}

export function buildOperationContext(
  config: AppConfig,
  genesisHash: string,
  wallet: string,
  operation: MainnetOperation,
  parameters: OperationContext["parameters"],
): OperationContext {
  return { network: config.SOLANA_NETWORK, genesisHash, rpcHost: rpcHostname(config.SOLANA_RPC_URL), wallet, operation, parameters };
}

export function assertMainnetAuthorization(config: AppConfig, operation: MainnetOperation, signer: string): void {
  if (config.SOLANA_NETWORK !== "mainnet-beta") throw new Error("Esta operación está reservada para mainnet-beta.");
  if (!config.ALLOW_MAINNET) throw new Error("Mainnet bloqueada: ALLOW_MAINNET debe ser true sólo durante la operación autorizada.");
  if (config.MAINNET_OPERATION !== operation) {
    throw new Error(`Autorización incorrecta: AVICOIN_MAINNET_OPERATION debe ser exactamente ${operation}.`);
  }
  if (!config.AVICOIN_PRODUCTION_WALLET) throw new Error("Falta AVICOIN_PRODUCTION_WALLET para fijar la wallet esperada.");
  if (config.AVICOIN_PRODUCTION_WALLET !== signer) throw new Error("El signer no coincide exactamente con AVICOIN_PRODUCTION_WALLET.");
}

export function assertUnsignedMainnetDryRun(config: AppConfig): void {
  if (config.SOLANA_NETWORK !== "mainnet-beta") throw new Error("El plan unsigned requiere mainnet-beta explícita.");
  if (config.ALLOW_MAINNET) throw new Error("El plan unsigned exige ALLOW_MAINNET=false.");
  if (config.MAINNET_OPERATION !== undefined) throw new Error("El plan unsigned no admite una operación persistente autorizada.");
  if (!config.AVICOIN_PRODUCTION_WALLET) throw new Error("Falta la public key de production_wallet.");
}

export function assertLegacyDevnetOnly(config: AppConfig): void {
  if (config.SOLANA_NETWORK !== "devnet") {
    throw new Error("Este entrypoint histórico está limitado a devnet. Usa exclusivamente el entrypoint mainnet específico con dry-run y autorización por operación.");
  }
}

export function dryRunRequested(argv: readonly string[] = process.argv.slice(2)): boolean {
  return argv.includes("--dry-run");
}

export function executeAfterDryRunRequested(argv: readonly string[] = process.argv.slice(2)): boolean {
  if (argv.includes("--dry-run") && argv.includes("--execute-after-dry-run")) throw new Error("Elige --dry-run o --execute-after-dry-run, no ambos.");
  return argv.includes("--execute-after-dry-run");
}

export function assertOnlyArguments(argv: readonly string[], allowed: readonly string[]): void {
  const unexpected = argv.filter((argument) => !allowed.includes(argument));
  if (unexpected.length) throw new Error(`Argumentos no permitidos: ${unexpected.join(", ")}.`);
}

export function assertOnlyOperationArguments(argv: readonly string[], allowedPrefixes: readonly string[] = []): void {
  const flags = ["--dry-run", "--execute-after-dry-run"];
  const unexpected = argv.filter((argument) => !flags.includes(argument) && !allowedPrefixes.some((prefix) => argument.startsWith(prefix)));
  if (unexpected.length) throw new Error(`Argumentos no permitidos: ${unexpected.join(", ")}.`);
}

export function receiptPath(context: OperationContext, directory = ".avicoin-dry-runs"): string {
  return resolve(directory, `${operationFingerprint(context)}.json`);
}

export async function writeDryRunReceipt(
  context: OperationContext,
  directory = ".avicoin-dry-runs",
  now = new Date(),
): Promise<string> {
  const output = receiptPath(context, directory);
  const receipt: DryRunReceipt = { schemaVersion: 1, fingerprint: operationFingerprint(context), simulatedAt: now.toISOString(), context };
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, output);
  return output;
}

export async function assertFreshDryRunReceipt(
  context: OperationContext,
  directory = ".avicoin-dry-runs",
  now = new Date(),
): Promise<void> {
  const expectedFingerprint = operationFingerprint(context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(receiptPath(context, directory), "utf8"));
  } catch (error) {
    throw new Error("Falta un recibo dry-run válido para exactamente esta operación y parámetros.", { cause: error });
  }
  if (!parsed || typeof parsed !== "object") throw new Error("El recibo dry-run no es válido.");
  const receipt = parsed as Partial<DryRunReceipt>;
  if (receipt.schemaVersion !== 1 || receipt.fingerprint !== expectedFingerprint || canonical(receipt.context) !== canonical(context)) {
    throw new Error("El recibo dry-run no coincide con la configuración, wallet u operación actuales.");
  }
  const simulatedAt = Date.parse(receipt.simulatedAt ?? "");
  if (!Number.isFinite(simulatedAt) || simulatedAt > now.getTime() || now.getTime() - simulatedAt > DRY_RUN_RECEIPT_TTL_MS) {
    throw new Error("El recibo dry-run expiró; ejecuta una simulación nueva con la misma configuración.");
  }
}

export async function executeGuarded<T>(options: {
  readonly dryRun: boolean;
  readonly executeAfterDryRun?: boolean;
  readonly context: OperationContext;
  readonly receiptDirectory?: string;
  readonly simulate: () => Promise<T>;
  readonly execute: () => Promise<T>;
  readonly confirm?: () => Promise<void>;
}): Promise<{ mode: "dry-run" | "execute"; result: T; receipt?: string }> {
  if (options.dryRun) {
    const result = await options.simulate();
    const receipt = await writeDryRunReceipt(options.context, options.receiptDirectory);
    return { mode: "dry-run", result, receipt };
  }
  if (options.executeAfterDryRun) {
    await options.simulate();
    await writeDryRunReceipt(options.context, options.receiptDirectory);
    await assertFreshDryRunReceipt(options.context, options.receiptDirectory);
    await options.confirm?.();
    return { mode: "execute", result: await options.execute() };
  }
  await assertFreshDryRunReceipt(options.context, options.receiptDirectory);
  await options.confirm?.();
  return { mode: "execute", result: await options.execute() };
}

export function safeOperationSummary(context: OperationContext): Record<string, string> {
  return {
    red: context.network,
    genesis: context.genesisHash,
    rpc_host: context.rpcHost,
    wallet: context.wallet,
    operación: context.operation,
    parámetros: canonical(context.parameters),
  };
}

export async function confirmMutation(config: AppConfig, action: string): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Se requiere una terminal interactiva para confirmar.");
  const expected = config.SOLANA_NETWORK === "mainnet-beta"
    ? `CONFIRMO MAINNET AVICOIN: ${action}`
    : `CONFIRMO DEVNET: ${action}`;
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await readline.question(`Escribe exactamente \"${expected}\" para continuar: `);
    if (answer !== expected) throw new Error("Confirmación incorrecta; operación cancelada sin enviar transacciones.");
  } finally {
    readline.close();
  }
}

export function humanToBaseUnits(value: string, decimals: number): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error("La cantidad debe ser decimal, positiva y sin notación exponencial.");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`La cantidad admite como máximo ${decimals} decimales.`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units <= 0n) throw new Error("La cantidad debe ser mayor que cero.");
  assertU64(units, "cantidad");
  return units;
}

export function assertU64(value: bigint, label: string): void {
  if (value < 0n || value > U64_MAX) throw new Error(`${label} excede el rango u64 admitido por SPL Token.`);
}

export function baseUnitsToHuman(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const padded = value.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function defaultReceiptDirectory(): string {
  return join(process.cwd(), ".avicoin-dry-runs");
}
