import { roundToCents } from '@/lib/xml/invoice-calculator';

type AmountChange = { netDelta: number; vatDelta: number; grossDelta: number };
type Rate = '23' | '8' | '5' | '0';

/** Reject ambiguous or inconsistent deltas rather than guessing a legal VAT rate. */
export function resolveAmountChangeVatRate(change: AmountChange): Rate {
  const { netDelta, vatDelta, grossDelta } = change;
  if (![netDelta, vatDelta, grossDelta].every(Number.isFinite) || netDelta === 0 ||
      [netDelta, vatDelta, grossDelta].some((value) =>
        Math.abs(value - roundToCents(value)) > 1e-8) ||
      roundToCents(netDelta + vatDelta) !== roundToCents(grossDelta)) {
    throw new Error('Korekta kwotowa: niespójna kwota netto, VAT lub brutto.');
  }

  const rates = [
    ['23', 0.23], ['8', 0.08], ['5', 0.05], ['0', 0],
  ] as const;
  const matches = rates.filter(([, rate]) => roundToCents(netDelta * rate) === vatDelta);
  if (matches.length !== 1) {
    throw new Error('Korekta kwotowa: stawka VAT jest niejednoznaczna lub nieobsługiwana.');
  }
  return matches[0]![0];
}
