import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PublicKey, type VersionedMessage, type VersionedTransaction } from "@solana/web3.js";
import { MAINNET_CONFIG, MAINNET_PRODUCTION_WALLET } from "../config/index.js";
import { AVICOIN_MAINNET_ATA, AVICOIN_MAINNET_MINT } from "../scripts/lib/phantom-ata-session.js";
import {
  FINAL_SUPPLY_CONFIRMATION_TOKEN,
  FINAL_SUPPLY_ISSUANCE_BASE_UNITS,
  FINAL_SUPPLY_POLICY,
  FINAL_SUPPLY_TOTAL_BASE_UNITS,
  PhantomFixedSupplyCoordinator,
  finalSupplyInstruction,
  type SupplyRecoveryRecord,
  type SupplyRecoveryStore,
  type SupplyRpc,
  type SupplyTokenAccount,
} from "../scripts/lib/phantom-supply-session.js";

const CURRENT_SUPPLY = 1_000_000_000_000n;

class MemoryRecovery implements SupplyRecoveryStore {
  record: SupplyRecoveryRecord | null = null;
  async load() { return this.record; }
  async save(record: SupplyRecoveryRecord) { this.record = record; }
}

const officialAta = (amount = CURRENT_SUPPLY): SupplyTokenAccount => ({
  address: AVICOIN_MAINNET_ATA,
  programOwner: MAINNET_CONFIG.programs.splToken,
  mint: AVICOIN_MAINNET_MINT,
  owner: MAINNET_PRODUCTION_WALLET,
  amount,
});

class FakeFinalSupplyRpc implements SupplyRpc {
  supply = CURRENT_SUPPLY;
  ata: SupplyTokenAccount | null = officialAta();
  accounts: SupplyTokenAccount[] = [officialAta()];
  simulated = 0;
  sent = 0;
  blockHeight = 100;
  async getGenesisHash() { return MAINNET_CONFIG.genesisHash; }
  async getBalance() { return 300_000_000n; }
  async getLatestBlockhash() { return { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 250 }; }
  async getFeeForMessage(_message: VersionedMessage) { return 5_050n; }
  async simulate(_transaction: VersionedTransaction) { this.simulated += 1; return { logs: ["spl-token:mintToChecked success"], unitsConsumed: 8_000 }; }
  async getBlockHeight() { return this.blockHeight; }
  async sendRawTransaction() { this.sent += 1; return "unused"; }
  async confirmFinalized() {}
  async getSignatureStatus() { return null; }
  async readMint() {
    return { owner: MAINNET_CONFIG.programs.splToken, snapshot: { decimals: 9, supply: this.supply, mintAuthority: MAINNET_PRODUCTION_WALLET, freezeAuthority: null } };
  }
  async readAta() { return this.ata; }
  async listMintAccounts() { return this.accounts; }
}

function runtime(overrides: Record<string, unknown> = {}) {
  return {
    network: "mainnet-beta",
    rpcUrl: MAINNET_CONFIG.rpcUrl,
    expectedGenesisHash: MAINNET_CONFIG.genesisHash,
    productionWallet: MAINNET_PRODUCTION_WALLET,
    allowMainnet: true,
    operation: "mint-final-supply",
    confirmationToken: FINAL_SUPPLY_CONFIRMATION_TOKEN,
    ...overrides,
  };
}

function coordinator(rpc = new FakeFinalSupplyRpc(), runtimeOverrides: Record<string, unknown> = {}) {
  const instance = new PhantomFixedSupplyCoordinator(
    rpc,
    () => runtime(runtimeOverrides),
    new MemoryRecovery(),
    async () => undefined,
    async () => undefined,
    async () => undefined,
    undefined,
    FINAL_SUPPLY_POLICY,
  );
  return { instance, rpc };
}

async function reviewed(instance: PhantomFixedSupplyCoordinator) {
  const built = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-final-supply" });
  return instance.review({ sessionId: built.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: built.plan.planHash });
}

describe("coordinador Phantom mint-final-supply", () => {
  it("fija la emisión en 99,999,000 AVI y el resultado en 100,000,000 AVI", async () => {
    const { instance, rpc } = coordinator();
    const session = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-final-supply" });
    assert.equal(session.plan.operation, "mint-final-supply");
    assert.equal(session.plan.amountAvi, "99999000");
    assert.equal(session.plan.amountBaseUnits, FINAL_SUPPLY_ISSUANCE_BASE_UNITS.toString());
    assert.equal(session.plan.currentSupplyBaseUnits, CURRENT_SUPPLY.toString());
    assert.equal(session.plan.finalSupplyAvi, "100000000");
    assert.equal(session.plan.finalSupplyBaseUnits, FINAL_SUPPLY_TOTAL_BASE_UNITS.toString());
    assert.equal(session.plan.mintAddress, AVICOIN_MAINNET_MINT);
    assert.equal(session.plan.destinationAta, AVICOIN_MAINNET_ATA);
    assert.equal(rpc.sent, 0);
  });

  it("codifica una sola mintToChecked con cantidad exacta y sin parámetros variables", () => {
    const instruction = finalSupplyInstruction(
      new PublicKey(MAINNET_PRODUCTION_WALLET),
      new PublicKey(AVICOIN_MAINNET_MINT),
      new PublicKey(AVICOIN_MAINNET_ATA),
    );
    assert.equal(instruction.programId.toBase58(), MAINNET_CONFIG.programs.splToken);
    assert.equal(instruction.keys[0]?.pubkey.toBase58(), AVICOIN_MAINNET_MINT);
    assert.equal(instruction.keys[1]?.pubkey.toBase58(), AVICOIN_MAINNET_ATA);
    assert.equal(instruction.keys[2]?.pubkey.toBase58(), MAINNET_PRODUCTION_WALLET);
    assert.equal(Buffer.from(instruction.data).toString("hex"), "0e00f0e4888f44630109");
  });

  it("se detiene si supply o ATA no son exactamente 1,000 AVI", async () => {
    const wrongSupply = new FakeFinalSupplyRpc();
    wrongSupply.supply = CURRENT_SUPPLY + 1n;
    await assert.rejects(coordinator(wrongSupply).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-final-supply" }), /Supply inesperado/);

    const wrongAta = new FakeFinalSupplyRpc();
    wrongAta.ata = officialAta(CURRENT_SUPPLY - 1n);
    wrongAta.accounts = [officialAta(CURRENT_SUPPLY - 1n)];
    await assert.rejects(coordinator(wrongAta).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-final-supply" }), /ATA oficial/);
  });

  it("rechaza otra cuenta del mint y no calcula una diferencia automática", async () => {
    const duplicate = new FakeFinalSupplyRpc();
    duplicate.accounts.push({ ...officialAta(), address: "11111111111111111111111111111111" });
    await assert.rejects(coordinator(duplicate).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-final-supply" }), /otra cuenta SPL/);
    assert.equal(FINAL_SUPPLY_POLICY.issuanceBaseUnits, FINAL_SUPPLY_ISSUANCE_BASE_UNITS);
  });

  it("Prepare exige Review, token exacto y primera confirmación", async () => {
    const { instance } = coordinator();
    const built = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-final-supply" });
    const common = { sessionId: built.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: built.plan.planHash };
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: FINAL_SUPPLY_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /Transición inválida/);
    await instance.review(common);
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: `${FINAL_SUPPLY_CONFIRMATION_TOKEN} `, explicitlyConfirmed: true }), /Token/);
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: FINAL_SUPPLY_CONFIRMATION_TOKEN, explicitlyConfirmed: false }), /Confirma/);
  });

  it("simula sin firmar ni enviar y conserva Review autoritativo", async () => {
    const { instance, rpc } = coordinator();
    const session = await reviewed(instance);
    const prepared = await instance.prepareFreshTransaction({
      sessionId: session.sessionId,
      connectedWallet: MAINNET_PRODUCTION_WALLET,
      planHash: session.plan.planHash,
      confirmationToken: FINAL_SUPPLY_CONFIRMATION_TOKEN,
      explicitlyConfirmed: true,
    });
    assert.equal(prepared.status, "simulated");
    assert.equal(prepared.planReviewed, true);
    assert.equal(prepared.freshTransaction?.canRequestSignature, true);
    assert.equal(rpc.simulated, 1);
    assert.equal(rpc.sent, 0);
  });

  it("rechaza Devnet, operación distinta, wallet distinta y ALLOW_MAINNET falso", async () => {
    await assert.rejects(coordinator(new FakeFinalSupplyRpc(), { network: "devnet" }).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-final-supply" }), /mainnet-beta/);
    await assert.rejects(coordinator().instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" }), /Sólo mint-final-supply/);
    await assert.rejects(coordinator().instance.build({ connectedWallet: "11111111111111111111111111111111", operation: "mint-final-supply" }), /wallet Phantom/);
    const { instance } = coordinator(new FakeFinalSupplyRpc(), { allowMainnet: false });
    const session = await reviewed(instance);
    await assert.rejects(instance.prepareFreshTransaction({ sessionId: session.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: session.plan.planHash, confirmationToken: FINAL_SUPPLY_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /ALLOW_MAINNET/);
  });

  it("frontend bloquea cualquier operación fuera de la emisión exacta", async () => {
    const sources = await Promise.all([
      readFile("scripts/lib/phantom-supply-session.ts", "utf8"),
      readFile("scripts/phantom/final-supply-server.ts", "utf8"),
      readFile("tools/phantom-final-supply/app.js", "utf8"),
    ]);
    assert.match(sources[0], /99_999_000_000_000_000n/);
    assert.doesNotMatch(sources.join("\n"), /createAssociatedTokenAccount|createMetadataAccount|setAuthority|Keypair|secretKey|seed phrase/iu);
    assert.match(sources[2], /"create-mint"/);
    assert.match(sources[2], /"create-pool"/);
    assert.match(sources[2], /"swaps"/);
    assert.match(sources[2], /— bloqueada/);
  });
});
