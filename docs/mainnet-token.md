# AVICOIN Mainnet Mint

Estado: **create-mint finalized; supply 0; operaciones posteriores no ejecutadas**.

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
- Supply: `0` unidades base / `0 AVI`.
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

- Metadata on-chain: no creada. PDA derivada `4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2`, cuenta inexistente al verificar.
- ATA AVI de producción: no creada. Dirección derivada `H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE`, cuenta inexistente al verificar.
- AVI emitidos: 0.
- Mint authority revocada: no.
- Pool, posición, liquidez y swaps: no creados ni ejecutados.
- Firmas Phantom: 1.
- Transacciones Mainnet: 1.

El servidor loopback fue detenido después de `finalized`; el keypair del mint existió sólo en memoria del proceso y no fue persistido. El recovery público finalizado fue eliminado durante el cierre. Esta evidencia no autoriza metadata, emisión ni ninguna operación posterior.
