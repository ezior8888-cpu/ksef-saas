import { describe, expect, it } from 'vitest';

import { estimateIncomeTaxThisYear } from '@/lib/dashboard/tax-estimate';

/**
 * Kafelek „Szac. podatek YTD” na przepływach sumował zysk z ostatnich sześciu
 * miesięcy: w październiku gubił styczeń–kwiecień, w lutym doliczał zeszły
 * rok. PIT liczy się od 1 stycznia.
 */

const fv = (issue_date: string, net: number) => ({ issue_date, net_total: net, invoice_kind: 'vat' });
const koszt = (issue_date: string, net: number) =>
  ({ issue_date, net_amount: net, vat_amount: 0, vat_deductible_amount: 0, document_type: 'invoice' });

describe('szacunek podatku od 1 stycznia', () => {
  it('luty: okno sięga września zeszłego roku — liczymy tylko bieżący rok', () => {
    const e = estimateIncomeTaxThisYear(
      [fv('2026-11-10', 100_000), fv('2027-01-15', 10_000), fv('2027-02-03', 5_000)],
      [koszt('2026-12-01', 1_000), koszt('2027-02-10', 5_000)],
      new Date('2027-02-20T12:00:00'),
      '2026-09-01',
    );
    expect(e.amount).toBe(1900); // (10 000 + 5 000 − 5 000) × 19%
    expect(e).toMatchObject({ fullYear: true, label: 'Szac. podatek od 1 stycznia', subtitle: '19% liniowy' });
  });

  it('czerwiec: okno od stycznia obejmuje cały rok', () => {
    const e = estimateIncomeTaxThisYear([fv('2026-01-05', 1_000), fv('2026-06-01', 1_000)], [], new Date('2026-06-15T12:00:00'), '2026-01-01');
    expect(e).toMatchObject({ amount: 380, fullYear: true });
  });

  it('październik: dane od maja — etykieta mówi to wprost, a nie „od początku roku”', () => {
    const e = estimateIncomeTaxThisYear([fv('2026-05-02', 10_000), fv('2026-10-01', 10_000)], [], new Date('2026-10-01T12:00:00'), '2026-05-01');
    expect(e).toMatchObject({
      amount: 3800,
      fullYear: false,
      label: 'Szac. podatek od 1 maja',
      subtitle: '19% liniowy · bez wcześniejszych miesięcy roku',
    });
  });

  it('faktura z datą w przyszłym roku nie wchodzi do bieżącego', () => {
    const e = estimateIncomeTaxThisYear([fv('2026-12-01', 1_000), fv('2027-01-02', 50_000)], [], new Date('2026-12-15T12:00:00'), '2026-07-01');
    expect(e.amount).toBe(190);
  });

  it('strata — zero, nie ujemny podatek', () => {
    expect(estimateIncomeTaxThisYear([fv('2026-03-01', 100)], [koszt('2026-03-02', 1_000)], new Date('2026-03-31T12:00:00'), '2025-10-01').amount).toBe(0);
  });

  it('przychód i koszt liczone jak w KPiR: ROZ bez zaliczek, paragon brutto', () => {
    const e = estimateIncomeTaxThisYear(
      [{ issue_date: '2026-03-01', net_total: 30_000, invoice_kind: 'final', settled_advances_net: 10_000 }],
      [{ issue_date: '2026-03-02', net_amount: 1_000, vat_amount: 230, vat_deductible_amount: 0, document_type: 'receipt' }],
      new Date('2026-03-31T12:00:00'),
      '2025-10-01',
    );
    expect(e.amount).toBe(3566.3); // (20 000 − 1 230) × 19%
  });
});
