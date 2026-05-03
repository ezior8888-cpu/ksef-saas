/**
 * Parser XML faktur FA(3) — ekstrakcja kontrahentów, pozycji i kwot.
 * Dopasowany do emisji z `lib/xml/fa3-generator.ts` (wersja schemy 2025-06-25).
 */

import { XMLParser } from 'fast-xml-parser';

// ============================================================================
// Typy wynikowe
// ============================================================================

export interface ParsedInvoice {
  ksefNumber?: string;
  invoiceNumber: string;
  issueDate: string;
  invoiceType: 'regular' | 'correction' | 'advance' | 'final';

  seller: ParsedParty;
  buyer: ParsedParty;

  lines: ParsedLine[];

  totals: {
    netTotal: number;
    vatTotal: number;
    grossTotal: number;
  };

  paymentDueDate?: string;
  /** Zmapowana etykieta (np. przelew / gotówka) albo surowy kod z FormaPlatnosci. */
  paymentMethod?: string;
  bankAccount?: string;

  warnings: string[];
}

export interface ParsedParty {
  nip?: string;
  pesel?: string;
  /** NrVatUE + KodUE jako „DEXXXXX” (bez spacji). */
  vatUeNumber?: string;
  nrInny?: string;
  brakId?: boolean;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  countryCode?: string;
  email?: string;
}

export interface ParsedLine {
  position: number;
  name: string;
  unit: string;
  quantity: number;
  unitPriceNet: number;
  /** Wartość z P_12 (np. „23”, „zw”, „0 KR”). */
  vatRate: string;
  netAmount: number;
}

// ============================================================================
// Parser XML
// ============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  removeNSPrefix: true,
});

/** Klucze netto wg sekwencji FA(3); brak pola = 0 przy sumowaniu. */
const FA_NET_KEYS = [
  'P_13_1',
  'P_13_2',
  'P_13_3',
  'P_13_4',
  'P_13_5',
  'P_13_6_1',
  'P_13_6_2',
  'P_13_6_3',
  'P_13_7',
  'P_13_8',
  'P_13_9',
  'P_13_10',
  'P_13_11',
] as const;

/** Typowe pola VAT przy stawkach 23 / 8 / 5 (+ ewentualne rozszerzenia). */
const FA_VAT_KEYS = [
  'P_14_1',
  'P_14_2',
  'P_14_3',
  'P_14_4',
  'P_14_5',
  'P_14_6',
  'P_14_7',
  'P_14_8',
  'P_14_9',
  'P_14_10',
  'P_14_11',
] as const;

const FORMA_PLATNOSCI_MAP: Record<string, string> = {
  '1': 'gotówka',
  '2': 'karta',
  '3': 'bon',
  '4': 'czek',
  '5': 'kredyt',
  '6': 'przelew',
  '7': 'przelew mobilny',
};

export function parseFa3Xml(xmlContent: string, options?: { ksefNumber?: string }): ParsedInvoice {
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = xmlParser.parse(xmlContent);
  } catch (e) {
    throw new Error(`XML parse error: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  const root = extractFakturaRoot(parsed);
  if (!root) {
    throw new Error('Brak elementu Faktura w XML — oczekiwany format FA(3)');
  }

  const faRaw = root.Fa;
  if (!faRaw || typeof faRaw !== 'object') {
    throw new Error('Brak sekcji Fa w fakturze');
  }

  const fa = faRaw as Record<string, unknown>;

  const invoiceType = mapRodzajFaktury(String(fa.RodzajFaktury ?? 'VAT'));

  const invoiceNumber = String(fa.P_2 ?? '');
  const issueDate = String(fa.P_1 ?? '').slice(0, 10);

  if (!invoiceNumber) warnings.push('Brak numeru faktury (P_2)');
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    warnings.push(`Niepewna lub brakująca data wystawienia (P_1): ${fa.P_1 ?? ''}`);
  }

  const seller = parseParty(root.Podmiot1, warnings, 'Sprzedawca');
  const buyer = parseParty(root.Podmiot2, warnings, 'Nabywca');

  const wiersze = ensureArray(fa.FaWiersz as unknown[] | Record<string, unknown> | undefined);
  const lines: ParsedLine[] = wiersze.map((wRaw, idx) => {
    const w = (wRaw && typeof wRaw === 'object' ? wRaw : {}) as Record<string, unknown>;
    const pos = Number(w.NrWierszaFa) || idx + 1;
    return {
      position: pos,
      name: String(w.P_7 ?? ''),
      unit: String(w.P_8A ?? 'szt.'),
      quantity: parseNum(w.P_8B),
      unitPriceNet: parseNum(w.P_9A),
      vatRate: String(w.P_12 ?? '23'),
      netAmount: parseNum(w.P_11),
    };
  });

  if (lines.length === 0 && invoiceType !== 'correction') {
    warnings.push('Brak pozycji (FaWiersz)');
  }

  const totalsHeader = summarizeTotalsFromFa(fa);
  const totalsFromLines = summarizeTotalsFromLines(lines);
  const totals = pickTotals(totalsHeader, totalsFromLines, warnings);

  const platnosc = fa.Platnosc;
  const { paymentDueDate, paymentMethod, bankAccount } = parsePlatnosc(platnosc, warnings);

  if (options?.ksefNumber) {
    return {
      ksefNumber: options.ksefNumber,
      invoiceNumber,
      issueDate,
      invoiceType,
      seller,
      buyer,
      lines,
      totals,
      paymentDueDate,
      paymentMethod,
      bankAccount,
      warnings,
    };
  }

  return {
    invoiceNumber,
    issueDate,
    invoiceType,
    seller,
    buyer,
    lines,
    totals,
    paymentDueDate,
    paymentMethod,
    bankAccount,
    warnings,
  };
}

// ============================================================================
// Rodzaj faktury
// ============================================================================

function mapRodzajFaktury(rodzajFaktury: string): ParsedInvoice['invoiceType'] {
  const r = rodzajFaktury.trim().toUpperCase();
  switch (r) {
    case 'KOR':
    case 'KOR_ZAL':
    case 'KOR_ROZ':
      return 'correction';
    case 'ZAL':
      return 'advance';
    case 'ROZ':
      return 'final';
    case 'VAT':
    case 'UPR':
    default:
      return 'regular';
  }
}

// ============================================================================
// Podmioty
// ============================================================================

function parseParty(
  podmiot: unknown,
  warnings: string[],
  partyLabel: string,
): ParsedParty {
  if (!podmiot || typeof podmiot !== 'object') {
    warnings.push(`Brak danych: ${partyLabel}`);
    return { name: 'Nieznany' };
  }

  const pm = podmiot as Record<string, unknown>;
  const dane = (pm.DaneIdentyfikacyjne ?? {}) as Record<string, unknown>;
  const adres = (pm.Adres ?? {}) as Record<string, unknown>;

  const nip = dane.NIP != null && String(dane.NIP).trim() !== '' ? String(dane.NIP).trim() : undefined;

  let pesel: string | undefined;
  if (dane.NrPESEL != null && String(dane.NrPESEL).trim() !== '') {
    pesel = String(dane.NrPESEL).trim();
  }

  let vatUeNumber: string | undefined;
  if (dane.KodUE != null && dane.NrVatUE != null) {
    vatUeNumber = `${String(dane.KodUE).trim()}${String(dane.NrVatUE).trim()}`;
  }

  const nrInny =
    dane.NrInny != null && String(dane.NrInny).trim() !== ''
      ? String(dane.NrInny).trim()
      : undefined;

  const brakId =
    dane.BrakID != null &&
    (dane.BrakID === 1 ||
      dane.BrakID === '1' ||
      String(dane.BrakID).toLowerCase() === 'true');

  const nazwaRaw = dane.Nazwa ?? dane.ImieINazwisko ?? '';
  const name = String(nazwaRaw ?? '').trim() || 'Nieznany';

  if (
    partyLabel === 'Nabywca' &&
    !nip &&
    !pesel &&
    !vatUeNumber &&
    !nrInny &&
    !brakId
  ) {
    warnings.push(`${partyLabel}: brak identyfikatora (NIP / PESEL / UE / NrInny / BrakID)`);
  }

  let email: string | undefined;
  const kontakt = pm.DaneKontaktowe;
  if (kontakt && typeof kontakt === 'object') {
    const k = kontakt as Record<string, unknown>;
    if (k.Email != null && String(k.Email).trim()) {
      email = String(k.Email).trim();
    }
  }

  return {
    nip,
    pesel,
    vatUeNumber,
    nrInny,
    brakId: brakId || undefined,
    name,
    addressLine1: adres.AdresL1 ? String(adres.AdresL1) : undefined,
    addressLine2: adres.AdresL2 ? String(adres.AdresL2) : undefined,
    countryCode: adres.KodKraju ? String(adres.KodKraju) : 'PL',
    email,
  };
}

// ============================================================================
// Pozycje / kwoty
// ============================================================================

function summarizeTotalsFromFa(fa: Record<string, unknown>): {
  grossTotal?: number;
  netTotal?: number;
  vatTotal?: number;
} {
  const grossTotal = optionalNum(fa.P_15);

  let netTotal = 0;
  let hasNetKey = false;
  for (const k of FA_NET_KEYS) {
    if (fa[k] != null && String(fa[k]).trim() !== '') {
      hasNetKey = true;
      netTotal += parseNum(fa[k]);
    }
  }

  let vatTotal = 0;
  let hasVatKey = false;
  for (const k of FA_VAT_KEYS) {
    if (fa[k] != null && String(fa[k]).trim() !== '') {
      hasVatKey = true;
      vatTotal += parseNum(fa[k]);
    }
  }

  return {
    grossTotal,
    netTotal: hasNetKey ? netTotal : undefined,
    vatTotal: hasVatKey ? vatTotal : undefined,
  };
}

function summarizeTotalsFromLines(lines: ParsedLine[]): {
  netTotal: number;
  vatTotal: number;
} {
  let netTotal = 0;
  for (const l of lines) netTotal += l.netAmount;
  return {
    netTotal,
    /** Brak pola VAT po linii w FA bez rozbicia — przy sumach z pozycji dajemy 0. */
    vatTotal: 0,
  };
}

function pickTotals(
  fromFa: { grossTotal?: number; netTotal?: number; vatTotal?: number },
  fromLines: { netTotal: number; vatTotal: number },
  warnings: string[],
): ParsedInvoice['totals'] {
  let grossTotal = fromFa.grossTotal ?? 0;
  let netTotal = fromFa.netTotal;
  let vatTotal = fromFa.vatTotal;

  if (netTotal === undefined || vatTotal === undefined) {
    if (fromLines.netTotal > 0) {
      if (netTotal === undefined) {
        warnings.push(
          'Brak lub niekompletne sum P_13_*/P_14_* w nagłówku — przyjęto sumę netto z pozycji',
        );
        netTotal = fromLines.netTotal;
      }
      if (vatTotal === undefined && grossTotal > 0 && netTotal != null) {
        vatTotal = Math.max(0, roundCents(grossTotal - netTotal));
        warnings.push('VAT przybliżony jako brutto − netto z pozycji');
      }
    }
  }

  netTotal ??= fromLines.netTotal;
  vatTotal ??= 0;

  if (!grossTotal && netTotal + vatTotal > 0) {
    grossTotal = roundCents(netTotal + vatTotal);
    warnings.push('Brak P_15 — brutto przyjęto jako netto + VAT');
  }

  grossTotal ||= roundCents(netTotal + vatTotal);

  const calcGross = roundCents(netTotal + vatTotal);
  if (grossTotal > 0 && Math.abs(calcGross - grossTotal) > 0.02) {
    warnings.push(
      `Możliwa niezgodność kwot nagłówka: netto+VAT=${calcGross.toFixed(2)} vs brutto(P_15)=${grossTotal.toFixed(2)}`,
    );
  }

  return { netTotal: roundCents(netTotal), vatTotal: roundCents(vatTotal), grossTotal };
}

// ============================================================================
// Płatność
// ============================================================================

function parsePlatnosc(
  platnosc: unknown,
  warnings: string[],
): Pick<ParsedInvoice, 'paymentDueDate' | 'paymentMethod' | 'bankAccount'> {
  if (!platnosc || typeof platnosc !== 'object') {
    return {};
  }

  const p = platnosc as Record<string, unknown>;

  let paymentDueDate: string | undefined;
  const blokList = ensureArray(
    p.TerminPlatnosci as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );
  for (const blok of blokList) {
    if (!blok || typeof blok !== 'object') continue;
    const rawTerm = (blok as Record<string, unknown>).Termin;
    const terms = ensureArray(rawTerm as string | string[] | undefined);
    const head = terms[0];
    if (head != null && String(head).trim() !== '') {
      paymentDueDate = String(head).trim().slice(0, 10);
      break;
    }
  }

  if (paymentDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDueDate)) {
    warnings.push(`Nieczytelny termin płatności: ${paymentDueDate}`);
  }

  let paymentMethod: string | undefined;
  if (p.PlatnoscInna === 1 || p.PlatnoscInna === '1') {
    paymentMethod =
      typeof p.OpisPlatnosci === 'string' && p.OpisPlatnosci.trim()
        ? `inna: ${String(p.OpisPlatnosci).trim()}`
        : 'inna';
  } else if (p.FormaPlatnosci != null) {
    const code = String(p.FormaPlatnosci).trim();
    paymentMethod = FORMA_PLATNOSCI_MAP[code] ?? `FormaPlatnosci=${code}`;
  }

  let bankAccount: string | undefined;
  const rach = p.RachunekBankowy;
  const rachList = ensureArray(
    rach as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );
  if (rachList.length) {
    const first = rachList[0] && typeof rachList[0] === 'object' ? rachList[0] : undefined;
    if (first && 'NrRB' in first && first.NrRB != null) {
      bankAccount = String(first.NrRB).replace(/\s+/g, '');
    }
  }

  return {
    paymentDueDate,
    paymentMethod,
    bankAccount,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function extractFakturaRoot(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const o = parsed as Record<string, unknown>;
  if ('Faktura' in o && o.Faktura && typeof o.Faktura === 'object') {
    return o.Faktura as Record<string, unknown>;
  }

  const keys = Object.keys(o);
  const faktKey = keys.find((k) => k === 'Faktura' || k.endsWith(':Faktura') || /\bFaktura$/u.test(k));
  if (faktKey && o[faktKey] && typeof o[faktKey] === 'object') {
    return o[faktKey] as Record<string, unknown>;
  }

  return null;
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseNum(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(',', '.').replace(/\s+/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function optionalNum(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
  const n = parseNum(raw);
  return n !== 0 || String(raw).trim() === '0' ? n : undefined;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
