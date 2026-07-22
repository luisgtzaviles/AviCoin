import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { MAINNET_CONFIG, MAINNET_PRODUCTION_WALLET, MAINNET_USDC_MINT } from "../../config/index.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { loadConfig } from "../lib/config.js";
import { estimateMainnetLaunchCosts } from "../lib/mainnet-costs.js";
import { validatePublishedMainnetMetadata } from "../lib/mainnet-metadata.js";
import { buildMainnetUnsignedPlan } from "../lib/mainnet-plan.js";
import { assertUnsignedMainnetDryRun } from "../lib/safety.js";

export async function main(): Promise<void> {
  if (process.argv.slice(2).some((argument) => argument !== "--dry-run")) throw new Error("Sólo se admite --dry-run.");
  const config = loadConfig({ SOLANA_NETWORK: "mainnet-beta", SOLANA_RPC_URL: MAINNET_CONFIG.rpcUrl, ALLOW_MAINNET: "false" });
  assertUnsignedMainnetDryRun(config);
  const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== MAINNET_CONFIG.genesisHash) throw new Error("Genesis Mainnet inesperado; plan detenido.");
  await validatePublishedMainnetMetadata();
  const wallet = new PublicKey(MAINNET_PRODUCTION_WALLET);
  const solLamports = BigInt(await connection.getBalance(wallet, "confirmed"));
  const usdcAta = getAssociatedTokenAddressSync(new PublicKey(MAINNET_USDC_MINT), wallet, false, TOKEN_PROGRAM_ID);
  const usdcBalance = await connection.getTokenAccountBalance(usdcAta, "confirmed").catch(() => ({ value: { amount: "0" } }));
  const costs = await estimateMainnetLaunchCosts(async (size) => BigInt(await connection.getMinimumBalanceForRentExemption(size, "confirmed")), solLamports);
  const plan = buildMainnetUnsignedPlan({ genesisHash, rpcUrl: config.SOLANA_RPC_URL, solLamports, usdcBaseUnits: BigInt(usdcBalance.value.amount), costs });
  console.log(JSON.stringify(plan, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  console.error("Dry-run unsigned completado. No se creó recibo de autorización; firma y envío permanecen deshabilitados.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
