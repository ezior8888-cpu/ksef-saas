import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CashFlowDashboard } from '@/components/expenses/cash-flow-dashboard';

/** Kafelek podatku na przepływach: etykieta i kwota z `estimateIncomeTaxThisYear`. */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

const fv = (issue_date: string, net: number) => ({ issue_date, net_total: net, gross_total: net * 1.23, invoice_kind: 'regular' as const });

describe('kafelek szacowanego podatku', () => {
  it('luty: od 1 stycznia, bez zeszłorocznego zysku', () => {
    vi.setSystemTime(new Date('2027-02-20T12:00:00'));
    const html = renderToStaticMarkup(
      <CashFlowDashboard invoices={[fv('2026-11-10', 100_000), fv('2027-02-03', 10_000)]} expenses={[]} pendingReviewCount={0} />,
    );
    expect(html).toContain('Szac. podatek od 1 stycznia');
    expect(html).not.toContain('YTD');
    expect(html).toMatch(/1[\s ]?900/); // 10 000 × 19%, nie 20 900
  });

  it('październik: dane od maja — kafelek nie udaje pełnego roku', () => {
    vi.setSystemTime(new Date('2026-10-10T12:00:00'));
    const html = renderToStaticMarkup(
      <CashFlowDashboard invoices={[fv('2026-06-01', 1_000)]} expenses={[]} pendingReviewCount={0} />,
    );
    expect(html).toContain('Szac. podatek od 1 maja');
    expect(html).toContain('bez wcześniejszych miesięcy roku');
  });
});
