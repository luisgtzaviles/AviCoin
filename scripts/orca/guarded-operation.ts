import type { Instruction } from "@solana/kit";
import type { MainnetOperation } from "../../config/index.js";
import { assertOnlyOperationArguments, confirmMutation, executeAfterDryRunRequested, executeGuarded, safeOperationSummary, type OperationContext } from "../lib/safety.js";
import { instructionPlanFingerprint, signAndSendKitInstructions, simulateKitInstructions } from "../lib/orca-kit.js";
import { mainnetRuntime } from "../mainnet/common.js";

export async function runOrcaOperation(
  operation: MainnetOperation,
  parameters: OperationContext["parameters"],
  prepare: (runtime: Awaited<ReturnType<typeof mainnetRuntime>>) => Promise<readonly Instruction[]>,
  afterExecute?: (signature: string, runtime: Awaited<ReturnType<typeof mainnetRuntime>>) => Promise<void>,
  allowedArgumentPrefixes: readonly string[] = [],
): Promise<void> {
  assertOnlyOperationArguments(process.argv.slice(2), allowedArgumentPrefixes);
  const runtime = await mainnetRuntime(operation, parameters);
  const instructions = await prepare(runtime);
  const context = { ...runtime.context, parameters: { ...runtime.context.parameters, instructionPlanSha256: instructionPlanFingerprint(instructions) } };
  console.table(safeOperationSummary(context));
  const guarded = await executeGuarded({
    dryRun: runtime.dryRun,
    executeAfterDryRun: executeAfterDryRunRequested(),
    context,
    simulate: () => simulateKitInstructions(runtime.config.SOLANA_RPC_URL, runtime.operator.publicKey.toBase58(), instructions),
    confirm: () => confirmMutation(runtime.config, operation.toUpperCase()),
    execute: async () => {
      const signature = await signAndSendKitInstructions(runtime.config.SOLANA_RPC_URL, runtime.operator.secretKey, instructions);
      const confirmation = await runtime.connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(`La transacción Orca fue rechazada: ${JSON.stringify(confirmation.value.err)}`);
      await afterExecute?.(signature, runtime);
      return signature;
    },
  });
  console.log(guarded.mode === "dry-run" ? `Dry-run PASS. Recibo: ${guarded.receipt}` : `Transacción enviada: ${guarded.result}`);
}
