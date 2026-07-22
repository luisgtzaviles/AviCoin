import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { AppConfig } from "./config.js";

const U64_MAX = 18_446_744_073_709_551_615n;

export async function confirmMutation(config: AppConfig, action: string): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Se requiere una terminal interactiva para confirmar.");
  if (config.SOLANA_NETWORK === "mainnet-beta" && !config.ALLOW_MAINNET) {
    throw new Error("Mainnet bloqueada: establece ALLOW_MAINNET=true de forma consciente.");
  }
  const expected = config.SOLANA_NETWORK === "mainnet-beta"
    ? `CONFIRMO MAINNET: ${action}`
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
  if (value < 0n || value > U64_MAX) {
    throw new Error(`${label} excede el rango u64 admitido por SPL Token.`);
  }
}

export function baseUnitsToHuman(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const padded = value.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
