export type SolanaNetwork = "devnet" | "mainnet-beta";
export type MintAuthorityPolicy = "retained_temporarily" | "revoked";

export interface NetworkConfig {
  readonly network: SolanaNetwork;
  readonly genesisHash: string;
  readonly rpcUrl: string;
  readonly allowMainnet: false;
  readonly token: {
    readonly name: "AVICOIN";
    readonly symbol: "AVI";
    readonly decimals: 9;
    readonly mintAddress: string | null;
    readonly metadataUri: string;
  };
  readonly operatorWallet: string | null;
  readonly programs: {
    readonly splToken: string;
    readonly tokenMetadata: string;
    readonly orcaWhirlpool: string;
    readonly orcaWhirlpoolConfig: string;
  };
  readonly usdc: { readonly mint: string | null; readonly decimals: 6 };
  readonly supplyPolicy: {
    readonly initialLaunchSupply: bigint;
    readonly initialLaunchBaseUnits: bigint;
    readonly launchMintOperationsAllowed: 1;
    readonly permanentMaxSupplyBaseUnits: bigint | null;
    readonly mintAuthorityPolicy: MintAuthorityPolicy;
  };
}

export type MainnetOperation =
  | "create-mint"
  | "create-metadata"
  | "mint-fixed-supply"
  | "revoke-mint-authority"
  | "create-pool"
  | "open-position"
  | "increase-liquidity"
  | "decrease-liquidity"
  | "test-swap"
  | "return-swap"
  | "close-position";
