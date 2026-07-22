# Política de wallet Mainnet

La wallet de producción es Phantom `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`. El repositorio conserva únicamente esta public key.

- Phantom mantiene la custodia y presenta una aprobación independiente por operación futura.
- Ninguna seed phrase, private key, export, ruta de keypair o secreto se solicita, registra o transmite al repositorio.
- La UI local no ejecuta nada al cargar y actualmente sólo conecta/verifica la public key; firma y envío están pendientes.
- El mint signer adicional, cuando se implemente la sesión explícita, será efímero en memoria, no persistido, no impreso y no reutilizado.
- Un fallo ambiguo exige consultar la dirección del mint de esa sesión y detenerse, no generar otro.
- Saldo observado: `0.071933519 SOL` y `10.89983 USDC` oficial. La estimación con margen indica que falta SOL; no se realizarán swaps automáticos para obtenerlo.
- La mint authority se retiene temporalmente por esta wallet sólo para fines educativos y decisiones futuras documentadas. No autoriza emisión adicional en la etapa actual.
- Freeze authority será `none` permanentemente.

Una wallet de prueba para swaps deberá ser distinta, públicamente autorizada y limitada a la prueba. Este código no genera, exporta ni fondea wallets.
