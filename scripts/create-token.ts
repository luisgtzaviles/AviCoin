import { createMint, getMinimumBalanceForRentExemptMint } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, type PublicKey } from "@solana/web3.js";
import { loadConfig } from "./lib/config.js";
import { isDirectExecution, reportFailure } from "./lib/entrypoint.js";
import { assertLegacyDevnetOnly, confirmMutation } from "./lib/safety.js";
import { assertRpcCluster, createConnection, explorerUrl, loadExternalKeypair, parsePublicKey } from "./lib/solana.js";

function resolveFreezeAuthority(argument: string | undefined, payer: PublicKey): PublicKey | null {
  if (!argument || argument === "none") return null;
  if (argument === "payer") return payer;
  return parsePublicKey(argument, "freeze authority");
}

export async function main(): Promise<void> {
  const config = loadConfig();
  assertLegacyDevnetOnly(config);
  const connection = createConnection(config);
  await assertRpcCluster(connection, config);
  const payer = await loadExternalKeypair(config.SOLANA_KEYPAIR_PATH);
  const balance = await connection.getBalance(payer.publicKey);
  const rent = await getMinimumBalanceForRentExemptMint(connection);
  const freezeArgument = process.argv.find((value) => value.startsWith("--freeze-authority="));
  const freezeOption = freezeArgument?.slice("--freeze-authority=".length);
  if (freezeArgument !== undefined && freezeOption === "") throw new Error("--freeze-authority requiere none, payer o una dirección pública.");
  const freezeAuthority = resolveFreezeAuthority(freezeOption, payer.publicKey);
  console.table({ red: config.SOLANA_NETWORK, RPC: config.SOLANA_RPC_URL, pagador: payer.publicKey.toBase58(), balance_SOL: balance / LAMPORTS_PER_SOL, decimales: config.TOKEN_DECIMALS, mint_authority: payer.publicKey.toBase58(), freeze_authority: freezeAuthority?.toBase58() ?? "ninguna" });
  if (balance <= rent) throw new Error(`Fondos insuficientes. Se requiere más de ${rent / LAMPORTS_PER_SOL} SOL para renta y comisión.`);
  await confirmMutation(config, "CREAR MINT");
  const mint = await createMint(connection, payer, payer.publicKey, freezeAuthority, config.TOKEN_DECIMALS);
  console.log(`Mint creada: ${mint.toBase58()}\n${explorerUrl(mint.toBase58(), config, "address")}\nNo se emitieron tokens.`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
