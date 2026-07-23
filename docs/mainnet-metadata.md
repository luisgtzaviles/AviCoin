# AVICOIN Mainnet Metadata

Estado: **create-metadata finalized; metadata exacta; supply 0; operaciones posteriores no ejecutadas**.

## Identidad y transacción

- Red: Solana `mainnet-beta`.
- Genesis hash: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.
- Mint: [`GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`](https://explorer.solana.com/address/GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC).
- Metadata PDA: [`4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2`](https://explorer.solana.com/address/4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2).
- Firma: [`38YgPFw4a3Z4m5LQdJAbLvjCjhU34yT9ksUsgWf1jXBQdXjwRwwz8ANx6KB4zpEi8U8W3ycDMgWb6GDNErMEcvJz`](https://explorer.solana.com/tx/38YgPFw4a3Z4m5LQdJAbLvjCjhU34yT9ksUsgWf1jXBQdXjwRwwz8ANx6KB4zpEi8U8W3ycDMgWb6GDNErMEcvJz).
- Estado: `finalized`, sin error.
- Slot: `434620903`.
- Fecha UTC: `2026-07-23T01:30:29.000Z`.
- Payer y update authority: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
- Programa: `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`.
- Stable plan hash: `4a9ccf14925b4dfe1e74da74e1878aeb7734ec1daa62f47d04f250256f5e53a6`.
- Message hash: `93e7c1adbded9e18aa3a700a4bced60b24b1dcca1e10aac164090e23d6e721a9`.
- Blockhash: `13rBpSL8vccYU1eaGpXh44yth1PQSAbp8oWBExeTSR59`.
- Last valid block height: `412681285`.

## Metadata releída en Mainnet

- Owner: Metaplex Token Metadata Program.
- Tamaño de cuenta: 607 bytes.
- Name: `AVICOIN`.
- Symbol: `AVI`.
- URI: `https://avicoin.avicell.com.mx/metadata-mainnet.json`.
- Seller fee basis points: `0`.
- Mutable: `true`.
- Update authority: wallet oficial de producción.
- Creators: `none`.
- Collection: `none`.
- Uses: `none`.

La transacción ejecutó dos instrucciones determinísticas de Compute Budget y una `createMetadataAccountV3`. Consumió 34,945 unidades de cómputo y no incluyó ATA, `mintTo`, transferencia SPL ni cambio de authorities.

## Balance y costo

- SOL antes: `0.338092619 SOL` / `338,092,619` lamports.
- SOL después: `0.322971819 SOL` / `322,971,819` lamports.
- Cuenta metadata: `0.015115600 SOL` / `15,115,600` lamports.
- Fee: `0.000005200 SOL` / `5,200` lamports.
- Costo total: `0.015120800 SOL` / `15,120,800` lamports.

## Metadata pública

- URL permanente: `https://avicoin.avicell.com.mx/metadata-mainnet.json`.
- SHA-256 antes: `80b7c815d346a66ac8572df04b06d1781b79c42da4631ced2cc94f0983d962f2`.
- SHA-256 después: `f3d87b8c254b190218a2a8b94630b8ef764555b18ce72ba657f1b2677daffb90`.
- Estado publicado: `Created`, con mint y Metadata PDA reales.
- HTTP: 200; Content-Type: `application/json`.
- Logo preservado: SHA-256 `7d90dee3d23218a5ab84cf5f465175e3e2ea11ed3959f9acd90100abc4406a54`.

La actualización pública se realizó después de `finalized`. La URL grabada on-chain no cambió; tampoco cambiaron el nombre, símbolo, logo, seller fee ni propósito educativo.

## Invariantes preservadas

- Decimales: 9.
- Supply: `0` unidades base / `0 AVI`.
- Mint authority: wallet oficial de producción, sin cambios.
- Freeze authority: `none`.
- ATA AVI de producción: no creada.
- AVI emitidos: 0.
- Pool, posición, liquidez y swaps: no creados ni ejecutados.
- Firmas Phantom nuevas: 1.
- Transacciones Mainnet nuevas: 1.

El servidor loopback fue detenido después de `finalized`; la autorización `create-metadata` existió sólo en el proceso y la configuración persistente permaneció en `ALLOW_MAINNET=false`. El recibo de recovery contenía únicamente evidencia pública y fue eliminado durante el cierre.
