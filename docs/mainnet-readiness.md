# AVICOIN Mainnet Readiness

Estado: **adaptador Phantom `create-mint` implementado y validado; ningún recurso Mainnet creado**.

## Preparado y validado

- Wallet pública Phantom de producción: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`. No se registran seed, clave privada, export ni ruta de keypair.
- Mainnet separado de devnet, genesis exacto `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, RPC Mainnet, USDC oficial y programas oficiales fijados.
- Metadata pública: `https://avicoin.avicell.com.mx/metadata-mainnet.json`, SHA-256 `80b7c815d346a66ac8572df04b06d1781b79c42da4631ced2cc94f0983d962f2`.
- Supply inicial: `1,000 AVI` / `1,000,000,000,000` unidades base; una sola emisión autorizada cuando supply sea 0.
- Supply máximo permanente: `null` / undecided. No existe autorización para emisiones posteriores en la etapa actual.
- Mint authority: `retained_temporarily`; freeze authority: `none` permanentemente.
- El gate del pool admite `retained_temporarily` y la política futura `revoked`, pero exige invariantes on-chain exactas y rechaza cualquier política desconocida.
- `ALLOW_MAINNET=false`; sin operación persistente autorizada; transacciones y firmas: 0.
- Servidor limitado a `127.0.0.1`, UI autocontenida sin CDN, CSP local y proveedor oficial `window.phantom.solana`.
- Flujo separado `Build stable plan → Review → confirmación → Prepare fresh transaction / Simulate → Request signature → Send → Verify finalized state`, con token efímero y dos confirmaciones explícitas.
- Keypair del mint generado sólo en memoria; únicamente su dirección pública y hashes pueden conservarse para resolver un estado ambiguo.
- `Build` no solicita blockhash: el stable plan hash cubre la semántica completa y puede revisarse sin expiración. `Prepare` conserva el mismo mint, obtiene el blockhash más reciente, calcula el fee exacto y simula el mensaje final.
- El mensaje firmable no se entrega antes de una simulación fresca. Se exigen 40 block heights para solicitar firma y 20 para aceptar/enviar; el servidor verifica las firmas de Phantom y del mint contra el mismo mensaje, blockhash y plan.
- Un refresh sólo está permitido antes de `send_locked`: invalida firma y mensaje anteriores, pero nunca regenera el mint. Tras contactar el RPC o quedar ambiguo se bloquean refresh, reenvío y mint sustituto.

## Preflight read-only y costos observados

El preflight SDK del 2026-07-22 releyó `0.071933519 SOL`, `10.89983 USDC` oficial, genesis y metadata. El cálculo de rentas por tamaños de cuenta estima `0.167431040 SOL` mínimo y `0.239907680 SOL` máximo antes de margen. Con margen recomendado de 25%, el techo es `0.299884600 SOL`; el saldo quedaría en `-0.227951081 SOL`, por lo que **se requiere más SOL antes de cualquier lanzamiento**. Los tick arrays dominan la estimación y deben recotizarse según cuentas ya existentes.

## Alcance operativo

Sólo `create-mint` tiene adaptador. `create-metadata`, `mint-fixed-supply`, pool, posición, liquidez y swaps continúan bloqueados. El proceso local no lee `.env`: una ejecución futura autorizada debe recibir `ALLOW_MAINNET=true`, `AVICOIN_MAINNET_OPERATION=create-mint` y un token de confirmación de al menos 16 caracteres únicamente como variables de esa sesión. La configuración persistente continúa en `ALLOW_MAINNET=false`.

Después del envío no existe reintento automático. Se espera `finalized`, se verifica owner SPL Token Program, 9 decimales, supply 0, mint authority exacta y freeze authority `none`; sólo entonces se actualiza el estado público. Un timeout conserva una ficha pública ignorada por Git con dirección esperada, firma y hashes, bloquea un segundo mint y exige resolución manual. Mint, metadata on-chain, ATA AVI, supply, pool, posición y swaps permanecen sin crear.
