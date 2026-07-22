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
  operatorWallet: "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq",
  programs: {
    splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    tokenMetadata: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    orcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    orcaWhirlpoolConfig: "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ",
  },
  usdc: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  supplyPolicy: {
    initialLaunchSupply: 1_000n,
    initialLaunchBaseUnits: 1_000_000_000_000n,
    launchMintOperationsAllowed: 1,
    permanentMaxSupplyBaseUnits: null,
    mintAuthorityPolicy: "retained_temporarily",
  },
} as const satisfies NetworkConfig;

export const MAINNET_PRODUCTION_WALLET = "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq";
export const MAINNET_INITIAL_LAUNCH_SUPPLY_AVI = 1_000n;
export const MAINNET_INITIAL_LAUNCH_BASE_UNITS = 1_000_000_000_000n;
export const MAINNET_LAUNCH_MINT_OPERATIONS_ALLOWED = 1;
export const MAINNET_PERMANENT_MAX_SUPPLY_BASE_UNITS = null;
export const MAINNET_MINT_AUTHORITY_POLICY = "retained_temporarily" as const;
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const MAINNET_USDC_DECIMALS = 6;
