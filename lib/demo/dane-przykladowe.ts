// Dane przykładowe stron z kartami (poprawka Bartosza 21.10.2026: firma przed
// weryfikacją KSeF ma zobaczyć „pełną okazałość” aplikacji; PLAN-PRAWDZIWE-DANE
// §5.3–5.4, etap E2). Zestaw tabel dla atrapy PostgREST-a: Pulpit, Przepływy
// i Analizy czytają go TYMI SAMYMI loaderami co prawdziwą bazę, więc liczby są
// spójne z definicji (zysk = przychód − koszty, wpłaty = zapłacone faktury).
//
// Firma usługowa: przychód ~30–45 tys. zł netto miesięcznie, koszty 33–37%
// przychodu, 24 miesiące historii z datami względem `now` (strefa Warszawa),
// dwie faktury po terminie (do 30 dni i ponad 30 dni). Firmy i NIP-y są
// fikcyjne: każda nazwa z „Przykład”, NIP-y zaczynają się od zer (AGENTS.md).
//
// Koszty jak u prawdziwej firmy po weryfikacji KSeF (E10, decyzja D-K):
// faktury zakupu z KSeF — z ostatnich miesięcy ze Skrzynki, każda z jednym
// wydatkiem (kategoria, opis), starsze z historii KSeF bez wydatku
// (archiwum) — oraz wydatki spoza KSeF (OCR, ręczne, paragony). Karty liczą
// je jedną definicją (`getCostsWithKsefPurchases`), KPiR — same wydatki.
import { currentMonthKey, daysInMonth, shiftMonthKey } from '@/lib/analytics-finance/months';
import { addDaysToIsoDate, todayInWarsaw } from '@/lib/format/warsaw-date';
import { roundToCents } from '@/lib/xml/invoice-calculator';
import type { KsefEnvironment } from '@/types/ksef';

import type { Row, Tables } from './fake-postgrest';

/** Firma-atrapa: wiersze przykładowe nie należą do żadnej prawdziwej firmy. */
export const DEMO_TENANT = 'przyklad-analizy';
const T = DEMO_TENANT;

/** Tyle miesięcy wstecz (z bieżącym) sięga historia — ranking klientów porównuje 12 z 12. */
export const MIESIACE_HISTORII = 24;

export interface OpcjePrzykladu {
  /**
   * Wariant firmy zwolnionej z VAT (art. 113) — TYLKO dla testów karty limitu.
   * Faktury bez VAT, koszty bez odliczenia, obroty mniejsze (limit nie
   * przekroczony), podstawa zwolnienia w `tenants`.
   */
  zwolnionyZVat?: boolean;
}

const r2 = (n: number) => roundToCents(n) || 0;
const pad = (n: number) => String(n).padStart(2, '0');

interface Kalendarz {
  now: Date;
  /** Dziś w Warszawie, RRRR-MM-DD. */
  today: string;
  /** Bieżący miesiąc w Warszawie, RRRR-MM. */
  month: string;
}

function dodaj(iso: string, dni: number): string {
  const wynik = addDaysToIsoDate(iso, dni);
  if (wynik === null) throw new Error(`Dane przykładowe: zła data ${iso}`);
  return wynik;
}

/**
 * Dzień `day` miesiąca `k` wstecz. W bieżącym miesiącu dni są ściśnięte do
 * tych, które już minęły (dzień 28 przy „dziś” = 14. to 13.), więc bieżący
 * miesiąc ma od 1. dnia pełny komplet dokumentów i nic nie ma daty z przyszłości.
 */
function dzien(kal: Kalendarz, k: number, day: number): string {
  const key = shiftMonthKey(kal.month, -k);
  const dim = daysInMonth(key);
  let d = Math.min(day, dim);
  if (k === 0) d = Math.max(1, Math.ceil((d * Number(kal.today.slice(8, 10))) / dim));
  return `${key}-${pad(d)}`;
}

/** Chwila zapłaty: dziś = `now`, wcześniej — przed południem tego dnia w Warszawie. */
function chwila(kal: Kalendarz, iso: string): string {
  return iso === kal.today ? kal.now.toISOString() : `${iso}T09:00:00.000Z`;
}

// ─── Sprzedaż ─────────────────────────────────────────────────────────────

type Pozycja = [name: string, unit: string, share: number];

interface Klient {
  nip: string;
  name: string;
  /** Dzień wystawienia w miesiącu. */
  day: number;
  /** Termin płatności w dniach od wystawienia. */
  termin: number;
  /** Po ilu dniach od wystawienia klient płaci (nie dłużej niż termin). */
  zwloka: number;
  /** Netto faktury `k` miesięcy wstecz. */
  net: (k: number) => number;
  aktywny: (k: number) => boolean;
  items: Pozycja[];
}

const ZAWSZE = () => true;

const KLIENCI: Klient[] = [
  {
    nip: '0000001010', name: 'Hurtownia Przykład sp. z o.o.', day: 3, termin: 30, zwloka: 29,
    net: (k) => 9600 - k * 110, aktywny: ZAWSZE,
    items: [['Abonament serwisowy', 'mies.', 0.55], ['Wdrożenie systemu', 'usł.', 0.45]],
  },
  {
    // Klient malejący — w rankingu strzałka w dół.
    nip: '0000002020', name: 'Studio Projektowe Przykład', day: 5, termin: 14, zwloka: 12,
    net: (k) => 5600 + k * 70, aktywny: ZAWSZE,
    items: [['Projekt graficzny', 'szt.', 0.6], ['Konsultacje', 'godz.', 0.4]],
  },
  {
    nip: '0000003030', name: 'Sklep Internetowy Przykład sp. z o.o.', day: 10, termin: 21, zwloka: 21,
    net: (k) => 5200 - k * 45 + (k % 2) * 300, aktywny: ZAWSZE,
    items: [['Hosting', 'mies.', 0.3], ['Abonament serwisowy', 'mies.', 0.7]],
  },
  {
    nip: '0000004040', name: 'Kancelaria Przykład', day: 14, termin: 30, zwloka: 26,
    net: (k) => 4200 - k * 15 + (k % 3 === 1 ? 600 : 0), aktywny: ZAWSZE,
    items: [['Konsultacje', 'godz.', 0.5], ['Abonament serwisowy', 'mies.', 0.5]],
  },
  {
    nip: '0000006060', name: 'Gabinet Przykład', day: 7, termin: 14, zwloka: 3,
    net: (k) => 2400 + k * 25, aktywny: ZAWSZE,
    items: [['Hosting', 'mies.', 0.4], ['Konsultacje', 'godz.', 0.6]],
  },
  {
    nip: '0000007070', name: 'Drukarnia Przykład S.A.', day: 20, termin: 30, zwloka: 14,
    net: (k) => 3600 - k * 30 + (k % 4) * 80, aktywny: ZAWSZE,
    items: [['Wdrożenie systemu', 'usł.', 1]],
  },
  {
    nip: '0000005050', name: 'Fundacja Przykład', day: 18, termin: 21, zwloka: 20,
    net: () => 3400, aktywny: (k) => k % 2 === 0,
    items: [['Szkolenie zespołu', 'godz.', 1]],
  },
  {
    nip: '0000008080', name: 'Biuro Podróży Przykład', day: 24, termin: 14, zwloka: 14,
    net: () => 5800, aktywny: (k) => k % 3 === 0,
    items: [['Szkolenie zespołu', 'godz.', 0.5], ['Konsultacje', 'godz.', 0.5]],
  },
  {
    nip: '0000009090', name: 'Pracownia Przykład', day: 16, termin: 14, zwloka: 9,
    net: () => 1900, aktywny: (k) => k % 4 === 1,
    items: [['Projekt graficzny', 'szt.', 1]],
  },
  {
    // Nowy klient (ostatnie 8 miesięcy) — w rankingu „nowy”, bez procentu.
    nip: '0000011110', name: 'Agencja Eventowa Przykład sp. z o.o.', day: 26, termin: 21, zwloka: 18,
    net: (k) => (k === 7 ? 6000 : 2600), aktywny: (k) => k <= 7,
    items: [['Licencja roczna', 'szt.', 0.35], ['Abonament serwisowy', 'mies.', 0.65]],
  },
];

/**
 * Faktury po terminie (należności „do 30 dni” i „ponad 30 dni” po terminie) —
 * daty liczone od dziś, żeby kubełki były pełne każdego dnia.
 */
const ZALEGLE: Array<{ klient: number; dniTemu: number; net: number; items: Pozycja[] }> = [
  { klient: 7, dniTemu: 34, net: 3100, items: [['Szkolenie zespołu', 'godz.', 1]] },
  { klient: 6, dniTemu: 61, net: 2450, items: [['Konsultacje', 'godz.', 1]] },
];

/** Status jak wyzwalacz `update_invoice_payment_status` (00073): `paid_at` tylko przy pełnej zapłacie. */
function platnosc(kal: Kalendarz, gross: number, due: string | null, paidOn: string | null) {
  if (paidOn !== null && paidOn <= kal.today) {
    return { payment_status: 'paid', paid_amount: gross, paid_at: chwila(kal, paidOn) };
  }
  return {
    payment_status: due !== null && due < kal.today ? 'overdue' : 'unpaid',
    paid_amount: 0,
    paid_at: null,
  };
}

interface Faktura {
  id: string;
  klient: Klient;
  issue: string;
  net: number;
  termin: number;
  /** Dzień zapłaty (może być w przyszłości — wtedy faktura otwarta); `null` = nie zapłaci. */
  paidOn: string | null;
  items: Pozycja[];
}

function faktury(kal: Kalendarz, env: KsefEnvironment, opcje: OpcjePrzykladu): { invoices: Row[]; lines: Row[] } {
  const skala = opcje.zwolnionyZVat ? 0.45 : 1;
  const vatRate = opcje.zwolnionyZVat ? 0 : 0.23;
  const plan: Faktura[] = [];
  for (let k = 0; k < MIESIACE_HISTORII; k++) {
    KLIENCI.forEach((klient, i) => {
      if (!klient.aktywny(k)) return;
      const issue = dzien(kal, k, klient.day);
      plan.push({
        id: `f-${k}-${i}`, klient, issue, net: r2(klient.net(k) * skala), termin: klient.termin,
        paidOn: dodaj(issue, klient.zwloka), items: klient.items,
      });
    });
  }
  ZALEGLE.forEach(({ klient, dniTemu, net, items }, i) => {
    plan.push({
      id: `f-zalegla-${i + 1}`, klient: KLIENCI[klient]!, issue: dodaj(kal.today, -dniTemu),
      net: r2(net * skala), termin: 14, paidOn: null, items,
    });
  });

  const invoices: Row[] = [];
  const lines: Row[] = [];
  const numer = new Map<string, number>();
  const nastepny = (month: string) => {
    const n = (numer.get(month) ?? 0) + 1;
    numer.set(month, n);
    return n;
  };
  const wspolne = (issue: string) => ({
    tenant_id: T,
    direction: 'outgoing',
    ksef_status: 'accepted',
    ksef_environment: env,
    advance_invoice_ids: [],
    currency: 'PLN',
    issue_date: issue,
    sale_date: issue,
    is_b2c: false,
    origin: 'app',
    payment_data: null,
    created_at: issue === kal.today ? kal.now.toISOString() : `${issue}T08:00:00.000Z`,
  });

  plan.sort((a, b) => a.issue.localeCompare(b.issue) || a.id.localeCompare(b.id));
  for (const f of plan) {
    const vat = r2(f.net * vatRate);
    const gross = r2(f.net + vat);
    const due = dodaj(f.issue, f.termin);
    invoices.push({
      id: f.id,
      ...wspolne(f.issue),
      invoice_kind: 'regular',
      invoice_type: 'VAT',
      parent_invoice_id: null,
      internal_number: `FV/${f.issue.slice(0, 4)}/${f.issue.slice(5, 7)}/${pad(nastepny(f.issue.slice(0, 7)))}`,
      net_total: f.net,
      vat_total: vat,
      gross_total: gross,
      buyer_nip: f.klient.nip,
      buyer_data: { name: f.klient.name, nip: f.klient.nip },
      payment_due_date: due,
      ...platnosc(kal, gross, due, f.paidOn),
    });
    // Ostatnia pozycja domyka netto faktury co do grosza.
    let reszta = f.net;
    f.items.forEach(([name, unit, share], j) => {
      const amount = j === f.items.length - 1 ? r2(reszta) : r2(f.net * share);
      reszta -= amount;
      lines.push({ id: `${f.id}-l${j}`, invoice_id: f.id, name, unit, net_amount: amount });
    });
  }

  // Korekta w bieżącym miesiącu: rabat do faktury Studia z poprzedniego miesiąca.
  const kor = dzien(kal, 0, 16);
  const korNet = r2(-400 * skala);
  const korVat = r2(korNet * vatRate);
  invoices.push({
    id: 'f-kor',
    ...wspolne(kor),
    invoice_kind: 'correction',
    invoice_type: 'KOR',
    parent_invoice_id: 'f-1-1',
    internal_number: `KOR/${kor.slice(0, 4)}/${kor.slice(5, 7)}/01`,
    net_total: korNet,
    vat_total: korVat,
    gross_total: r2(korNet + korVat),
    buyer_nip: KLIENCI[1]!.nip,
    buyer_data: { name: KLIENCI[1]!.name, nip: KLIENCI[1]!.nip },
    payment_due_date: null,
    ...platnosc(kal, r2(korNet + korVat), null, null),
  });
  return { invoices, lines };
}

// ─── Wydatki ──────────────────────────────────────────────────────────────

interface Dostawca {
  nip: string | null;
  name: string;
  category: string;
  day: number;
  /** Brutto dokumentu `k` miesięcy wstecz. */
  gross: (k: number) => number;
  aktywny: (k: number) => boolean;
  /** Paragon zamiast faktury (VAT bez odliczenia, koszt = brutto). */
  paragon?: boolean;
  /** VAT bez prawa do odliczenia (reprezentacja). */
  bezOdliczenia?: boolean;
  /** Dokument z bieżącego miesiąca czeka na opisanie („Do opisania”). */
  doOpisania?: boolean;
  /**
   * Skąd dokument (E10): `ksef` — faktura zakupu z KSeF (Skrzynka z wydatkiem
   * albo archiwum z historii), `ocr` — zdjęcie dokumentu spoza KSeF; brak —
   * wydatek wpisany ręcznie.
   */
  kanal?: 'ksef' | 'ocr';
}

const DOSTAWCY: Dostawca[] = [
  { nip: '0000000011', name: 'Coworking Przykład sp. z o.o.', category: 'Czynsz', day: 3, gross: () => 2460, aktywny: ZAWSZE, kanal: 'ksef' },
  { nip: '0000000022', name: 'Leasing Przykład S.A.', category: 'Usługi finansowe', day: 15, gross: () => 1599, aktywny: ZAWSZE, kanal: 'ksef' },
  { nip: '0000000033', name: 'Biuro Rachunkowe Przykład sp. z o.o.', category: 'Usługi obce', day: 10, gross: () => 738, aktywny: ZAWSZE, kanal: 'ksef' },
  { nip: '0000000044', name: 'Chmura Przykład sp. z o.o.', category: 'Oprogramowanie', day: 1, gross: (k) => 1230 - k * 12.3, aktywny: ZAWSZE, kanal: 'ksef' },
  { nip: '0000000055', name: 'Energia Przykład S.A.', category: 'Energia', day: 12, gross: (k) => 380 + (k % 12) * 17.5, aktywny: ZAWSZE, kanal: 'ksef' },
  { nip: '0000000066', name: 'Telekom Przykład S.A.', category: 'Telekomunikacja', day: 8, gross: () => 184.5, aktywny: ZAWSZE, kanal: 'ksef' },
  { nip: '0000000077', name: 'Stacja Paliw Przykład sp. z o.o.', category: 'Paliwo', day: 6, gross: (k) => 412.3 - (k % 6) * 21, aktywny: ZAWSZE, kanal: 'ocr' },
  { nip: '0000000077', name: 'Stacja Paliw Przykład sp. z o.o.', category: 'Paliwo', day: 19, gross: (k) => 368.9 + (k % 5) * 12, aktywny: ZAWSZE, kanal: 'ocr' },
  { nip: '0000000077', name: 'Stacja Paliw Przykład sp. z o.o.', category: 'Paliwo', day: 27, gross: (k) => 198 + (k % 4) * 5, aktywny: (k) => k > 0, kanal: 'ocr' },
  { nip: '0000000088', name: 'Agencja Reklamowa Przykład sp. z o.o.', category: 'Marketing', day: 14, gross: (k) => (k === 0 ? 1230 : 615), aktywny: (k) => k % 3 === 0, kanal: 'ksef' },
  { nip: '0000000099', name: 'Restauracja Przykład', category: 'Reprezentacja', day: 17, gross: (k) => 286 - (k % 4) * 9, aktywny: (k) => k % 2 === 0, bezOdliczenia: true, doOpisania: true, kanal: 'ocr' },
  { nip: null, name: 'Sklep Papierniczy Przykład', category: 'Materiały biurowe', day: 9, gross: (k) => 159.9 + (k % 3) * 7, aktywny: (k) => k % 2 === 0, paragon: true, doOpisania: true },
  { nip: null, name: 'Księgarnia Przykład', category: 'Pozostałe', day: 20, gross: () => 89, aktywny: (k) => k % 6 === 0, paragon: true },
  { nip: '0000000101', name: 'Szkolenia Przykład sp. z o.o.', category: 'Usługi obce', day: 24, gross: () => 1476, aktywny: (k) => k % 6 === 1, kanal: 'ksef' },
  { nip: '0000000112', name: 'Kurier Przykład sp. z o.o.', category: 'Pozostałe', day: 4, gross: (k) => 36.9 + (k % 3), aktywny: ZAWSZE },
  { nip: '0000000123', name: 'Sklep Komputerowy Przykład S.A.', category: 'Oprogramowanie', day: 22, gross: () => 1845, aktywny: (k) => k % 12 === 3, kanal: 'ksef' },
];

/**
 * Skrzynka KSeF działa od tylu miesięcy (z bieżącym): faktury zakupu z tego
 * okresu mają wydatek ze Skrzynki, starsze są archiwum z historii KSeF.
 */
const MIESIACE_SKRZYNKI = 3;

/** Firma przykładowa jako nabywca faktur zakupu (fikcyjna, jak reszta). */
const NABYWCA = { name: 'Twoja Firma Przykład', nip: '0000000000' } as const;

/**
 * Podwykonawca — koszt dopełniający miesiąc do 33–37% przychodu netto
 * (firma usługowa zleca część pracy). Liczony ze sprzedaży tego miesiąca
 * w zestawie, więc proporcja zgadza się z kartą i wykresem z definicji.
 */
const PODWYKONAWCA = {
  nip: '0000000134',
  name: 'Programista Przykład',
  category: 'Usługi obce',
  day: 25,
  kanal: 'ksef',
} as const;

function udzialKosztow(k: number): number {
  return 0.33 + ((k * 7) % 5) * 0.01;
}

type DaneDostawcy = Pick<Dostawca, 'nip' | 'name' | 'category' | 'paragon' | 'bezOdliczenia' | 'kanal'>;

function wydatek(
  kal: Kalendarz,
  id: string,
  nr: number,
  d: DaneDostawcy,
  date: string,
  gross: number,
  net: number,
  zwolniony: boolean,
  reviewed: boolean,
  /** Faktura ze Skrzynki, z której powstał wydatek (00121: jeden wydatek na fakturę). */
  faktura: Row | null = null,
): Row {
  const vat = r2(gross - net);
  const odliczenie = zwolniony || d.paragon || d.bezOdliczenia ? 0 : vat;
  return {
    id,
    tenant_id: T,
    source: faktura ? 'ksef_inbox' : d.kanal === 'ocr' ? 'ocr_photo' : 'manual',
    ksef_invoice_id: faktura ? faktura.id : null,
    issue_date: date,
    seller_nip: d.nip,
    seller_name: d.name,
    document_number: faktura
      ? faktura.internal_number
      : d.paragon
        ? `PAR ${date.slice(8, 10)}/${nr}`
        : `FV/${nr}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
    is_deductible: true,
    is_reviewed: reviewed,
    document_type: d.paragon ? 'receipt' : 'invoice',
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross,
    vat_deductible_amount: odliczenie,
    category_label: d.category,
    ocr_extracted_data: null,
    created_at: date === kal.today ? kal.now.toISOString() : `${date}T08:00:00.000Z`,
  };
}

/**
 * Faktura zakupu z KSeF (E10) w kształcie zapisu prawdziwych ścieżek:
 * Skrzynka (`inbox-polling`: metadane w `fa3_data`, bez `seller_data`) albo
 * historia (`processImportedInvoices`: `seller_data`). Bez terminu i bez
 * wpłat — zakupów nie rozliczamy (statusy jak wyzwalacz 00073 dla braku terminu).
 */
function fakturaZakupu(
  kal: Kalendarz,
  env: KsefEnvironment,
  id: string,
  nr: number,
  d: DaneDostawcy,
  date: string,
  gross: number,
  net: number,
  origin: 'ksef_inbox' | 'ksef_import',
): Row {
  const sprzedawca = { name: d.name, nip: d.nip };
  return {
    id,
    tenant_id: T,
    direction: 'incoming',
    origin,
    ksef_status: 'accepted',
    ksef_environment: env,
    ksef_number: `${d.nip}-${date.replaceAll('-', '')}-${id.toUpperCase()}`,
    internal_number: `FV/${nr}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
    invoice_kind: 'regular',
    invoice_type: 'VAT',
    parent_invoice_id: null,
    advance_invoice_ids: [],
    currency: 'PLN',
    issue_date: date,
    sale_date: date,
    net_total: net,
    vat_total: r2(gross - net),
    gross_total: gross,
    seller_nip: d.nip,
    seller_data: origin === 'ksef_import' ? sprzedawca : null,
    fa3_data: origin === 'ksef_inbox' ? { _source: 'inbox-metadata', seller: sprzedawca } : {},
    buyer_nip: NABYWCA.nip,
    buyer_data: { ...NABYWCA },
    is_b2c: false,
    payment_data: null,
    payment_due_date: null,
    payment_status: 'unpaid',
    paid_amount: 0,
    paid_at: null,
    created_at: date === kal.today ? kal.now.toISOString() : `${date}T08:00:00.000Z`,
  };
}

/** Koszt jak w KPiR: netto + VAT bez odliczenia (`kpirCostAmount`). */
function kosztKpir(row: Row): number {
  return Number(row.net_amount) + Number(row.vat_amount) - Number(row.vat_deductible_amount);
}

/**
 * Dokument kosztowy miesiąca `k`: wydatek, a dla faktur z KSeF także faktura
 * zakupu — ze Skrzynki z wydatkiem (ostatnie `MIESIACE_SKRZYNKI`) albo
 * z historii bez wydatku. Zwraca koszt jak w KPiR — dla faktury bez wydatku
 * ten sam, który policzy `getCostsWithKsefPurchases` (netto; firma zwolniona
 * — brutto), więc proporcja kosztów do przychodu nie zależy od kanału.
 */
function dokument(
  kal: Kalendarz,
  env: KsefEnvironment,
  k: number,
  slot: string,
  nr: number,
  d: DaneDostawcy,
  date: string,
  gross: number,
  net: number,
  zwolniony: boolean,
  reviewed: boolean,
  out: { expenses: Row[]; purchases: Row[] },
): number {
  const faktura = d.kanal === 'ksef'
    ? fakturaZakupu(kal, env, `z-${slot}`, nr, d, date, gross, net, k < MIESIACE_SKRZYNKI ? 'ksef_inbox' : 'ksef_import')
    : null;
  const row = wydatek(kal, `w-${slot}`, nr, d, date, gross, net, zwolniony, reviewed, faktura);
  if (faktura) out.purchases.push(faktura);
  if (!faktura || faktura.origin === 'ksef_inbox') out.expenses.push(row);
  return kosztKpir(row);
}

function wydatki(
  kal: Kalendarz,
  env: KsefEnvironment,
  przychod: Map<string, number>,
  opcje: OpcjePrzykladu,
): { expenses: Row[]; purchases: Row[] } {
  const skala = opcje.zwolnionyZVat ? 0.45 : 1;
  const zwolniony = opcje.zwolnionyZVat === true;
  const out = { expenses: [] as Row[], purchases: [] as Row[] };
  for (let k = 0; k < MIESIACE_HISTORII; k++) {
    const month = shiftMonthKey(kal.month, -k);
    let koszt = 0;
    DOSTAWCY.forEach((d, i) => {
      if (!d.aktywny(k)) return;
      const date = dzien(kal, k, d.day);
      const gross = r2(d.gross(k) * skala);
      koszt += dokument(kal, env, k, `${k}-${pad(i)}`, 100 + i, d, date, gross, r2(gross / 1.23), zwolniony, !(k === 0 && d.doOpisania), out);
    });
    const brakuje = Math.max(0, (przychod.get(month) ?? 0) * udzialKosztow(k) - koszt);
    // Koszt podwykonawcy = netto (VAT odliczony) albo brutto (firma zwolniona).
    const net = r2(zwolniony ? brakuje / 1.23 : brakuje);
    const gross = r2(net * 1.23);
    dokument(kal, env, k, `${k}-99`, 24 - k, PODWYKONAWCA, dzien(kal, k, PODWYKONAWCA.day), gross, net, zwolniony, true, out);
  }
  return out;
}

// ─── Firma ────────────────────────────────────────────────────────────────

function firma(kal: Kalendarz, opcje: OpcjePrzykladu): Row {
  return {
    id: T,
    vat_exemption_basis: opcje.zwolnionyZVat ? 'art. 113 ust. 1 ustawy o VAT' : null,
    // Działalność od 3 lat — limit VAT bez proporcji, cały rok w historii.
    business_started_on: `${shiftMonthKey(kal.month, -36)}-01`,
  };
}

/**
 * Tabele atrapy bazy: `tenants`, `invoices` (sprzedaż i faktury zakupu
 * z KSeF), `invoice_line_items` (sprzedaż), `expenses`.
 */
export function danePrzykladowe(now: Date, env: KsefEnvironment, opcje: OpcjePrzykladu = {}): Tables {
  const kal: Kalendarz = { now, today: todayInWarsaw(now), month: currentMonthKey(now) };
  const { invoices, lines } = faktury(kal, env, opcje);
  const przychod = new Map<string, number>();
  for (const inv of invoices) {
    const month = String(inv.issue_date).slice(0, 7);
    przychod.set(month, (przychod.get(month) ?? 0) + Number(inv.net_total));
  }
  const { expenses, purchases } = wydatki(kal, env, przychod, opcje);
  return {
    tenants: [firma(kal, opcje)],
    invoices: [...invoices, ...purchases],
    invoice_line_items: lines,
    expenses,
  };
}
