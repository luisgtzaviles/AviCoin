import type { Instruction } from "@solana/kit";
import type { MainnetOperation } from "../../config/index.js";
import { assertOnlyOperationArguments, safeOperationSummary, type OperationContext } from "../lib/safety.js";
import { instructionPlanFingerprint, simulateKitInstructions } from "../lib/orca-kit.js";
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
  await simulateKitInstructions(runtime.config.SOLANA_RPC_URL, runtime.operator.toBase58(), instructions);
  void afterExecute;
  console.log("Dry-run unsigned PASS. No se creó recibo ejecutable; firma y envío permanecen bloqueados.");
}
