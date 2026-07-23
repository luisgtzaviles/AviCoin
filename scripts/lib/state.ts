import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const stateSchema = z.object({
  schema_version: z.literal(2),
  network: z.literal("mainnet-beta"),
  production_wallet: z.string().min(32),
  initial_launch_supply: z.literal("1000"),
  initial_launch_base_units: z.literal("1000000000000"),
  launch_mint_operations_allowed: z.literal(1),
  launch_mint_operations_completed: z.union([z.literal(0), z.literal(1)]),
  permanent_max_supply: z.null(),
  mint_authority_policy: z.enum(["retained_temporarily", "revoked"]),
  avi_mint: z.string().nullable(),
  metadata_pda: z.string().nullable(),
  avi_ata: z.string().nullable(),
  ata_created: z.boolean().optional().default(false),
  pool: z.string().nullable(),
  position: z.string().nullable(),
  mint_created: z.boolean(),
  metadata_created: z.boolean(),
  supply_minted: z.boolean(),
  mint_authority_revoked: z.boolean(),
  pool_created: z.boolean(),
  position_opened: z.boolean(),
  liquidity_added: z.boolean(),
  swaps_tested: z.boolean(),
}).superRefine((state, context) => {
  if (state.mint_authority_policy === "retained_temporarily" && state.mint_authority_revoked) {
    context.addIssue({ code: "custom", message: "retained_temporarily exige mint_authority_revoked=false", path: ["mint_authority_revoked"] });
  }
  if (state.mint_authority_policy === "revoked" && !state.mint_authority_revoked) {
    context.addIssue({ code: "custom", message: "revoked exige mint_authority_revoked=true", path: ["mint_authority_revoked"] });
  }
  if ((state.launch_mint_operations_completed === 1) !== state.supply_minted) {
    context.addIssue({ code: "custom", message: "El contador de emisión y supply_minted deben coincidir", path: ["launch_mint_operations_completed"] });
  }
  if (state.ata_created !== (state.avi_ata !== null)) {
    context.addIssue({ code: "custom", message: "ata_created y avi_ata deben representar el mismo estado", path: ["ata_created"] });
  }
});

export type MainnetLaunchState = z.infer<typeof stateSchema>;
export const MAINNET_STATE_PATH = resolve("config/mainnet-launch-state.json");

export async function loadMainnetState(path = MAINNET_STATE_PATH): Promise<MainnetLaunchState> {
  const result = stateSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!result.success) throw new Error(`Estado mainnet inválido:\n${z.prettifyError(result.error)}`);
  return result.data;
}

export function assertStateAllows(state: MainnetLaunchState, operation: string): void {
  if (operation === "create-mint" && (state.mint_created || state.avi_mint)) throw new Error("El estado ya registra un mint; no se permite crear otro.");
  if (operation !== "create-mint" && (!state.mint_created || !state.avi_mint)) throw new Error("El estado todavía no registra el mint mainnet confirmado.");
}

export async function writeMainnetState(next: MainnetLaunchState, path = MAINNET_STATE_PATH): Promise<void> {
  const valid = stateSchema.parse(next);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
