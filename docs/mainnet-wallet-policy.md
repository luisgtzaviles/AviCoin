# Política de wallet Mainnet

La wallet de producción es Phantom `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq`. El repositorio conserva únicamente esta public key.

- Phantom mantiene la custodia y presenta una aprobación independiente mediante su proveedor oficial inyectado. La aplicación no habilita auto-confirm ni `signAndSendTransaction`.
- Ninguna seed phrase, private key, export, ruta de keypair o secreto se solicita, registra o transmite al repositorio.
- La UI local no firma ni envía al cargar o conectar. `Request signature` sólo se habilita después de Build, Simulate, Review, wallet exacta, dry-run vigente, plan sin cambios, `ALLOW_MAINNET=true`, operación exacta, token efímero y confirmación manual.
- `Send` exige una segunda confirmación y vuelve a validar firma, mensaje, configuración, estado y blockhash. El bloqueo de envío se fija antes de llamar al RPC para impedir doble clic o duplicación.
- El mint signer adicional es efímero en memoria, no persistido, no impreso y no reutilizado. La transacción parcialmente firmada tampoco se escribe a disco.
- Un fallo ambiguo exige consultar la dirección del mint de esa sesión y detenerse, no generar otro.
- Saldo observado: `0.071933519 SOL` y `10.89983 USDC` oficial. La estimación con margen indica que falta SOL; no se realizarán swaps automáticos para obtenerlo.
- La mint authority se retiene temporalmente por esta wallet sólo para fines educativos y decisiones futuras documentadas. No autoriza emisión adicional en la etapa actual.
- Freeze authority será `none` permanentemente.

La ficha de recuperación ignorada por Git conserva únicamente datos públicos necesarios para un resultado ambiguo. Una wallet de prueba para swaps deberá ser distinta, públicamente autorizada y limitada a la prueba; esos adaptadores continúan bloqueados. Este código no genera, exporta ni fondea wallets de usuario.
