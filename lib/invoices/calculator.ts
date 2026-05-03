/**
 * Kalkulatory dla scenariuszy faktur z `types/invoice-types.ts`.
 * Sumy pozycji delegujemy do `@/lib/xml/invoice-calculator` (VAT, zaokrąglenia FA).
 */

import type { InvoiceLineItem, VatRate } from '@/types/invoice';
import type {
  AdvanceInvoiceData,
  CorrectionInvoiceData,
  InvoiceLine,
} from '@/types/invoice-types';
import type { InvoiceTotals } from '@/lib/xml/invoice-calculator';
import {
  calculateInvoiceTotals as summarizePreparedLineItems,
  calculateLineItem,
  roundToCents,
} from '@/lib/xml/invoice-calculator';

function domainLineToPrepared(line: InvoiceLine, ordinal: number): InvoiceLineItem {
  const { netAmount, vatAmount, grossAmount } = calculateLineItem({
    quantity: line.quantity,
    unitPriceNet: line.unitPriceNet,
    vatRate: line.vatRate as VatRate,
  });
  return {
    ordinal,
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    unitPriceNet: line.unitPriceNet,
    vatRate: line.vatRate as VatRate,
    netAmount,
    vatAmount,
    grossAmount,
  };
}

/** Sumuje pozycje w kształcie domenowym (bez pól wyliczonych w linii). */
export function calculateInvoiceTotals(lines: InvoiceLine[]): InvoiceTotals {
  const prepared = lines.map((line, idx) => domainLineToPrepared(line, idx + 1));
  return summarizePreparedLineItems(prepared);
}

// ============================================================================
// Kalkulacja dla faktury KORYGUJĄCEJ
// ============================================================================

export interface CorrectionTotals {
  netBefore: number;
  vatBefore: number;
  grossBefore: number;

  netAfter: number;
  vatAfter: number;
  grossAfter: number;

  netDelta: number;
  vatDelta: number;
  grossDelta: number;
}

export function calculateCorrectionTotals(data: CorrectionInvoiceData): CorrectionTotals {
  if (data.correctionType === 'before_after') {
    const before = data.linesBefore
      ? calculateInvoiceTotals(data.linesBefore)
      : { netTotal: 0, vatTotal: 0, grossTotal: 0 };
    const after = data.linesAfter
      ? calculateInvoiceTotals(data.linesAfter)
      : { netTotal: 0, vatTotal: 0, grossTotal: 0 };

    return {
      netBefore: before.netTotal,
      vatBefore: before.vatTotal,
      grossBefore: before.grossTotal,
      netAfter: after.netTotal,
      vatAfter: after.vatTotal,
      grossAfter: after.grossTotal,
      netDelta: after.netTotal - before.netTotal,
      vatDelta: after.vatTotal - before.vatTotal,
      grossDelta: after.grossTotal - before.grossTotal,
    };
  }

  if (data.correctionType === 'amount_change' && data.amountChange) {
    return {
      netBefore: 0,
      vatBefore: 0,
      grossBefore: 0,
      netAfter: 0,
      vatAfter: 0,
      grossAfter: 0,
      netDelta: data.amountChange.netDelta,
      vatDelta: data.amountChange.vatDelta,
      grossDelta: data.amountChange.grossDelta,
    };
  }

  if (data.correctionType === 'cancellation') {
    const before = data.linesBefore
      ? calculateInvoiceTotals(data.linesBefore)
      : { netTotal: 0, vatTotal: 0, grossTotal: 0 };

    return {
      netBefore: before.netTotal,
      vatBefore: before.vatTotal,
      grossBefore: before.grossTotal,
      netAfter: 0,
      vatAfter: 0,
      grossAfter: 0,
      netDelta: -before.netTotal,
      vatDelta: -before.vatTotal,
      grossDelta: -before.grossTotal,
    };
  }

  return {
    netBefore: 0,
    vatBefore: 0,
    grossBefore: 0,
    netAfter: 0,
    vatAfter: 0,
    grossAfter: 0,
    netDelta: 0,
    vatDelta: 0,
    grossDelta: 0,
  };
}

// ============================================================================
// Kalkulacja dla faktury ZALICZKOWEJ
// ============================================================================

export interface AdvanceTotals {
  advanceNet: number;
  advanceVat: number;
  advanceGross: number;
  vatRate: string;
  remainingAmount: number;
}

export function calculateAdvanceTotals(data: AdvanceInvoiceData): AdvanceTotals {
  const vatRateNum = parseFloat(data.vatRate);
  const vatMultiplier = vatRateNum / 100;

  const advanceNet = round2(data.advanceAmount / (1 + vatMultiplier));
  const advanceVat = round2(data.advanceAmount - advanceNet);

  return {
    advanceNet,
    advanceVat,
    advanceGross: data.advanceAmount,
    vatRate: data.vatRate,
    remainingAmount: round2(data.totalContractAmount - data.advanceAmount),
  };
}

// ============================================================================
// Kalkulacja dla faktury FINALNEJ (rozliczającej zaliczki)
// ============================================================================

export interface FinalInvoiceTotals {
  totalNet: number;
  totalVat: number;
  totalGross: number;
  totalAdvances: number;
  amountDue: number;
}

export function calculateFinalInvoiceTotals(
  lines: InvoiceLine[],
  totalAdvances: number
): FinalInvoiceTotals {
  const totals = calculateInvoiceTotals(lines);

  return {
    totalNet: totals.netTotal,
    totalVat: totals.vatTotal,
    totalGross: totals.grossTotal,
    totalAdvances: round2(totalAdvances),
    amountDue: round2(totals.grossTotal - totalAdvances),
  };
}

// ============================================================================
// Helper - zaokrąglanie do 2 miejsc (spójne z FA / invoice-calculator)
// ============================================================================

function round2(n: number): number {
  return roundToCents(n);
}
