import { address, createSolanaRpc } from "@solana/kit";
import { fetchWhirlpoolsByTokenPair, WhirlpoolDeployment } from "@orca-so/whirlpools";
import { MAINNET_USDC_MINT } from "../../config/mainnet.js";
import { loadConfig } from "../lib/config.js";
import { loadMainnetState } from "../lib/state.js";
import { createConnection, verifiedGenesisHash } from "../lib/solana.js";

export async function mainnetPoolLookup() {
  const config = loadConfig();
  if (config.SOLANA_NETWORK !== "mainnet-beta") throw new Error("La consulta Orca Mainnet requiere SOLANA_NETWORK=mainnet-beta.");
  await verifiedGenesisHash(createConnection(config), config);
  const state = await loadMainnetState();
  if (!state.mint_created || !state.avi_mint) throw new Error("El mint Mainnet aún no está registrado; no se puede derivar el par.");
  const rpc = createSolanaRpc(config.SOLANA_RPC_URL);
  const pools = await fetchWhirlpoolsByTokenPair(rpc, address(state.avi_mint), address(MAINNET_USDC_MINT), WhirlpoolDeployment.mainnet);
  return { config, state, rpc, pools };
}
