import type { NetworkConfig } from "./types.js";

export const MAINNET_CONFIG = {
  network: "mainnet-beta",
  genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  rpcUrl: "https://api.mainnet-beta.solana.com",
  allowMainnet: false,
  token: {
    name: "AVICOIN",
    symbol: "AVI",
    decimals: 9,
    mintAddress: null,
    metadataUri: "https://avicoin.avicell.com.mx/metadata-mainnet.json",
  },
  operatorWallet: null,
  programs: {
    splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    tokenMetadata: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    orcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    orcaWhirlpoolConfig: "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ",
  },
  usdc: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  maximumSupplyBaseUnits: 1_000_000_000_000n,
} as const satisfies NetworkConfig;

export const MAINNET_FIXED_SUPPLY_AVI = 1_000n;
export const MAINNET_FIXED_SUPPLY_BASE_UNITS = 1_000_000_000_000n;
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const MAINNET_USDC_DECIMALS = 6;
