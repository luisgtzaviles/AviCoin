const copyButton = document.querySelector("[data-copy-mint]");
const copyStatus = document.querySelector("[data-copy-status]");

if (copyButton instanceof HTMLButtonElement && copyStatus instanceof HTMLElement) {
  copyButton.addEventListener("click", async () => {
    const mint = copyButton.dataset.copyMint;
    if (!mint) return;

    try {
      await navigator.clipboard.writeText(mint);
      copyButton.textContent = "Copiada";
      copyStatus.textContent = "Dirección del mint copiada al portapapeles.";
    } catch {
      copyStatus.textContent = "No se pudo copiar automáticamente. Selecciona la dirección manualmente.";
    }

    window.setTimeout(() => {
      copyButton.textContent = "Copiar mint";
      copyStatus.textContent = "";
    }, 2500);
  });
}
