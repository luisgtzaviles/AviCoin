import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const stateSchema = z.object({
  schema_version: z.literal(1),
  network: z.literal("mainnet-beta"),
  production_wallet: z.string().nullable(),
  avi_mint: z.string().nullable(),
  metadata_pda: z.string().nullable(),
  avi_ata: z.string().nullable(),
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
