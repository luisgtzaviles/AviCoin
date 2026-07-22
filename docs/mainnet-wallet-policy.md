# Política de wallet Mainnet

La wallet de producción sigue **no designada**. Debe crearse o seleccionarse fuera del repositorio, sin automatización de AVICOIN y sin reutilizar automáticamente la wallet devnet.

- Usar una wallet dedicada, no empleada para actividades personales.
- Conservar keypair/seed fuera del repositorio, `.env`, hosting, chats y logs.
- Registrar en configuración únicamente la public key esperada y una ruta/proveedor de firma externo ignorado por Git.
- Mantener sólo el saldo operativo mínimo y verificar destinatarios manualmente.
- Fondear SOL y USDC oficiales mediante un procedimiento externo aprobado.
- Mantener control y documentación de la posición de liquidez, que es retirable por la wallet del proyecto.
- Considerar multisig antes de ampliar alcance o fondos.
- No compartir seed phrase ni clave privada bajo ninguna circunstancia.

Una segunda wallet educativa debe ser distinta, expresamente autorizada y limitada a la prueba de swap. El código no genera ni fondea wallets.
