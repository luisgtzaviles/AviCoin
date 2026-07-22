# AVICOIN Mainnet Readiness

Estado: **Mainnet preparation in progress / no Mainnet token created**.

## Preparado en el repositorio

- Configuración devnet/mainnet separada y genesis hashes completos.
- Mainnet sin mint ni wallet por defecto; mint devnet excluido del carril Mainnet.
- Autorización temporal por operación exacta y `ALLOW_MAINNET=false` por defecto.
- Dry-run obligatorio, recibo SHA-256 ligado a configuración/wallet/parámetros y caducidad de 30 minutos.
- Scripts separados para mint, metadata, supply fijo y revocación.
- SDK oficial Orca fijado y módulos separados de lectura, cotización y operaciones.
- Metadata Mainnet publicada en `https://avicoin.avicell.com.mx/metadata-mainnet.json` y verificada contra `site/metadata-mainnet.json` con SHA-256 `80b7c815d346a66ac8572df04b06d1781b79c42da4631ced2cc94f0983d962f2`.
- Estado de lanzamiento no secreto inicializado con valores nulos/falsos.

## Gates pendientes

- Designar una wallet de producción externa y registrar sólo su public key.
- Fondear con SOL y 10 USDC oficiales sin usar automatización de este repositorio.
- Ejecutar preflight read-only y obtener aprobación separada para cada operación.
- Crear y verificar mint/metadata/supply/revocación antes de considerar un pool.

El archivo de estado local nunca sustituye una relectura on-chain ni autoriza una transacción.

## Dependencias y programas fijados

- `@orca-so/whirlpools` 8.0.1: SDK oficial moderno para generar instrucciones y cotizaciones.
- `@orca-so/whirlpools-core` 3.1.0: matemática oficial de precio y ticks usada por la versión fijada del SDK.
- `@solana/kit` 5.5.1: API compatible requerida por Orca 8.
- `@solana/web3.js` 1.98.4 y `@solana/spl-token` 0.4.15: compatibilidad con los scripts SPL existentes.
- TypeScript 5.9.3: versión compatible con los tipos de Solana Kit; el lockfile es único.

Programas/configuración Mainnet: SPL Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, Token Metadata `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`, Orca Whirlpool `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` y WhirlpoolConfig `2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ`.

Los scripts de build no revisados permanecen bloqueados; `bigint-buffer` usa su implementación JavaScript.
