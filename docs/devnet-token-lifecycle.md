# Validación del ciclo de vida de AVICOIN en devnet

Estado: **PASS — ciclo completo validado en Solana devnet**.

Fecha de ejecución: 2026-07-22. El ciclo comenzó a las 21:03:38 UTC y terminó a las 21:05:43 UTC. Todas las transacciones quedaron finalizadas sin error y se ejecutaron contra el genesis hash de devnet `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.

## Estado y cuentas verificadas

| Campo | Valor |
|---|---|
| Mint | [`8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK`](https://explorer.solana.com/address/8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK?cluster=devnet) |
| Programa SPL Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Decimales | `9` |
| Wallet A oficial | `BFGzEAviMQ7FBwLC59sjx7dkgXJXLUAjEKLxoxEa28YU` |
| ATA A | [`2EJ88ieRH2HDwHNPzp6RW9gKPHRL1NmT8b3KkvYjPfXT`](https://explorer.solana.com/address/2EJ88ieRH2HDwHNPzp6RW9gKPHRL1NmT8b3KkvYjPfXT?cluster=devnet) |
| Wallet B temporal | `6tQ1KnsGT66gHYZcmHRHmh6t9cNhbypFhh7xGo8TqCjL` |
| ATA B | [`B6Fk81PUxfCT4cBuctomJs2re9MYT3mTTHxn1usdsjPS`](https://explorer.solana.com/address/B6Fk81PUxfCT4cBuctomJs2re9MYT3mTTHxn1usdsjPS?cluster=devnet) |
| Metadata PDA | `3r8v8AteJkseWy3ex45ZmmSL8FrTVecdzhgcUX51k2ZL` |

Ambos ATA fueron los únicos token accounts creados para esta validación. La wallet B se generó y conservó fuera del repositorio; este documento sólo registra su dirección pública.

## Transacciones

| Operación | Cantidad | Fecha UTC | Slot | Firma y Explorer |
|---|---:|---|---:|---|
| Crear ATA A | — | 2026-07-22 21:03:38 | `478171007` | [`3R8aGYcDnEwsTBgNDPbomaeCua2eitH4H1dzMn15b8iSrWVbBAmwPXHzHSqT2hpty2JsaqvEXWSVt7VXfkfV232b`](https://explorer.solana.com/tx/3R8aGYcDnEwsTBgNDPbomaeCua2eitH4H1dzMn15b8iSrWVbBAmwPXHzHSqT2hpty2JsaqvEXWSVt7VXfkfV232b?cluster=devnet) |
| Emitir a ATA A | `1 AVI` | 2026-07-22 21:04:05 | `478171081` | [`5SAAzJqH3qL6yRjTpAh96yqDipox6pu9q8UZFT3ajqHESRnHaNATe6oZzKyk8MrfvkVeFTpMVZ3pveHp4bJvuvGX`](https://explorer.solana.com/tx/5SAAzJqH3qL6yRjTpAh96yqDipox6pu9q8UZFT3ajqHESRnHaNATe6oZzKyk8MrfvkVeFTpMVZ3pveHp4bJvuvGX?cluster=devnet) |
| Crear ATA B | — | 2026-07-22 21:04:30 | `478171151` | [`B9MRofEbfczPpmEXRE3QdjGp2qz5tefcyw1EcJWRqb23xKJgvwLFHsUcYD7VxVrwtJoBzNodfioJkKaSCYoikqq`](https://explorer.solana.com/tx/B9MRofEbfczPpmEXRE3QdjGp2qz5tefcyw1EcJWRqb23xKJgvwLFHsUcYD7VxVrwtJoBzNodfioJkKaSCYoikqq?cluster=devnet) |
| Transferir A → B | `0.1 AVI` | 2026-07-22 21:04:55 | `478171217` | [`3rqJu3dKfgufPJLYp7c6BmayEQ2zyC4hmUCgzPkNGXn2UbLvGP2As5Tx2CKX2A4D6wrwNQoccz5uYHrhWCw2ciD5`](https://explorer.solana.com/tx/3rqJu3dKfgufPJLYp7c6BmayEQ2zyC4hmUCgzPkNGXn2UbLvGP2As5Tx2CKX2A4D6wrwNQoccz5uYHrhWCw2ciD5?cluster=devnet) |
| Devolver B → A | `0.1 AVI` | 2026-07-22 21:05:22 | `478171293` | [`4FX3JVBjCNdeEhUQ5nxjAhwFRrZGfXNEXupNVGRheqyLsnEgq2ec57jFWw3CPjLhyAU715qzWSnDQnezeYv5e6bt`](https://explorer.solana.com/tx/4FX3JVBjCNdeEhUQ5nxjAhwFRrZGfXNEXupNVGRheqyLsnEgq2ec57jFWw3CPjLhyAU715qzWSnDQnezeYv5e6bt?cluster=devnet) |
| Burn desde ATA A | `1 AVI` | 2026-07-22 21:05:43 | `478171351` | [`4zBreM2RhygJ3mxYmiRfirhKvZS2KCJknPp97DZ1L4BDKYyKGVvEWK2wfRuNR1ywQmAcPsLE2fDwXu5uBVUMBki2`](https://explorer.solana.com/tx/4zBreM2RhygJ3mxYmiRfirhKvZS2KCJknPp97DZ1L4BDKYyKGVvEWK2wfRuNR1ywQmAcPsLE2fDwXu5uBVUMBki2?cluster=devnet) |

Las instrucciones decodificadas fueron dos creaciones de ATA, `mintToChecked`, dos `transferChecked` y `burnChecked`. Explorer mostró las seis transacciones con resultado `Success`.

## Supply y balances

| Gate | Supply | ATA A | ATA B |
|---|---:|---:|---:|
| Estado inicial | `0 AVI` | No existía | No existía |
| ATA A creada | `0 AVI` | `0 AVI` | No existía |
| Emisión | `1 AVI` | `1 AVI` | No existía |
| ATA B creada | `1 AVI` | `1 AVI` | `0 AVI` |
| Transferencia A → B | `1 AVI` | `0.9 AVI` | `0.1 AVI` |
| Devolución B → A | `1 AVI` | `1 AVI` | `0 AVI` |
| Burn final | `0 AVI` | `0 AVI` | `0 AVI` |

El balance SOL de la wallet pagadora pasó de 4.9834078 SOL a 4.97929424 SOL. La diferencia de 0.00411356 SOL corresponde a la renta de los dos ATA y a 0.000035 SOL de comisiones de las seis transacciones.

## Invariantes posteriores

La relectura final confirmó que los siguientes valores permanecieron sin cambios:

- Nombre: `AVICOIN`.
- Símbolo: `AVI`.
- URI: <https://avicoin.avicell.com.mx/metadata.json>.
- SHA-256 del JSON público: `09e0141a0fba141e79225145e6e67873efa3d5736658c4f0df1d0622b5f94e3a`.
- Update authority: `BFGzEAviMQ7FBwLC59sjx7dkgXJXLUAjEKLxoxEa28YU`.
- Mint authority: `BFGzEAviMQ7FBwLC59sjx7dkgXJXLUAjEKLxoxEa28YU`.
- Freeze authority: ninguna.
- Seller fee: `0` puntos base.
- Metadata mutable: sí, sin modificación durante esta validación.
- Supply final: `0 AVI`.

Solana Explorer mostró `AVICOIN`, símbolo `AVI`, supply `0`, ambos ATA y el historial exitoso. Su distintivo externo de verificación aparece como `Not verified`; no altera ni contradice la metadata on-chain validada.

## Verificación reproducible

Estas consultas son de solo lectura:

```bash
solana genesis-hash --url https://api.devnet.solana.com
spl-token display 8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK \
  --url https://api.devnet.solana.com
spl-token display 2EJ88ieRH2HDwHNPzp6RW9gKPHRL1NmT8b3KkvYjPfXT \
  --url https://api.devnet.solana.com
spl-token display B6Fk81PUxfCT4cBuctomJs2re9MYT3mTTHxn1usdsjPS \
  --url https://api.devnet.solana.com
solana confirm 4zBreM2RhygJ3mxYmiRfirhKvZS2KCJknPp97DZ1L4BDKYyKGVvEWK2wfRuNR1ywQmAcPsLE2fDwXu5uBVUMBki2 \
  --url https://api.devnet.solana.com
```

No se creó otro mint, no se modificó metadata o authorities y no hubo interacción con mainnet.
