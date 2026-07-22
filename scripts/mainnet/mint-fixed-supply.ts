import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { main as preflightPlan } from "./preflight-plan.js";

export async function main(): Promise<void> {
  if (!process.argv.slice(2).includes("--dry-run")) throw new Error("Firma y envío bloqueados; usa --dry-run para revisar el plan unsigned de 1,000 AVI.");
  await preflightPlan();
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
