# Diseño propuesto del pool Mainnet AVI/USDC

Estado: **no creado**. El diseño es educativo y no constituye una recomendación de mercado.

| Parámetro | Valor |
|---|---:|
| Par | AVI / USDC oficial |
| Precio económico inicial | 1 AVI = 0.01 USDC |
| Precio inverso | 1 USDC = 100 AVI |
| AVI | 9 decimales; máximo 1,000 AVI |
| USDC | 6 decimales; máximo 10 USDC |
| Fee tier seleccionado | 0.30% |
| Tick spacing | 64 |
| Rango educativo propuesto | 0.005–0.02 USDC por AVI |
| Slippage máximo inicial | 1% (100 bps) |
| Price impact máximo para prueba | 10% |
| Compra educativa máxima | 0.10 USDC |

El SDK ordena canónicamente los mints. Si USDC resulta token A, el código invierte precios y decimales. Los ticks se redondean al tick spacing. Una posición concentrada puede consumir cantidades desiguales: la cotización debe reportar importes requeridos, remanentes, rentas, comisiones y número de transacciones inmediatamente antes del dry-run.

Si existe un pool para el par y fee tier, la creación se detiene y no agrega liquidez. La venta de regreso sólo puede usar exactamente los AVI obtenidos en la compra educativa. No se hacen operaciones correctivas para restaurar precio.
