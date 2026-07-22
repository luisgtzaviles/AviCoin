import { address, createNoopSigner } from "@solana/kit";
import { decreaseLiquidityInstructions, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState } from "../lib/state.js";
import { runOrcaOperation } from "./guarded-operation.js";

export async function main(): Promise<void> {
  const state = await loadMainnetState();
  if (!state.position_opened || !state.position || !state.liquidity_added) throw new Error("No hay una posición con liquidez confirmada.");
  const liquidityArgument = process.argv.find((value) => value.startsWith("--liquidity="))?.slice("--liquidity=".length);
  if (!liquidityArgument || !/^\d+$/.test(liquidityArgument) || BigInt(liquidityArgument) <= 0n) throw new Error("--liquidity requiere una cantidad entera positiva obtenida de una cotización actual.");
  await runOrcaOperation("decrease-liquidity", { position: state.position, liquidity: liquidityArgument }, async (runtime) => {
    const plan = await decreaseLiquidityInstructions(kitRpc(runtime.config.SOLANA_RPC_URL), address(state.position as string), { liquidity: BigInt(liquidityArgument) }, {
      slippageToleranceBps: 100,
      authority: createNoopSigner(address(runtime.operator.publicKey.toBase58())),
      whirlpoolDeployment: WhirlpoolDeployment.mainnet,
    });
    console.table({ token_est_A: plan.quote.tokenEstA.toString(), token_est_B: plan.quote.tokenEstB.toString(), token_min_A: plan.quote.tokenMinA.toString(), token_min_B: plan.quote.tokenMinB.toString() });
    return plan.instructions;
  }, undefined, ["--liquidity="]);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
