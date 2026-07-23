import { createMetadataAccountV3, findMetadataPda, mplTokenMetadata, safeFetchMetadataFromSeeds } from "@metaplex-foundation/mpl-token-metadata";
import { createNoopSigner, isSome, none, publicKey, signerIdentity, type PublicKey as UmiPublicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAINNET_PRODUCTION_WALLET } from "../../config/index.js";

export const MAINNET_METADATA_URI = "https://avicoin.avicell.com.mx/metadata-mainnet.json";
export const MAINNET_METADATA_SHA256 = "80b7c815d346a66ac8572df04b06d1781b79c42da4631ced2cc94f0983d962f2";
export const MAINNET_LOGO_SHA256 = "7d90dee3d23218a5ab84cf5f465175e3e2ea11ed3959f9acd90100abc4406a54";

export interface MetadataSnapshot {
  readonly mint: string;
  readonly name: string;
  readonly symbol: string;
  readonly uri: string;
  readonly sellerFeeBasisPoints: number;
  readonly isMutable: boolean;
  readonly updateAuthority: string;
  readonly hasCreators: boolean;
  readonly hasCollection: boolean;
  readonly hasUses: boolean;
}

export async function validatePublishedMainnetMetadata(
  uri = MAINNET_METADATA_URI,
  fetcher: typeof fetch = fetch,
  localPath = "site/metadata-mainnet.json",
): Promise<{ readonly metadataSha256: string; readonly logoSha256: string }> {
  const response = await fetcher(uri, { redirect: "error" });
  if (!response.ok) throw new Error(`Metadata Mainnet no publicada: HTTP ${response.status}.`);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("La metadata pública debe servirse como application/json.");
  const publicBytes = new Uint8Array(await response.arrayBuffer());
  const localBytes = await readFile(localPath);
  const publicHash = createHash("sha256").update(publicBytes).digest("hex");
  const localHash = createHash("sha256").update(localBytes).digest("hex");
  if (publicHash !== localHash) throw new Error("La metadata pública no coincide byte a byte con site/metadata-mainnet.json.");
  if (publicHash !== MAINNET_METADATA_SHA256) throw new Error("El SHA-256 de metadata Mainnet no coincide con el artefacto aprobado.");
  const metadata = JSON.parse(Buffer.from(publicBytes).toString("utf8")) as Record<string, unknown>;
  if (metadata.name !== "AVICOIN" || metadata.symbol !== "AVI" || metadata.seller_fee_basis_points !== 0) throw new Error("Identidad o seller fee inválidos en metadata pública.");
  if (metadata.image !== "https://avicoin.avicell.com.mx/logo.png") throw new Error("La metadata pública no referencia el logo oficial esperado.");
  if (metadata.external_url !== "https://avicoin.avicell.com.mx/") throw new Error("external_url no coincide con el sitio oficial.");
  const attributes = Array.isArray(metadata.attributes) ? metadata.attributes as Array<Record<string, unknown>> : [];
  if (!attributes.some((item) => item.trait_type === "Network" && item.value === "Solana Mainnet-beta")) throw new Error("La metadata pública no identifica Solana Mainnet.");
  if (!attributes.some((item) => item.trait_type === "Purpose" && item.value === "Educational")) throw new Error("La metadata pública no identifica el propósito educativo.");
  const logo = await fetcher(metadata.image, { redirect: "error" });
  if (!logo.ok) throw new Error(`Logo público no disponible: HTTP ${logo.status}.`);
  if (!logo.headers.get("content-type")?.toLowerCase().startsWith("image/png")) throw new Error("El logo público debe servirse como image/png.");
  const logoBytes = new Uint8Array(await logo.arrayBuffer());
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!pngSignature.every((byte, index) => logoBytes[index] === byte)) throw new Error("El logo público no contiene una firma PNG válida.");
  const logoHash = createHash("sha256").update(logoBytes).digest("hex");
  if (logoHash !== MAINNET_LOGO_SHA256) throw new Error("El SHA-256 del logo no coincide con el artefacto aprobado.");
  if (logoBytes.length < 24 || Buffer.from(logoBytes).readUInt32BE(16) !== Buffer.from(logoBytes).readUInt32BE(20)) throw new Error("El logo público debe ser PNG cuadrado.");
  return { metadataSha256: publicHash, logoSha256: logoHash };
}

export function assertMetadataSnapshot(snapshot: MetadataSnapshot, expectedMint: string, expectedUri: string, expectedUpdateAuthority: string): void {
  if (snapshot.mint !== expectedMint) throw new Error("La metadata no corresponde al mint Mainnet esperado.");
  if (snapshot.name.trim().replace(/\0+$/u, "") !== "AVICOIN") throw new Error("Nombre de metadata inesperado.");
  if (snapshot.symbol.trim().replace(/\0+$/u, "") !== "AVI") throw new Error("Símbolo de metadata inesperado.");
  if (snapshot.uri.trim().replace(/\0+$/u, "") !== expectedUri) throw new Error("URI de metadata inesperada.");
  if (snapshot.sellerFeeBasisPoints !== 0) throw new Error("seller_fee_basis_points debe ser cero.");
  if (!snapshot.isMutable) throw new Error("La metadata Mainnet debe permanecer mutable en esta etapa.");
  if (snapshot.updateAuthority !== expectedUpdateAuthority) throw new Error("Update authority inválida.");
  if (snapshot.hasCreators || snapshot.hasCollection || snapshot.hasUses) throw new Error("Creators, collection y uses deben permanecer none.");
}

export async function assertMainnetMetadata(rpcUrl: string, mintAddress: string, expectedUri: string): Promise<string> {
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());
  const mint = publicKey(mintAddress);
  const metadata = await safeFetchMetadataFromSeeds(umi, { mint });
  if (!metadata) throw new Error("No existe metadata on-chain para el mint Mainnet.");
  assertMetadataSnapshot({
    mint: metadata.mint,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
    isMutable: metadata.isMutable,
    updateAuthority: metadata.updateAuthority,
    hasCreators: isSome(metadata.creators),
    hasCollection: isSome(metadata.collection),
    hasUses: isSome(metadata.uses),
  }, mintAddress, expectedUri, MAINNET_PRODUCTION_WALLET);
  return metadata.publicKey;
}

function metadataBuilder(umi: ReturnType<typeof createUmi>, mint: UmiPublicKey) {
  return createMetadataAccountV3(umi, {
    mint,
    mintAuthority: umi.identity,
    updateAuthority: umi.identity,
    data: { name: "AVICOIN", symbol: "AVI", uri: MAINNET_METADATA_URI, sellerFeeBasisPoints: 0, creators: none(), collection: none(), uses: none() },
    isMutable: true,
    collectionDetails: none(),
  });
}

export function createMainnetMetadataInstruction(rpcUrl: string, wallet: string, mintAddress: string): { readonly metadataPda: string; readonly instruction: TransactionInstruction } {
  const identity = createNoopSigner(publicKey(wallet));
  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(signerIdentity(identity));
  const instructions = metadataBuilder(umi, publicKey(mintAddress)).getInstructions();
  if (instructions.length !== 1 || !instructions[0]) throw new Error("El SDK debe producir exactamente una instrucción createMetadataAccountV3.");
  const source = instructions[0];
  const instruction = new TransactionInstruction({
    programId: new PublicKey(source.programId),
    keys: source.keys.map((key) => ({ pubkey: new PublicKey(key.pubkey), isSigner: key.isSigner, isWritable: key.isWritable })),
    data: Buffer.from(source.data),
  });
  return { metadataPda: metadataPda(rpcUrl, mintAddress), instruction };
}

export function metadataPda(rpcUrl: string, mintAddress: string): string {
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());
  return findMetadataPda(umi, { mint: publicKey(mintAddress) })[0];
}

export async function simulateMetadataCreation(rpcUrl: string, wallet: string, mintAddress: string): Promise<string> {
  const identity = createNoopSigner(publicKey(wallet));
  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(signerIdentity(identity));
  const transaction = await metadataBuilder(umi, publicKey(mintAddress)).buildAndSign(umi);
  const result = await umi.rpc.simulateTransaction(transaction, { verifySignatures: false });
  if (result.err) throw new Error(`La simulación de metadata falló: ${JSON.stringify(result.err)}`);
  return `Simulación correcta (${result.logs?.length ?? 0} logs)`;
}
