# AVICOIN

AVICOIN es una base educativa para preparar un token SPL de Solana orientado inicialmente al aprendizaje y a transferencias entre amigos. **No representa acciones, deuda, participación empresarial ni promesa de rendimiento, precio o valor financiero.**

## Estado actual

Existe un mint de pruebas y su cuenta de metadata en devnet, registrados en la sección de despliegues. En Mainnet se crearon el mint SPL definitivo, su metadata on-chain y el ATA oficial de producción; el supply permanece en 0 y no existen pool ni posición. La licencia está **pendiente de definir**.

El registro histórico de devnet usa nombre `AVICOIN`, símbolo `AVI`, 9 decimales y supply 0. La política Mainnet vigente es distinta y está documentada en [tokenomics](docs/tokenomics.md) y [readiness](docs/mainnet-readiness.md).

El logo oficial está conservado en [docs/logo.png](docs/logo.png). [logo-placeholder.svg](docs/logo-placeholder.svg) permanece únicamente como registro del marcador provisional inicial.

## Requisitos e instalación

- Node.js 20.19 o posterior.
- pnpm 11.15.1 (registrado en `packageManager`).
- Una wallet existente almacenada fuera de Git y SOL de prueba para operar posteriormente en devnet.

```bash
pnpm install
cp .env.example .env
pnpm typecheck
```

`.env` contiene la red, RPC, ruta externa del keypair, parámetros propuestos, mint y URI. Nunca guardes secretos reales en `.env`; `SOLANA_KEYPAIR_PATH` apunta a un archivo externo. `.env`, `.secrets/`, `keys/` y `*.keypair.json` están ignorados.

## Redes y protecciones

`devnet` es una red de pruebas cuyos tokens y SOL no tienen valor real. `mainnet-beta` es la red productiva y cualquier error puede ser irreversible. Las consultas y el plan unsigned validan genesis, RPC y wallet con `ALLOW_MAINNET=false`. Los adaptadores Phantom ya utilizados para `create-mint`, `create-metadata` y `create-ata` aíslan cada operación; la firma y el envío permanecen bloqueados salvo una sesión efímera deliberada con operación exacta, token de confirmación y `ALLOW_MAINNET=true`. Ningún plan local o hash autoriza por sí mismo una operación real.

La configuración está separada en `config/devnet.ts` y `config/mainnet.ts`. Mainnet nunca hereda el mint de devnet. El estado inicial no secreto está en `config/mainnet-launch-state.json`; sus valores deben compararse siempre con el estado on-chain.

## Flujo previsto

1. Validar el entorno y revisar código/configuración.
2. Probar exclusivamente en devnet.
3. Crear el mint sin emitir supply.
4. Publicar externamente metadata/logo y crear la cuenta de metadata.
5. Emitir únicamente una cantidad explícita y aprobada.
6. Transferir entre wallets comprobando origen, destino y balance.

## Comandos

```bash
pnpm typecheck
pnpm create-token -- --freeze-authority=none
pnpm create-metadata -- [MINT] [URI]
pnpm mint -- [MINT] [WALLET_DESTINO] [CANTIDAD]
pnpm transfer -- [MINT] [WALLET_DESTINO] [CANTIDAD]
```

Los argumentos `MINT` y `URI` pueden provenir de `.env`. Los comandos transaccionales solo preparan y envían una operación después de mostrar un resumen y recibir confirmación; ninguno debe automatizarse sin revisión.

El preflight Mainnet actual es exclusivamente read-only/unsigned:

```bash
pnpm mainnet:preflight-plan
```

Las interfaces locales autocontenidas usan exclusivamente el proveedor inyectado por Phantom. `pnpm phantom:serve`, `pnpm phantom:metadata` y `pnpm phantom:ata` aíslan respectivamente la creación del mint, metadata y ATA. No usan CDN, no solicitan secretos y no firman al conectar o cargar. Su flujo manual es:

`Connect → Build stable plan → Review → confirmación → Prepare fresh transaction / Simulate → Request signature → segunda confirmación → Send → Verify finalized state`.

Cada adaptador habilita una sola operación exacta. El plan estable se revisa sin blockhash final; después, `Prepare` obtiene un blockhash fresco y simula el mensaje exacto. Se reservan 40 block heights antes de solicitar firma y 20 antes de aceptar o enviar. Después de `Send` o de un resultado ambiguo está prohibido reconstruir o repetir. Los flujos ya finalizados no autorizan emisión, pool, posición, liquidez ni swaps.

`create-token` no asigna freeze authority por defecto. Se puede elegir explícitamente `none`, `payer` o una dirección pública con `--freeze-authority=VALOR`; esta decisión debe revisarse antes de crear el mint.

### Política de instalación de pnpm

`pnpm-workspace.yaml` no convierte este repositorio en un monorepo ni declara otros paquetes. pnpm 11 usa ese archivo como configuración por proyecto. La lista `allowBuilds` permite únicamente el `postinstall` requerido por `esbuild`, bloquea el binding nativo de `bigint-buffer` y excluye los aceleradores nativos opcionales `bufferutil` y `utf-8-validate`. El override de `uuid` evita una versión transitiva vulnerable de `jayson` y está reflejado en el lockfile.

`pnpm audit --prod` todavía reporta `bigint-buffer@1.1.5` mediante `@solana/spl-token > @solana/buffer-layout-utils`. No existe una versión corregida publicada. El binding nativo donde se encuentra el desbordamiento permanece deshabilitado y la implementación JavaScript es la utilizada, pero el hallazgo seguirá visible hasta que la dependencia upstream lo resuelva. No habilites su script de instalación sin una nueva revisión de seguridad.

## Seguridad y pendientes

- No copies claves privadas, seed phrases ni keypairs al repositorio, historial de shell, tickets o chats.
- Confirma red, RPC, dirección, decimales, cantidad y authorities en cada operación.
- Usa una wallet de pruebas separada y respáldala mediante un procedimiento seguro externo.
- No revoques authorities sin comprender que la acción es irreversible.
- TBD: distribución y supply finales, freeze authority, momento de fijar supply, custodia, metadata/logo definitivos, licencia, utilidades y evaluación previa a mainnet.

## Despliegues

### Devnet

- Mint address: `8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK`
- Red: Solana devnet
- Decimales: 9
- Supply actual: 0 AVI
- Mint authority: wallet de administración AVICOIN
- Freeze authority: ninguna
- Metadata PDA: `3r8v8AteJkseWy3ex45ZmmSL8FrTVecdzhgcUX51k2ZL`
- Metadata: creada y verificada on-chain
- Update authority: `BFGzEAviMQ7FBwLC59sjx7dkgXJXLUAjEKLxoxEa28YU`
- URI on-chain: <https://avicoin.avicell.com.mx/metadata.json>
- Transacción: [`4CAe6Pz5bukY3baTgR9XoYaagJpxPaBHFxtyzNwE88X3qH4SSDEtMqvEox6KSt463jN2Z9rTEr8WvAanDCx7VE2R`](https://explorer.solana.com/tx/4CAe6Pz5bukY3baTgR9XoYaagJpxPaBHFxtyzNwE88X3qH4SSDEtMqvEox6KSt463jN2Z9rTEr8WvAanDCx7VE2R?cluster=devnet)
- Evidencia técnica: [registro de metadata en devnet](docs/metadata-devnet.md)
- Estado: mint y metadata de pruebas creados; supply sin emitir

#### Recursos públicos de devnet

- Sitio oficial: <https://avicoin.avicell.com.mx/>
- Metadata URI: <https://avicoin.avicell.com.mx/metadata.json>
- Logo: <https://avicoin.avicell.com.mx/logo.png>
- Estado de metadata on-chain: **Creada y verificada en devnet**

#### Devnet Token Lifecycle Validation

El ciclo técnico de emisión, transferencia, devolución y burn fue validado completamente en devnet el 2026-07-22. Se emitió temporalmente `1 AVI`, se transfirieron `0.1 AVI` a una segunda wallet controlada, se devolvieron y finalmente se quemó `1 AVI`. El supply y los balances de ambos ATA terminaron nuevamente en `0`; metadata, URI y authorities permanecieron sin cambios.

La evidencia, slots, firmas y comandos de verificación están en [docs/devnet-token-lifecycle.md](docs/devnet-token-lifecycle.md).

### Mainnet-beta

Estado: **mint y metadata Mainnet creados y verificados / supply 0 / lanzamiento incompleto**.

- Wallet de producción Phantom: `EYCMAVd2nSNDZkt3XTBzjKRY7QYFqb6k8oE1DSG5eFkq` (sólo public key).
- Mint address: [`GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC`](https://explorer.solana.com/address/GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC).
- Transacción create-mint: [`4nhedBupr9cpyFh3ZFKrUboGaDHnnuCRdtCvyPBsidAX1Smk79hVtmXK8snr8jhUGbYYQZMWKWTg7Q4qWM7UegkH`](https://explorer.solana.com/tx/4nhedBupr9cpyFh3ZFKrUboGaDHnnuCRdtCvyPBsidAX1Smk79hVtmXK8snr8jhUGbYYQZMWKWTg7Q4qWM7UegkH).
- Decimales: 9; supply actual: 0 AVI.
- Supply inicial autorizado: una sola operación `mintTo` de exactamente 1,000 AVI cuando supply sea 0.
- Supply máximo permanente: no definido (`null`). No se autoriza emisión adicional en esta etapa.
- Freeze authority: ninguna.
- Mint authority: retenida temporalmente por la wallet de producción; esto no garantiza supply fijo ni autoriza nuevas emisiones.
- Pool AVI/USDC: no creado; diseño educativo con liquidez extremadamente baja.
- Metadata on-chain: [`4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2`](https://explorer.solana.com/address/4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2), creada con nombre `AVICOIN`, símbolo `AVI`, seller fee 0, URI pública exacta y update authority de producción.
- Transacción create-metadata: [`38YgPFw4a3Z4m5LQdJAbLvjCjhU34yT9ksUsgWf1jXBQdXjwRwwz8ANx6KB4zpEi8U8W3ycDMgWb6GDNErMEcvJz`](https://explorer.solana.com/tx/38YgPFw4a3Z4m5LQdJAbLvjCjhU34yT9ksUsgWf1jXBQdXjwRwwz8ANx6KB4zpEi8U8W3ycDMgWb6GDNErMEcvJz).
- ATA oficial: [`H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE`](https://explorer.solana.com/address/H2qdPNJH668Jx85Moed7pLU1AyApAdnvNiVvpRdyrgGE), owner de producción, mint AVICOIN y balance `0 AVI`.
- Transacción create-ata: [`1Dqyd5tV4CnaQSPDydrLRaN5pgDUjMwGGEY2Yah6trt259ETZQdLKzsL2LyTqHPipGNwhiu1X5BqC72fU1CteeH`](https://explorer.solana.com/tx/1Dqyd5tV4CnaQSPDydrLRaN5pgDUjMwGGEY2Yah6trt259ETZQdLKzsL2LyTqHPipGNwhiu1X5BqC72fU1CteeH), finalizada en el slot `434624296`.
- Metadata pública: <https://avicoin.avicell.com.mx/metadata-mainnet.json>, actualizada al estado creado y verificada con SHA-256 `f3d87b8c254b190218a2a8b94630b8ef764555b18ce72ba657f1b2677daffb90`.
- Estado de seguridad: `create-mint`, `create-metadata` y `create-ata` finalizados una vez; `ALLOW_MAINNET=false`; firmas Phantom: 3; transacciones Mainnet: 3. No se autoriza repetir ninguna de esas operaciones.

La evidencia exacta está en [mainnet-token](docs/mainnet-token.md) y [mainnet-metadata](docs/mainnet-metadata.md). El procedimiento y sus aprobaciones separadas están en [mainnet-runbook](docs/mainnet-runbook.md). Véanse también [readiness](docs/mainnet-readiness.md), [política de wallet](docs/mainnet-wallet-policy.md), [diseño del pool](docs/mainnet-pool-design.md) y [riesgos](docs/mainnet-risk-disclosure.md).
