import { VersionedTransaction } from "@solana/web3.js";

export const PRODUCTION_WALLET = "EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq";
export const ENABLED_OPERATION = "create-metadata";
export const MINT_ADDRESS = "GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC";
export const METADATA_PDA = "4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2";
export const EXPECTED_CONFIRMATION_TOKEN = "CONFIRMO-MAINNET-METADATA-PERMANENTE";
export const BLOCKED_OPERATIONS = ["create-mint", "create-ATA", "mint-fixed-supply", "revoke-mint-authority", "create-pool", "open-position", "liquidity", "swaps"];

function assertWallet(value) { if (value !== PRODUCTION_WALLET) throw new Error("Wallet incorrecta; selecciona la wallet oficial."); }

export async function connectForMetadata(provider) {
  if (!provider?.isPhantom || typeof provider.connect !== "function" || typeof provider.signTransaction !== "function") throw new Error("Proveedor Phantom oficial no disponible.");
  const response = await provider.connect();
  const value = response.publicKey.toString();
  assertWallet(value);
  return value;
}

function fromBase64(value) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
function toBase64(value) { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }

function unicodeSequence(value) { return Array.from(value, (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(" "); }

export function diagnoseConfirmationToken(receivedValue) {
  const received = String(receivedValue ?? "");
  const trimmed = received.trim();
  const nfc = trimmed.normalize("NFC");
  const nfkc = trimmed.normalize("NFKC");
  const expectedCharacters = Array.from(EXPECTED_CONFIRMATION_TOKEN);
  const receivedCharacters = Array.from(received);
  let firstDifference = "none";
  const width = Math.max(expectedCharacters.length, receivedCharacters.length);
  for (let index = 0; index < width; index += 1) {
    if (expectedCharacters[index] !== receivedCharacters[index]) {
      const expected = expectedCharacters[index]; const actual = receivedCharacters[index];
      firstDifference = `index ${index}: expected ${expected === undefined ? "<end>" : `${JSON.stringify(expected)} U+${expected.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`}; received ${actual === undefined ? "<end>" : `${JSON.stringify(actual)} U+${actual.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`}`;
      break;
    }
  }
  return {
    expected: EXPECTED_CONFIRMATION_TOKEN,
    received,
    expectedLength: EXPECTED_CONFIRMATION_TOKEN.length,
    receivedLength: received.length,
    expectedUnicode: unicodeSequence(EXPECTED_CONFIRMATION_TOKEN),
    receivedUnicode: unicodeSequence(received),
    firstDifference,
    trimmed,
    nfc,
    nfkc,
    rawMatches: received === EXPECTED_CONFIRMATION_TOKEN,
    trimmedMatches: trimmed === EXPECTED_CONFIRMATION_TOKEN,
    nfcMatches: nfc === EXPECTED_CONFIRMATION_TOKEN,
    nfkcMatches: nfkc === EXPECTED_CONFIRMATION_TOKEN,
    matches: received === EXPECTED_CONFIRMATION_TOKEN,
    condition: "received === EXPECTED_CONFIRMATION_TOKEN",
  };
}

async function api(path, body) {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Error HTTP ${response.status}`);
  return result;
}

function appendLine(container, label, value) {
  const row = document.createElement("div"); const term = document.createElement("dt"); const description = document.createElement("dd");
  term.textContent = label; description.textContent = Array.isArray(value) ? value.join(" · ") : String(value ?? "none");
  row.append(term, description); container.append(row);
}

export function deriveMetadataSignatureGate({ busy, status, serverStatus, serverSessionMatches, stablePlanHashMatches, serverPlanReviewed, fresh, tokenExact, firstConfirmationChecked, executionEnabled }) {
  const checks = {
    serverSessionMatches,
    stablePlanHashMatches,
    planReviewedByServer: serverPlanReviewed,
    sessionStateIsSimulated: status === "simulated",
    serverStateIsSimulated: serverStatus === "simulated",
    simulationValid: Boolean(fresh?.simulation && fresh?.messageHash),
    signatureMarginValid: fresh?.canRequestSignature === true,
    confirmationTokenMatches: tokenExact,
    firstConfirmationChecked,
    allowMainnetSessionEnabled: executionEnabled,
  };
  return { checks, enabled: !busy && Object.values(checks).every(Boolean) };
}

export function isSendConfirmationEnabled({ status, serverStatus, expectedSignature }) {
  return status === "signed" && serverStatus === "signed" && Boolean(expectedSignature);
}

export function renderMetadataPlan(plan, container) {
  container.replaceChildren();
  const fields = [
    ["Operación", plan.operation], ["Red", plan.network], ["Genesis", plan.genesisHash], ["RPC", plan.rpcHost], ["Payer", plan.payer],
    ["Update authority", plan.updateAuthority], ["Mint", plan.mintAddress], ["Metadata PDA", plan.metadataPda], ["Programa", plan.metadataProgram],
    ["Instrucción", plan.instruction], ["Compute unit limit", plan.computeUnitLimit], ["Compute unit price (micro-lamports)", plan.computeUnitPriceMicroLamports],
    ["Prioridad máxima (lamports)", plan.maximumPriorityFeeLamports], ["Instruction data SHA-256", plan.instructionDataSha256], ["Nombre", plan.name], ["Símbolo", plan.symbol],
    ["URI", plan.uri], ["Seller fee bps", plan.sellerFeeBasisPoints], ["Mutable", plan.isMutable], ["Creators", plan.creators], ["Collection", plan.collection], ["Uses", plan.uses],
    ["Writable", plan.writableAccounts], ["Signers", plan.signerAccounts], ["Balance", plan.balanceBeforeLamports], ["Renta estimada", plan.estimatedRentLamports],
    ["Fee aproximado", plan.estimatedFeeLamports], ["Cambio aproximado", plan.expectedBalanceChangeLamports], ["Metadata pública SHA-256", plan.publicMetadataSha256],
    ["Stable plan hash", plan.planHash], ["Condiciones de detención", plan.stopConditions],
  ];
  for (const [label, value] of fields) appendLine(container, label, value);
}

export function renderFresh(fresh, container) {
  container.replaceChildren();
  if (!fresh) { appendLine(container, "Estado", "Todavía no existe blockhash final; se obtendrá después de Review y confirmación."); return; }
  const fields = [["Stable plan hash", fresh.stablePlanHash], ["Blockhash", fresh.blockhash], ["Last valid block height", fresh.lastValidBlockHeight], ["Block height actual", fresh.currentBlockHeight], ["Margen restante", fresh.remainingBlockHeights], ["Margen firma", fresh.signatureMarginRequired], ["Margen Send", fresh.sendMarginRequired], ["Firma permitida", fresh.canRequestSignature], ["Send permitido", fresh.canSend], ["Fee exacto", fresh.feeLamports], ["Balance antes", fresh.balanceBeforeLamports], ["Balance estimado después", fresh.expectedBalanceAfterLamports], ["Message hash", fresh.messageHash], ["Simulación", fresh.simulation.logs], ["Unidades", fresh.simulation.unitsConsumed]];
  for (const [label, value] of fields) appendLine(container, label, value);
}

export function initializeMetadataPage(documentRef = document, provider = window.phantom?.solana) {
  const elements = {
    connect: documentRef.querySelector("#connect"), build: documentRef.querySelector("#build"), review: documentRef.querySelector("#review"), prepare: documentRef.querySelector("#prepare"),
    requestSignature: documentRef.querySelector("#request-signature"), send: documentRef.querySelector("#send"), verify: documentRef.querySelector("#verify"), cancel: documentRef.querySelector("#cancel"),
    status: documentRef.querySelector("#status"), plan: documentRef.querySelector("#plan"), fresh: documentRef.querySelector("#fresh-transaction"), validity: documentRef.querySelector("#validity"), prepareGate: documentRef.querySelector("#prepare-gate"), tokenDebug: documentRef.querySelector("#confirmation-token-debug"), signatureValidity: documentRef.querySelector("#signature-validity"), signatureGate: documentRef.querySelector("#signature-gate"),
    firstConfirm: documentRef.querySelector("#first-confirm"), sendConfirm: documentRef.querySelector("#send-confirm"), token: documentRef.querySelector("#confirmation-token"), gate: documentRef.querySelector("#execution-gate"), blocked: documentRef.querySelector("#blocked-operations"),
  };
  const state = { wallet: null, session: null, bootstrap: null, serverSession: null, busy: false };
  for (const operation of BLOCKED_OPERATIONS) { const item = documentRef.createElement("li"); item.textContent = `${operation} — bloqueada`; elements.blocked.append(item); }
  const setStatus = (message, tone = "neutral") => { elements.status.textContent = message; elements.status.dataset.tone = tone; };
  const common = () => ({ sessionId: state.session.sessionId, connectedWallet: state.wallet, planHash: state.session.plan.planHash });
  const walletStillMatches = () => { const value = provider?.publicKey?.toString(); assertWallet(value); if (value !== state.wallet) throw new Error("La wallet conectada cambió."); };
  const restoreReviewedSession = (serverSession) => {
    if (!serverSession?.hasSession || serverSession.status !== "plan_reviewed" || serverSession.planReviewed !== true) return false;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem("avicoin.create-metadata.public") ?? "null"); } catch { return false; }
    if (!saved || saved.sessionId !== serverSession.sessionId || saved.planHash !== serverSession.planHash || saved.mint !== MINT_ADDRESS || saved.metadataPda !== METADATA_PDA || saved.messageHash !== null || saved.signature !== null) return false;
    state.serverSession = serverSession;
    state.session = { sessionId: serverSession.sessionId, status: serverSession.status, planReviewed: true, plan: { planHash: serverSession.planHash, mintAddress: saved.mint, metadataPda: saved.metadataPda }, freshTransaction: null, signature: null, expectedSignature: null };
    elements.plan.replaceChildren(); appendLine(elements.plan, "Sesión restaurada", serverSession.sessionId); appendLine(elements.plan, "Stable plan hash", serverSession.planHash); appendLine(elements.plan, "Mint", saved.mint); appendLine(elements.plan, "Metadata PDA", saved.metadataPda); appendLine(elements.plan, "Review autoritativo", true);
    renderFresh(null, elements.fresh);
    return true;
  };
  const refresh = () => {
    const status = state.session?.status; const fresh = state.session?.freshTransaction;
    const tokenDiagnostics = diagnoseConfirmationToken(elements.token.value);
    const tokenExact = tokenDiagnostics.matches;
    const walletMatches = state.wallet === PRODUCTION_WALLET && provider?.publicKey?.toString() === PRODUCTION_WALLET;
    const serverSessionMatches = Boolean(state.session && state.serverSession?.sessionId === state.session.sessionId);
    const stablePlanHashMatches = Boolean(state.session?.plan?.planHash && state.serverSession?.planHash === state.session.plan.planHash);
    const planReviewed = serverSessionMatches && stablePlanHashMatches && state.serverSession?.planReviewed === true;
    const checks = {
      connected: Boolean(state.wallet), walletMatches, planBuilt: Boolean(state.session), planReviewed,
      confirmationTokenMatches: tokenExact, firstConfirmationChecked: elements.firstConfirm.checked,
      stablePlanHashMatches, metadataPdaStillAbsent: state.bootstrap?.preflight?.metadataPdaStillAbsent === true,
      mintInvariantsValid: state.bootstrap?.preflight?.mintInvariantsValid === true,
      publicMetadataHashMatches: state.bootstrap?.preflight?.publicMetadataHashMatches === true,
      allowMainnetSessionEnabled: state.bootstrap?.executionEnabled === true,
      operationEqualsCreateMetadata: state.bootstrap?.selectedOperation === ENABLED_OPERATION,
      serverSessionMatches,
    };
    const canPrepare = Object.values(checks).every(Boolean);
    const cancellable = ["plan_built", "plan_reviewed", "fresh_message_prepared", "simulated", "signature_requested", "signed"].includes(status);
    elements.build.disabled = state.busy || !state.wallet || Boolean(state.session);
    elements.review.disabled = state.busy || status !== "plan_built";
    elements.prepare.disabled = state.busy || !canPrepare;
    const signatureGate = deriveMetadataSignatureGate({ busy: state.busy, status, serverStatus: state.serverSession?.status, serverSessionMatches, stablePlanHashMatches, serverPlanReviewed: state.serverSession?.planReviewed === true, fresh, tokenExact, firstConfirmationChecked: elements.firstConfirm.checked, executionEnabled: state.bootstrap?.executionEnabled === true });
    elements.requestSignature.disabled = !signatureGate.enabled;
    const sendConfirmationEnabled = isSendConfirmationEnabled({ busy: state.busy, status, serverStatus: state.serverSession?.status, expectedSignature: state.session?.expectedSignature });
    elements.sendConfirm.disabled = state.busy || !sendConfirmationEnabled;
    if (!sendConfirmationEnabled) elements.sendConfirm.checked = false;
    elements.send.disabled = state.busy || status !== "signed" || !fresh?.canSend || !tokenExact || !elements.sendConfirm.checked || !state.bootstrap?.executionEnabled;
    elements.verify.disabled = state.busy || !["sent", "ambiguous"].includes(status);
    elements.cancel.disabled = state.busy || !cancellable;
    elements.prepareGate.replaceChildren();
    for (const [name, passed] of Object.entries(checks)) appendLine(elements.prepareGate, name, passed ? "PASS" : "BLOCKED");
    const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    elements.validity.textContent = fresh ? (!fresh.canRequestSignature ? "Blockhash sin margen; prepara uno nuevo antes de Send." : `Mensaje fresco: ${fresh.remainingBlockHeights} block heights restantes.`) : blockers.length ? `Prepare bloqueado por: ${blockers.join(", ")}.` : "Prepare habilitado; todavía no existe blockhash final.";
    elements.tokenDebug.replaceChildren();
    appendLine(elements.tokenDebug, "Token esperado", JSON.stringify(tokenDiagnostics.expected));
    appendLine(elements.tokenDebug, "Token recibido", JSON.stringify(tokenDiagnostics.received));
    appendLine(elements.tokenDebug, "Longitud esperada", tokenDiagnostics.expectedLength);
    appendLine(elements.tokenDebug, "Longitud recibida", tokenDiagnostics.receivedLength);
    appendLine(elements.tokenDebug, "Unicode esperado", tokenDiagnostics.expectedUnicode);
    appendLine(elements.tokenDebug, "Unicode recibido", tokenDiagnostics.receivedUnicode || "<empty>");
    appendLine(elements.tokenDebug, "Primera diferencia", tokenDiagnostics.firstDifference);
    appendLine(elements.tokenDebug, "trim()", `${JSON.stringify(tokenDiagnostics.trimmed)}; coincide=${tokenDiagnostics.trimmedMatches}`);
    appendLine(elements.tokenDebug, "trim() + NFC", `${JSON.stringify(tokenDiagnostics.nfc)}; coincide=${tokenDiagnostics.nfcMatches}`);
    appendLine(elements.tokenDebug, "trim() + NFKC (sólo diagnóstico)", `${JSON.stringify(tokenDiagnostics.nfkc)}; coincide=${tokenDiagnostics.nfkcMatches}`);
    appendLine(elements.tokenDebug, "Condición exacta", `${tokenDiagnostics.condition} => ${tokenDiagnostics.matches}`);
    elements.signatureGate.replaceChildren();
    for (const [name, passed] of Object.entries(signatureGate.checks)) appendLine(elements.signatureGate, name, passed ? "PASS" : "BLOCKED");
    const signatureBlockers = Object.entries(signatureGate.checks).filter(([, passed]) => !passed).map(([name]) => name);
    elements.signatureValidity.textContent = signatureGate.enabled ? "Request signature habilitado para el mensaje recién simulado." : `Request signature bloqueado por: ${signatureBlockers.join(", ") || "operación en curso"}.`;
  };
  const run = async (work) => { if (state.busy) return; state.busy = true; refresh(); try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : "Error local.", "error"); } finally { state.busy = false; refresh(); } };
  const acceptSession = (session, message, tone = "success") => {
    state.session = session; state.serverSession = { sessionId: session.sessionId, status: session.status, planHash: session.plan.planHash, planReviewed: session.planReviewed }; renderMetadataPlan(session.plan, elements.plan); renderFresh(session.freshTransaction, elements.fresh);
    sessionStorage.setItem("avicoin.create-metadata.public", JSON.stringify({ sessionId: session.sessionId, mint: session.plan.mintAddress, metadataPda: session.plan.metadataPda, planHash: session.plan.planHash, messageHash: session.freshTransaction?.messageHash ?? null, signature: session.signature ?? session.expectedSignature }));
    if (message) setStatus(message, tone); refresh();
  };
  elements.connect.addEventListener("click", () => run(async () => {
    state.wallet = await connectForMetadata(provider); state.bootstrap = await api("/api/bootstrap");
    if (state.bootstrap.productionWallet !== state.wallet || state.bootstrap.selectedOperation !== ENABLED_OPERATION) throw new Error("Configuración local incorrecta.");
    const serverSession = await api("/api/session-status");
    const restored = restoreReviewedSession(serverSession);
    elements.gate.textContent = state.bootstrap.executionEnabled ? "Autorización temporal activa sólo para create-metadata." : "ALLOW_MAINNET=false: Prepare, firma y Send bloqueados.";
    setStatus(`${restored ? "Misma sesión plan_reviewed restaurada y verificada. " : ""}Wallet verificada: ${state.wallet}. No se solicitó firma.`, "success");
  }));
  elements.build.addEventListener("click", () => run(async () => { walletStillMatches(); const session = await api("/api/build", { connectedWallet: state.wallet, operation: ENABLED_OPERATION }); acceptSession(session, `Plan estable creado para PDA ${session.plan.metadataPda}; sin blockhash final.`); }));
  elements.review.addEventListener("click", () => run(async () => { walletStillMatches(); acceptSession(await api("/api/review", common()), "Plan estable revisado. Confirma Mainnet, mint, PDA, URI, mutable=true y supply 0."); }));
  elements.prepare.addEventListener("click", () => run(async () => { walletStillMatches(); const prior = state.session?.expectedSignature; const session = await api("/api/prepare", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.firstConfirm.checked }); acceptSession(session, `${prior || session.signatureInvalidated ? "Firma anterior invalidada; no enviada. " : ""}Mensaje metadata fresco simulado. Firma requerida ahora.`); }));
  elements.requestSignature.addEventListener("click", () => run(async () => {
    walletStillMatches(); const payload = await api("/api/signing-payload", { ...common(), confirmationToken: elements.token.value, explicitlyConfirmed: elements.firstConfirm.checked });
    if (payload.planHash !== state.session.plan.planHash || payload.messageHash !== state.session.freshTransaction?.messageHash) throw new Error("Payload distinto del plan y mensaje revisados.");
    const transaction = VersionedTransaction.deserialize(fromBase64(payload.transactionBase64));
    try {
      const signed = await provider.signTransaction(transaction);
      acceptSession(await api("/api/signed", { ...common(), messageHash: payload.messageHash, transactionBase64: toBase64(signed.serialize()) }), "Phantom firmó exactamente una transacción metadata. Send inmediatamente.");
    } catch (error) {
      try {
        const recovered = await api("/api/signature-aborted", common());
        acceptSession(recovered, recovered.status === "simulated" ? "Phantom no devolvió firma. Solicitud revertida; el mensaje conserva margen y puede solicitarse otra vez." : "Phantom no devolvió firma y el blockhash perdió margen. Mensaje invalidado; vuelve a Prepare.", "error");
      } catch { /* El polling mostrará signed si Phantom sí alcanzó a devolverla al servidor. */ }
      throw error;
    }
  }));
  elements.send.addEventListener("click", () => {
    const explicitlyConfirmed = elements.sendConfirm.checked;
    const confirmationToken = elements.token.value;
    return run(async () => { walletStillMatches(); const session = await api("/api/send", { ...common(), confirmationToken, explicitlyConfirmed }); acceptSession(session, `Send único realizado. Firma: ${session.signature}. Verifica finalized.`); });
  });
  elements.verify.addEventListener("click", () => run(async () => { walletStillMatches(); const session = await api("/api/verify", common()); acceptSession(session, session.status === "finalized" ? "Finalized PASS: metadata y mint releídos exactamente." : "Resultado ambiguo: no reintentes ni reconstruyas.", session.status === "finalized" ? "success" : "error"); }));
  elements.cancel.addEventListener("click", () => run(async () => { walletStillMatches(); const session = await api("/api/cancel", common()); acceptSession(session, "Sesión metadata cancelada."); sessionStorage.removeItem("avicoin.create-metadata.public"); }));
  for (const event of ["input", "change"]) {
    elements.firstConfirm.addEventListener(event, refresh); elements.sendConfirm.addEventListener(event, refresh); elements.token.addEventListener(event, refresh);
  }
  window.setInterval(() => { void api("/api/session-status").then((serverSession) => { state.serverSession = serverSession; refresh(); }).catch((error) => setStatus(error instanceof Error ? error.message : "No se pudo sincronizar la sesión.", "error")); }, 1_000);
  window.setInterval(() => { if (state.busy || !["simulated", "signature_requested", "signed"].includes(state.session?.status)) return; void api("/api/fresh-status", common()).then((session) => acceptSession(session, null)).catch((error) => setStatus(error instanceof Error ? error.message : "No se actualizó block height.", "error")); }, 5_000);
  refresh(); return { state, refresh };
}

if (typeof window !== "undefined" && typeof document !== "undefined") initializeMetadataPage();
