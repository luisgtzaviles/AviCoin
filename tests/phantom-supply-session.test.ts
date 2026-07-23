import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PublicKey, TransactionMessage, type VersionedMessage, type VersionedTransaction } from "@solana/web3.js";
import { MAINNET_CONFIG, MAINNET_PRODUCTION_WALLET } from "../config/index.js";
import { AVICOIN_MAINNET_ATA, AVICOIN_MAINNET_MINT } from "../scripts/lib/phantom-ata-session.js";
import {
  FIXED_SUPPLY_CONFIRMATION_TOKEN,
  PhantomFixedSupplyCoordinator,
  fixedSupplyInstruction,
  type SupplyRecoveryRecord,
  type SupplyRecoveryStore,
  type SupplyRpc,
  type SupplyTokenAccount,
} from "../scripts/lib/phantom-supply-session.js";

class MemoryRecovery implements SupplyRecoveryStore {
  record: SupplyRecoveryRecord | null = null;
  async load() { return this.record; }
  async save(record: SupplyRecoveryRecord) { this.record = record; }
}

const officialAta = (amount = 0n): SupplyTokenAccount => ({
  address: AVICOIN_MAINNET_ATA,
  programOwner: MAINNET_CONFIG.programs.splToken,
  mint: AVICOIN_MAINNET_MINT,
  owner: MAINNET_PRODUCTION_WALLET,
  amount,
});

class FakeSupplyRpc implements SupplyRpc {
  supply = 0n;
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
  async readMint(_address: PublicKey) {
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
    operation: "mint-fixed-supply",
    confirmationToken: FIXED_SUPPLY_CONFIRMATION_TOKEN,
    ...overrides,
  };
}

function coordinator(rpc = new FakeSupplyRpc(), runtimeOverrides: Record<string, unknown> = {}) {
  let metadataChecks = 0;
  const instance = new PhantomFixedSupplyCoordinator(rpc, () => runtime(runtimeOverrides), new MemoryRecovery(), async () => undefined, async () => { metadataChecks += 1; });
  return { instance, rpc, metadataChecks: () => metadataChecks };
}

async function reviewed(instance: PhantomFixedSupplyCoordinator) {
  const built = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" });
  return instance.review({ sessionId: built.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: built.plan.planHash });
}

describe("coordinador Phantom mint-fixed-supply", () => {
  it("construye una única mintToChecked exacta de 1,000 AVI al ATA oficial", async () => {
    const { instance, rpc, metadataChecks } = coordinator();
    const session = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" });
    assert.equal(session.plan.operation, "mint-fixed-supply");
    assert.equal(session.plan.mintAddress, AVICOIN_MAINNET_MINT);
    assert.equal(session.plan.destinationAta, AVICOIN_MAINNET_ATA);
    assert.equal(session.plan.amountAvi, "1000");
    assert.equal(session.plan.amountBaseUnits, "1000000000000");
    assert.equal(session.plan.decimals, 9);
    assert.equal(session.plan.instruction, "spl-token:mintToChecked");
    assert.deepEqual(session.plan.signerAccounts, [MAINNET_PRODUCTION_WALLET]);
    assert.equal(rpc.sent, 0);
    assert.equal(metadataChecks(), 1);
  });

  it("codifica cantidad, mint, ATA y autoridad sin parámetros variables", () => {
    const wallet = new PublicKey(MAINNET_PRODUCTION_WALLET);
    const mint = new PublicKey(AVICOIN_MAINNET_MINT);
    const ata = new PublicKey(AVICOIN_MAINNET_ATA);
    const instruction = fixedSupplyInstruction(wallet, mint, ata);
    const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: "11111111111111111111111111111111", instructions: [instruction] }).compileToLegacyMessage();
    assert.equal(message.instructions.length, 1);
    assert.equal(instruction.programId.toBase58(), MAINNET_CONFIG.programs.splToken);
    assert.equal(instruction.keys[0]?.pubkey.toBase58(), AVICOIN_MAINNET_MINT);
    assert.equal(instruction.keys[1]?.pubkey.toBase58(), AVICOIN_MAINNET_ATA);
    assert.equal(instruction.keys[2]?.pubkey.toBase58(), MAINNET_PRODUCTION_WALLET);
    assert.equal(Buffer.from(instruction.data).toString("hex"), "0e0010a5d4e800000009");
  });

  it("Prepare exige Review, token exacto y primera confirmación", async () => {
    const { instance } = coordinator();
    const built = await instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" });
    const common = { sessionId: built.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: built.plan.planHash };
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: FIXED_SUPPLY_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /Transición inválida/);
    const reviewedSession = await instance.review(common);
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: `${FIXED_SUPPLY_CONFIRMATION_TOKEN} `, explicitlyConfirmed: true }), /Token/);
    await assert.rejects(instance.prepareFreshTransaction({ ...common, confirmationToken: FIXED_SUPPLY_CONFIRMATION_TOKEN, explicitlyConfirmed: false }), /Confirma/);
    assert.equal(reviewedSession.planReviewed, true);
  });

  it("simula sin firmar, enviar ni cambiar el estado Review autoritativo", async () => {
    const { instance, rpc } = coordinator();
    const session = await reviewed(instance);
    const prepared = await instance.prepareFreshTransaction({ sessionId: session.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: session.plan.planHash, confirmationToken: FIXED_SUPPLY_CONFIRMATION_TOKEN, explicitlyConfirmed: true });
    assert.equal(prepared.status, "simulated");
    assert.equal(prepared.planReviewed, true);
    assert.equal(prepared.freshTransaction?.canRequestSignature, true);
    assert.equal(rpc.simulated, 1);
    assert.equal(rpc.sent, 0);
  });

  it("rechaza red, operación, wallet, ALLOW_MAINNET falso y supply no cero", async () => {
    await assert.rejects(coordinator(new FakeSupplyRpc(), { network: "devnet" }).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" }), /mainnet-beta/);
    await assert.rejects(coordinator().instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "create-ata" }), /Sólo mint-fixed-supply/);
    await assert.rejects(coordinator().instance.build({ connectedWallet: "11111111111111111111111111111111", operation: "mint-fixed-supply" }), /wallet Phantom/);
    const nonzero = new FakeSupplyRpc(); nonzero.supply = 1n;
    await assert.rejects(coordinator(nonzero).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" }), /Supply inesperado/);
    const { instance } = coordinator(new FakeSupplyRpc(), { allowMainnet: false });
    const session = await reviewed(instance);
    await assert.rejects(instance.prepareFreshTransaction({ sessionId: session.sessionId, connectedWallet: MAINNET_PRODUCTION_WALLET, planHash: session.plan.planHash, confirmationToken: FIXED_SUPPLY_CONFIRMATION_TOKEN, explicitlyConfirmed: true }), /ALLOW_MAINNET/);
  });

  it("rechaza ATA no vacío, otra cuenta del mint y autoridades alteradas", async () => {
    const nonzeroAta = new FakeSupplyRpc(); nonzeroAta.ata = officialAta(1n); nonzeroAta.accounts = [officialAta(1n)];
    await assert.rejects(coordinator(nonzeroAta).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" }), /ATA oficial/);
    const duplicate = new FakeSupplyRpc(); duplicate.accounts.push({ ...officialAta(), address: "11111111111111111111111111111111" });
    await assert.rejects(coordinator(duplicate).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" }), /otra cuenta SPL/);
    const wrongAuthority = new FakeSupplyRpc();
    wrongAuthority.readMint = async () => ({ owner: MAINNET_CONFIG.programs.splToken, snapshot: { decimals: 9, supply: 0n, mintAuthority: "11111111111111111111111111111111", freezeAuthority: null } });
    await assert.rejects(coordinator(wrongAuthority).instance.build({ connectedWallet: MAINNET_PRODUCTION_WALLET, operation: "mint-fixed-supply" }), /mint authority no coincide/i);
  });

  it("frontend y servidor bloquean cuentas, metadata, autoridades, pools y swaps", async () => {
    const sources = await Promise.all([
      readFile("scripts/lib/phantom-supply-session.ts", "utf8"),
      readFile("scripts/phantom/supply-server.ts", "utf8"),
      readFile("tools/phantom-supply/app.js", "utf8"),
    ]);
    assert.match(sources[0], /createMintToCheckedInstruction/);
    assert.doesNotMatch(sources.join("\n"), /createAssociatedTokenAccount|createMetadataAccount|setAuthority|Keypair|secretKey|seed phrase/iu);
    assert.match(sources[2], /"create-ATA"/);
    assert.match(sources[2], /"create-pool"/);
    assert.match(sources[2], /"swaps"/);
    assert.match(sources[2], /— bloqueada/);
  });
});
