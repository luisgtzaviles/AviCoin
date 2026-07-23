import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { startFinalSupplyPhantomServer } from "./supply-server.js";

export async function main(): Promise<void> {
  const instance = await startFinalSupplyPhantomServer();
  const shutdown = () => { void instance.close().catch(reportFailure); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.log("OPEN THIS URL MANUALLY IN YOUR NORMAL CHROME PROFILE");
  console.log(`AVICOIN Phantom final supply: http://127.0.0.1:${instance.port}/`);
  console.log("No se solicita firma al iniciar. Única operación: mint-final-supply de exactamente 99,999,000 AVI.");
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
