import { address, createNoopSigner } from "@solana/kit";
import { createConcentratedLiquidityPoolInstructions, fetchWhirlpoolsByTokenPair, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { MAINNET_USDC_MINT } from "../../config/mainnet.js";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { ORCA_TICK_SPACING, poolDesign } from "../lib/orca.js";
import { assertPoolLaunchReady } from "../lib/launch-policy.js";
import { createConnection } from "../lib/solana.js";
import { loadConfig } from "../lib/config.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { assertMainnetMetadata } from "../lib/mainnet-metadata.js";
import { kitRpc } from "../lib/orca-kit.js";
import { loadMainnetState, writeMainnetState } from "../lib/state.js";
import { runOrcaOperation } from "./guarded-operation.js";

export async function main(): Promise<void> {
  const state = await loadMainnetState();
  if (!state.avi_mint) throw new Error("El pool requiere un mint Mainnet confirmado.");
  if (state.pool_created || state.pool) throw new Error("El estado ya registra un pool; no se creará otro.");
  const config = loadConfig();
  const mintSnapshot = await getMint(createConnection(config), new PublicKey(state.avi_mint), "confirmed", TOKEN_PROGRAM_ID);
  const metadataPda = await assertMainnetMetadata(config.SOLANA_RPC_URL, state.avi_mint, config.TOKEN_METADATA_URI);
  const design = poolDesign(state.avi_mint);
  let plannedPool: string | null = null;
  await runOrcaOperation("create-pool", { aviMint: state.avi_mint, usdcMint: MAINNET_USDC_MINT, initialPrice: design.initialPriceBPerA, tickSpacing: ORCA_TICK_SPACING }, async (runtime) => {
    const rpc = kitRpc(runtime.config.SOLANA_RPC_URL);
    const pools = await fetchWhirlpoolsByTokenPair(rpc, address(state.avi_mint as string), address(MAINNET_USDC_MINT), WhirlpoolDeployment.mainnet);
    const poolExists = pools.some((pool) => pool.initialized && pool.tickSpacing === ORCA_TICK_SPACING);
    assertPoolLaunchReady(state, {
      decimals: mintSnapshot.decimals,
      supplyBaseUnits: mintSnapshot.supply,
      mintAuthority: mintSnapshot.mintAuthority?.toBase58() ?? null,
      freezeAuthority: mintSnapshot.freezeAuthority?.toBase58() ?? null,
      metadataMatches: metadataPda === state.metadata_pda,
      productionWallet: runtime.operator.toBase58(),
      usdcMint: MAINNET_USDC_MINT,
      poolExists,
      additionalIssuanceObserved: mintSnapshot.supply > BigInt(state.initial_launch_base_units),
      operationAuthorized: runtime.context.operation === "create-pool",
      dryRunValid: runtime.dryRun,
    });
    const plan = await createConcentratedLiquidityPoolInstructions(rpc, address(design.mintA), address(design.mintB), ORCA_TICK_SPACING, {
      initialPrice: design.initialPriceBPerA,
      funder: createNoopSigner(address(runtime.operator.toBase58())),
      whirlpoolDeployment: WhirlpoolDeployment.mainnet,
    });
    plannedPool = plan.poolAddress;
    console.table({ pool_derivado: plan.poolAddress, renta_lamports: plan.initializationCost.toString(), transacciones: 1 });
    return plan.instructions;
  }, async () => {
    if (!plannedPool) throw new Error("No se conservó la dirección derivada del pool.");
    await writeMainnetState({ ...state, pool: plannedPool, pool_created: true });
  });
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
