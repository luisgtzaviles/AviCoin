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
    ["Wallet payer", plan.wallet], ["Mint propuesto", plan.mintAddress], ["Programas", plan.programs],
    ["Instrucciones", plan.instructions], ["Writable", plan.writableAccounts], ["Signers", plan.signerAccounts],
    ["Decimales", plan.decimals], ["Supply esperado", plan.supply], ["Mint authority", plan.mintAuthority],
    ["Freeze authority", plan.freezeAuthority], ["Espacio mint", plan.mintAccountSpace],
    ["Balance revisado (lamports)", plan.balanceBeforeLamports], ["Renta (lamports)", plan.rentLamports],
    ["Fee aproximado (lamports)", plan.estimatedFeeLamports], ["Cambio aproximado (lamports)", plan.expectedBalanceChangeLamports],
    ["Stable plan hash", plan.planHash], ["Condiciones de detención", plan.stopConditions],
  ];
  for (const [label, value] of fields) appendLine(container, label, value);
}

export function renderFreshTransaction(fresh, container) {
  container.replaceChildren();
  if (!fresh) {
    appendLine(container, "Estado", "Todavía no existe un blockhash final. Se obtendrá uno fresco al iniciar la fase de firma.");
    return;
  }
  const fields = [
    ["Stable plan hash", fresh.stablePlanHash], ["Wallet payer", fresh.wallet], ["Mint propuesto", fresh.mintAddress],
    ["Blockhash", fresh.blockhash], ["Last valid block height", fresh.lastValidBlockHeight],
    ["Block height actual", fresh.currentBlockHeight], ["Margen restante", fresh.remainingBlockHeights],
    ["Margen para firma", fresh.signatureMarginRequired], ["Margen para envío", fresh.sendMarginRequired],
    ["Firma permitida", fresh.canRequestSignature], ["Envío permitido", fresh.canSend],
    ["Fee exacto (lamports)", fresh.feeLamports], ["Balance antes (lamports)", fresh.balanceBeforeLamports],
    ["Balance estimado después", fresh.expectedBalanceAfterLamports], ["Message hash", fresh.messageHash],
    ["Simulación", fresh.simulation.logs], ["Unidades consumidas", fresh.simulation.unitsConsumed],
  ];
  for (const [label, value] of fields) appendLine(container, label, value);
}

export function initializePage(documentRef = document, provider = window.phantom?.solana) {
  const elements = {
    connect: documentRef.querySelector("#connect"), build: documentRef.querySelector("#build"), review: documentRef.querySelector("#review"),
    prepare: documentRef.querySelector("#prepare"), requestSignature: documentRef.querySelector("#request-signature"), send: documentRef.querySelector("#send"),
    verify: documentRef.querySelector("#verify"), cancel: documentRef.querySelector("#cancel"), status: documentRef.querySelector("#status"),
    plan: documentRef.querySelector("#plan"), fresh: documentRef.querySelector("#fresh-transaction"), validity: documentRef.querySelector("#validity"),
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
    const fresh = state.session?.freshTransaction;
    const tokenPresent = elements.token.value.length >= 16;
    const canPrepare = ["plan_reviewed", "simulated", "signature_requested", "signed"].includes(status);
    const cancellable = ["plan_built", "plan_reviewed", "fresh_message_prepared", "simulated", "signature_requested", "signed"].includes(status);
    elements.build.disabled = state.busy || !state.wallet || Boolean(state.session);
    elements.review.disabled = state.busy || status !== "plan_built";
    elements.prepare.disabled = state.busy || !canPrepare || !tokenPresent || !elements.signatureConfirm.checked || !state.bootstrap?.executionEnabled;
    elements.requestSignature.disabled = state.busy || status !== "simulated" || !fresh?.canRequestSignature || !tokenPresent || !elements.signatureConfirm.checked || !state.bootstrap?.executionEnabled;
    elements.send.disabled = state.busy || status !== "signed" || !fresh?.canSend || !tokenPresent || !elements.sendConfirm.checked || !state.bootstrap?.executionEnabled;
    elements.verify.disabled = state.busy || (status !== "sent" && status !== "ambiguous");
    elements.cancel.disabled = state.busy || !cancellable;
    if (!fresh) elements.validity.textContent = "Plan revisable; sin blockhash final.";
    else if (!fresh.canRequestSignature) elements.validity.textContent = "Blockhash demasiado cercano a expirar; prepara uno nuevo.";
    else if (status === "signed") elements.validity.textContent = `Firma válida para envío; quedan ${fresh.remainingBlockHeights} block heights.`;
    else elements.validity.textContent = `Mensaje fresco preparado; quedan ${fresh.remainingBlockHeights} block heights.`;
  };
  const run = async (work) => {
    if (state.busy) return;
    state.busy = true; refresh();
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : "Error local inesperado.", "error"); }
    finally { state.busy = false; refresh(); }
  };
  const acceptSession = (session, message, tone = "success") => {
    state.session = session;
    renderPlan(session.plan, elements.plan);
    renderFreshTransaction(session.freshTransaction, elements.fresh);
    sessionStorage.setItem("avicoin.create-mint.public", JSON.stringify({
      sessionId: session.sessionId,
      mintAddress: session.plan.mintAddress,
      planHash: session.plan.planHash,
      messageHash: session.freshTransaction?.messageHash ?? null,
      signature: session.signature ?? session.expectedSignature,
    }));
    if (message) setStatus(message, tone);
    refresh();
  };

  elements.connect.addEventListener("click", () => run(async () => {
    state.wallet = await connectForPublicKeyVerification(provider);
    state.bootstrap = await api("/api/bootstrap");
    if (state.bootstrap.productionWallet !== state.wallet || state.bootstrap.network !== "mainnet-beta") throw new Error("La configuración local no coincide con Mainnet y la wallet autorizada.");
    elements.gate.textContent = state.bootstrap.executionEnabled
      ? "Ejecución efímera habilitada sólo para create-mint. Cada aprobación sigue siendo manual."
      : "ALLOW_MAINNET=false o autorización efímera ausente: sólo Build stable plan y Review están disponibles.";
    setStatus(`Wallet verificada: ${state.wallet}. No se solicitó firma.`, "success");
  }));
  elements.build.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const session = await api("/api/build", { connectedWallet: state.wallet, operation: ENABLED_OPERATION });
    acceptSession(session, `Plan estable creado para ${session.plan.mintAddress}. Todavía no existe blockhash final.`);
  }));
  elements.review.addEventListener("click", () => run(async () => {
    walletStillMatches();
    acceptSession(await api("/api/review", common()), "Plan estable revisado. Confirma Mainnet antes de preparar y simular el mensaje fresco.");
  }));
  elements.prepare.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const previousSignature = state.session?.expectedSignature;
    const session = await api("/api/prepare", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.signatureConfirm.checked });
    const prefix = previousSignature || session.signatureInvalidated ? "Firma anterior invalidada; no fue enviada. " : "";
    acceptSession(session, `${prefix}Mensaje fresco preparado. Firma requerida ahora.`);
  }));
  elements.requestSignature.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const payload = await api("/api/signing-payload", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.signatureConfirm.checked });
    if (payload.planHash !== state.session.plan.planHash || payload.messageHash !== state.session.freshTransaction?.messageHash) throw new Error("El payload de firma no coincide con el plan estable y mensaje fresco revisados.");
    const transaction = VersionedTransaction.deserialize(fromBase64(payload.transactionBase64));
    const signed = await provider.signTransaction(transaction);
    const session = await api("/api/signed", { ...common(), messageHash: payload.messageHash, transactionBase64: toBase64(signed.serialize()) });
    acceptSession(session, "Phantom firmó exactamente el mensaje fresco simulado. Envía inmediatamente o prepara uno nuevo si el margen cae.");
  }));
  elements.send.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const session = await api("/api/send", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.sendConfirm.checked });
    acceptSession(session, `Envío bloqueado y realizado una sola vez. Firma: ${session.signature}. Esperando finalized.`);
  }));
  elements.verify.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const session = await api("/api/verify", common());
    const detail = session.status === "finalized" ? "Finalized PASS; mint releído con supply 0 y freeze none." : "Resultado ambiguo: no refresques, reintentes ni construyas otro mint.";
    acceptSession(session, detail, session.status === "finalized" ? "success" : "error");
  }));
  elements.cancel.addEventListener("click", () => run(async () => {
    walletStillMatches();
    const session = await api("/api/cancel", common());
    acceptSession(session, "Sesión cancelada; mensaje, firma y material efímero invalidados.");
    sessionStorage.removeItem("avicoin.create-mint.public");
  }));
  elements.signatureConfirm.addEventListener("change", refresh);
  elements.sendConfirm.addEventListener("change", refresh);
  elements.token.addEventListener("input", refresh);
  window.setInterval(() => {
    if (state.busy || !["simulated", "signature_requested", "signed"].includes(state.session?.status)) return;
    void api("/api/fresh-status", common()).then((session) => acceptSession(session, null)).catch((error) => setStatus(error instanceof Error ? error.message : "No se pudo actualizar block height.", "error"));
  }, 5_000);
  refresh();
  return { state, refresh };
}

if (typeof window !== "undefined" && typeof document !== "undefined") initializePage();
