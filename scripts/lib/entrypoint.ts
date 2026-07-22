import { pathToFileURL } from "node:url";

export function isDirectExecution(moduleUrl: string): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(entrypoint).href === moduleUrl;
}

export function reportFailure(error: unknown): void {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
