import { PublicKey } from "@solana/web3.js";
import type { MainnetOperation } from "../../config/index.js";
import { loadConfig, type AppConfig } from "../lib/config.js";
import { assertUnsignedMainnetDryRun, buildOperationContext, dryRunRequested, type OperationContext } from "../lib/safety.js";
import { createConnection, verifiedGenesisHash } from "../lib/solana.js";
import { loadMainnetState } from "../lib/state.js";

export interface MainnetRuntime {
  readonly config: AppConfig;
  readonly operator: PublicKey;
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
  if (!dryRunRequested(argv)) throw new Error("Firma y envío bloqueados; sólo está disponible --dry-run unsigned.");
  assertUnsignedMainnetDryRun(config);
  const connection = createConnection(config);
  const genesisHash = await verifiedGenesisHash(connection, config);
  const operator = new PublicKey(config.AVICOIN_PRODUCTION_WALLET);
  const wallet = operator.toBase58();
  const state = await loadMainnetState();
  if (state.production_wallet !== null && state.production_wallet !== wallet) {
    throw new Error("La wallet firmante no coincide con production_wallet registrada en el estado Mainnet.");
  }
  return {
    config,
    operator,
    connection,
    dryRun: true,
    context: buildOperationContext(config, genesisHash, wallet, operation, parameters),
  };
}
