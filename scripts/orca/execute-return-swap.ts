import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { instructionPlanFingerprint, signAndSendKitInstructions, simulateKitInstructions } from "../lib/orca-kit.js";
import { assertMainnetAuthorization, buildOperationContext, confirmMutation, dryRunRequested, executeAfterDryRunRequested, executeGuarded, safeOperationSummary } from "../lib/safety.js";
import { createConnection, loadExternalKeypair, verifiedGenesisHash } from "../lib/solana.js";
import { quoteEducationalReturn } from "./quote-return-swap.js";
import { writeMainnetState } from "../lib/state.js";

export async function main(): Promise<void> {
  const { config, state, plan, priceImpact, purchased } = await quoteEducationalReturn();
  const operator = await loadExternalKeypair(config.SOLANA_KEYPAIR_PATH);
  assertMainnetAuthorization(config, "test-swap", operator.publicKey.toBase58());
  const context = buildOperationContext(config, await verifiedGenesisHash(createConnection(config), config), operator.publicKey.toBase58(), "test-swap", {
    direction: "AVI-to-USDC-return",
    pool: state.pool,
    exactPurchasedAviBaseUnits: purchased.toString(),
    inputAmountBaseUnits: plan.quote.tokenIn.toString(),
    minimumOutputBaseUnits: plan.quote.tokenMinOut.toString(),
    testWallet: config.AVICOIN_TEST_WALLET,
    priceImpactPercent: Number(priceImpact.toFixed(8)),
    instructionPlanSha256: instructionPlanFingerprint(plan.instructions),
  });
  console.table(safeOperationSummary(context));
  const guarded = await executeGuarded({
    dryRun: dryRunRequested(), context,
    executeAfterDryRun: executeAfterDryRunRequested(),
    simulate: () => simulateKitInstructions(config.SOLANA_RPC_URL, operator.publicKey.toBase58(), plan.instructions),
    confirm: () => confirmMutation(config, "VENTA DE REGRESO EXACTA"),
    execute: async () => {
      if (!config.AVICOIN_TEST_KEYPAIR_PATH) throw new Error("Falta AVICOIN_TEST_KEYPAIR_PATH.");
      const testWallet = await loadExternalKeypair(config.AVICOIN_TEST_KEYPAIR_PATH);
      if (testWallet.publicKey.toBase58() !== config.AVICOIN_TEST_WALLET) throw new Error("El signer educativo no coincide con AVICOIN_TEST_WALLET.");
      const signature = await signAndSendKitInstructions(config.SOLANA_RPC_URL, operator.secretKey, plan.instructions, [testWallet.secretKey]);
      const confirmation = await createConnection(config).confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(`La venta de regreso fue rechazada: ${JSON.stringify(confirmation.value.err)}`);
      await writeMainnetState({ ...state, swaps_tested: true });
      return signature;
    },
  });
  console.log(guarded.mode === "dry-run" ? `Dry-run PASS. Recibo: ${guarded.receipt}` : `Transacción enviada: ${guarded.result}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
