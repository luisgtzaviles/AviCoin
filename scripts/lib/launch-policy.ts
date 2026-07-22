import type { MintAuthorityPolicy } from "../../config/types.js";
import {
  MAINNET_INITIAL_LAUNCH_BASE_UNITS,
  MAINNET_PRODUCTION_WALLET,
  MAINNET_USDC_MINT,
} from "../../config/mainnet.js";
import type { MainnetLaunchState } from "./state.js";

export interface PoolLaunchEvidence {
  readonly decimals: number;
  readonly supplyBaseUnits: bigint;
  readonly mintAuthority: string | null;
  readonly freezeAuthority: string | null;
  readonly metadataMatches: boolean;
  readonly productionWallet: string;
  readonly usdcMint: string;
  readonly poolExists: boolean;
  readonly additionalIssuanceObserved: boolean;
  readonly operationAuthorized: boolean;
  readonly dryRunValid: boolean;
}

export function assertMintAuthorityPolicy(value: string): asserts value is MintAuthorityPolicy {
  if (value !== "retained_temporarily" && value !== "revoked") {
    throw new Error(`Política de mint authority desconocida: ${value}.`);
  }
}

export function assertInitialLaunchMintAllowed(
  state: MainnetLaunchState,
  requestedBaseUnits: bigint,
  currentSupplyBaseUnits: bigint,
): void {
  if (requestedBaseUnits !== MAINNET_INITIAL_LAUNCH_BASE_UNITS) {
    throw new Error("La emisión de lanzamiento debe ser exactamente 1,000 AVI.");
  }
  if (currentSupplyBaseUnits !== 0n) throw new Error("La emisión inicial requiere supply on-chain igual a cero.");
  if (state.launch_mint_operations_completed !== 0 || state.supply_minted) {
    throw new Error("La única operación mintTo de lanzamiento ya fue consumida.");
  }
  if (state.launch_mint_operations_allowed !== 1) throw new Error("La política debe autorizar exactamente una operación mintTo.");
}

export function assertPoolLaunchReady(state: MainnetLaunchState, evidence: PoolLaunchEvidence): void {
  assertMintAuthorityPolicy(state.mint_authority_policy);
  if (!state.mint_created || !state.avi_mint) throw new Error("El mint Mainnet confirmado es obligatorio.");
  if (!state.metadata_created || !state.metadata_pda || !evidence.metadataMatches) throw new Error("La metadata Mainnet debe existir y coincidir exactamente.");
  if (!state.supply_minted || state.launch_mint_operations_completed !== 1) throw new Error("La única emisión inicial debe estar confirmada.");
  if (evidence.supplyBaseUnits !== MAINNET_INITIAL_LAUNCH_BASE_UNITS) throw new Error("El supply on-chain debe ser exactamente 1,000 AVI.");
  if (evidence.decimals !== 9) throw new Error("El mint debe conservar 9 decimales.");
  if (evidence.freezeAuthority !== null) throw new Error("Freeze authority debe permanecer en none.");
  if (evidence.productionWallet !== state.production_wallet || evidence.productionWallet !== MAINNET_PRODUCTION_WALLET) {
    throw new Error("La wallet de producción no coincide con la política registrada.");
  }
  const expectedAuthority = state.mint_authority_policy === "retained_temporarily" ? MAINNET_PRODUCTION_WALLET : null;
  if (evidence.mintAuthority !== expectedAuthority) throw new Error("La mint authority on-chain no coincide con la política declarada.");
  if (evidence.usdcMint !== MAINNET_USDC_MINT) throw new Error("El pool requiere el mint oficial exacto de USDC.");
  if (evidence.poolExists || state.pool_created || state.pool) throw new Error("Ya existe un pool o el estado registra su creación.");
  if (evidence.additionalIssuanceObserved) throw new Error("Se detectó evidencia de emisión adicional no autorizada.");
  if (!evidence.operationAuthorized) throw new Error("La operación exacta create-pool no está autorizada.");
  if (!evidence.dryRunValid) throw new Error("El dry-run exacto del pool no es válido.");
}
