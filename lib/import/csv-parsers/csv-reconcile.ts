/**
 * Spójność kwot przy imporcie CSV (jedna zbiorcza pozycja).
 */

export function warnTotalsConsistency(
  netTotal: number,
  vatTotal: number,
  grossTotal: number,
  warnings: string[],
  label?: string,
): string | undefined {
  const prefix = label ? `${label}: ` : '';
  let netRate: string | undefined;

  if (netTotal > 0 && Math.abs(netTotal + vatTotal - grossTotal) > 0.02) {
    warnings.push(
      `${prefix}Netto+VAT (${(netTotal + vatTotal).toFixed(2)}) ≠ Brutto (${grossTotal.toFixed(2)})`,
    );
  }

  if (netTotal > 0 && vatTotal >= 0) {
    const pct = Math.round((vatTotal / netTotal) * 1000) / 10;
    if (Number.isFinite(pct) && pct >= 0 && pct < 100) {
      const snapped = snapVatPercent(pct);
      if (snapped != null) netRate = String(snapped);
    }
  }

  return netRate;
}

function snapVatPercent(pct: number): number | null {
  const candidates = [23, 22, 8, 7, 5, 0];
  for (const c of candidates) {
    if (Math.abs(pct - c) < 0.6) return c;
  }
  return null;
}
