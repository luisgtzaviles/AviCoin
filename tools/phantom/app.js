import { VersionedTransaction } from "@solana/web3.js";

export const PRODUCTION_WALLET = "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq";
export const ENABLED_OPERATION = "create-mint";
export const BLOCKED_OPERATIONS = ["create-metadata", "mint-fixed-supply", "create-pool", "open-position", "increase-liquidity", "test-swap", "return-swap"];

export function assertProductionWallet(publicKey) {
  if (publicKey !== PRODUCTION_WALLET) throw new Error("Wallet incorrecta. Desconecta Phantom y selecciona la wallet oficial.");
}

export async function connectForPublicKeyVerification(provider) {
  if (!provider?.isPhantom || typeof provider.connect !== "function" || typeof provider.signTransaction !== "function") {
    throw new Error("El proveedor oficial inyectado por Phantom no está disponible.");
  }
  const response = await provider.connect();
  const publicKey = response.publicKey.toString();
  assertProductionWallet(publicKey);
  return publicKey;
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toBase64(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Error HTTP ${response.status}`);
  return result;
}

function appendLine(container, label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = Array.isArray(value) ? value.join(" · ") : String(value ?? "—");
  row.append(term, description);
  container.append(row);
}

export function renderPlan(plan, container) {
  container.replaceChildren();
  const fields = [
    ["Operación", plan.operation], ["Red", plan.network], ["Genesis", plan.genesisHash], ["RPC", plan.rpcHost],
    ["Wallet", plan.wallet], ["Mint esperado", plan.mintAddress], ["Programas", plan.programs],
    ["Instrucciones", plan.instructions], ["Writable", plan.writableAccounts], ["Signers", plan.signerAccounts],
    ["Balance antes (lamports)", plan.balanceBeforeLamports], ["Cambio esperado (lamports)", plan.expectedBalanceChangeLamports],
    ["Renta (lamports)", plan.rentLamports], ["Fee estimado (lamports)", plan.estimatedFeeLamports],
    ["Message hash", plan.messageHash], ["Plan hash", plan.planHash], ["Blockhash", plan.blockhash],
    ["Último block height válido", plan.lastValidBlockHeight], ["Condiciones de detención", plan.stopConditions],
  ];
  for (const [label, value] of fields) appendLine(container, label, value);
}

export function initializePage(documentRef = document, provider = window.phantom?.solana) {
  const elements = {
    connect: documentRef.querySelector("#connect"), build: documentRef.querySelector("#build"), simulate: documentRef.querySelector("#simulate"),
    review: documentRef.querySelector("#review"), requestSignature: documentRef.querySelector("#request-signature"), send: documentRef.querySelector("#send"),
    verify: documentRef.querySelector("#verify"), status: documentRef.querySelector("#status"), plan: documentRef.querySelector("#plan"),
    signatureConfirm: documentRef.querySelector("#signature-confirm"), sendConfirm: documentRef.querySelector("#send-confirm"),
    token: documentRef.querySelector("#confirmation-token"), gate: documentRef.querySelector("#execution-gate"), blocked: documentRef.querySelector("#blocked-operations"),
  };
  const state = { wallet: null, session: null, bootstrap: null, busy: false };
  for (const operation of BLOCKED_OPERATIONS) {
    const item = documentRef.createElement("li");
    item.textContent = `${operation} — bloqueada en esta fase`;
    elements.blocked.append(item);
  }

  const setStatus = (message, tone = "neutral") => {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
  };
  const common = () => ({ sessionId: state.session.sessionId, connectedWallet: state.wallet, planHash: state.session.plan.planHash });
  const walletStillMatches = () => {
    const current = provider?.publicKey?.toString();
    assertProductionWallet(current);
    if (current !== state.wallet) throw new Error("La wallet conectada cambió; sesión invalidada.");
  };
  const refresh = () => {
    const status = state.session?.status;
    const dryRunFresh = Boolean(state.session?.dryRunValidUntil && Date.parse(state.session.dryRunValidUntil) > Date.now());
    const tokenPresent = elements.token.value.length >= 16;
    elements.build.disabled = state.busy || !state.wallet || Boolean(state.session);
    elements.simulate.disabled = state.busy || status !== "built";
    elements.review.disabled = state.busy || status !== "simulated";
    elements.requestSignature.disabled = state.busy || status !== "reviewed" || !dryRunFresh || !tokenPresent || !elements.signatureConfirm.checked || !state.bootstrap?.executionEnabled;
    elements.send.disabled = state.busy || status !== "signed" || !dryRunFresh || !tokenPresent || !elements.sendConfirm.checked || !state.bootstrap?.executionEnabled;
    elements.verify.disabled = state.busy || (status !== "sent" && status !== "ambiguous");
  };
  const run = async (work) => {
    if (state.busy) return;
    state.busy = true; refresh();
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : "Error local inesperado.", "error"); }
    finally { state.busy = false; refresh(); }
  };
  const acceptSession = (session, message) => {
    state.session = session;
    renderPlan(session.plan, elements.plan);
    sessionStorage.setItem("avicoin.create-mint.public", JSON.stringify({ sessionId: session.sessionId, mintAddress: session.plan.mintAddress, planHash: session.plan.planHash, messageHash: session.plan.messageHash, signature: session.signature ?? session.expectedSignature }));
    setStatus(message, "success");
  };

  elements.connect.addEventListener("click", () => run(async () => {
    state.wallet = await connectForPublicKeyVerification(provider);
    state.bootstrap = await api("/api/bootstrap");
    if (state.bootstrap.productionWallet !== state.wallet || state.bootstrap.network !== "mainnet-beta") throw new Error("La configuración local no coincide con Mainnet y la wallet autorizada.");
    elements.gate.textContent = state.bootstrap.executionEnabled
      ? "Ejecución efímera habilitada para create-mint. Cada aprobación sigue siendo manual."
      : "ALLOW_MAINNET=false o autorización efímera ausente: Build/Simulate disponibles; firma y envío bloqueados.";
    setStatus(`Wallet verificada: ${state.wallet}. No se solicitó firma.`, "success");
  }));
  elements.build.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const session = await api("/api/build", { connectedWallet: state.wallet, operation: ENABLED_OPERATION });
    acceptSession(session, `Build PASS. Mint esperado: ${session.plan.mintAddress}. No se firmó con Phantom.`);
  }));
  elements.simulate.addEventListener("click", () => run(async () => {
    walletStillMatches();
    acceptSession(await api("/api/simulate", common()), "Simulate PASS. El dry-run tiene vigencia limitada.");
  }));
  elements.review.addEventListener("click", () => run(async () => {
    walletStillMatches();
    acceptSession(await api("/api/review", common()), "Review PASS. Verifica todos los campos antes de confirmar firma.");
  }));
  elements.requestSignature.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const payload = await api("/api/signing-payload", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.signatureConfirm.checked });
    if (payload.planHash !== state.session.plan.planHash || payload.messageHash !== state.session.plan.messageHash) throw new Error("El payload de firma no coincide con el plan revisado.");
    const transaction = VersionedTransaction.deserialize(fromBase64(payload.transactionBase64));
    const signed = await provider.signTransaction(transaction);
    const session = await api("/api/signed", { ...common(), messageHash: payload.messageHash, transactionBase64: toBase64(signed.serialize()) });
    acceptSession(session, "Phantom firmó exactamente el mensaje revisado. Aún no se envió.");
  }));
  elements.send.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const session = await api("/api/send", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.sendConfirm.checked });
    acceptSession(session, `Envío realizado una sola vez. Firma: ${session.signature}. Verifica finalized antes de continuar.`);
  }));
  elements.verify.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const session = await api("/api/verify", common());
    const detail = session.status === "finalized" ? "Finalized PASS; mint releído con supply 0 y freeze none." : "Resultado ambiguo: no reintentes ni construyas otro mint.";
    acceptSession(session, detail);
  }));
  elements.signatureConfirm.addEventListener("change", refresh);
  elements.sendConfirm.addEventListener("change", refresh);
  elements.token.addEventListener("input", refresh);
  window.setInterval(refresh, 1_000);
  refresh();
  return { state, refresh };
}

if (typeof window !== "undefined" && typeof document !== "undefined") initializePage();
