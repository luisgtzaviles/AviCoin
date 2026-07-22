# Evidencia de metadata de AVICOIN en devnet

Estado: **creada y verificada en Solana devnet**.

La cuenta fue creada el 2026-07-22 a las 20:58:05 UTC mediante el script `create-metadata` del repositorio. La transacción quedó finalizada y la cuenta fue releída desde el RPC de devnet. No se emitieron tokens ni se modificaron las authorities del mint.

## Identificadores públicos

| Campo | Valor verificado |
|---|---|
| Red | Solana devnet |
| Genesis hash | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` |
| Mint | `8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK` |
| Metadata PDA | `3r8v8AteJkseWy3ex45ZmmSL8FrTVecdzhgcUX51k2ZL` |
| Programa propietario | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` |
| Update authority | `BFGzEAviMQ7FBwLC59sjx7dkgXJXLUAjEKLxoxEa28YU` |
| Nombre | `AVICOIN` |
| Símbolo | `AVI` |
| URI | <https://avicoin.avicell.com.mx/metadata.json> |
| Seller fee | 0 puntos base |
| Mutable | Sí |
| Slot | `478170097` |
| Firma | [`4CAe6Pz5bukY3baTgR9XoYaagJpxPaBHFxtyzNwE88X3qH4SSDEtMqvEox6KSt463jN2Z9rTEr8WvAanDCx7VE2R`](https://explorer.solana.com/tx/4CAe6Pz5bukY3baTgR9XoYaagJpxPaBHFxtyzNwE88X3qH4SSDEtMqvEox6KSt463jN2Z9rTEr8WvAanDCx7VE2R?cluster=devnet) |

## Validaciones posteriores

- Estado de la transacción: `Finalized`.
- Cuenta metadata: 15,115,600 lamports, no ejecutable y propiedad del programa oficial de Metaplex Token Metadata.
- Supply del mint: `0` unidades base, equivalente a `0 AVI`.
- Decimales: `9`.
- Mint authority: `BFGzEAviMQ7FBwLC59sjx7dkgXJXLUAjEKLxoxEa28YU`.
- Freeze authority: ninguna.
- Balance del pagador: 4.9985284 SOL antes y 4.9834078 SOL después.
- Costo: 0.0151156 SOL de renta para la cuenta y 0.000005 SOL de comisión.

## Verificación reproducible

Estas consultas son de solo lectura y deben apuntar explícitamente a devnet:

```bash
solana genesis-hash --url https://api.devnet.solana.com
solana confirm 4CAe6Pz5bukY3baTgR9XoYaagJpxPaBHFxtyzNwE88X3qH4SSDEtMqvEox6KSt463jN2Z9rTEr8WvAanDCx7VE2R \
  --url https://api.devnet.solana.com
solana account 3r8v8AteJkseWy3ex45ZmmSL8FrTVecdzhgcUX51k2ZL \
  --url https://api.devnet.solana.com --output json
spl-token display 8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK \
  --url https://api.devnet.solana.com
```

Esta evidencia corresponde exclusivamente a devnet. No demuestra un despliegue en mainnet ni una emisión, distribución, transferencia o valor económico de AVI.
