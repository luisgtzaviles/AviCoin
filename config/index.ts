import { DEVNET_CONFIG } from "./devnet.js";
import { MAINNET_CONFIG } from "./mainnet.js";
import type { NetworkConfig, SolanaNetwork } from "./types.js";

export function networkConfig(network: SolanaNetwork): NetworkConfig {
  return network === "devnet" ? DEVNET_CONFIG : MAINNET_CONFIG;
}

export { DEVNET_CONFIG, MAINNET_CONFIG };
export * from "./mainnet.js";
export type * from "./types.js";
