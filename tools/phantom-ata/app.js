import { VersionedTransaction } from "@solana/web3.js";

export const PRODUCTION_WALLET = "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq";
export const ENABLED_OPERATION = "create-ata";
export const MINT_ADDRESS = "GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC";
export const ATA_ADDRESS = "H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE";
export const EXPECTED_CONFIRMATION_TOKEN = "CONFIRMO-MAINNET-CREAR-ATA-OFICIAL";
export const BLOCKED_OPERATIONS = ["mintTo", "create-metadata", "revoke-mint-authority", "create-pool", "open-position", "liquidity", "swaps", "Devnet"];

function fromBase64(value) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
function toBase64(value) { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }
function appendLine(target, label, value) { const row = document.createElement("div"); const term = document.createElement("dt"); const detail = document.createElement("dd"); term.textContent = label; detail.textContent = Array.isArray(value) ? value.join(" · ") : String(value); row.append(term, detail); target.append(row); }

async function api(path, body) {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Error local.");
  return result;
}

export async function connectForAta(provider) {
  if (!provider?.isPhantom || typeof provider.connect !== "function" || typeof provider.signTransaction !== "function") throw new Error("Proveedor Phantom oficial no disponible.");
  const response = await provider.connect();
  const wallet = response.publicKey.toString();
  if (wallet !== PRODUCTION_WALLET) throw new Error("Wallet incorrecta; selecciona la wallet oficial.");
  return wallet;
}

export function initializeAtaPage(documentRef = document, provider = window.phantom?.solana) {
  const byId = (id) => documentRef.getElementById(id);
  const elements = {
    connect: byId("connect"), gate: byId("execution-gate"), status: byId("status"), build: byId("build"), review: byId("review"),
    token: byId("confirmation-token"), firstConfirm: byId("first-confirm"), prepare: byId("prepare"), prepareValidity: byId("prepare-validity"), prepareGate: byId("prepare-gate"),
    requestSignature: byId("request-signature"), signatureValidity: byId("signature-validity"), sendConfirm: byId("send-confirm"), send: byId("send"), verify: byId("verify"), cancel: byId("cancel"),
    plan: byId("plan"), fresh: byId("fresh-transaction"), blocked: byId("blocked-operations"),
  };
  const state = { busy: false, wallet: null, bootstrap: null, session: null, serverSession: null };
  for (const operation of BLOCKED_OPERATIONS) { const item = documentRef.createElement("li"); item.textContent = `${operation} — bloqueada`; elements.blocked.append(item); }
  const setStatus = (message, tone = "neutral") => { elements.status.textContent = message; elements.status.dataset.tone = tone; };
  const common = () => ({ sessionId: state.session.sessionId, connectedWallet: state.wallet, planHash: state.session.plan.planHash });
  const walletStillMatches = () => { if (state.wallet !== PRODUCTION_WALLET || provider?.publicKey?.toString() !== PRODUCTION_WALLET) throw new Error("La wallet Phantom cambió."); };
  const renderPlan = (plan) => { elements.plan.replaceChildren(); for (const [key, value] of Object.entries(plan)) appendLine(elements.plan, key, value ?? "none"); };
  const renderFresh = (fresh) => { elements.fresh.replaceChildren(); if (!fresh) appendLine(elements.fresh, "Estado", "Sin mensaje fresco"); else for (const [key, value] of Object.entries(fresh)) appendLine(elements.fresh, key, typeof value === "object" ? JSON.stringify(value) : value); };
  const refresh = () => {
    const status = state.session?.status;
    const tokenMatches = elements.token.value === EXPECTED_CONFIRMATION_TOKEN;
    const serverMatches = Boolean(state.session && state.serverSession?.sessionId === state.session.sessionId && state.serverSession?.planHash === state.session.plan.planHash);
    const checks = {
      connected: state.wallet === PRODUCTION_WALLET,
      walletMatches: provider?.publicKey?.toString() === PRODUCTION_WALLET,
      planReviewedByServer: serverMatches && state.serverSession?.planReviewed === true,
      confirmationTokenMatches: tokenMatches,
      firstConfirmationChecked: elements.firstConfirm.checked,
      ataStillAbsent: state.bootstrap?.preflight?.ataStillAbsent === true,
      mintInvariantsValid: state.bootstrap?.preflight?.mintInvariantsValid === true,
      metadataValid: state.bootstrap?.preflight?.metadataValid === true,
      allowMainnetSessionEnabled: state.bootstrap?.executionEnabled === true,
      operationEqualsCreateAta: state.bootstrap?.selectedOperation === ENABLED_OPERATION,
    };
    const canPrepare = Object.values(checks).every(Boolean);
    elements.build.disabled = state.busy || !state.wallet || Boolean(state.session);
    elements.review.disabled = state.busy || status !== "plan_built";
    elements.prepare.disabled = state.busy || !canPrepare;
    const fresh = state.session?.freshTransaction;
    const canSign = !state.busy && status === "simulated" && state.serverSession?.status === "simulated" && serverMatches && state.serverSession?.planReviewed === true && fresh?.canRequestSignature && tokenMatches && elements.firstConfirm.checked;
    elements.requestSignature.disabled = !canSign;
    elements.sendConfirm.disabled = state.busy || status !== "signed" || state.serverSession?.status !== "signed" || !state.session?.expectedSignature;
    if (elements.sendConfirm.disabled) elements.sendConfirm.checked = false;
    elements.send.disabled = state.busy || status !== "signed" || !fresh?.canSend || !tokenMatches || !elements.sendConfirm.checked;
    elements.verify.disabled = state.busy || !["sent", "ambiguous"].includes(status);
    elements.cancel.disabled = state.busy || !["plan_built", "plan_reviewed", "simulated", "signature_requested", "signed"].includes(status);
    elements.prepareGate.replaceChildren(); for (const [name, passed] of Object.entries(checks)) appendLine(elements.prepareGate, name, passed ? "PASS" : "BLOCKED");
    const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    elements.prepareValidity.textContent = fresh ? `Mensaje fresco: ${fresh.remainingBlockHeights} block heights restantes.` : blockers.length ? `Prepare bloqueado por: ${blockers.join(", ")}.` : "Prepare habilitado; aún sin blockhash final.";
    elements.signatureValidity.textContent = canSign ? "Request signature habilitado para el mensaje simulado." : "Firma bloqueada hasta estado simulated autoritativo y margen válido.";
  };
  const accept = (session, message, tone = "success") => { state.session = session; state.serverSession = { sessionId: session.sessionId, status: session.status, planHash: session.plan.planHash, planReviewed: session.planReviewed }; renderPlan(session.plan); renderFresh(session.freshTransaction); if (message) setStatus(message, tone); refresh(); };
  const run = async (work) => { if (state.busy) return; state.busy = true; refresh(); try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : "Error local.", "error"); } finally { state.busy = false; refresh(); } };

  elements.connect.addEventListener("click", () => run(async () => {
    state.wallet = await connectForAta(provider); state.bootstrap = await api("/api/bootstrap");
    if (state.bootstrap.productionWallet !== state.wallet || state.bootstrap.mint !== MINT_ADDRESS || state.bootstrap.ata !== ATA_ADDRESS) throw new Error("Bootstrap no coincide con wallet, mint o ATA oficiales.");
    state.serverSession = await api("/api/session-status");
    elements.gate.textContent = state.bootstrap.executionEnabled ? "Autorización temporal activa sólo para create-ata." : "ALLOW_MAINNET=false: firma y Send bloqueados.";
    setStatus(`Wallet verificada: ${state.wallet}. No se solicitó firma.`, "success");
  }));
  elements.build.addEventListener("click", () => run(async () => { walletStillMatches(); accept(await api("/api/build", { connectedWallet: state.wallet, operation: ENABLED_OPERATION }), "Plan estable ATA creado; no contiene mintTo."); }));
  elements.review.addEventListener("click", () => run(async () => { walletStillMatches(); accept(await api("/api/review", common()), "Plan revisado. Confirma wallet, mint, ATA y supply 0."); }));
  elements.prepare.addEventListener("click", () => run(async () => { walletStillMatches(); accept(await api("/api/prepare", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.firstConfirm.checked }), "Mensaje fresco create-ata simulado. Firma requerida ahora."); }));
  elements.requestSignature.addEventListener("click", () => run(async () => {
    walletStillMatches(); const payload = await api("/api/signing-payload", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.firstConfirm.checked });
    const transaction = VersionedTransaction.deserialize(fromBase64(payload.transactionBase64));
    try { const signed = await provider.signTransaction(transaction); accept(await api("/api/signed", { ...common(), messageHash: payload.messageHash, transactionBase64: toBase64(signed.serialize()) }), "Phantom firmó exactamente create-ata. Confirma el envío único."); }
    catch (error) { try { accept(await api("/api/signature-aborted", common()), "Phantom no devolvió firma; solicitud revertida.", "error"); } catch {} throw error; }
  }));
  elements.send.addEventListener("click", () => { const explicitlyConfirmed = elements.sendConfirm.checked; const confirmationToken = elements.token.value; return run(async () => { walletStillMatches(); accept(await api("/api/send", { ...common(), confirmationToken, explicitlyConfirmed }), "Send único realizado. Ejecuta Verify finalized."); }); });
  elements.verify.addEventListener("click", () => run(async () => { walletStillMatches(); const session = await api("/api/verify", common()); accept(session, session.status === "finalized" ? "Finalized PASS: ATA exacta, balance 0 AVI y supply 0 AVI." : "Resultado ambiguo: no reintentes.", session.status === "finalized" ? "success" : "error"); }));
  elements.cancel.addEventListener("click", () => run(async () => { walletStillMatches(); accept(await api("/api/cancel", common()), "Sesión ATA cancelada."); }));
  for (const event of ["input", "change"]) { elements.token.addEventListener(event, refresh); elements.firstConfirm.addEventListener(event, refresh); elements.sendConfirm.addEventListener(event, refresh); }
  window.setInterval(() => { void api("/api/session-status").then((session) => { state.serverSession = session; refresh(); }).catch(() => {}); }, 1_000);
  window.setInterval(() => { if (state.busy || !["simulated", "signature_requested", "signed"].includes(state.session?.status)) return; void api("/api/fresh-status", common()).then((session) => accept(session)).catch((error) => setStatus(error instanceof Error ? error.message : "No se actualizó vigencia.", "error")); }, 5_000);
  refresh();
  return { state, refresh };
}

if (typeof window !== "undefined" && typeof document !== "undefined") initializeAtaPage();
