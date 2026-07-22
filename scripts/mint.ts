import { AuthorityType, createAssociatedTokenAccountIdempotent, getMint, getAccount, mintToChecked } from "@solana/spl-token";
import { loadConfig } from "./lib/config.js";
import { isDirectExecution, reportFailure } from "./lib/entrypoint.js";
import { assertU64, baseUnitsToHuman, confirmMutation, humanToBaseUnits } from "./lib/safety.js";
import { assertRpcCluster, createConnection, explorerUrl, loadExternalKeypair, parsePublicKey } from "./lib/solana.js";

export async function main(): Promise<void> {
  const config = loadConfig();
  const mintAddress = parsePublicKey(process.argv[2] ?? config.TOKEN_MINT_ADDRESS, "mint address");
  const destinationOwner = parsePublicKey(process.argv[3] ?? "", "wallet destino");
  const amountText = process.argv[4] ?? "";
  const connection = createConnection(config);
  await assertRpcCluster(connection, config);
  const authority = await loadExternalKeypair(config.SOLANA_KEYPAIR_PATH);
  const mint = await getMint(connection, mintAddress);
  if (!mint.mintAuthority?.equals(authority.publicKey)) throw new Error("La wallet configurada no es la mint authority actual.");
  const amount = humanToBaseUnits(amountText, mint.decimals);
  const resultingSupply = mint.supply + amount;
  assertU64(resultingSupply, "El supply resultante");
  console.table({ red: config.SOLANA_NETWORK, mint: mintAddress.toBase58(), destino: destinationOwner.toBase58(), cantidad: baseUnitsToHuman(amount, mint.decimals), supply_actual: baseUnitsToHuman(mint.supply, mint.decimals), supply_resultante: baseUnitsToHuman(resultingSupply, mint.decimals), decimales: mint.decimals, autoridad: authority.publicKey.toBase58(), verificación: AuthorityType.MintTokens });
  await confirmMutation(config, "EMITIR TOKENS");
  const destinationAta = await createAssociatedTokenAccountIdempotent(connection, authority, mintAddress, destinationOwner);
  const signature = await mintToChecked(connection, authority, mintAddress, destinationAta, authority, amount, mint.decimals);
  const account = await getAccount(connection, destinationAta);
  console.log(`ATA destino: ${destinationAta.toBase58()}\nBalance: ${baseUnitsToHuman(account.amount, mint.decimals)}\nTransacción: ${signature}\n${explorerUrl(signature, config, "tx")}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
