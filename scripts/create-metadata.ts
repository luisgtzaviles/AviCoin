import { createMetadataAccountV3, mplTokenMetadata, safeFetchMetadataFromSeeds } from "@metaplex-foundation/mpl-token-metadata";
import { base58, keypairIdentity, none, publicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { getMint } from "@solana/spl-token";
import { loadConfig } from "./lib/config.js";
import { isDirectExecution, reportFailure } from "./lib/entrypoint.js";
import { assertLegacyDevnetOnly, confirmMutation } from "./lib/safety.js";
import { assertRpcCluster, createConnection, explorerUrl, loadExternalKeypair, parsePublicKey } from "./lib/solana.js";

function validateMetadataUri(value: string): string {
  if (Buffer.byteLength(value, "utf8") > 200) throw new Error("La URI de metadata excede 200 bytes.");
  let uri: URL;
  try { uri = new URL(value); } catch { throw new Error("La URI de metadata no es válida."); }
  if (!["https:", "ipfs:", "ar:"].includes(uri.protocol) || uri.username || uri.password) {
    throw new Error("La URI de metadata debe usar HTTPS, IPFS o Arweave y no incluir credenciales.");
  }
  return value;
}

export async function main(): Promise<void> {
  const config = loadConfig();
  assertLegacyDevnetOnly(config);
  const mintWeb3 = parsePublicKey(process.argv[2] ?? config.TOKEN_MINT_ADDRESS, "mint address");
  const uriValue = process.argv[3] ?? config.TOKEN_METADATA_URI;
  if (!uriValue) throw new Error("Falta TOKEN_METADATA_URI o el segundo argumento.");
  const uri = validateMetadataUri(uriValue);
  const connection = createConnection(config);
  await assertRpcCluster(connection, config);
  const wallet = await loadExternalKeypair(config.SOLANA_KEYPAIR_PATH);
  const mintAccount = await getMint(connection, mintWeb3);
  if (!mintAccount.mintAuthority?.equals(wallet.publicKey)) {
    throw new Error("La wallet configurada no es la mint authority actual.");
  }
  const umi = createUmi(config.SOLANA_RPC_URL).use(mplTokenMetadata()).use(keypairIdentity({
    publicKey: publicKey(wallet.publicKey.toBase58()),
    secretKey: wallet.secretKey,
  }));
  const mint = publicKey(mintWeb3.toBase58());
  const existing = await safeFetchMetadataFromSeeds(umi, { mint });
  if (existing) throw new Error(`La metadata ya existe: ${existing.publicKey}`);
  console.table({ red: config.SOLANA_NETWORK, mint, nombre: config.TOKEN_NAME, símbolo: config.TOKEN_SYMBOL, URI: uri, update_authority: umi.identity.publicKey, mutable: true });
  await confirmMutation(config, "CREAR METADATA");
  const result = await createMetadataAccountV3(umi, {
    mint,
    mintAuthority: umi.identity,
    updateAuthority: umi.identity,
    data: { name: config.TOKEN_NAME, symbol: config.TOKEN_SYMBOL, uri, sellerFeeBasisPoints: 0, creators: none(), collection: none(), uses: none() },
    isMutable: true,
    collectionDetails: none(),
  }).sendAndConfirm(umi);
  const signature = base58.deserialize(result.signature)[0];
  console.log(`Metadata creada.\nTransacción: ${signature}\n${explorerUrl(signature, config, "tx")}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
