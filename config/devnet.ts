import type { NetworkConfig } from "./types.js";

export const DEVNET_CONFIG = {
  network: "devnet",
  genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  rpcUrl: "https://api.devnet.solana.com",
  allowMainnet: false,
  token: {
    name: "AVICOIN",
    symbol: "AVI",
    decimals: 9,
    mintAddress: "8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK",
    metadataUri: "https://avicoin.avicell.com.mx/metadata.json",
  },
  operatorWallet: "BFGzEAviMQ7FBwLC59sjx7dkgXJXLUAjEKLxoxEa28YU",
  programs: {
    splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    tokenMetadata: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    orcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    orcaWhirlpoolConfig: "FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR",
  },
  usdc: { mint: null, decimals: 6 },
  supplyPolicy: {
    initialLaunchSupply: 100_000_000n,
    initialLaunchBaseUnits: 100_000_000_000_000_000n,
    launchMintOperationsAllowed: 1,
    permanentMaxSupplyBaseUnits: null,
    mintAuthorityPolicy: "retained_temporarily",
  },
} as const satisfies NetworkConfig;
