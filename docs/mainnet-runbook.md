# Runbook de lanzamiento Mainnet AVICOIN

Estado: preparación; **ningún paso transaccional ha sido ejecutado**. Cada operación requiere una aprobación separada, `ALLOW_MAINNET=true`, `AVICOIN_MAINNET_OPERATION=<operación exacta>`, dry-run fresco y confirmación interactiva.

`--dry-run` simula y termina siempre sin firmar. Cuando un plan contiene signers efímeros (por ejemplo, una posición Orca), `--execute-after-dry-run` simula, escribe/verifica el recibo del hash exacto de las instrucciones y sólo entonces pide confirmación para ejecutar ese mismo plan en memoria. No debe usarse sin la aprobación final de esa operación.

1. Designar wallet dedicada fuera del repositorio.
2. Configurar únicamente su public key esperada y proveedor/ruta externa de firma.
3. Depositar SOL mediante un procedimiento externo aprobado.
4. Depositar exactamente el presupuesto autorizado, máximo 10 USDC oficiales.
5. Ejecutar preflight read-only: genesis, RPC, balances, programas, estado y metadata HTTPS.
6. Crear el mint de 9 decimales, supply 0 y freeze authority `none` (`create-mint`).
7. Releer el mint, registrar dirección confirmada y crear metadata inmutable (`create-metadata`).
8. Releer metadata y emitir una sola vez 1,000 AVI (`mint-fixed-supply`).
9. Releer supply y revocar únicamente mint authority (`revoke-mint-authority`).
10. Confirmar supply, decimales, authorities, metadata y ATA contra on-chain.
11. Detectar pools y cotizar diseño AVI/USDC sin firmar.
12. Crear pool sólo si no existe el par/fee tier (`create-pool`).
13. Abrir posición en operación separada (`open-position`).
14. Depositar liquidez sin exceder 1,000 AVI/10 USDC (`increase-liquidity`).
15. Cotizar compra educativa máxima de 0.10 USDC y exigir price impact ≤10%.
16. Ejecutarla sólo con segunda wallet autorizada (`test-swap`) y vender de regreso únicamente lo recibido.
17. Releer y documentar firmas, slots, balances, invariantes, remanentes y estado final.

Ante timeout o resultado incierto, no se reintenta creando otro recurso: se conserva la dirección esperada, se consulta on-chain y se detiene. Nunca se confía sólo en el estado local.
