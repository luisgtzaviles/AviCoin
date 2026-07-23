import "dotenv/config";
import { z } from "zod";
import { networkConfig, type MainnetOperation, type NetworkConfig } from "../../config/index.js";

const httpUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
}, "Debe ser una URL HTTP(S) sin credenciales embebidas");

const operation = z.enum([
  "create-mint", "create-metadata", "create-ata", "mint-fixed-supply", "revoke-mint-authority",
  "create-pool", "open-position", "increase-liquidity", "decrease-liquidity",
  "test-swap", "return-swap", "close-position",
]);

const schema = z.object({
  SOLANA_NETWORK: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  SOLANA_RPC_URL: httpUrl.optional(),
  SOLANA_KEYPAIR_PATH: z.string().default(""),
  AVICOIN_PRODUCTION_WALLET: z.string().trim().default(""),
  AVICOIN_TEST_WALLET: z.string().trim().default(""),
  AVICOIN_MAINNET_OPERATION: operation.optional(),
  ALLOW_MAINNET: z.stringbool().default(false),
  TOKEN_NAME: z.string().trim().min(1).max(32).default("AVICOIN"),
  TOKEN_SYMBOL: z.string().trim().min(1).max(10).default("AVI"),
  TOKEN_DECIMALS: z.coerce.number().int().min(0).max(9).default(9),
  TOKEN_SUPPLY: z.string().regex(/^\d+(?:\.\d+)?$/).default("100000000"),
  TOKEN_MINT_ADDRESS: z.string().trim().default(""),
  TOKEN_METADATA_URI: z.string().trim().default(""),
}).refine(
  (config) => !config.ALLOW_MAINNET || config.SOLANA_NETWORK === "mainnet-beta",
  { message: "ALLOW_MAINNET=true solo es válido con SOLANA_NETWORK=mainnet-beta", path: ["ALLOW_MAINNET"] },
);

type ParsedConfig = z.infer<typeof schema>;

export interface AppConfig extends ParsedConfig {
  readonly SOLANA_RPC_URL: string;
  readonly NETWORK_CONFIG: NetworkConfig;
  readonly MAINNET_OPERATION: MainnetOperation | undefined;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Configuración inválida:\n${z.prettifyError(result.error)}`);
  }
  const staticConfig = networkConfig(result.data.SOLANA_NETWORK);
  const isMainnet = result.data.SOLANA_NETWORK === "mainnet-beta";
  return {
    ...result.data,
    SOLANA_RPC_URL: result.data.SOLANA_RPC_URL ?? staticConfig.rpcUrl,
    TOKEN_NAME: isMainnet ? staticConfig.token.name : result.data.TOKEN_NAME,
    TOKEN_SYMBOL: isMainnet ? staticConfig.token.symbol : result.data.TOKEN_SYMBOL,
    TOKEN_DECIMALS: isMainnet ? staticConfig.token.decimals : result.data.TOKEN_DECIMALS,
    AVICOIN_PRODUCTION_WALLET: isMainnet ? (staticConfig.operatorWallet ?? "") : result.data.AVICOIN_PRODUCTION_WALLET,
    TOKEN_SUPPLY: isMainnet ? staticConfig.supplyPolicy.initialLaunchSupply.toString() : result.data.TOKEN_SUPPLY,
    TOKEN_MINT_ADDRESS: isMainnet ? (staticConfig.token.mintAddress ?? "") : result.data.TOKEN_MINT_ADDRESS,
    TOKEN_METADATA_URI: isMainnet ? staticConfig.token.metadataUri : result.data.TOKEN_METADATA_URI,
    NETWORK_CONFIG: staticConfig,
    MAINNET_OPERATION: result.data.AVICOIN_MAINNET_OPERATION,
  };
}
