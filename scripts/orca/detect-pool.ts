import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { mainnetPoolLookup } from "./read-only.js";

export async function main(): Promise<void> {
  const { pools } = await mainnetPoolLookup();
  const initialized = pools.filter((pool) => pool.initialized);
  console.table(initialized.map((pool) => ({ address: pool.address, tickSpacing: pool.tickSpacing, feeRate: pool.feeRate, price: pool.price })));
  console.log(initialized.length ? "Pool existente detectado: la creación debe detenerse." : "No se detectó un pool inicializado para el par en los fee tiers consultados.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
