export const PRODUCTION_WALLET = "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq";
export const INJECTION_TIMEOUT_MS = 30_000;

export function collectDiagnostics(windowRef = window, documentRef = document) {
  const provider = windowRef.phantom?.solana;
  const topLevel = windowRef.top === windowRef.self;
  return {
    href: windowRef.location.href,
    origin: windowRef.location.origin,
    topLevel,
    visibilityState: documentRef.visibilityState,
    phantomType: typeof windowRef.phantom,
    phantomSolanaType: typeof provider,
    isPhantom: provider?.isPhantom === true,
    publicKey: provider?.publicKey?.toString?.() ?? null,
    userAgent: windowRef.navigator.userAgent,
    inIframe: !topLevel,
  };
}

export function assertProductionWallet(publicKey) {
  if (publicKey !== PRODUCTION_WALLET) {
    throw new Error(`Wallet incorrecta: ${publicKey || "sin public key"}. Selecciona la wallet oficial en Phantom.`);
  }
}

export async function waitForPhantom({
  windowRef = window,
  documentRef = document,
  timeoutMs = INJECTION_TIMEOUT_MS,
  pollMs = 250,
  onObservation = () => {},
  onEvent = () => {},
} = {}) {
  const startedAt = Date.now();
  const eventNames = ["phantom#initialized", "solana#initialized"];
  const listeners = eventNames.map((name) => {
    const listener = () => onEvent(name);
    windowRef.addEventListener(name, listener);
    return [name, listener];
  });

  try {
    while (Date.now() - startedAt <= timeoutMs) {
      const diagnostics = collectDiagnostics(windowRef, documentRef);
      onObservation(diagnostics, Date.now() - startedAt);
      if (diagnostics.phantomSolanaType !== "undefined" && diagnostics.isPhantom) {
        return { provider: windowRef.phantom.solana, diagnostics, elapsedMs: Date.now() - startedAt };
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    const diagnostics = collectDiagnostics(windowRef, documentRef);
    onObservation(diagnostics, Date.now() - startedAt);
    return { provider: null, diagnostics, elapsedMs: Date.now() - startedAt };
  } finally {
    for (const [name, listener] of listeners) windowRef.removeEventListener(name, listener);
  }
}

function appendDiagnostic(container, label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = String(value ?? "null");
  row.append(term, description);
  container.append(row);
}

function renderDiagnostics(container, diagnostics) {
  container.replaceChildren();
  const fields = [
    ["location.href", diagnostics.href],
    ["location.origin", diagnostics.origin],
    ["window.top === window.self", diagnostics.topLevel],
    ["document.visibilityState", diagnostics.visibilityState],
    ["typeof window.phantom", diagnostics.phantomType],
    ["typeof window.phantom?.solana", diagnostics.phantomSolanaType],
    ["window.phantom?.solana?.isPhantom", diagnostics.isPhantom],
    ["window.phantom?.solana?.publicKey", diagnostics.publicKey],
    ["navigator.userAgent", diagnostics.userAgent],
    ["Dentro de iframe", diagnostics.inIframe],
  ];
  for (const [label, value] of fields) appendDiagnostic(container, label, value);
}

async function reportResult(result) {
  try {
    await fetch("/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  } catch {
    // El resultado ya permanece visible en la página aunque el servidor se cierre.
  }
}

export function initializeDiagnosticPage(documentRef = document, windowRef = window) {
  const connectButton = documentRef.querySelector("#connect");
  const waitState = documentRef.querySelector("#wait-state");
  const status = documentRef.querySelector("#status");
  const diagnosticsContainer = documentRef.querySelector("#diagnostics");
  const events = documentRef.querySelector("#events");
  let detectedProvider = null;
  let detectedElapsedMs = null;

  const setStatus = (message, tone = "neutral") => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const recordEvent = (message) => {
    const item = documentRef.createElement("li");
    item.textContent = message;
    events.append(item);
  };

  connectButton.addEventListener("click", async () => {
    if (!detectedProvider || detectedProvider !== windowRef.phantom?.solana) {
      setStatus("El proveedor Phantom cambió o dejó de estar disponible.", "error");
      return;
    }
    connectButton.disabled = true;
    try {
      const response = await windowRef.phantom.solana.connect();
      const publicKey = response.publicKey.toString();
      assertProductionWallet(publicKey);
      const diagnostics = collectDiagnostics(windowRef, documentRef);
      renderDiagnostics(diagnosticsContainer, diagnostics);
      recordEvent(`connect: ${publicKey}`);
      setStatus("PASS — PHANTOM MANUAL LOCAL CONNECTION VERIFIED", "success");
      await reportResult({ status: "PASS", publicKey, diagnostics, waitedMs: detectedElapsedMs, openedManually: true });
    } catch (error) {
      connectButton.disabled = false;
      setStatus(error instanceof Error ? error.message : "Phantom rechazó connect().", "error");
    }
  });

  const initial = collectDiagnostics(windowRef, documentRef);
  renderDiagnostics(diagnosticsContainer, initial);
  void waitForPhantom({
    windowRef,
    documentRef,
    onEvent: (name) => recordEvent(name),
    onObservation: (diagnostics, elapsedMs) => {
      renderDiagnostics(diagnosticsContainer, diagnostics);
      const remaining = Math.max(0, Math.ceil((INJECTION_TIMEOUT_MS - elapsedMs) / 1_000));
      waitState.textContent = diagnostics.isPhantom
        ? `Phantom detectado después de ${(elapsedMs / 1_000).toFixed(2)} segundos. connect() espera tu clic.`
        : `Esperando proveedor Phantom: ${remaining} segundos restantes.`;
    },
  }).then(async ({ provider, diagnostics, elapsedMs }) => {
    if (!provider) {
      setStatus("FAIL — PHANTOM LOCAL CONNECTION FAILED", "error");
      waitState.textContent = "Phantom no fue inyectado durante 30 segundos.";
      await reportResult({ status: "FAIL", publicKey: null, diagnostics, waitedMs: elapsedMs, openedManually: true });
      return;
    }
    detectedProvider = provider;
    detectedElapsedMs = elapsedMs;
    connectButton.disabled = false;
    recordEvent("Proveedor Phantom detectado; connect() aún no se ejecutó.");
  });

  return { get detectedProvider() { return detectedProvider; } };
}

if (typeof window !== "undefined" && typeof document !== "undefined") initializeDiagnosticPage();
