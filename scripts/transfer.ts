import { createAssociatedTokenAccountIdempotent, getAssociatedTokenAddress, getAccount, getMint, transferChecked } from "@solana/spl-token";
import { loadConfig } from "./lib/config.js";
import { isDirectExecution, reportFailure } from "./lib/entrypoint.js";
import { baseUnitsToHuman, confirmMutation, humanToBaseUnits } from "./lib/safety.js";
import { assertRpcCluster, createConnection, explorerUrl, loadExternalKeypair, parsePublicKey } from "./lib/solana.js";

export async function main(): Promise<void> {
  const config = loadConfig();
  const mintAddress = parsePublicKey(process.argv[2] ?? config.TOKEN_MINT_ADDRESS, "mint address");
  const destinationOwner = parsePublicKey(process.argv[3] ?? "", "wallet destino");
  const amountText = process.argv[4] ?? "";
  const connection = createConnection(config);
  await assertRpcCluster(connection, config);
  const owner = await loadExternalKeypair(config.SOLANA_KEYPAIR_PATH);
  const mint = await getMint(connection, mintAddress);
  const amount = humanToBaseUnits(amountText, mint.decimals);
  const sourceAta = await getAssociatedTokenAddress(mintAddress, owner.publicKey);
  const source = await getAccount(connection, sourceAta);
  if (!source.owner.equals(owner.publicKey) || !source.mint.equals(mintAddress)) throw new Error("La cuenta origen no pertenece a la wallet o al mint indicado.");
  if (source.amount < amount) throw new Error(`Balance insuficiente: ${baseUnitsToHuman(source.amount, mint.decimals)} disponible.`);
  console.table({ red: config.SOLANA_NETWORK, mint: mintAddress.toBase58(), origen: sourceAta.toBase58(), propietario_origen: owner.publicKey.toBase58(), destino: destinationOwner.toBase58(), cantidad: baseUnitsToHuman(amount, mint.decimals) });
  await confirmMutation(config, "TRANSFERIR TOKENS");
  const destinationAta = await createAssociatedTokenAccountIdempotent(connection, owner, mintAddress, destinationOwner);
  const signature = await transferChecked(connection, owner, sourceAta, mintAddress, destinationAta, owner, amount, mint.decimals);
  const [sourceAfter, destinationAfter] = await Promise.all([getAccount(connection, sourceAta), getAccount(connection, destinationAta)]);
  console.log(`ATA destino: ${destinationAta.toBase58()}\nBalance origen: ${baseUnitsToHuman(sourceAfter.amount, mint.decimals)}\nBalance destino: ${baseUnitsToHuman(destinationAfter.amount, mint.decimals)}\nTransacción: ${signature}\n${explorerUrl(signature, config, "tx")}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
