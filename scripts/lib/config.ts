import "dotenv/config";
import { z } from "zod";

const httpUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
}, "Debe ser una URL HTTP(S) sin credenciales embebidas");

const schema = z.object({
  SOLANA_NETWORK: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  SOLANA_RPC_URL: httpUrl,
  SOLANA_KEYPAIR_PATH: z.string().default(""),
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

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Configuración inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
