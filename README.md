# AVICOIN

AVICOIN es una base educativa para preparar un token SPL de Solana orientado inicialmente al aprendizaje y a transferencias entre amigos. **No representa acciones, deuda, participación empresarial ni promesa de rendimiento, precio o valor financiero.**

## Estado actual

Solo existen documentación y scripts administrativos preparados para uso posterior. No se creó ningún mint, no se emitieron tokens y AVICOIN no existe en mainnet. La mint address está **Pendiente**. La licencia también está **pendiente de definir**.

La propuesta inicial es: nombre `AVICOIN`, símbolo `AVI`, devnet, 9 decimales, supply de referencia de 100,000,000 AVI (no emitido), mint authority conservada inicialmente y freeze authority pendiente de decisión. Véanse [tokenomics](docs/tokenomics.md) y [roadmap](docs/roadmap.md).

El logo final `docs/logo.png` está pendiente. [logo-placeholder.svg](docs/logo-placeholder.svg) es solo un marcador original y claramente identificado; no debe publicarse como logo definitivo.

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

`devnet` es una red de pruebas cuyos tokens y SOL no tienen valor real. `mainnet-beta` es la red productiva y cualquier error puede ser irreversible. Mainnet permanece bloqueada salvo que coincidan `SOLANA_NETWORK=mainnet-beta`, `ALLOW_MAINNET=true`, el RPC tenga el genesis hash correcto y se escriba la frase interactiva exacta. Cada mutación en devnet también exige confirmación. Los scripts rechazan ejecución no interactiva.

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

## Registro del mint

| Red | Mint address | Estado |
|---|---|---|
| devnet | Pendiente | No creado |
| mainnet-beta | Pendiente | Fuera del alcance actual |
