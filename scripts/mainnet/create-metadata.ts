import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { isDirectExecution, reportFailure } from "../lib/entrypoint.js";
import { assertMainnetMetadata, metadataPda, sendMetadataCreation, simulateMetadataCreation, validatePublishedMainnetMetadata } from "../lib/mainnet-metadata.js";
import { fetchAndAssertMint } from "../lib/mainnet-token.js";
import { assertOnlyArguments, confirmMutation, executeAfterDryRunRequested, executeGuarded, safeOperationSummary } from "../lib/safety.js";
import { assertStateAllows, loadMainnetState, writeMainnetState } from "../lib/state.js";
import { mainnetRuntime } from "./common.js";
import { PublicKey } from "@solana/web3.js";

export async function main(): Promise<void> {
  assertOnlyArguments(process.argv.slice(2), ["--dry-run", "--execute-after-dry-run"]);
  const state = await loadMainnetState();
  assertStateAllows(state, "create-metadata");
  if (state.metadata_created || state.metadata_pda) throw new Error("El estado ya registra metadata Mainnet.");
  const mintAddress = state.avi_mint as string;
  const runtime = await mainnetRuntime("create-metadata", { mintAddress, uri: "https://avicoin.avicell.com.mx/metadata-mainnet.json", sellerFeeBasisPoints: 0, isMutable: false });
  const publicAssets = await validatePublishedMainnetMetadata(runtime.config.TOKEN_METADATA_URI);
  console.table(publicAssets);
  await fetchAndAssertMint(runtime.connection, new PublicKey(mintAddress), { authority: runtime.operator.publicKey.toBase58(), supply: 0n });
  const umi = createUmi(runtime.config.SOLANA_RPC_URL);
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(runtime.operator.secretKey);
  const pda = metadataPda(runtime.config.SOLANA_RPC_URL, mintAddress);
  const existing = await runtime.connection.getAccountInfo(new PublicKey(pda), "confirmed");
  if (existing) throw new Error("La metadata PDA ya existe; no se intentará recrearla.");
  const context = { ...runtime.context, parameters: { ...runtime.context.parameters, metadataPda: pda } };
  console.table(safeOperationSummary(context));
  const guarded = await executeGuarded({
    dryRun: runtime.dryRun,
    executeAfterDryRun: executeAfterDryRunRequested(),
    context,
    simulate: () => simulateMetadataCreation(runtime.config.SOLANA_RPC_URL, runtime.operator.publicKey.toBase58(), mintAddress),
    confirm: () => confirmMutation(runtime.config, "CREAR METADATA MAINNET INMUTABLE"),
    execute: async () => {
      const signature = await sendMetadataCreation(runtime.config.SOLANA_RPC_URL, umiKeypair, mintAddress);
      const confirmedPda = await assertMainnetMetadata(runtime.config.SOLANA_RPC_URL, mintAddress, runtime.config.TOKEN_METADATA_URI);
      if (confirmedPda !== pda) throw new Error("La metadata confirmada no coincide con la PDA derivada.");
      await writeMainnetState({ ...state, metadata_pda: pda, metadata_created: true });
      return signature;
    },
  });
  console.log(guarded.mode === "dry-run" ? `Dry-run PASS. Recibo: ${guarded.receipt}` : `Transacción enviada: ${guarded.result}`);
}

if (isDirectExecution(import.meta.url)) void main().catch(reportFailure);
