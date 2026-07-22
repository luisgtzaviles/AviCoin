import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { AppConfig } from "./config.js";

export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const TESTNET_GENESIS_HASH = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
export const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export type SolanaCluster = AppConfig["SOLANA_NETWORK"] | "testnet";

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

export function identifyCluster(genesisHash: string): SolanaCluster {
  switch (genesisHash) {
    case DEVNET_GENESIS_HASH:
      return "devnet";
    case TESTNET_GENESIS_HASH:
      return "testnet";
    case MAINNET_GENESIS_HASH:
      return "mainnet-beta";
    default:
      throw new Error(`Genesis hash desconocido: ${genesisHash}; operación cancelada.`);
  }
}

export function assertClusterMatchesConfig(genesisHash: string, config: AppConfig): SolanaCluster {
  const actualCluster = identifyCluster(genesisHash);
  if (config.ALLOW_MAINNET && actualCluster !== "mainnet-beta") {
    throw new Error("ALLOW_MAINNET=true requiere que el RPC real corresponda a mainnet-beta.");
  }
  if (actualCluster !== config.SOLANA_NETWORK) {
    throw new Error(`La red declarada es ${config.SOLANA_NETWORK}, pero el RPC corresponde a ${actualCluster}; operación cancelada.`);
  }
  return actualCluster;
}

export async function assertRpcCluster(connection: Connection, config: AppConfig): Promise<void> {
  const genesisHash = await connection.getGenesisHash();
  assertClusterMatchesConfig(genesisHash, config);
  if (genesisHash !== config.NETWORK_CONFIG.genesisHash) {
    throw new Error("El genesis hash no coincide exactamente con la configuración estática seleccionada.");
  }
}

export async function verifiedGenesisHash(connection: Connection, config: AppConfig): Promise<string> {
  const genesisHash = await connection.getGenesisHash();
  assertClusterMatchesConfig(genesisHash, config);
  if (genesisHash !== config.NETWORK_CONFIG.genesisHash) throw new Error("Genesis hash distinto del esperado para la red configurada.");
  return genesisHash;
}
