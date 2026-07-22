import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAINNET_CONFIG, MAINNET_INITIAL_LAUNCH_BASE_UNITS, MAINNET_PRODUCTION_WALLET, MAINNET_USDC_MINT } from "../config/index.js";
import { DEVNET_CONFIG } from "../config/devnet.js";
import { loadConfig } from "../scripts/lib/config.js";

describe("configuración multired", () => {
  it("preserva el mint y metadata históricos de devnet", () => {
    assert.equal(DEVNET_CONFIG.token.mintAddress, "8gmaV76WHvxG4Bkp865ufxSwWPNGqa5nQA6Sj8NwRqyK");
    assert.equal(DEVNET_CONFIG.token.metadataUri, "https://avicoin.avicell.com.mx/metadata.json");
  });

  it("mainnet inicia sin mint y con la public key Phantom designada", () => {
    const config = loadConfig({ SOLANA_NETWORK: "mainnet-beta", SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com", TOKEN_MINT_ADDRESS: DEVNET_CONFIG.token.mintAddress });
    assert.equal(config.TOKEN_MINT_ADDRESS, "");
    assert.equal(config.NETWORK_CONFIG.operatorWallet, MAINNET_PRODUCTION_WALLET);
    assert.equal(MAINNET_CONFIG.token.mintAddress, null);
  });

  it("separa emisión inicial de máximo permanente", () => {
    const config = loadConfig({ SOLANA_NETWORK: "mainnet-beta", TOKEN_SUPPLY: "999999" });
    assert.equal(config.TOKEN_SUPPLY, "1000");
    assert.equal(MAINNET_INITIAL_LAUNCH_BASE_UNITS, 1_000_000_000_000n);
    assert.equal(config.NETWORK_CONFIG.supplyPolicy.initialLaunchBaseUnits, MAINNET_INITIAL_LAUNCH_BASE_UNITS);
    assert.equal(config.NETWORK_CONFIG.supplyPolicy.launchMintOperationsAllowed, 1);
    assert.equal(config.NETWORK_CONFIG.supplyPolicy.permanentMaxSupplyBaseUnits, null);
    assert.equal(config.NETWORK_CONFIG.supplyPolicy.mintAuthorityPolicy, "retained_temporarily");
  });

  it("fija el mint oficial y 6 decimales de USDC", () => {
    assert.equal(MAINNET_CONFIG.usdc.mint, MAINNET_USDC_MINT);
    assert.equal(MAINNET_CONFIG.usdc.decimals, 6);
  });

  it("rechaza ALLOW_MAINNET con devnet", () => {
    assert.throws(() => loadConfig({ SOLANA_NETWORK: "devnet", ALLOW_MAINNET: "true" }), /solo es válido/);
  });
});
