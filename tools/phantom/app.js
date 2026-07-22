export const PRODUCTION_WALLET = "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq";
export const OPERATIONS = [
  ["create-mint", "wallet + mint efímero en memoria"],
  ["create-metadata", "después de finalized y relectura"],
  ["create-ATA", "cuenta AVI de producción"],
  ["mint-fixed-supply", "exactamente 1,000 AVI, una vez"],
  ["verify-retained-authority", "lectura exacta on-chain"],
  ["detect-pool", "sólo lectura"],
  ["quote-pool", "sólo lectura"],
  ["quote-position", "sólo lectura"],
  ["quote-liquidity", "máximo 1,000 AVI / 10 USDC"],
  ["quote-test-swap", "máximo 0.10 USDC"],
];

export function assertProductionWallet(publicKey) {
  if (publicKey !== PRODUCTION_WALLET) throw new Error("Wallet incorrecta. Desconecta Phantom y selecciona la wallet oficial.");
}

export async function connectForPublicKeyVerification(provider) {
  if (!provider?.isPhantom || typeof provider.connect !== "function") throw new Error("Phantom no está disponible en este navegador.");
  const response = await provider.connect();
  const publicKey = response.publicKey.toString();
  assertProductionWallet(publicKey);
  return publicKey;
}

export function initializePage(documentRef = document, provider = window.phantom?.solana) {
  const list = documentRef.querySelector("#operations");
  for (const [operation, note] of OPERATIONS) {
    const item = documentRef.createElement("li");
    item.innerHTML = `<strong>${operation}</strong><small>${note}</small>`;
    list.append(item);
  }
  documentRef.querySelector("#connect").addEventListener("click", async () => {
    const status = documentRef.querySelector("#status");
    try {
      const publicKey = await connectForPublicKeyVerification(provider);
      status.textContent = `Wallet verificada: ${publicKey}. Firma y envío continúan deshabilitados.`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "No fue posible verificar Phantom.";
    }
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") initializePage();
