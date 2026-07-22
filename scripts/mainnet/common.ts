import type { Keypair } from "@solana/web3.js";
import type { MainnetOperation } from "../../config/index.js";
import { loadConfig, type AppConfig } from "../lib/config.js";
import { assertMainnetAuthorization, buildOperationContext, dryRunRequested, type OperationContext } from "../lib/safety.js";
import { createConnection, loadExternalKeypair, verifiedGenesisHash } from "../lib/solana.js";
import { loadMainnetState } from "../lib/state.js";

export interface MainnetRuntime {
  readonly config: AppConfig;
  readonly operator: Keypair;
  readonly context: OperationContext;
  readonly dryRun: boolean;
  readonly connection: ReturnType<typeof createConnection>;
}

export async function mainnetRuntime(
  operation: MainnetOperation,
  parameters: OperationContext["parameters"],
  argv: readonly string[] = process.argv.slice(2),
): Promise<MainnetRuntime> {
  const config = loadConfig();
  const connection = createConnection(config);
  const genesisHash = await verifiedGenesisHash(connection, config);
  const operator = await loadExternalKeypair(config.SOLANA_KEYPAIR_PATH);
  const wallet = operator.publicKey.toBase58();
  assertMainnetAuthorization(config, operation, wallet);
  const state = await loadMainnetState();
  if (state.production_wallet !== null && state.production_wallet !== wallet) {
    throw new Error("La wallet firmante no coincide con production_wallet registrada en el estado Mainnet.");
  }
  return {
    config,
    operator,
    connection,
    dryRun: dryRunRequested(argv),
    context: buildOperationContext(config, genesisHash, wallet, operation, parameters),
  };
}
