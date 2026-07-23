import {
  AuthorityType,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToCheckedInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  type Mint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { MAINNET_INITIAL_LAUNCH_BASE_UNITS } from "../../config/mainnet.js";

export interface MintSnapshot {
  readonly decimals: number;
  readonly supply: bigint;
  readonly mintAuthority: string | null;
  readonly freezeAuthority: string | null;
}

export function mintSnapshot(mint: Mint): MintSnapshot {
  return {
    decimals: mint.decimals,
    supply: mint.supply,
    mintAuthority: mint.mintAuthority?.toBase58() ?? null,
    freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
  };
}

export function assertMintSnapshot(
  snapshot: MintSnapshot,
  expected: { readonly authority: string | null; readonly supply: bigint },
): void {
  if (snapshot.decimals !== 9) throw new Error("El mint debe tener exactamente 9 decimales.");
  if (snapshot.supply !== expected.supply) throw new Error(`Supply inesperado: ${snapshot.supply.toString()} base units.`);
  if (snapshot.mintAuthority !== expected.authority) throw new Error("La mint authority no coincide con la wallet esperada.");
  if (snapshot.freezeAuthority !== null) throw new Error("Freeze authority debe permanecer en null.");
}

export async function fetchAndAssertMint(
  connection: Connection,
  mintAddress: PublicKey,
  expected: { readonly authority: string | null; readonly supply: bigint },
): Promise<Mint> {
  const mint = await getMint(connection, mintAddress, "confirmed", TOKEN_PROGRAM_ID);
  assertMintSnapshot(mintSnapshot(mint), expected);
  return mint;
}

export async function createMintPlan(
  connection: Connection,
  operator: PublicKey,
  mint: PublicKey,
): Promise<readonly TransactionInstruction[]> {
  const rent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  return [
    SystemProgram.createAccount({ fromPubkey: operator, newAccountPubkey: mint, lamports: rent, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
    createInitializeMint2Instruction(mint, 9, operator, null, TOKEN_PROGRAM_ID),
  ];
}

export async function fixedSupplyPlan(
  connection: Connection,
  operator: PublicKey,
  mint: PublicKey,
): Promise<{ readonly ata: PublicKey; readonly instructions: readonly TransactionInstruction[] }> {
  await fetchAndAssertMint(connection, mint, { authority: operator.toBase58(), supply: 0n });
  const ata = getAssociatedTokenAddressSync(mint, operator, false, TOKEN_PROGRAM_ID);
  return {
    ata,
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(operator, ata, operator, mint, TOKEN_PROGRAM_ID),
      createMintToCheckedInstruction(mint, ata, operator, MAINNET_INITIAL_LAUNCH_BASE_UNITS, 9, [], TOKEN_PROGRAM_ID),
    ],
  };
}

export async function createAtaPlan(
  connection: Connection,
  operator: PublicKey,
  mint: PublicKey,
): Promise<{ readonly ata: PublicKey; readonly instruction: TransactionInstruction }> {
  await fetchAndAssertMint(connection, mint, { authority: operator.toBase58(), supply: 0n });
  const ata = getAssociatedTokenAddressSync(mint, operator, false, TOKEN_PROGRAM_ID);
  return {
    ata,
    instruction: createAssociatedTokenAccountIdempotentInstruction(operator, ata, operator, mint, TOKEN_PROGRAM_ID),
  };
}

export async function revokeMintAuthorityPlan(
  connection: Connection,
  operator: PublicKey,
  mint: PublicKey,
): Promise<readonly TransactionInstruction[]> {
  const current = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
  if (current.mintAuthority === null) throw new Error("La mint authority ya es none; no se requiere ninguna acción.");
  assertMintSnapshot(mintSnapshot(current), { authority: operator.toBase58(), supply: MAINNET_INITIAL_LAUNCH_BASE_UNITS });
  return [createSetAuthorityInstruction(mint, operator, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)];
}

async function versionedTransaction(
  connection: Connection,
  payer: PublicKey,
  instructions: readonly TransactionInstruction[],
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: [...instructions] }).compileToV0Message();
  return new VersionedTransaction(message);
}

export async function simulateUnsigned(
  connection: Connection,
  payer: PublicKey,
  instructions: readonly TransactionInstruction[],
): Promise<readonly string[]> {
  const transaction = await versionedTransaction(connection, payer, instructions);
  const result = await connection.simulateTransaction(transaction, { sigVerify: false });
  if (result.value.err) throw new Error(`La simulación falló: ${JSON.stringify(result.value.err)}`);
  return result.value.logs ?? [];
}
