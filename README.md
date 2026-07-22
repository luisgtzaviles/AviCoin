# AVICOIN

AVICOIN es una base educativa para preparar un token SPL de Solana orientado inicialmente al aprendizaje y a transferencias entre amigos. **No representa acciones, deuda, participación empresarial ni promesa de rendimiento, precio o valor financiero.**

## Estado actual

Existe un mint de pruebas y su cuenta de metadata en devnet, registrados en la sección de despliegues. No se emitieron tokens y AVICOIN no existe en mainnet. La preparación técnica de Mainnet está en curso: no hay wallet de producción designada, fondeo, mint, pool ni posición. La licencia está **pendiente de definir**.

La propuesta inicial es: nombre `AVICOIN`, símbolo `AVI`, devnet, 9 decimales, supply de referencia de 100,000,000 AVI (no emitido), mint authority conservada inicialmente y freeze authority pendiente de decisión. Véanse [tokenomics](docs/tokenomics.md) y [roadmap](docs/roadmap.md).

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

`devnet` es una red de pruebas cuyos tokens y SOL no tienen valor real. `mainnet-beta` es la red productiva y cualquier error puede ser irreversible. Mainnet permanece bloqueada salvo que coincidan el genesis hash real, red, RPC, operación exacta, wallet pública esperada y signer; además requiere `ALLOW_MAINNET=true`, un dry-run fresco con parámetros idénticos y confirmación interactiva. El recibo local no autoriza por sí mismo ninguna operación.

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

Estado: **Mainnet preparation in progress / no Mainnet token created**.

- Wallet de producción: no designada.
- Mint address: pendiente.
- Supply propuesto: exactamente 1,000 AVI sólo después de metadata verificada.
- Freeze authority: ninguna.
- Mint authority: se revocaría únicamente tras verificar supply fijo e invariantes.
- Pool AVI/USDC: no creado; diseño educativo con liquidez extremadamente baja.
- Metadata preparada localmente: `site/metadata-mainnet.json`; publicación pública pendiente.

El procedimiento y sus aprobaciones separadas están en [mainnet-runbook](docs/mainnet-runbook.md). Véanse también [readiness](docs/mainnet-readiness.md), [política de wallet](docs/mainnet-wallet-policy.md), [diseño del pool](docs/mainnet-pool-design.md) y [riesgos](docs/mainnet-risk-disclosure.md).
