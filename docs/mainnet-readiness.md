# AVICOIN Mainnet Readiness

Estado: **mint, metadata y ATA Mainnet creados y verificados; supply y recursos Orca pendientes**.

## Preparado y validado

- Wallet pública Phantom de producción: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`. No se registran seed, clave privada, export ni ruta de keypair.
- Mainnet separado de devnet, genesis exacto `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, RPC Mainnet, USDC oficial y programas oficiales fijados.
- Metadata pública: `https://avicoin.avicell.com.mx/metadata-mainnet.json`, SHA-256 actual `f3d87b8c254b190218a2a8b94630b8ef764555b18ce72ba657f1b2677daffb90`.
- Supply inicial: `1,000 AVI` / `1,000,000,000,000` unidades base; una sola emisión autorizada cuando supply sea 0.
- Supply máximo permanente: `null` / undecided. No existe autorización para emisiones posteriores en la etapa actual.
- Mint authority: `retained_temporarily`; freeze authority: `none` permanentemente.
- El gate del pool admite `retained_temporarily` y la política futura `revoked`, pero exige invariantes on-chain exactas y rechaza cualquier política desconocida.
- Mint definitivo: `GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`, creado en slot `434607364` y releído en `finalized` con owner SPL Token Program, 9 decimales, supply 0, mint authority de producción y freeze authority `none`.
- Metadata PDA `4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2`, creada en slot `434620903` y releída en `finalized` con owner Metaplex, identidad, URI, seller fee, mutabilidad y update authority exactos.
- ATA oficial `H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE`, creada en slot `434624296` y releída en `finalized` con owner SPL Token Program, wallet de producción, mint AVICOIN y balance `0 AVI`.
- `ALLOW_MAINNET=false`; sin operación persistente autorizada; transacciones Mainnet: 3; firmas Phantom: 3. `create-mint`, `create-metadata` y `create-ata` no deben repetirse.
- Servidor limitado a `127.0.0.1`, UI autocontenida sin CDN, CSP local y proveedor oficial `window.phantom.solana`.
- Flujo separado `Build stable plan → Review → confirmación → Prepare fresh transaction / Simulate → Request signature → Send → Verify finalized state`, con token efímero y dos confirmaciones explícitas.
- Keypair del mint generado sólo en memoria; únicamente su dirección pública y hashes pueden conservarse para resolver un estado ambiguo.
- `Build` no solicita blockhash: el stable plan hash cubre la semántica completa y puede revisarse sin expiración. `Prepare` conserva el mismo mint, obtiene el blockhash más reciente, calcula el fee exacto y simula el mensaje final.
- El mensaje firmable no se entrega antes de una simulación fresca. Se exigen 40 block heights para solicitar firma y 20 para aceptar/enviar; el servidor verifica las firmas de Phantom y del mint contra el mismo mensaje, blockhash y plan.
- Un refresh sólo está permitido antes de `send_locked`: invalida firma y mensaje anteriores, pero nunca regenera el mint. Tras contactar el RPC o quedar ambiguo se bloquean refresh, reenvío y mint sustituto.

## Preflight y costo observado

El preflight SDK del 2026-07-22 releyó `0.339564219 SOL`, `10.89983 USDC` oficial y el genesis exacto. Create-mint consumió `0.001471600 SOL`. Create-metadata consumió `0.015120800 SOL`: `0.015115600 SOL` para la cuenta y `0.000005200 SOL` de fee. Create-ata consumió después `0.002044380 SOL`: `0.002039280 SOL` para la cuenta y `0.000005100 SOL` de fee. El saldo posterior fue `0.320927439 SOL`. Los costos de operaciones posteriores deben recotizarse antes de cualquier autorización independiente.

## Alcance operativo

Las operaciones `create-mint`, `create-metadata` y `create-ata` concluyeron y no deben ejecutarse nuevamente. `mint-fixed-supply`, pool, posición, liquidez y swaps continúan bloqueados y requieren autorizaciones futuras separadas. La configuración persistente continúa en `ALLOW_MAINNET=false`.

Las verificaciones finales confirmaron mint, metadata y ATA exactos sin errores. AVI emitidos, balance del ATA, pool, posición y swaps permanecen en cero. La evidencia completa está en [mainnet-token.md](mainnet-token.md) y [mainnet-metadata.md](mainnet-metadata.md).
