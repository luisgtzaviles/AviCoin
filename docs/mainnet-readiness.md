# AVICOIN Mainnet Readiness

Estado: **política remediada; adaptador de firma Phantom pendiente; ningún recurso Mainnet creado**.

## Preparado y validado

- Wallet pública Phantom de producción: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`. No se registran seed, clave privada, export ni ruta de keypair.
- Mainnet separado de devnet, genesis exacto `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, RPC Mainnet, USDC oficial y programas oficiales fijados.
- Metadata pública: `https://avicoin.avicell.com.mx/metadata-mainnet.json`, SHA-256 `80b7c815d346a66ac8572df04b06d1781b79c42da4631ced2cc94f0983d962f2`.
- Supply inicial: `1,000 AVI` / `1,000,000,000,000` unidades base; una sola emisión autorizada cuando supply sea 0.
- Supply máximo permanente: `null` / undecided. No existe autorización para emisiones posteriores en la etapa actual.
- Mint authority: `retained_temporarily`; freeze authority: `none` permanentemente.
- El gate del pool admite `retained_temporarily` y la política futura `revoked`, pero exige invariantes on-chain exactas y rechaza cualquier política desconocida.
- `ALLOW_MAINNET=false`; sin operación persistente autorizada; transacciones y firmas: 0.

## Preflight read-only y costos observados

El preflight SDK del 2026-07-22 releyó `0.071933519 SOL`, `10.89983 USDC` oficial, genesis y metadata. El cálculo de rentas por tamaños de cuenta estima `0.167431040 SOL` mínimo y `0.239907680 SOL` máximo antes de margen. Con margen recomendado de 25%, el techo es `0.299884600 SOL`; el saldo quedaría en `-0.227951081 SOL`, por lo que **se requiere más SOL antes de cualquier lanzamiento**. Los tick arrays dominan la estimación y deben recotizarse según cuentas ya existentes.

## Gate pendiente

La UI local de `tools/phantom/` sólo conecta y verifica la public key. El adaptador que construya, simule, solicite una aprobación Phantom por operación y envíe todavía no está implementado. Hasta su auditoría, los entrypoints Mainnet sólo ofrecen plan unsigned o detienen el envío.

El archivo de estado local nunca sustituye la relectura on-chain ni autoriza una transacción. Mint, metadata on-chain, ATA AVI, supply, pool, posición y swaps permanecen sin crear.
