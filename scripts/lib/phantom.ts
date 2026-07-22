import { MAINNET_PRODUCTION_WALLET } from "../../config/mainnet.js";

const SECRET_FIELD = /(?:secret|private|seed|mnemonic|keypair)/iu;

export function assertExpectedPhantomWallet(connectedPublicKey: string, expected = MAINNET_PRODUCTION_WALLET): void {
  if (connectedPublicKey !== expected) throw new Error("La wallet conectada en Phantom no coincide con production_wallet.");
}

export function assertConnectedSigner(connectedPublicKey: string, signerPublicKey: string): void {
  assertExpectedPhantomWallet(connectedPublicKey);
  if (signerPublicKey !== connectedPublicKey) throw new Error("El signer solicitado no coincide con la wallet Phantom conectada.");
}

export function assertNoSecretMaterial(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_FIELD.test(key)) throw new Error(`El plan unsigned no admite material secreto (${key}).`);
    assertNoSecretMaterial(child);
  }
}

export function assertPhantomSigningAdapterPending(): never {
  throw new Error("Firma y envío bloqueados: el adaptador auditado de Phantom todavía está pendiente.");
}
