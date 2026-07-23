# AVICOIN Mainnet Readiness

Estado: **mint Mainnet creado y verificado; metadata, ATA, supply y recursos Orca pendientes**.

## Preparado y validado

- Wallet pública Phantom de producción: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`. No se registran seed, clave privada, export ni ruta de keypair.
- Mainnet separado de devnet, genesis exacto `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, RPC Mainnet, USDC oficial y programas oficiales fijados.
- Metadata pública: `https://avicoin.avicell.com.mx/metadata-mainnet.json`, SHA-256 `80b7c815d346a66ac8572df04b06d1781b79c42da4631ced2cc94f0983d962f2`.
- Supply inicial: `1,000 AVI` / `1,000,000,000,000` unidades base; una sola emisión autorizada cuando supply sea 0.
- Supply máximo permanente: `null` / undecided. No existe autorización para emisiones posteriores en la etapa actual.
- Mint authority: `retained_temporarily`; freeze authority: `none` permanentemente.
- El gate del pool admite `retained_temporarily` y la política futura `revoked`, pero exige invariantes on-chain exactas y rechaza cualquier política desconocida.
- Mint definitivo: `GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`, creado en slot `434607364` y releído en `finalized` con owner SPL Token Program, 9 decimales, supply 0, mint authority de producción y freeze authority `none`.
- `ALLOW_MAINNET=false`; sin operación persistente autorizada; transacciones Mainnet: 1; firmas Phantom: 1. `create-mint` no debe repetirse.
- Servidor limitado a `127.0.0.1`, UI autocontenida sin CDN, CSP local y proveedor oficial `window.phantom.solana`.
- Flujo separado `Build stable plan → Review → confirmación → Prepare fresh transaction / Simulate → Request signature → Send → Verify finalized state`, con token efímero y dos confirmaciones explícitas.
- Keypair del mint generado sólo en memoria; únicamente su dirección pública y hashes pueden conservarse para resolver un estado ambiguo.
- `Build` no solicita blockhash: el stable plan hash cubre la semántica completa y puede revisarse sin expiración. `Prepare` conserva el mismo mint, obtiene el blockhash más reciente, calcula el fee exacto y simula el mensaje final.
- El mensaje firmable no se entrega antes de una simulación fresca. Se exigen 40 block heights para solicitar firma y 20 para aceptar/enviar; el servidor verifica las firmas de Phantom y del mint contra el mismo mensaje, blockhash y plan.
- Un refresh sólo está permitido antes de `send_locked`: invalida firma y mensaje anteriores, pero nunca regenera el mint. Tras contactar el RPC o quedar ambiguo se bloquean refresh, reenvío y mint sustituto.

## Preflight y costo observado

El preflight SDK del 2026-07-22 releyó `0.339564219 SOL`, `10.89983 USDC` oficial, genesis y metadata pública exacta. Create-mint consumió `0.001471600 SOL`: `0.001461600 SOL` de renta y `0.000010000 SOL` de fee. El saldo final verificado fue `0.338092619 SOL`. Los costos de operaciones posteriores deben recotizarse antes de cualquier autorización independiente.

## Alcance operativo

La operación `create-mint` concluyó y no debe ejecutarse nuevamente. `create-metadata`, `mint-fixed-supply`, pool, posición, liquidez y swaps continúan bloqueados y requieren autorizaciones futuras separadas. La configuración persistente continúa en `ALLOW_MAINNET=false`.

La verificación final confirmó exactamente dos instrucciones —System Program `createAccount` y SPL Token `initializeMint2`— y ningún error. Metadata PDA y ATA de producción no existen; AVI emitidos, pool, posición y swaps permanecen en cero. La evidencia completa está en [mainnet-token.md](mainnet-token.md).
