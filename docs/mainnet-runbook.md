# Runbook de lanzamiento Mainnet AVICOIN

Estado: preparación unsigned; **ningún paso transaccional ha sido ejecutado**. `ALLOW_MAINNET=false` y la firma Phantom permanece pendiente.

## Sesión actual permitida

1. Ejecutar `pnpm mainnet:preflight-plan`.
2. Releer genesis, wallet, SOL, USDC oficial y metadata pública.
3. Revisar el plan de diez pasos, sus hashes, cuentas, signers requeridos, dependencias, rentas, fees y condiciones de detención.
4. No crear recibos de autorización, no firmar y no enviar.

## Secuencia futura, sujeta a aprobación independiente

1. Conectar Phantom y exigir exactamente `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
2. Crear mint con 9 decimales, supply 0 y freeze authority `none`. El mint signer será efímero y sólo en memoria durante esa sesión; su secreto no se persiste ni se imprime.
3. Esperar `finalized`, releer la dirección generada y detenerse ante cualquier resultado ambiguo. Nunca crear automáticamente un segundo mint.
4. Crear metadata on-chain inmutable usando exclusivamente la URI pública aprobada y releerla.
5. Crear ATA AVI de producción.
6. Emitir una sola vez exactamente `1,000 AVI` sólo si supply es 0 y el contador de emisiones completadas es 0.
7. Verificar que la mint authority permanece en la wallet de producción y freeze authority es `none`. La revocación no forma parte del lanzamiento; queda como operación futura separada.
8. Detectar y cotizar el pool AVI/USDC oficial. Crear pool, posición y liquidez sólo después de que el gate on-chain completo pase.
9. Cotizar una compra educativa máxima de `0.10 USDC` y su venta de regreso; cada envío requiere aprobación Phantom independiente.

Ante timeout o resultado incierto se consulta la dirección previamente generada y se detiene. No se reintenta creando recursos alternativos. La retención de mint authority no garantiza un supply fijo y no habilita emisiones adicionales.
