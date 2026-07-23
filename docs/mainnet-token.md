# AVICOIN Mainnet Mint

Estado: **create-mint, metadata, ATA, emisión inicial y emisión final declarada finalized; supply 100,000,000 AVI**.

## Identidad y transacción

- Red: Solana `mainnet-beta`.
- Genesis hash: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.
- RPC de verificación: `https://api.mainnet-beta.solana.com`.
- Mint: [`GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`](https://explorer.solana.com/address/GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC).
- Firma: [`4nhedBupr9cpyFh3ZFKrUboGaDHnnuCRdtCvyPBsidAX1Smk79hVtmXK8snr8jhUGbYYQZMWKWTg7Q4qWM7UegkH`](https://explorer.solana.com/tx/4nhedBupr9cpyFh3ZFKrUboGaDHnnuCRdtCvyPBsidAX1Smk79hVtmXK8snr8jhUGbYYQZMWKWTg7Q4qWM7UegkH).
- Estado: `finalized`, sin error.
- Slot: `434607364`.
- Fecha UTC: `2026-07-22T23:56:00.000Z`.
- Payer: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
- Stable plan hash: `2d9f1868e381136f0314c10748b71383f2d09aa0a2735fbd083deb031f74ccf4`.
- Message hash: `dff6ef2f7c853b4e70a9ffd609df9cafb651139258f19fa489f0ec9377853593`.
- Blockhash: `5wn7XJmkrUG7NZRcn536zRk1wqSdALMr9vN4YGWu6kUf`.
- Last valid block height: `412667756`.

## Invariantes releídas en Mainnet

- Owner: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.
- Initialized: `true`.
- Tamaño de la cuenta mint: 82 bytes.
- Decimales: 9.
- Supply: `100,000,000,000,000,000` unidades base / `100,000,000 AVI`.
- Mint authority: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
- Freeze authority: `none`.
- Instrucciones: exactamente `SystemProgram.createAccount` y `initializeMint2`.
- Renta de la cuenta: `1,461,600` lamports.
- Fee: `10,000` lamports.

## Balance y costo

- SOL antes: `0.339564219 SOL` / `339,564,219` lamports.
- SOL después: `0.338092619 SOL` / `338,092,619` lamports.
- Costo total: `0.001471600 SOL` / `1,471,600` lamports.

## Alcance preservado

- Metadata on-chain: creada y verificada en la PDA `4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2`. Véase [mainnet-metadata.md](mainnet-metadata.md).
- ATA AVI de producción: creada y verificada en `H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE`.
- AVI emitidos: `100,000,000`; `1,000 AVI` en la emisión inicial y `99,999,000 AVI` en una autorización independiente posterior.
- Mint authority revocada: no.
- Pool, posición, liquidez y swaps: no creados ni ejecutados.
- Firmas Phantom acumuladas: 5 (`create-mint`, `create-metadata`, `create-ata`, `mint-fixed-supply` y `mint-final-supply`).
- Transacciones Mainnet acumuladas: 5.

## Associated Token Account oficial

- ATA: [`H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE`](https://explorer.solana.com/address/H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE).
- Firma: [`1Dqyd5tV4CnaQSPDydrLRaN5pgDUjMwGGEY2Yah6trt259ETZQdLKzsL2LyTqHPipGNwhiu1X5BqC72fU1CteeH`](https://explorer.solana.com/tx/1Dqyd5tV4CnaQSPDydrLRaN5pgDUjMwGGEY2Yah6trt259ETZQdLKzsL2LyTqHPipGNwhiu1X5BqC72fU1CteeH).
- Estado: `finalized`, sin error.
- Slot: `434624296`.
- Fecha UTC: `2026-07-23T01:54:08.000Z`.
- Owner del ATA: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
- Mint del ATA: `GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`.
- Owner del programa: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.
- Balance actual: `100,000,000,000,000,000` unidades base / `100,000,000 AVI`.
- Instrucciones: dos Compute Budget y exactamente una `associated-token:createIdempotent`; ninguna instrucción `mintTo`.
- Stable plan hash: `051d52928454030b5c1a67fd42ed2f759207dc7c4bb5f5e3a074fe071832db82`.
- Message hash: `8d107328f3f465d3b4a56de2d33e980a066c69c309f98347f8ca10dfe33a6b35`.
- Blockhash: `21NrqrzxeateAuwJrNDU357Pt7EmiFjdPTo9tZAC6HET`.
- Last valid block height: `412684689`.
- SOL antes: `0.322971819 SOL` / `322,971,819` lamports.
- SOL después: `0.320927439 SOL` / `320,927,439` lamports.
- Renta: `0.002039280 SOL` / `2,039,280` lamports.
- Fee: `0.000005100 SOL` / `5,100` lamports.
- Costo total: `0.002044380 SOL` / `2,044,380` lamports.
- Supply releído después: `0` unidades base / `0 AVI`.
- Mint authority: sin cambios, wallet de producción.
- Freeze authority: `none`.
- Metadata: sin cambios; PDA, nombre, símbolo, URI, seller fee, mutabilidad y update authority exactos.

## Emisión fija inicial

- Firma: [`3oQ6WHWKkzbiQx61rPN85jTenAtndYKNbkXodoWXrZa6XP3sxquSeuaUXpkRcEFb3q2RjtqmmYtC2KfrQPjFgiqr`](https://explorer.solana.com/tx/3oQ6WHWKkzbiQx61rPN85jTenAtndYKNbkXodoWXrZa6XP3sxquSeuaUXpkRcEFb3q2RjtqmmYtC2KfrQPjFgiqr).
- Estado: `finalized`, sin error.
- Slot: `434632215`.
- Fecha UTC: `2026-07-23T02:49:25.000Z`.
- Stable plan hash: `75add4dd30f09e7f52a0a4ad39411eb48b9fbf75883ca37b59774c1983a3ad07`.
- Message hash: `3dc6e46edad7aadaadcb0e696bbbd6a75cf7f559626b2c3e061a51560a29af61`.
- Blockhash: `Eri8YiqhuAJpdhfH2xLsBFyezDbo4SEiSZemVSYdQudv`.
- Last valid block height: `412692603`.
- Instrucciones: dos Compute Budget y exactamente una `mintToChecked`.
- Mint: `GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`.
- Destino: ATA oficial `H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE`.
- Autoridad y signer: wallet de producción `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
- Cantidad: `1,000,000,000,000` unidades base / `1,000 AVI`; decimales verificados: 9.
- Supply antes: `0`; supply después: `1,000 AVI`.
- Balance ATA antes: `0`; balance ATA después: `1,000 AVI`.
- Cuentas del mint después: exactamente una, el ATA oficial, con todo el supply.
- SOL antes: `0.320927439 SOL` / `320,927,439` lamports.
- SOL después: `0.320922389 SOL` / `320,922,389` lamports.
- Fee y costo total: `0.000005050 SOL` / `5,050` lamports.
- Mint authority: sin cambios, wallet de producción.
- Freeze authority: `none`.
- Metadata: sin cambios; PDA, nombre, símbolo, URI, seller fee, mutabilidad y update authority exactos.
- La operación inicial quedó registrada como consumida. La autorización posterior `mint-final-supply` se documenta a continuación.
- Pool, posición, liquidez y swaps: no creados ni ejecutados.

## Emisión final declarada

- Firma: [`4LwCLwoTH7fXDVhhuLH7oXLSs4aZsXCzregqNHMtqm6NXbo96gxhT87zhgfy52bqbJ2Rwp8ffePLfYbPcg3r47rM`](https://explorer.solana.com/tx/4LwCLwoTH7fXDVhhuLH7oXLSs4aZsXCzregqNHMtqm6NXbo96gxhT87zhgfy52bqbJ2Rwp8ffePLfYbPcg3r47rM).
- Estado: `finalized`, sin error.
- Slot: `434636115`.
- Fecha UTC: `2026-07-23T03:16:42.000Z`.
- Stable plan hash: `890ea455c7019f377ab8157709ac9ebbae5170c5c5a282dd80d40389dee4a0b6`.
- Message hash: `6982f0fa7de53abaa2ee7a830dc224f5c888a84ea6985af8a542d62d4ff02273`.
- Blockhash: `J4JuqK6c1pAgZF8YjAd8RankdSTMJAr76FRk3xFSxP1a`.
- Last valid block height: `412696505`.
- Instrucciones: dos Compute Budget y exactamente una `mintToChecked`.
- Mint: `GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`.
- Destino: ATA oficial `H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE`.
- Autoridad y signer: wallet de producción `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`.
- Cantidad emitida: `99,999,000,000,000,000` unidades base / `99,999,000 AVI`; decimales verificados: 9.
- Supply antes: `1,000 AVI`; supply después: `100,000,000 AVI`.
- Balance ATA antes: `1,000 AVI`; balance ATA después: `100,000,000 AVI`.
- Cuentas del mint después: exactamente una, el ATA oficial, con todo el supply.
- SOL antes: `0.320922389 SOL` / `320,922,389` lamports.
- SOL después: `0.320917339 SOL` / `320,917,339` lamports.
- Fee y costo total: `0.000005050 SOL` / `5,050` lamports.
- Mint authority: sin cambios, wallet de producción.
- Freeze authority: `none`.
- Metadata: sin cambios; PDA, nombre, símbolo, URI, seller fee, mutabilidad y update authority exactos.
- Pool, posición, liquidez y swaps: no creados ni ejecutados.
- El supply actual de `100,000,000 AVI` es el objetivo final declarado. Como la mint authority permanece retenida, no es un máximo criptográfico; cualquier emisión futura requeriría una decisión y autorización nuevas y actualmente no está autorizada.

El servidor loopback fue detenido después de `finalized`; el recovery público finalizado fue eliminado durante el cierre. Esta evidencia no autoriza una emisión adicional ni ninguna operación posterior.
