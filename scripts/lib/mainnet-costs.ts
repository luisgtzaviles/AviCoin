export const MAINNET_ACCOUNT_SIZES = {
  mint: 82,
  metadata: 679,
  tokenAccount: 165,
  whirlpool: 653,
  position: 216,
  tickArray: 9_988,
} as const;

export interface CostLine {
  readonly category: string;
  readonly minimumLamports: bigint;
  readonly maximumLamports: bigint;
  readonly recoverable: "yes" | "no" | "conditional";
  readonly assumption: string;
}

export interface MainnetCostEstimate {
  readonly lines: readonly CostLine[];
  readonly minimumLamports: bigint;
  readonly maximumBeforeMarginLamports: bigint;
  readonly recommendedMarginBps: number;
  readonly maximumWithMarginLamports: bigint;
  readonly walletBalanceLamports: bigint;
  readonly expectedRemainderLamports: bigint;
  readonly requiresMoreSol: boolean;
}

export async function estimateMainnetLaunchCosts(
  rentForSize: (size: number) => Promise<bigint>,
  walletBalanceLamports: bigint,
): Promise<MainnetCostEstimate> {
  const rent = async (size: number, count = 1) => (await rentForSize(size)) * BigInt(count);
  const mint = await rent(MAINNET_ACCOUNT_SIZES.mint);
  const metadata = await rent(MAINNET_ACCOUNT_SIZES.metadata);
  const ata = await rent(MAINNET_ACCOUNT_SIZES.tokenAccount);
  const whirlpool = await rent(MAINNET_ACCOUNT_SIZES.whirlpool);
  const position = await rent(MAINNET_ACCOUNT_SIZES.position);
  const tickArray = await rent(MAINNET_ACCOUNT_SIZES.tickArray);
  const baseFee = 5_000n;
  const lines: CostLine[] = [
    { category: "mint", minimumLamports: mint, maximumLamports: mint, recoverable: "no", assumption: "SPL Mint de 82 bytes" },
    { category: "metadata", minimumLamports: metadata, maximumLamports: metadata, recoverable: "no", assumption: "cuenta metadata hasta 679 bytes" },
    { category: "ATA AVI producción", minimumLamports: ata, maximumLamports: ata, recoverable: "conditional", assumption: "una cuenta SPL de 165 bytes" },
    { category: "emisión 1,000 AVI", minimumLamports: 0n, maximumLamports: 0n, recoverable: "no", assumption: "sin renta adicional; fee contado abajo" },
    { category: "Whirlpool y dos vaults", minimumLamports: whirlpool + ata * 2n, maximumLamports: whirlpool + ata * 2n, recoverable: "no", assumption: "pool de 653 bytes y dos cuentas token" },
    { category: "posición", minimumLamports: position + mint + ata, maximumLamports: position + mint + ata, recoverable: "conditional", assumption: "posición, position mint y su ATA" },
    { category: "tick arrays", minimumLamports: tickArray * 2n, maximumLamports: tickArray * 3n, recoverable: "no", assumption: "dos requeridos por rango; reserva máxima de tres" },
    { category: "depósito de liquidez", minimumLamports: 0n, maximumLamports: 0n, recoverable: "conditional", assumption: "sin cuentas adicionales fuera de las anteriores" },
    { category: "ATA wallet de prueba", minimumLamports: ata, maximumLamports: ata * 2n, recoverable: "conditional", assumption: "una o dos ATA según estado USDC/AVI" },
    { category: "compra y venta educativas", minimumLamports: 0n, maximumLamports: 0n, recoverable: "no", assumption: "fees contados abajo; no incluye pérdida económica/slippage" },
    { category: "fees de red", minimumLamports: baseFee * 10n, maximumLamports: baseFee * 16n, recoverable: "no", assumption: "10 a 16 firmas a 5,000 lamports; releer antes de firmar" },
  ];
  const minimumLamports = lines.reduce((sum, line) => sum + line.minimumLamports, 0n);
  const maximumBeforeMarginLamports = lines.reduce((sum, line) => sum + line.maximumLamports, 0n);
  const recommendedMarginBps = 2_500;
  const maximumWithMarginLamports = (maximumBeforeMarginLamports * BigInt(10_000 + recommendedMarginBps) + 9_999n) / 10_000n;
  return {
    lines,
    minimumLamports,
    maximumBeforeMarginLamports,
    recommendedMarginBps,
    maximumWithMarginLamports,
    walletBalanceLamports,
    expectedRemainderLamports: walletBalanceLamports - maximumWithMarginLamports,
    requiresMoreSol: walletBalanceLamports < maximumWithMarginLamports,
  };
}
