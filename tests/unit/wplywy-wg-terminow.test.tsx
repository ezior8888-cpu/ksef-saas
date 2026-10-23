import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerenderToNodeStream } from 'react-dom/static';
import { describe, expect, it, vi } from 'vitest';

import { fakePostgrest, type Row } from '../helpers/fake-postgrest';

vi.mock('@/lib/dashboard-shell-data', () => ({ getDashboardActiveOrgVerified: async () => true }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/przeplywy',
  useRouter: () => ({ prefetch: () => {}, push: () => {}, refresh: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { getInflows } = await import('@/lib/dashboard/inflows');
const movements = await import('@/lib/dashboard/cash-movements');
const { inflowTerms } = await import('@/lib/dashboard/inflow-terms');
const { naleznosciProps } = await import('@/components/dashboard/finora/adaptery');
const przeplywyAdaptery = await import('@/components/przeplywy/finora-1do1/adaptery');
const { receivablesRows } = await import('@/components/analizy/adapters');
const { default: CashFlowCard } = await import('@/components/przeplywy/finora-1do1/chart-cash-flow');
const { default: TransactionDatatable } = await import('@/components/przeplywy/finora-1do1/datatable-transaction');
const przeplywy = await import('@/components/przeplywy/finora-1do1/sloty');
const pulpit = await import('@/components/dashboard/finora/sloty');
const sprzedaz = await import('@/components/analizy/sprzedaz-grid');
const { danePrzykladowe, DEMO_TENANT } = await import('@/lib/demo/dane-przykladowe');

/**
 * PLAN-PRAWDZIWE-DANE E11, decyzja Bartosza D-W (23.10.2026): klient NIC nie
 * oznacza. Wpływ faktury sprzedaży liczymy w dniu prawdziwej zapłaty, jeśli
 * ją znamy (`paid_at` z wpłat/FLO, potem `Zaplacono` + `DataZaplaty` z FA(3)),
 * inaczej w dniu terminu płatności, a bez terminu — w dniu wystawienia.
 * Kwota: brutto do zapłaty; Spodziewane wpływy i Należności pokazują resztę
 * po potwierdzonych wpłatach częściowych. Należności nie twierdzą, że ktoś
 * zalega — pokazują przyszłe terminy. Podpisy: „według terminów płatności”.
 */

const TENANT = 'firma-a';
/** Piątek 23.10.2026, 10:00 w Warszawie; niedziela tego tygodnia to 25.10, +30 dni to 22.11. */
const NOW = new Date('2026-10-23T08:00:00Z');
const NOW_ISO = NOW.toISOString();
const TODAY = '2026-10-23';
const OCTOBER = { from: '2026-10-01', toExclusive: '2026-11-01' };

/** Faktura sprzedaży przyjęta w KSeF (aktywne środowisko testów: `test`), bez wpłat. */
function sprzedaz1(id: string, fields: Row = {}): Row {
  return {
    id,
    tenant_id: TENANT,
    direction: 'outgoing',
    origin: 'app',
    ksef_status: 'accepted',
    ksef_environment: 'test',
    invoice_kind: 'regular',
    invoice_type: 'VAT',
    parent_invoice_id: null,
    advance_invoice_ids: [],
    currency: 'PLN',
    issue_date: '2026-10-05',
    internal_number: `FV/${id}`,
    net_total: 1000,
    vat_total: 230,
    gross_total: 1230,
    buyer_nip: '1234567890',
    buyer_data: { name: 'Klient Testowy sp. z o.o.', nip: '1234567890' },
    is_b2c: false,
    payment_data: null,
    payment_due_date: '2026-10-19',
    payment_status: 'unpaid',
    paid_amount: 0,
    paid_at: null,
    fa3_data: {},
    ...fields,
  };
}

const zaplacona = (id: string, paidAt: string, fields: Row = {}) =>
  sprzedaz1(id, { paid_amount: 1230, paid_at: paidAt, payment_status: 'paid', ...fields });

function sb(invoices: Row[]) {
  return fakePostgrest({ invoices, expenses: [], tenants: [{ id: TENANT, vat_exemption_basis: null }] });
}

const spacje = (s: string) => s.replace(/[  ]/g, ' ');

async function prerender(node: ReactNode): Promise<string> {
  const { prelude } = await prerenderToNodeStream(<>{node}</>);
  let out = '';
  for await (const chunk of prelude) out += String(chunk);
  return spacje(out.replace(/<!-- -->/g, ''));
}

function html(node: ReactNode): string {
  return spacje(renderToStaticMarkup(<>{node}</>).replace(/<!-- -->/g, ''));
}

/** Tekst widoczny i ukryty (dymki `title`, `sr-only`) — wszystko, co klient może przeczytać. */
function wszystkieNapisy(markup: string): string {
  return [markup.replace(/<[^>]+>/g, ' '), ...[...markup.matchAll(/title="([^"]*)"/g)].map((m) => m[1])].join(' ');
}

// ─── Dzień i kwota wpływu ────────────────────────────────────────────────────

describe('getInflows — dzień wpływu według D-W', () => {
  it('faktura bez zapłaty: wpływ w dniu terminu płatności, kwota brutto', async () => {
    const [entry] = await getInflows(sb([sprzedaz1('a')]), TENANT, OCTOBER);
    expect(entry).toMatchObject({
      id: 'a', date: '2026-10-19', basis: 'due', amount: 1230, outstanding: 1230, dueDate: '2026-10-19',
    });
  });

  it('paid_at (prawdziwa zapłata) ma pierwszeństwo przed terminem — dzień w Warszawie', async () => {
    const entries = await getInflows(sb([
      zaplacona('a', '2026-10-10T10:00:00Z'),
      zaplacona('b', '2026-10-09T22:30:00Z'), // 10.10, 00:30 w Warszawie
    ]), TENANT, OCTOBER);
    expect(entries.map((e) => [e.id, e.date, e.basis, e.amount, e.outstanding])).toEqual([
      ['a', '2026-10-10', 'paid', 1230, 0],
      ['b', '2026-10-10', 'paid', 1230, 0],
    ]);
  });

  it('data zapłaty z FA(3) (Zaplacono + DataZaplaty) przed terminem, ale po paid_at', async () => {
    const fa3 = { parsed: { paidDate: '2026-10-03' } };
    const entries = await getInflows(sb([
      sprzedaz1('a', { origin: 'ksef_import', fa3_data: fa3 }),
      zaplacona('b', '2026-10-12T10:00:00Z', { fa3_data: fa3 }),
    ]), TENANT, OCTOBER);
    expect(entries.map((e) => [e.id, e.date, e.basis])).toEqual([
      ['a', '2026-10-03', 'paid'],
      ['b', '2026-10-12', 'paid'],
    ]);
  });

  it('faktura bez terminu płatności: wpływ w dniu wystawienia', async () => {
    const [entry] = await getInflows(sb([sprzedaz1('a', { payment_due_date: null })]), TENANT, OCTOBER);
    expect(entry).toMatchObject({ date: '2026-10-05', basis: 'issued', amount: 1230, dueDate: null });
  });

  it('wpłata częściowa: brutto w dniu terminu, do zapłaty zostaje reszta', async () => {
    const [entry] = await getInflows(sb([sprzedaz1('a', { paid_amount: 400, payment_status: 'partial' })]), TENANT, OCTOBER);
    expect(entry).toMatchObject({ date: '2026-10-19', basis: 'due', amount: 1230, outstanding: 830 });
  });

  it('sprzedaż z historii KSeF się liczy, korekta in minus zmniejsza wpływy (ze znakiem)', async () => {
    const entries = await getInflows(sb([
      sprzedaz1('a', { origin: 'ksef_import' }),
      sprzedaz1('k', {
        invoice_kind: 'correction', invoice_type: 'KOR', parent_invoice_id: 'a', issue_date: '2026-10-20',
        payment_due_date: null, net_total: -100, vat_total: -23, gross_total: -123,
      }),
    ]), TENANT, OCTOBER);
    expect(entries.map((e) => [e.id, e.date, e.amount, e.outstanding])).toEqual([
      ['a', '2026-10-19', 1230, 1230],
      ['k', '2026-10-20', -123, 0],
    ]);
  });

  it('faktura z innego środowiska KSeF (PROD pod TEST), zakup, szkic i cudza firma nie są wpływem', async () => {
    const entries = await getInflows(sb([
      sprzedaz1('prod', { ksef_environment: 'production' }),
      sprzedaz1('zakup', { direction: 'incoming' }),
      sprzedaz1('szkic', { ksef_status: 'draft' }),
      sprzedaz1('cudza', { tenant_id: 'firma-b' }),
      sprzedaz1('ok'),
    ]), TENANT, OCTOBER);
    expect(entries.map((e) => e.id)).toEqual(['ok']);
  });

  it('zakres po dniu wpływu: faktura z września z terminem w październiku jest w październiku; bez końca zakresu — także przyszłe terminy', async () => {
    const rows = [
      sprzedaz1('wrzesien', { issue_date: '2026-09-25', payment_due_date: '2026-10-09' }),
      sprzedaz1('przed', { issue_date: '2026-09-01', payment_due_date: '2026-09-15' }),
      sprzedaz1('listopad', { issue_date: '2026-10-20', payment_due_date: '2026-11-03' }),
    ];
    expect((await getInflows(sb(rows), TENANT, OCTOBER)).map((e) => e.id)).toEqual(['wrzesien']);
    expect((await getInflows(sb(rows), TENANT, { from: TODAY })).map((e) => [e.id, e.date])).toEqual([['listopad', '2026-11-03']]);
  });

  it('faktura w walucie obcej w zakresie zatrzymuje kartę (jak przychód) z numerem dokumentu, poza zakresem — nie', async () => {
    await expect(getInflows(sb([sprzedaz1('eur', { currency: 'EUR' })]), TENANT, OCTOBER))
      .rejects.toThrow('Raport wstrzymany: faktura sprzedaży FV/eur nie ma potwierdzonej waluty PLN (EUR).');
    const poza = sprzedaz1('eur', { currency: 'EUR', issue_date: '2026-08-01', payment_due_date: '2026-08-15' });
    expect(await getInflows(sb([poza, sprzedaz1('a')]), TENANT, OCTOBER)).toHaveLength(1);
  });

  it('przyjęta faktura bez środowiska KSeF w zakresie → wyjątek', async () => {
    await expect(getInflows(sb([sprzedaz1('a', { ksef_environment: null })]), TENANT, OCTOBER))
      .rejects.toThrow('Przyjęte faktury wymagają uzgodnienia środowiska KSeF');
  });
});

// ─── Agregaty ─────────────────────────────────────────────────────────────────

/** Wpis wpływu do czystych agregatów. */
function wpis(id: string, date: string, fields: Partial<Awaited<ReturnType<typeof getInflows>>[number]> = {}) {
  return {
    id,
    date,
    basis: 'due' as const,
    amount: 1000,
    outstanding: 1000,
    dueDate: date,
    invoiceKind: 'regular',
    internalNumber: `FV/${id}`,
    buyerKey: 'nip:1234567890',
    buyerName: 'Klient Testowy sp. z o.o.',
    buyerNip: '1234567890',
    consumers: false,
    ...fields,
  };
}

describe('Spodziewane wpływy i Należności: przyszłe terminy bez prawdziwej zapłaty', () => {
  const entries = [
    wpis('dzis', '2026-10-23'),
    wpis('niedziela', '2026-10-25', { amount: 500, outstanding: 300 }),
    wpis('poniedzialek', '2026-10-26'),
    wpis('plus30', '2026-11-22'),
    wpis('plus31', '2026-11-23', { amount: 7000, outstanding: 7000 }),
    wpis('wczoraj', '2026-10-22'),
    wpis('zaplacona', '2026-10-30', { basis: 'paid', outstanding: 0, dueDate: '2026-11-05' }),
    wpis('bez-terminu', '2026-10-23', { basis: 'issued', dueDate: null }),
  ];

  it('Spodziewane wpływy: od dziś do +30 dni, bez faktur z prawdziwą zapłatą, kwota = reszta do zapłaty', () => {
    const upcoming = movements.upcomingInflows(entries, TODAY);
    expect(upcoming.items.map((i) => [i.id, i.daysLeft, i.amount])).toEqual([
      ['dzis', 0, 1000],
      ['niedziela', 2, 300],
      ['poniedzialek', 3, 1000],
      ['plus30', 30, 1000],
    ]);
    expect(upcoming.count).toBe(4);
    expect(upcoming.total).toBe(3300);
  });

  it('Należności: „Ten tydzień” do niedzieli, „Do 30 dni”, „Później”; suma kolumn = suma karty', () => {
    const terms = inflowTerms(entries, TODAY);
    expect(terms.buckets.map((b) => [b.key, b.amount, b.count])).toEqual([
      ['thisWeek', 1300, 2],
      ['upTo30', 2000, 2],
      ['later', 7000, 1],
    ]);
    expect(terms.total).toBe(10_300);
    expect(terms.count).toBe(5);
    expect(terms.buckets.reduce((s, b) => s + b.pct, 0)).toBe(100);
  });

  it('w niedzielę „Ten tydzień” to sam dzisiejszy dzień', () => {
    const terms = inflowTerms([wpis('a', '2026-10-25'), wpis('b', '2026-10-26')], '2026-10-25');
    expect(terms.buckets.map((b) => b.count)).toEqual([1, 1, 0]);
  });
});

describe('Przepływy: wpływy do dziś, sumy zakładek = suma serii', () => {
  const entries = [
    wpis('a', '2026-10-05'),
    wpis('b', '2026-10-23', { amount: 250 }),
    wpis('przyszly', '2026-10-28', { amount: 9999 }),
    wpis('sierpien', '2026-08-20', { amount: 400, basis: 'paid', outstanding: 0 }),
  ];

  it('wykres i kafel miesiąca nie liczą terminów z przyszłości', () => {
    const chart = movements.buildCashFlowChart(entries, [], TODAY);
    expect(chart.month.at(-1)).toMatchObject({ inflow: 1250, inflowCount: 2 });
    expect(movements.monthFlows(entries, [], TODAY).inflow.amount).toBe(1250);
  });

  it('suma nad wykresem każdej zakładki = suma jej serii = suma wpływów z okna', () => {
    const chart = movements.buildCashFlowChart(entries, [], TODAY);
    const suma = (b: readonly { inflow: number }[]) => b.reduce((s, x) => s + x.inflow, 0);
    expect(suma(chart.month)).toBe(1650);
    expect(suma(chart.year)).toBe(1650);
    expect(suma(chart.week)).toBe(1250);
    const out = html(<CashFlowCard tabs={{ weekly: chart.week, monthly: chart.month, yearly: chart.year }} subTitle="x" />);
    // pl-PL nie grupuje kwot czterocyfrowych („1650 zł”).
    expect(out).toContain('1650 zł');
    expect(out).toContain('Suma wpływów');
  });

  it('operacje: tylko wpływy do dziś, status z podstawy dnia (prawdziwa zapłata, termin, wystawienie)', () => {
    const ops = movements.cashFlowOperations(
      [...entries, wpis('wyst', '2026-10-02', { basis: 'issued', dueDate: null })],
      [],
      TODAY,
    );
    expect(ops.map((o) => [o.id, o.status])).toEqual([
      ['in:b', 'due'],
      ['in:a', 'due'],
      ['in:wyst', 'issued'],
      ['in:sierpien', 'paid'],
    ]);
    expect(movements.topCashFlowSources(entries, [], TODAY)[0]).toMatchObject({ amount: 1650, count: 3 });
  });
});

// ─── Napisy kart ──────────────────────────────────────────────────────────────

const ZALEGLOSC = /zaległ|po terminie|oznacz|nie potwierdzamy/i;

describe('Pulpit: karta Należności pokazuje przyszłe terminy, bez zaległości', () => {
  const terms = inflowTerms([wpis('a', '2026-10-24'), wpis('b', '2026-11-10'), wpis('c', '2026-12-30')], TODAY);

  it('kolumny „Ten tydzień” / „Do 30 dni” / „Później”, plakietka = liczba faktur, bez „% zaległe”', () => {
    const dane = naleznosciProps(terms, 'prawdziwe');
    expect(dane.visitorData.map((c) => c.name)).toEqual(['Ten tydzień', 'Do 30 dni', 'Później']);
    expect(dane.badge).toBe('3 faktury');
    expect(dane.note).toContain('według terminów płatności');
    // Strzałka nie ocenia: każda kolumna to wpływ (↗), jak strzałka wpływu w Przepływach.
    expect(dane.visitorData.map((c) => c.trend)).toEqual(['up', 'up', 'up']);
    const napisy = JSON.stringify(dane);
    expect(napisy).not.toMatch(ZALEGLOSC);
  });

  it('karta na Pulpicie (prawdziwe dane): ani słowa o zaległościach, zapłacona faktura się nie liczy', async () => {
    const out = await prerender(
      <pulpit.NaleznosciSlot
        supabase={sb([
          sprzedaz1('a', { payment_due_date: '2026-10-24' }),
          sprzedaz1('po', { payment_due_date: '2026-10-01' }),
          zaplacona('z', '2026-10-20T10:00:00Z', { payment_due_date: '2026-11-05' }),
        ])}
        tenantId={TENANT}
        nowIso={NOW_ISO}
        tryb="prawdziwe"
        kosztyKsefOd={null}
      />,
    );
    expect(wszystkieNapisy(out)).not.toMatch(ZALEGLOSC);
    expect(out).toContain('1 faktura');
    expect(out).toContain('Ten tydzień');
  });
});

describe('Analizy: karta Należności analogicznie', () => {
  it('trzy wiersze terminów, bez „Po terminie” i „Najstarszej zaległości”', () => {
    const rows = receivablesRows(inflowTerms([wpis('a', '2026-10-24'), wpis('b', '2026-12-30', { outstanding: 2500 })], TODAY));
    expect(rows.map((r) => [r.title, r.value])).toEqual([
      ['Ten tydzień', '1000,00 zł · 1 faktura'],
      ['Do 30 dni', '0,00 zł · 0 faktur'],
      ['Później', '2500,00 zł · 1 faktura'],
    ]);
    expect(JSON.stringify(rows.map((r) => [r.title, r.value, r.iconClassName]))).not.toMatch(/zaległ|po terminie|destructive/i);
  });

  it('podpis karty: „według terminów płatności” zamiast zastrzeżenia Z16', async () => {
    const out = html(await sprzedaz.ReceivablesSlot({
      supabase: sb([sprzedaz1('a', { payment_due_date: '2026-11-03' })]),
      tenantId: TENANT, nowIso: NOW_ISO, month: '2026-10', tryb: 'prawdziwe', kosztyKsefOd: null,
    }));
    expect(out).toContain('Faktury sprzedaży · według terminów płatności');
    expect(wszystkieNapisy(out)).not.toMatch(ZALEGLOSC);
  });
});

describe('Przepływy: napisy kart', () => {
  it('Ostatnia aktywność: „Termin · DD.MM.RRRR”, „Wpłata · …” przy prawdziwej zapłacie, „Wystawiona · …” bez terminu', () => {
    const ops = movements.cashFlowOperations([
      wpis('t', '2026-10-19'),
      wpis('p', '2026-10-10', { basis: 'paid', outstanding: 0 }),
      wpis('w', '2026-10-05', { basis: 'issued', dueDate: null }),
    ], [], TODAY);
    const dane = przeplywyAdaptery.aktywnoscProps(ops, 'prawdziwe');
    expect(dane.items.map((i) => i.subLabel)).toEqual(['Termin · 19.10.2026', 'Wpłata · 10.10.2026', 'Wystawiona · 05.10.2026']);
  });

  it('tabela: „Opłacona” tylko przy prawdziwej zapłacie, inaczej „Wg terminu” / „Wg wystawienia”', () => {
    const ops = movements.cashFlowOperations([
      wpis('t', '2026-10-19'),
      wpis('p', '2026-10-10', { basis: 'paid', outstanding: 0 }),
      wpis('w', '2026-10-05', { basis: 'issued', dueDate: null }),
    ], [], TODAY);
    const { rows } = przeplywyAdaptery.tabelaProps(ops, 'prawdziwe');
    const out = html(<TransactionDatatable data={rows} />);
    expect(out.match(/Opłacona/g)).toHaveLength(1);
    expect(out).toContain('Wg terminu');
    expect(out).toContain('Wg wystawienia');
    expect(out).not.toMatch(/zaległ|Termin minął/i);
  });

  it('kafel „Wpłynęło”: podpis „według terminów płatności”, pusty stan bez „oznaczania”', () => {
    const flow = movements.monthFlows([wpis('a', '2026-10-05')], [], TODAY).inflow;
    expect(przeplywyAdaptery.wplywyMiesiacaProps(flow, 'prawdziwe').amountTitle).toContain('według terminów płatności');
    const pusty = przeplywyAdaptery.wplywyMiesiacaProps(movements.monthFlows([], [], TODAY).inflow, 'prawdziwe');
    expect(pusty.amount).toBe('—');
    expect(`${pusty.comparison} ${pusty.amountTitle}`).not.toMatch(ZALEGLOSC);
    // Pusty stan mieści się w miejscu „wobec poprzedniego miesiąca” (27 znaków).
    expect(pusty.comparison.length).toBeLessThanOrEqual('wobec poprzedniego miesiąca'.length);
  });

  it('Spodziewane wpływy: zapłacona faktura się nie pokazuje, dymek bez zastrzeżenia Z16', async () => {
    const out = await prerender(
      <przeplywy.SpodziewaneSlot
        supabase={sb([
          sprzedaz1('a', { payment_due_date: '2026-10-30', buyer_data: { name: 'Alfa Przykład' } }),
          zaplacona('z', '2026-10-20T10:00:00Z', { payment_due_date: '2026-11-05', buyer_data: { name: 'Zeta Przykład' } }),
        ])}
        tenantId={TENANT}
        nowIso={NOW_ISO}
        tryb="prawdziwe"
        kosztyKsefOd={null}
      />,
    );
    expect(out).toContain('Alfa Przykład');
    expect(out).not.toContain('Zeta Przykład');
    expect(out).toContain('według terminów płatności');
    expect(wszystkieNapisy(out)).not.toMatch(ZALEGLOSC);
  });

  it('podtytuł wykresu nazywa założenie (terminy płatności) i nie jest dłuższy od dawnego', () => {
    // Szerokość w Outfit (pomiar 23.10.2026): 199 wobec 205 jednostek dawnego napisu — ta sama linia.
    expect(przeplywyAdaptery.PODTYTUL_WYKRESU).toMatch(/Terminy płatności/);
    expect(przeplywyAdaptery.PODTYTUL_WYKRESU.length).toBeLessThanOrEqual('Oznaczone wpłaty i koszty brutto'.length);
  });
});

// ─── Atrapa ───────────────────────────────────────────────────────────────────

describe('dane przykładowe liczone tą samą regułą', () => {
  it('demo: bez oznaczonych wpłat — wpływy z terminów; Należności we wszystkich trzech kolumnach', async () => {
    const tables = danePrzykladowe(NOW, 'test');
    const sprzedazDemo = tables.invoices!.filter((i) => i.direction === 'outgoing');
    expect(sprzedazDemo.every((i) => i.paid_at === null && Number(i.paid_amount) === 0)).toBe(true);
    const db = fakePostgrest(tables);
    const entries = await getInflows(db, DEMO_TENANT, { from: '2025-11-01' });
    expect(entries.every((e) => e.basis !== 'paid')).toBe(true);
    expect(inflowTerms(entries, TODAY).buckets.map((b) => b.count > 0)).toEqual([true, true, true]);
    expect(movements.upcomingInflows(entries, TODAY).count).toBeGreaterThanOrEqual(5);
  });
});
