import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertPhantomSigningAdapterPending } from "../lib/phantom.js";

export async function main(): Promise<void> {
  assertPhantomSigningAdapterPending();
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
