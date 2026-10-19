import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { formatPlMoney } from '@/lib/format/pl';
import { FinanceCard } from '@/components/dashboard/pulpit/finance-card';
import { NetRevenueCard } from '@/components/dashboard/pulpit/net-revenue-card';
import { SalesYtdCard } from '@/components/dashboard/pulpit/sales-ytd-card';
import { VatDueCard } from '@/components/dashboard/pulpit/vat-due-card';
import { PULPIT_EMPTY } from '@/components/dashboard/pulpit/card-states';

/** SSR wstawia <!-- --> między sąsiednie węzły tekstowe — usuwamy je. */
function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<!-- -->/g, '');
}

const m12 = Array.from({ length: 12 }, (_, i) => ({ key: `2026-${i + 1}`, label: `M${i + 1}` }));
const m6 = m12.slice(6);
const nums = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));

const report = { revenue: 45600, costs: 12000, profit: 33600, monthlyAverageNet: 41234.5 };

describe('FinanceCard', () => {
  const base = {
    months: m12,
    net: nums(12, i => 1000 * (i + 1)),
    costs: nums(12, i => 500 * (i + 1)),
    report,
    costsHint: 'none' as const,
  };

  it('stan z danymi: podpisy, kwoty, link do przepływów', () => {
    const out = html(<FinanceCard {...base} />);
    expect(out).toContain('Przychody i koszty');
    expect(out).toContain('Ostatnie 12 miesięcy');
    expect(out).toContain('Przychody netto');
    expect(out).toContain('Koszty');
    expect(out).toContain('Ten miesiąc');
    expect(out).toContain('Zysk');
    expect(out).toContain('Średnio miesięcznie:');
    expect(out).toContain('33 600,00 zł');
    expect(out).toContain('title="33 600,00 zł"');
    expect(out).toMatch(/<a[^>]*href="\/przeplywy"[^>]*>Zobacz przepływy<\/a>/);
    expect(out).not.toContain('$');
    expect(out).not.toContain(PULPIT_EMPTY.connectKsef);
  });

  it('strata: tytuł „Strata”, kwota bez minusa w kolorze destructive', () => {
    const out = html(<FinanceCard {...base} report={{ ...report, profit: -1500 }} />);
    expect(out).toContain('Strata');
    expect(out).not.toContain('>Zysk<');
    expect(out).toContain('1500,00 zł');
    expect(out).not.toMatch(/[-−]1\s?500,00 zł/);
    expect(out).toMatch(/text-destructive[^>]*title="1500,00 zł"|title="1500,00 zł"[^>]*text-destructive/);
  });

  it('jeden miesiąc z wartością (nie bieżący): pokazuje ten miesiąc z etykietą', () => {
    const net = nums(12, i => (i === 10 ? 5000 : 0));
    const out = html(<FinanceCard {...base} net={net} costs={nums(12, () => 0)} />);
    expect(out).toContain('title="5000,00 zł"');
    expect(out).toContain('Przychody netto · M11');
  });

  it('brak średniej: tekst zastępczy', () => {
    const out = html(<FinanceCard {...base} report={{ ...report, monthlyAverageNet: null }} />);
    expect(out).toContain('Średnia pojawi się po pierwszym pełnym miesiącu');
  });

  it('link „Podłącz KSeF…” gdy connect-ksef', () => {
    const out = html(<FinanceCard {...base} costsHint="connect-ksef" />);
    expect(out).toContain(PULPIT_EMPTY.connectKsef);
    expect(out).toContain(`href="${PULPIT_EMPTY.connectKsefHref}"`);
  });

  it('wszystko 0: pusty stan z „Wystaw fakturę”, prawa część z zerami', () => {
    const out = html(
      <FinanceCard
        {...base}
        net={nums(12, () => 0)}
        costs={nums(12, () => 0)}
        report={{ revenue: 0, costs: 0, profit: 0, monthlyAverageNet: null }}
      />,
    );
    expect(out).toContain(PULPIT_EMPTY.noInvoices);
    expect(out).toContain('Wystaw fakturę');
    expect(out).toContain('0,00 zł');
    expect(out).toContain('Zobacz przepływy');
  });

  it('jeden miesiąc z wartością: wartość bieżąca i tekst o drugim miesiącu', () => {
    const net = nums(12, i => (i === 11 ? 2500 : 0));
    const out = html(<FinanceCard {...base} net={net} costs={nums(12, () => 0)} />);
    expect(out).toContain(PULPIT_EMPTY.trendAfterSecondMonth);
    expect(out).toContain('title="2500,00 zł"');
  });
});

describe('NetRevenueCard', () => {
  it('z danymi: wartość bieżąca, procent, opis', () => {
    const out = html(
      <NetRevenueCard months={m6} net={[1, 2, 3, 4, 5, 45600]} changePct={12} />,
    );
    expect(out).toContain('Przychód netto');
    expect(out).toContain('+12%');
    expect(out).toContain('text-green-700');
    expect(out).not.toContain('text-green-600');
    expect(out).toContain('title="45 600,00 zł"');
    expect(out).not.toContain('$');
  });

  it('spadek jest czerwony, null bez procentu', () => {
    const down = html(<NetRevenueCard months={m6} net={[1, 2, 3, 4, 5, 6]} changePct={-8} />);
    expect(down).toContain('−8%');
    expect(down).toContain('text-destructive');
    const none = html(<NetRevenueCard months={m6} net={[1, 2, 3, 4, 5, 6]} changePct={null} />);
    expect(none).not.toMatch(/\d%</);
  });

  it('puste stany: wszystko 0 i jeden miesiąc', () => {
    const zero = html(<NetRevenueCard months={m6} net={[0, 0, 0, 0, 0, 0]} changePct={null} />);
    expect(zero).toContain(PULPIT_EMPTY.noInvoices);
    const one = html(<NetRevenueCard months={m6} net={[0, 0, 0, 0, 0, 900]} changePct={null} />);
    expect(one).toContain(PULPIT_EMPTY.trendAfterSecondMonth);
  });
});

describe('VatDueCard', () => {
  const net6 = [10, 20, 30, 40, 50, 60];
  const props = { months: m6, vatDueLabel: '25 listopada', daysToVatDue: 7, net: net6 };

  it('z danymi: tytuł, opis, wartość, termin i odmiana dni', () => {
    const out = html(<VatDueCard {...props} vat={[1, 2, 3, 4, 5, 10500]} />);
    expect(out).toContain('VAT należny');
    expect(out).toContain('6 mies.');
    expect(out).toContain('title="10 500,00 zł"');
    expect(out).toContain('Termin: 25 listopada');
    expect(out).toContain('za 7 dni');
    expect(out).not.toContain('$');
  });

  it('odmiana: 1 dzień, 0 dziś', () => {
    expect(html(<VatDueCard {...props} daysToVatDue={1} vat={[1, 2, 3, 4, 5, 6]} />)).toContain('za 1 dzień');
    expect(html(<VatDueCard {...props} daysToVatDue={0} vat={[1, 2, 3, 4, 5, 6]} />)).toContain('dziś');
  });

  it('mniej niż 2 miesiące: bez wykresu, wartość i termin zostają', () => {
    const out = html(<VatDueCard {...props} net={[0, 0, 0, 0, 0, 800]} vat={[0, 0, 0, 0, 0, 800]} />);
    expect(out).toContain(PULPIT_EMPTY.trendAfterSecondMonth);
    expect(out).toContain('title="800,00 zł"');
    expect(out).toContain('Termin: 25 listopada');
  });

  it('VAT = 0 przy sprzedaży w 6 miesiącach (np/zw/0%): wykres, bez tekstu o drugim miesiącu', () => {
    const out = html(<VatDueCard {...props} vat={[0, 0, 0, 0, 0, 0]} />);
    expect(out).not.toContain(PULPIT_EMPTY.trendAfterSecondMonth);
    expect(out).not.toContain(PULPIT_EMPTY.noInvoices);
  });

  it('brak sprzedaży: pusty stan noInvoices z akcją', () => {
    const out = html(<VatDueCard {...props} net={[0, 0, 0, 0, 0, 0]} vat={[0, 0, 0, 0, 0, 0]} />);
    expect(out).toContain(PULPIT_EMPTY.noInvoices);
    expect(out).toContain('href="/invoices/new"');
  });
});

describe('SalesYtdCard', () => {
  const months = m12.slice(0, 4);
  it('≥ 2 miesiące: tytuł i kwota narastająca', () => {
    const out = html(<SalesYtdCard months={months} cumulative={[1000, 3000, 6000, 10000]} />);
    expect(out).toContain('Sprzedaż od 1 stycznia');
    expect(out).toContain(`title="${formatPlMoney(10000)} zł"`);
    expect(out).not.toContain('$');
    expect(out).not.toMatch(/\d\s?%</);
    expect(out).not.toContain('limit');
  });
  it('same zera: noInvoices', () => {
    const out = html(<SalesYtdCard months={months} cumulative={[0, 0, 0, 0]} />);
    expect(out).toContain(PULPIT_EMPTY.noInvoices);
  });
  it('jeden miesiąc: trendAfterSecondMonth', () => {
    const out = html(<SalesYtdCard months={months.slice(0, 1)} cumulative={[2500]} />);
    expect(out).toContain(PULPIT_EMPTY.trendAfterSecondMonth);
    expect(out).toContain('title="2500,00 zł"');
    expect(out).not.toContain('$');
  });
});
