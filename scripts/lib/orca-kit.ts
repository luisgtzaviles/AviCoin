import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
} from "@solana/kit";
import { createHash } from "node:crypto";

export function kitRpc(rpcUrl: string) {
  return createSolanaRpc(rpcUrl);
}

export function instructionPlanFingerprint(instructions: readonly Instruction[]): string {
  const normalized = instructions.map((instruction) => ({
    programAddress: instruction.programAddress,
    accounts: instruction.accounts?.map((account) => ({ address: account.address, role: account.role })) ?? [],
    data: instruction.data ? Buffer.from(instruction.data).toString("hex") : "",
  }));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function simulateKitInstructions(rpcUrl: string, payer: string, instructions: readonly Instruction[]): Promise<string> {
  const rpc = kitRpc(rpcUrl);
  const { value: lifetime } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(address(payer), value),
    (value) => setTransactionMessageLifetimeUsingBlockhash(lifetime, value),
    (value) => appendTransactionMessageInstructions(instructions, value),
  );
  const transaction = compileTransaction(message);
  const encoded = getBase64EncodedWireTransaction(transaction);
  const result = await rpc.simulateTransaction(encoded, { encoding: "base64", sigVerify: false }).send();
  if (result.value.err) throw new Error(`La simulación Orca falló: ${JSON.stringify(result.value.err)}`);
  return `Simulación correcta (${result.value.logs?.length ?? 0} logs)`;
}
