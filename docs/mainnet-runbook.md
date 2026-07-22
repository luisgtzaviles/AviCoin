# Runbook de lanzamiento Mainnet AVICOIN

Estado: adaptador Phantom disponible sólo para `create-mint`; **ninguna firma ni transacción Mainnet ha sido ejecutada**. La configuración persistente conserva `ALLOW_MAINNET=false`.

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
5. Usar `Build`, `Simulate` y `Review`. `Request signature` y `Send` deben permanecer deshabilitados.

## Sesión futura expresamente autorizada

No guardar estas variables en `.env`, archivos o historial compartido. Para una ejecución aprobada, establecer únicamente durante la vida del proceso:

- `SOLANA_NETWORK=mainnet-beta`;
- RPC Mainnet HTTPS sin credenciales;
- `AVICOIN_MAINNET_OPERATION=create-mint`;
- `ALLOW_MAINNET=true`;
- un `AVICOIN_CONFIRMATION_TOKEN` efímero de al menos 16 caracteres.

Detener el proceso al concluir para retirar la autorización.

## Flujo manual obligatorio

1. **Connect**: Phantom solicita únicamente compartir la public key. No se firma nada.
2. **Build**: el servidor relee estado/genesis/balance, genera un keypair de mint sólo en memoria y construye `SystemProgram.createAccount` más `initializeMint2`. Muestra mint esperado, programas, cuentas, signers, rentas, fee, balance y hashes.
3. **Simulate**: simula el mismo mensaje con verificación de firmas deshabilitada. El dry-run dura diez minutos.
4. **Review**: congela el plan y obliga a revisar operación, red, wallet, instrucciones, cambios y condiciones de detención.
5. **Request signature**: requiere el token efímero y una casilla explícita. Phantom firma el mensaje ya simulado; el servidor verifica Ed25519 y que el mensaje/hash no cambió. Todavía no se envía.
6. **Send**: exige una segunda casilla, vuelve a comprobar configuración, genesis, estado, blockhash, plan, firmas y ausencia de la cuenta. Envía una sola vez con reintentos RPC automáticos deshabilitados.
7. **Verify finalized state**: espera `finalized`, relee owner SPL Token Program, decimales 9, supply 0, mint authority de producción y freeze authority `none`. Sólo después registra el mint como creado.

## Fallos y resultados ambiguos

No existe reintento automático. El primer intento de envío fija un bloqueo en memoria antes de llamar al RPC. Una ficha de recuperación local contiene sólo datos públicos —dirección esperada, firma, blockhash y hashes— y está ignorada por Git; nunca contiene keypair o transacción serializada. Ante timeout se consulta la firma y esa dirección, no se genera un mint sustituto.

`create-metadata`, ATA, emisión, revocación, pool, posición, liquidez y swaps permanecen bloqueados. La retención de mint authority no garantiza supply fijo ni habilita emisiones adicionales.
