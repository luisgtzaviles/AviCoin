# Runbook de lanzamiento Mainnet AVICOIN

Estado: `create-mint` y `create-metadata` fueron ejecutados una sola vez y finalizaron correctamente. La configuración persistente conserva `ALLOW_MAINNET=false`; **no repetir ninguna de esas operaciones**.

Mint definitivo: [`GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`](https://explorer.solana.com/address/GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC). Evidencia: [mainnet-token.md](mainnet-token.md).

Metadata definitiva: [`4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2`](https://explorer.solana.com/address/4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2). Evidencia: [mainnet-metadata.md](mainnet-metadata.md).

## Diagnóstico local de conexión Phantom

1. Conservar `ALLOW_MAINNET=false` e iniciar únicamente el diagnóstico con `pnpm phantom:diagnose`.
2. Abrir manualmente la URL loopback mostrada en la terminal en el perfil normal de Chrome donde Phantom está instalado y desbloqueado.
3. Nunca usar perfiles automatizados, previews, webviews, iframes ni instancias temporales del navegador para esta comprobación.
4. Pulsar `Connect Phantom` sólo después de que la página detecte el proveedor. El diagnóstico únicamente valida la public key; no autoriza, construye ni firma operaciones.

## Revisión sin firma

1. Ejecutar `pnpm mainnet:preflight-plan` y revisar genesis, wallet, balances, metadata, costos y hashes.
2. Para revisar la UI sin habilitar firma, iniciar una sesión local con `AVICOIN_MAINNET_OPERATION=create-mint` y `ALLOW_MAINNET=false`.
3. Abrir exclusivamente la dirección `127.0.0.1` mostrada por el proceso y conectar Phantom.
4. Confirmar que la wallet sea `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
5. Usar `Build stable plan` y `Review stable plan`. El plan no obtiene blockhash ni construye todavía el mensaje final. `Prepare fresh transaction`, `Request signature` y `Send` deben permanecer deshabilitados.

## Procedimiento histórico de la sesión autorizada

Estas variables se establecieron únicamente durante la vida del proceso y no se guardaron en `.env`:

- `SOLANA_NETWORK=mainnet-beta`;
- RPC Mainnet HTTPS sin credenciales;
- `AVICOIN_MAINNET_OPERATION=create-mint`;
- `ALLOW_MAINNET=true`;
- `AVICOIN_CONFIRMATION_TOKEN=CONFIRMO-MAINNET-RECURSO-PERMANENTE`, únicamente como autorización efímera del proceso.

El proceso fue detenido después de `finalized`, retirando la autorización. Este bloque queda como evidencia operativa y no autoriza una segunda ejecución.

## Flujo manual ejecutado

1. **Connect**: Phantom solicita únicamente compartir la public key. No se firma nada.
2. **Build stable plan**: el servidor relee estado, genesis y balance; genera una sola vez el keypair de mint en memoria; y muestra la public key propuesta, programas, instrucciones, cuentas, signers, renta, fee aproximado y hash canónico. Todavía no obtiene blockhash ni mensaje final.
3. **Review stable plan**: congela la semántica y permite revisar el plan sin riesgo de expiración.
4. **Token de confirmación**: escribir `CONFIRMO-MAINNET-RECURSO-PERMANENTE` y marcar la primera confirmación manual.
5. **Prepare fresh transaction / Simulate**: vuelve a validar la configuración y estado, obtiene el blockhash más reciente, construye el mensaje V0 con el mismo mint, calcula fee/hash exactos y simula exactamente ese mensaje.
6. **Request signature**: hacerlo inmediatamente. El servidor exige al menos 40 block heights de margen; Phantom firma el mensaje simulado y el servidor verifica Ed25519, payer, signers, blockhash y hash exactos. Todavía no se envía.
7. **Aprobar Phantom**: si la aprobación llega con menos de 20 block heights restantes, la firma y el mensaje se invalidan sin enviarse.
8. **Segunda confirmación**: aprobar explícitamente el envío del mismo mensaje firmado.
9. **Send**: hacerlo inmediatamente. Vuelve a verificar un margen mínimo de 20 block heights, configuración, genesis, estado, plan, firmas y ausencia de la cuenta; fija el lock antes del RPC y envía una sola vez con `maxRetries: 0`.
10. **Verify finalized state**: espera `finalized`, relee owner SPL Token Program, decimales 9, supply 0, mint authority de producción y freeze authority `none`. Sólo después registra el mint como creado.

## Vigencia y refresh previo al envío

El block height del RPC es la autoridad; el tiempo de reloj sólo identifica cuándo se preparó el recibo en memoria. La [guía oficial de confirmación de Solana](https://solana.com/developers/guides/advanced/confirmation) describe una edad máxima de procesamiento de 150 y una cola de 151 blockhashes recientes, por lo que este flujo reserva 40 para iniciar la firma y 20 para aceptar/enviar. Los márgenes son deliberadamente conservadores frente al tiempo de aprobación manual y propagación.

Antes del primer intento de envío se puede pulsar nuevamente `Prepare fresh transaction`. El servidor invalida cualquier firma anterior, conserva el mismo keypair y public key del mint, obtiene otro blockhash y vuelve a construir y simular. El stable plan hash no cambia; sólo cambian blockhash, last valid block height, fee exacto y message hash.

Después de que `Send` fija `send_locked`, o si el resultado es `sent` o `ambiguous`, todo refresh queda prohibido. Una firma expirada nunca se envía y una operación ya contactada con el RPC nunca se reconstruye automáticamente.

## Fallos y resultados ambiguos

No existe reintento automático. La máquina de estados es `plan_built → plan_reviewed → fresh_message_prepared → simulated → signature_requested → signed → send_locked → sent → finalized`; `ambiguous` y `cancelled` son salidas explícitas. El primer intento de envío fija un bloqueo en memoria antes de llamar al RPC. Una ficha de recuperación local contiene sólo datos públicos —dirección esperada, firma, blockhash y hashes— y está ignorada por Git; nunca contiene keypair o transacción serializada. Ante timeout se consulta la firma y esa dirección, no se genera un mint sustituto.

La sesión posterior de `create-metadata` reutilizó la misma máquina de estados sin material custodial. El mensaje final incluyó un presupuesto determinístico de cómputo, fue simulado y firmado exactamente una vez, enviado con `maxRetries: 0` y verificado en `finalized`. La metadata pública se actualizó después, sin cambiar su URL.

ATA, emisión, revocación, pool, posición, liquidez y swaps permanecen bloqueados. La retención de mint authority no garantiza supply fijo ni habilita emisiones adicionales.
