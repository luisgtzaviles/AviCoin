import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { loadExternalKeypair } from "../lib/solana.js";
import { buildOperationContext, confirmMutation, dryRunRequested, executeAfterDryRunRequested, executeGuarded, safeOperationSummary, assertMainnetAuthorization } from "../lib/safety.js";
import { instructionPlanFingerprint, signAndSendKitInstructions, simulateKitInstructions } from "../lib/orca-kit.js";
import { quoteEducationalBuy } from "./quote-swap.js";
import { createConnection, verifiedGenesisHash } from "../lib/solana.js";

export async function main(): Promise<void> {
  const { config, state, plan, priceImpact } = await quoteEducationalBuy();
  const operator = await loadExternalKeypair(config.SOLANA_KEYPAIR_PATH);
  assertMainnetAuthorization(config, "test-swap", operator.publicKey.toBase58());
  const genesisHash = await verifiedGenesisHash(createConnection(config), config);
  const context = buildOperationContext(config, genesisHash, operator.publicKey.toBase58(), "test-swap", {
    pool: state.pool,
    inputMint: plan.quote.tokenIn > 0n ? "USDC" : null,
    inputAmountBaseUnits: plan.quote.tokenIn.toString(),
    minimumOutputBaseUnits: plan.quote.tokenMinOut.toString(),
    testWallet: config.AVICOIN_TEST_WALLET,
    priceImpactPercent: Number(priceImpact.toFixed(8)),
    instructionPlanSha256: instructionPlanFingerprint(plan.instructions),
  });
  console.table(safeOperationSummary(context));
  const guarded = await executeGuarded({
    dryRun: dryRunRequested(),
    executeAfterDryRun: executeAfterDryRunRequested(),
    context,
    simulate: () => simulateKitInstructions(config.SOLANA_RPC_URL, operator.publicKey.toBase58(), plan.instructions),
    confirm: () => confirmMutation(config, "SWAP EDUCATIVO MÁXIMO 0.10 USDC"),
    execute: async () => {
      if (!config.AVICOIN_TEST_KEYPAIR_PATH) throw new Error("Falta AVICOIN_TEST_KEYPAIR_PATH para la ejecución real.");
      const testWallet = await loadExternalKeypair(config.AVICOIN_TEST_KEYPAIR_PATH);
      if (testWallet.publicKey.toBase58() !== config.AVICOIN_TEST_WALLET) throw new Error("El signer educativo no coincide con AVICOIN_TEST_WALLET.");
      const signature = await signAndSendKitInstructions(config.SOLANA_RPC_URL, operator.secretKey, plan.instructions, [testWallet.secretKey]);
      const confirmation = await createConnection(config).confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(`El swap fue rechazado: ${JSON.stringify(confirmation.value.err)}`);
      return signature;
    },
  });
  console.log(guarded.mode === "dry-run" ? `Dry-run PASS. Recibo: ${guarded.receipt}` : `Transacción enviada: ${guarded.result}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
