import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { AppConfig } from "./config.js";

export function createConnection(config: AppConfig): Connection {
  return new Connection(config.SOLANA_RPC_URL, "confirmed");
}

export async function loadExternalKeypair(path: string): Promise<Keypair> {
  if (!path) throw new Error("Falta SOLANA_KEYPAIR_PATH. No se generará ningún keypair.");
  const absolutePath = resolve(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`No fue posible leer el keypair externo: ${absolutePath}`, { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new Error("El archivo keypair debe contener un arreglo JSON válido de 64 bytes.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

export function parsePublicKey(value: string, label: string): PublicKey {
  if (!value) throw new Error(`Falta ${label}.`);
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} no es una dirección pública válida.`);
  }
}

export function explorerUrl(value: string, config: AppConfig, kind: "address" | "tx"): string {
  const cluster = config.SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/${kind}/${value}${cluster}`;
}

export async function assertRpcCluster(connection: Connection, config: AppConfig): Promise<void> {
  const genesisHash = await connection.getGenesisHash();
  const expected = config.SOLANA_NETWORK === "devnet"
    ? "EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
    : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  if (genesisHash !== expected) {
    throw new Error(`El RPC no corresponde a ${config.SOLANA_NETWORK}; operación cancelada.`);
  }
}
