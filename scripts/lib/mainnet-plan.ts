import { createHash } from "node:crypto";
import {
  MAINNET_CONFIG,
  MAINNET_INITIAL_LAUNCH_BASE_UNITS,
  MAINNET_PRODUCTION_WALLET,
  MAINNET_USDC_MINT,
} from "../../config/index.js";
import type { MainnetCostEstimate } from "./mainnet-costs.js";
import { assertNoSecretMaterial } from "./phantom.js";

export interface UnsignedOperationPlan {
  readonly order: number;
  readonly operation: string;
  readonly kind: "transaction" | "read-only";
  readonly instructions: readonly string[];
  readonly programs: readonly string[];
  readonly writableAccounts: readonly string[];
  readonly requiredSigners: readonly string[];
  readonly dependsOn: readonly string[];
  readonly stopConditions: readonly string[];
  readonly planSha256: string;
}

export interface MainnetUnsignedPlan {
  readonly schemaVersion: 1;
  readonly unsignedOnly: true;
  readonly phantomSigningAdapter: "pending";
  readonly authorizationReceipt: null;
  readonly network: "mainnet-beta";
  readonly genesisHash: string;
  readonly rpcUrl: string;
  readonly productionWallet: string;
  readonly observedBalances: { readonly solLamports: string; readonly officialUsdcBaseUnits: string };
  readonly costs: MainnetCostEstimate;
  readonly operations: readonly UnsignedOperationPlan[];
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
}

function operationPlan(plan: Omit<UnsignedOperationPlan, "planSha256">): UnsignedOperationPlan {
  return { ...plan, planSha256: createHash("sha256").update(stable(plan)).digest("hex") };
}

export function buildMainnetUnsignedPlan(input: {
  readonly genesisHash: string;
  readonly rpcUrl: string;
  readonly solLamports: bigint;
  readonly usdcBaseUnits: bigint;
  readonly costs: MainnetCostEstimate;
}): MainnetUnsignedPlan {
  if (input.genesisHash !== MAINNET_CONFIG.genesisHash) throw new Error("El genesis hash leído no corresponde a Mainnet.");
  const spl = MAINNET_CONFIG.programs.splToken;
  const metadata = MAINNET_CONFIG.programs.tokenMetadata;
  const whirlpool = MAINNET_CONFIG.programs.orcaWhirlpool;
  const wallet = MAINNET_PRODUCTION_WALLET;
  const mint = "session_ephemeral_mint_public_key";
  const plans = [
    operationPlan({ order: 1, operation: "create-mint", kind: "transaction", instructions: ["system:createAccount(82 bytes)", "spl-token:initializeMint2(decimals=9, freezeAuthority=none)"], programs: ["11111111111111111111111111111111", spl], writableAccounts: [wallet, mint], requiredSigners: [wallet, "session_ephemeral_mint_keypair_in_memory"], dependsOn: [], stopConditions: ["mint address already exists", "wallet mismatch", "genesis mismatch"] }),
    operationPlan({ order: 2, operation: "create-metadata", kind: "transaction", instructions: ["token-metadata:createMetadataAccountV3(immutable, sellerFee=0)"], programs: [metadata], writableAccounts: [wallet, mint, "metadata_pda"], requiredSigners: [wallet], dependsOn: ["create-mint finalized and re-read"], stopConditions: ["metadata PDA exists", "public metadata hash mismatch"] }),
    operationPlan({ order: 3, operation: "create-ATA", kind: "transaction", instructions: ["associated-token:createIdempotent"], programs: ["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", spl], writableAccounts: [wallet, "production_avi_ata"], requiredSigners: [wallet], dependsOn: ["create-mint finalized"], stopConditions: ["mint mismatch", "owner mismatch"] }),
    operationPlan({ order: 4, operation: "mint-fixed-supply", kind: "transaction", instructions: [`spl-token:mintToChecked(${MAINNET_INITIAL_LAUNCH_BASE_UNITS.toString()} base units, decimals=9)`], programs: [spl], writableAccounts: [mint, "production_avi_ata"], requiredSigners: [wallet], dependsOn: ["metadata finalized and exact", "supply=0", "launch_mint_operations_completed=0"], stopConditions: ["amount differs from 1,000 AVI", "supply is not zero", "freeze authority exists", "authority mismatch"] }),
    operationPlan({ order: 5, operation: "verify-retained-authority", kind: "read-only", instructions: ["getMint and compare exact invariants"], programs: [spl], writableAccounts: [], requiredSigners: [], dependsOn: ["mint-fixed-supply finalized"], stopConditions: ["supply!=1,000 AVI", "mint authority!=production wallet", "freeze authority!=none"] }),
    operationPlan({ order: 6, operation: "detect-pool", kind: "read-only", instructions: ["derive/fetch Whirlpool by canonical AVI-USDC pair"], programs: [whirlpool], writableAccounts: [], requiredSigners: [], dependsOn: ["all token and metadata invariants exact"], stopConditions: ["pool already exists for selected fee tier", "USDC mint mismatch"] }),
    operationPlan({ order: 7, operation: "quote-pool", kind: "read-only", instructions: ["quote pool initialization at 0.01 USDC/AVI"], programs: [whirlpool], writableAccounts: [], requiredSigners: [], dependsOn: ["detect-pool reports absent"], stopConditions: ["SDK/config mismatch", "cost exceeds approved budget"] }),
    operationPlan({ order: 8, operation: "quote-position", kind: "read-only", instructions: ["quote concentrated position range 0.005-0.02 USDC/AVI"], programs: [whirlpool], writableAccounts: [], requiredSigners: [], dependsOn: ["quote-pool valid"], stopConditions: ["ticks invalid", "position owner mismatch"] }),
    operationPlan({ order: 9, operation: "quote-liquidity", kind: "read-only", instructions: ["quote liquidity with maximum 1,000 AVI and 10 USDC"], programs: [whirlpool], writableAccounts: [], requiredSigners: [], dependsOn: ["quote-position valid"], stopConditions: ["AVI>1,000", "USDC>10", "unexpected remainder"] }),
    operationPlan({ order: 10, operation: "quote-test-swap", kind: "read-only", instructions: ["quote exact-input buy maximum 0.10 USDC and return sale"], programs: [whirlpool, spl], writableAccounts: [], requiredSigners: [], dependsOn: ["pool and position finalized in a future approved session"], stopConditions: ["input>0.10 USDC", "price impact>10%", "return amount differs from AVI bought"] }),
  ];
  const result: MainnetUnsignedPlan = {
    schemaVersion: 1,
    unsignedOnly: true,
    phantomSigningAdapter: "pending",
    authorizationReceipt: null,
    network: "mainnet-beta",
    genesisHash: input.genesisHash,
    rpcUrl: input.rpcUrl,
    productionWallet: wallet,
    observedBalances: { solLamports: input.solLamports.toString(), officialUsdcBaseUnits: input.usdcBaseUnits.toString() },
    costs: input.costs,
    operations: plans,
  };
  assertNoSecretMaterial(result);
  if (MAINNET_USDC_MINT !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") throw new Error("USDC oficial inesperado.");
  return result;
}
