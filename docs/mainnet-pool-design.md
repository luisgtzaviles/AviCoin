# Diseño propuesto del pool Mainnet AVI/USDC

Estado: **no creado**. El diseño es educativo y no constituye recomendación ni garantía de mercado.

| Parámetro | Valor |
|---|---:|
| Par | AVI / USDC oficial `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Precio económico inicial | 1 AVI = 0.01 USDC |
| AVI / USDC máximos de depósito | 1,000 AVI / 10 USDC |
| Fee tier / tick spacing | 0.30% / 64 |
| Rango educativo | 0.005–0.02 USDC por AVI |
| Slippage / price impact máximos | 1% / 10% |
| Compra educativa máxima | 0.10 USDC |

El pool puede avanzar con `mint_authority_policy=retained_temporarily` si la autoridad on-chain coincide con la wallet de producción. También admite una política futura `revoked` si la autoridad es `none`; cualquier otro valor se rechaza. En ambos casos exige mint, metadata y única emisión confirmados, supply exacto de 1,000 AVI, 9 decimales, freeze authority `none`, USDC oficial, wallet exacta, ausencia de emisión adicional y ausencia de pool previo.

La autorización exacta de operación y un dry-run válido seguirán siendo necesarios cuando exista el adaptador Phantom. La autoridad retenida no garantiza supply fijo. Los costos de dos a tres tick arrays son el componente dominante: deben releerse antes de aprobar pool o posición. No se hacen swaps correctivos para restaurar precio.
