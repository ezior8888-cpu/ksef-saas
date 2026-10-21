// Dane przykładowe Analiz (poprawka Bartosza 21.10.2026: firma przed weryfikacją
// KSeF ma zobaczyć „pełną okazałość” aplikacji). Przykładowe faktury sprzedaży,
// pozycje i wydatki z 7 miesięcy wstecz od bieżącego w atrapie PostgREST-a —
// siatki `/analizy/*` czytają je tymi samymi loaderami i adapterami co prawdziwe
// dane, więc karty i wykresy wyglądają dokładnie jak po podłączeniu KSeF.
// Firmy i NIP-y są fikcyjne (10 cyfr bez poprawnej sumy kontrolnej).
import type { PageContext } from '@/lib/supabase/page-context';
import { currentMonthKey, shiftMonthKey } from '@/lib/analytics-finance/months';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { fakePostgrest, type Row } from '@/lib/demo/fake-postgrest';
import type { KsefEnvironment } from '@/types/ksef';
import { roundToCents } from '@/lib/xml/invoice-calculator';

/** Firma-atrapa: wiersze przykładowe nie należą do żadnej prawdziwej firmy. */
export const DEMO_TENANT = 'przyklad-analizy';
const T = DEMO_TENANT;

const r2 = roundToCents;

/** Dni z miesiąca `k` wstecz; w bieżącym tylko te, które już minęły. */
function dates(now: Date, k: number, day: number): string | null {
  const key = shiftMonthKey(currentMonthKey(now), -k);
  const iso = `${key}-${String(day).padStart(2, '0')}`;
  return iso <= todayInWarsaw(now) ? iso : null;
}

// ─── Wydatki ──────────────────────────────────────────────────────────────
type Dostawca = [nip: string | null, name: string, category: string, day: number, gross: (k: number) => number, months: number[]];

const DOSTAWCY: Dostawca[] = [
  ['0000000011', 'Coworking Przykład sp. z o.o.', 'Czynsz', 3, () => 2460, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000022', 'Leasing Przykład S.A.', 'Usługi finansowe', 15, () => 1599, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000033', 'Biuro Rachunkowe Przykład sp. z o.o.', 'Usługi obce', 10, () => 738, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000044', 'Chmura Przykład sp. z o.o.', 'Oprogramowanie', 1, () => 615, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000055', 'Energia Przykład S.A.', 'Energia', 12, (k) => 380 + k * 17.5, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000066', 'Telekom Przykład S.A.', 'Telekomunikacja', 8, () => 184.5, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000077', 'Stacja Paliw Przykład sp. z o.o.', 'Paliwo', 6, (k) => 412.3 - k * 21, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000077', 'Stacja Paliw Przykład sp. z o.o.', 'Paliwo', 19, (k) => 368.9 + k * 12, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000088', 'Agencja Reklamowa Przykład sp. z o.o.', 'Marketing', 14, (k) => (k === 0 ? 1230 : 615), [0, 2, 5]],
  ['0000000099', 'Restauracja Przykład', 'Reprezentacja', 17, (k) => 286 - k * 9, [0, 1, 3, 4]],
  [null, 'Sklep Papierniczy Przykład', 'Materiały biurowe', 9, (k) => 159.9 + k * 7, [0, 2, 4, 6]],
  [null, 'Księgarnia Przykład', 'Pozostałe', 20, () => 89, [0, 3]],
  ['0000000101', 'Szkolenia Przykład sp. z o.o.', 'Usługi obce', 24, () => 1476, [1, 4]],
  ['0000000077', 'Stacja Paliw Przykład sp. z o.o.', 'Paliwo', 27, (k) => 198 + k * 5, [1, 2, 3, 4, 5, 6]],
  ['0000000112', 'Kurier Przykład sp. z o.o.', 'Pozostałe', 4, (k) => 36.9 + k, [0, 1, 2, 3, 4, 5, 6]],
  ['0000000123', 'Sklep Komputerowy Przykład S.A.', 'Oprogramowanie', 22, () => 1845, [3]],
];

/** Wydatki do opisania (bieżący miesiąc) — „Do opisania” w karcie VAT. */
const NIEOPISANE = new Set(['w-0-9-0', 'w-0-17-0']);

function wydatki(now: Date): Row[] {
  const rows: Row[] = [];
  DOSTAWCY.forEach(([nip, name, category, day, gross, months], i) => {
    for (const k of months) {
      const date = dates(now, k, day);
      if (!date) continue;
      const g = r2(gross(k));
      const net = r2(g / 1.23);
      const vat = r2(g - net);
      const id = `w-${k}-${day}-${i === 7 || i === 13 ? i : 0}`;
      rows.push({
        id,
        tenant_id: T,
        source: 'manual',
        ksef_invoice_id: null,
        issue_date: date,
        seller_nip: nip,
        seller_name: name,
        document_number: `FV/${date.slice(0, 7)}/${100 + i}`,
        is_deductible: true,
        is_reviewed: !NIEOPISANE.has(id),
        document_type: nip ? 'invoice' : 'receipt',
        net_amount: net,
        vat_amount: vat,
        gross_amount: g,
        vat_deductible_amount: category === 'Reprezentacja' ? 0 : vat,
        category_label: category,
        ocr_extracted_data: null,
      });
    }
  });
  return rows;
}

// ─── Sprzedaż ─────────────────────────────────────────────────────────────
type Klient = [nip: string, name: string, day: number, net: (k: number) => number, months: number[], items: Array<[string, string, number]>];

const KLIENCI: Klient[] = [
  ['0000001010', 'Hurtownia Przykład sp. z o.o.', 2, (k) => 8200 - k * 150, [0, 1, 2, 3, 4, 5, 6], [['Abonament serwisowy', 'mies.', 0.5], ['Wdrożenie systemu', 'usł.', 0.5]]],
  ['0000002020', 'Studio Projektowe Przykład', 5, (k) => 4500 + (k % 2) * 300, [0, 1, 2, 3, 4, 5, 6], [['Projekt graficzny', 'szt.', 0.6], ['Konsultacje', 'godz.', 0.4]]],
  ['0000003030', 'Sklep Internetowy Przykład sp. z o.o.', 10, (k) => 3200 + k * 90, [0, 1, 2, 3, 4, 5, 6], [['Hosting', 'mies.', 0.3], ['Abonament serwisowy', 'mies.', 0.7]]],
  ['0000004040', 'Kancelaria Przykład', 14, () => 2400, [0, 1, 3, 4, 5, 6], [['Licencja roczna', 'szt.', 1]]],
  ['0000005050', 'Fundacja Przykład', 18, (k) => 1800 - k * 40, [0, 2, 3, 5, 6], [['Szkolenie zespołu', 'godz.', 1]]],
  ['0000006060', 'Gabinet Przykład', 7, () => 1200, [0, 1, 2, 3, 4, 5], [['Hosting', 'mies.', 0.5], ['Konsultacje', 'godz.', 0.5]]],
  ['0000007070', 'Drukarnia Przykład S.A.', 12, (k) => 950 + k * 25, [0, 1, 2, 3, 5, 6], [['Wdrożenie systemu', 'usł.', 1]]],
  ['0000008080', 'Biuro Podróży Przykład', 20, () => 5400, [0, 4], [['Szkolenie zespołu', 'godz.', 0.5], ['Konsultacje', 'godz.', 0.5]]],
  ['0000009090', 'Pracownia Przykład', 16, () => 640, [1, 3], [['Projekt graficzny', 'szt.', 1]]],
];

function faktury(now: Date, env: KsefEnvironment): { invoices: Row[]; lines: Row[] } {
  const today = todayInWarsaw(now);
  const invoices: Row[] = [];
  const lines: Row[] = [];
  let seq = 0;
  KLIENCI.forEach(([nip, name, day, net, months, items], i) => {
    for (const k of months) {
      const date = dates(now, k, day);
      if (!date) continue;
      seq += 1;
      const id = `f-${k}-${i}`;
      const n = r2(net(k));
      const gross = r2(n * 1.23);
      const due = new Date(`${date}T12:00:00Z`);
      due.setUTCDate(due.getUTCDate() + 14);
      const dueIso = due.toISOString().slice(0, 10);
      // Starsze miesiące zapłacone; dwie faktury po terminie (należności).
      const zalegla = (k === 1 && i === 3) || (k === 2 && i === 6);
      const otwarta = k === 0 || zalegla;
      invoices.push({
        id,
        tenant_id: T,
        direction: 'outgoing',
        ksef_status: 'accepted',
        ksef_environment: env,
        invoice_kind: 'regular',
        advance_invoice_ids: [],
        parent_invoice_id: null,
        currency: 'PLN',
        issue_date: date,
        internal_number: `FV/${date.slice(0, 4)}/${date.slice(5, 7)}/${String(seq).padStart(3, '0')}`,
        net_total: n,
        gross_total: gross,
        buyer_nip: nip,
        buyer_data: { name, nip },
        is_b2c: false,
        origin: 'app',
        invoice_type: 'VAT',
        payment_status: otwarta ? (dueIso < today ? 'overdue' : 'unpaid') : 'paid',
        payment_due_date: dueIso,
        paid_amount: otwarta ? 0 : gross,
        payment_data: null,
      });
      items.forEach(([product, unit, share], j) => {
        lines.push({ id: `${id}-l${j}`, invoice_id: id, name: product, unit, net_amount: r2(n * share) });
      });
    }
  });
  // Korekta w bieżącym miesiącu (rabat do wrześniowej faktury Studia).
  const kor = dates(now, 0, 16);
  if (kor) {
    invoices.push({
      id: 'f-kor',
      tenant_id: T,
      direction: 'outgoing',
      ksef_status: 'accepted',
      ksef_environment: env,
      invoice_kind: 'correction',
      advance_invoice_ids: [],
      parent_invoice_id: 'f-1-1',
      currency: 'PLN',
      issue_date: kor,
      internal_number: `KOR/${kor.slice(0, 4)}/${kor.slice(5, 7)}/001`,
      net_total: -400,
      gross_total: -492,
      buyer_nip: '0000002020',
      buyer_data: { name: 'Studio Projektowe Przykład', nip: '0000002020' },
      is_b2c: false,
      origin: 'app',
      invoice_type: 'KOR',
      payment_status: 'paid',
      payment_due_date: kor,
      paid_amount: 0,
      payment_data: null,
    });
  }
  return { invoices, lines };
}

/** Klient bazy z danymi przykładowymi; `env` = skonfigurowane środowisko KSeF (filtry loaderów). */
export function analizyDemoSupabase(now: Date, env: KsefEnvironment): PageContext['supabase'] {
  const { invoices, lines } = faktury(now, env);
  return fakePostgrest({ invoices, invoice_line_items: lines, expenses: wydatki(now) });
}
