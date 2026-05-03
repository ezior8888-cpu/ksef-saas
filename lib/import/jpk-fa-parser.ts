/**
 * Parser JPK_FA — Jednolity Plik Kontrolny (FA).
 * Dokumentacja / schematy: https://www.gov.pl/web/finanse/struktury-jpk
 *
 * Zgodnie ze strukturą MF: rekordy `FakturaWiersz` to osobna tabela powiązana z fakturą
 * przez P_2B → P_2A (alternatywnie niektóre narzędzia zagnieżdżają wiersze w `Faktura`).
 */

import { XMLParser } from 'fast-xml-parser';
import type { ParsedInvoice, ParsedLine, ParsedParty } from './fa3-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  removeNSPrefix: true,
});

const FA_NET_KEYS_BASE = [
  'P_13_1',
  'P_13_2',
  'P_13_3',
  'P_13_4',
  'P_13_5',
  'P_13_7',
  'P_13_8',
  'P_13_9',
  'P_13_10',
  'P_13_11',
] as const;

const P_13_6_SPLIT = ['P_13_6_1', 'P_13_6_2', 'P_13_6_3'] as const;

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

export interface JpkFaParseResult {
  invoices: ParsedInvoice[];
  metadata: {
    issuerNip: string;
    issuerName: string;
    periodFrom: string;
    periodTo: string;
    schemaVersion: string;
  };
  warnings: string[];
}

export function parseJpkFaXml(xmlContent: string): JpkFaParseResult {
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = xmlParser.parse(xmlContent);
  } catch (e) {
    throw new Error(`JPK_FA parse error: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  const jpk = extractJpkRoot(parsed);
  if (!jpk) {
    throw new Error('Brak elementu JPK / JPK_FA — oczekiwany plik JPK_FA');
  }

  const naglowek =
    (jpk.Naglowek as Record<string, unknown> | undefined) ??
    (jpk.Header as Record<string, unknown> | undefined) ??
    {};

  const podmiot1 =
    jpk.Podmiot1 ??
    jpk.Subject ??
    (Array.isArray(jpk.Podmiot1) ? jpk.Podmiot1[0] : undefined);

  const { nip: issuerNip, name: issuerName } = parseIssuerPodmiot(podmiot1);

  const schemaVersion = readKodFormularzaVariant(naglowek);

  const periodFrom = readNaglowekDate(naglowek, 'from');
  const periodTo = readNaglowekDate(naglowek, 'to');

  if (!periodFrom || !periodTo) {
    warnings.push('Brak lub niepełny okres (DataOd/DataDo) w nagłówku JPK');
  }

  const faktury = ensureArray(jpk.Faktura as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const wierszeGlobal = ensureArray(
    jpk.FakturaWiersz as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );

  const linesByInvoice = new Map<string, Record<string, unknown>[]>();
  for (const wRaw of wierszeGlobal) {
    if (!wRaw || typeof wRaw !== 'object') continue;
    const w = wRaw as Record<string, unknown>;
    const inv = normalizeKey(String(w.P_2B ?? ''));
    if (!inv) {
      warnings.push('Wiersz FakturaWiersz bez P_2B — pominięty przy grupowaniu');
      continue;
    }
    const list = linesByInvoice.get(inv) ?? [];
    list.push(w);
    linesByInvoice.set(inv, list);
  }

  const invoices: ParsedInvoice[] = [];

  for (const faRaw of faktury) {
    if (!faRaw || typeof faRaw !== 'object') continue;
    const fa = faRaw as Record<string, unknown>;
    const invNo = jpkInvoiceNumber(fa);
    try {
      if (!invNo) {
        throw new Error('Brak numeru faktury (P_2A / P_2)');
      }
      const mergedLines = mergeLinesForInvoice(fa, invNo, linesByInvoice);
      const invoice = buildParsedInvoiceFromJpk(
        fa,
        mergedLines,
        { nip: issuerNip, name: issuerName },
        invNo,
      );
      invoices.push(invoice);
    } catch (e) {
      warnings.push(
        `Pominięto fakturę ${invNo || 'nieznaną'}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  const seenInvoices = new Set(faktury.map((f) => normalizeKey(jpkInvoiceNumber(f as Record<string, unknown>))).filter(Boolean));
  for (const key of linesByInvoice.keys()) {
    if (!seenInvoices.has(key)) {
      warnings.push(`Wiersze FakturaWiersz dla nieistniejącej faktury (P_2B=${key})`);
    }
  }

  return {
    invoices,
    metadata: {
      issuerNip,
      issuerName,
      periodFrom,
      periodTo,
      schemaVersion,
    },
    warnings,
  };
}

// ============================================================================
// Budowa ParsedInvoice
// ============================================================================

function buildParsedInvoiceFromJpk(
  fa: Record<string, unknown>,
  lineRows: Record<string, unknown>[],
  issuer: { nip: string; name: string },
  invoiceNumber: string,
): ParsedInvoice {
  const warnings: string[] = [];

  const issueDate = String(fa.P_1 ?? '').slice(0, 10);
  const invoiceType = mapJpkRodzajFaktury(fa.RodzajFaktury);

  if (!invoiceNumber) warnings.push('Brak numeru faktury (P_2A / P_2)');
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    warnings.push(`Niepewna data wystawienia (P_1): ${fa.P_1 ?? ''}`);
  }

  const seller: ParsedParty = {
    nip: issuer.nip || undefined,
    name: issuer.name?.trim() || 'Nieznany',
  };

  const buyer = parseJpkBuyer(fa, warnings);

  const lines: ParsedLine[] = lineRows.map((w, idx) => mapFakturaWiersz(w, idx));

  if (
    lines.length === 0 &&
    invoiceType !== 'correction' &&
    invoiceType !== 'advance'
  ) {
    warnings.push('Brak pozycji (FakturaWiersz / zagnieżdżone) dla faktury');
  }

  const totalsHeader = summarizeTotalsFromJpkFaktura(fa);
  const totalsFromLines = summarizeTotalsFromLines(lines);
  const totals = pickTotals(totalsHeader, totalsFromLines, warnings);

  return {
    invoiceNumber,
    issueDate,
    invoiceType,
    seller,
    buyer,
    lines,
    totals,
    warnings,
  };
}

function mapFakturaWiersz(w: Record<string, unknown>, idx: number): ParsedLine {
  const pos =
    Number(w.NrWierszaFa ?? w.NrWiersza ?? w.NrLinii ?? w.Lp) || idx + 1;
  const qty = parseNum(w.P_8B);
  return {
    position: pos,
    name: String(w.P_7 ?? w.NazwaTowaruUslugi ?? ''),
    unit: String(w.P_8A ?? 'szt.'),
    quantity: qty || 0,
    unitPriceNet: parseNum(w.P_9A),
    vatRate: normalizeVatRate(w.P_12),
    netAmount: parseNum(w.P_11),
  };
}

function parseJpkBuyer(fa: Record<string, unknown>, warnings: string[]): ParsedParty {
  const name =
    String(fa.P_3A ?? fa.NazwaKontrahenta ?? '').trim() || 'Nieznany';
  const addressLine1 =
    fa.P_3B != null
      ? String(fa.P_3B)
      : fa.AdresKontrahenta != null
        ? String(fa.AdresKontrahenta)
        : undefined;

  const p5a = fa.P_5A != null ? String(fa.P_5A).trim() : '';
  const p5b = fa.P_5B != null ? String(fa.P_5B).replace(/\s+/g, '') : '';
  const legacyNr = fa.NrKontrahenta != null ? String(fa.NrKontrahenta).replace(/\s+/g, '') : '';

  let nip: string | undefined;
  let vatUeNumber: string | undefined;

  if (p5a) {
    vatUeNumber = `${p5a}${p5b}`;
  } else if (p5b) {
    const digits = p5b.replace(/\D/g, '');
    if (digits.length === 10) nip = digits;
    else nip = p5b;
  } else if (legacyNr) {
    const d = legacyNr.replace(/\D/g, '');
    if (d.length === 10) nip = d;
    else nip = legacyNr;
  }

  if (!nip && !vatUeNumber) {
    warnings.push('Nabywca: brak identyfikatora (P_5A/P_5B lub NrKontrahenta)');
  }

  return {
    nip,
    vatUeNumber,
    name,
    addressLine1,
    countryCode: p5a ? p5a : 'PL',
  };
}

function mapJpkRodzajFaktury(raw: unknown): ParsedInvoice['invoiceType'] {
  const r = String(raw ?? 'VAT')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  if (
    r === 'KOREKTA' ||
    r === 'KOR' ||
    r === 'KOR_ZAL' ||
    r === 'KOR_ROZ'
  ) {
    return 'correction';
  }
  if (r === 'ZAL' || r === 'ZALICZKOWA') return 'advance';
  if (
    r === 'ROZ' ||
    r === 'ROZLICZENIOWA' ||
    r === 'KONCOWA' ||
    r === 'KOŃCOWA'
  ) {
    return 'final';
  }
  return 'regular';
}

function jpkInvoiceNumber(fa: Record<string, unknown>): string {
  return String(fa.P_2A ?? fa.P_2 ?? '').trim();
}

function mergeLinesForInvoice(
  fa: Record<string, unknown>,
  invoiceNumber: string,
  linesByInvoice: Map<string, Record<string, unknown>[]>,
): Record<string, unknown>[] {
  const key = normalizeKey(invoiceNumber);
  const fromTable = key ? (linesByInvoice.get(key) ?? []) : [];

  const nested = ensureArray(
    fa.FakturaWiersz as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ).filter((r) => r && typeof r === 'object') as Record<string, unknown>[];

  return [...fromTable, ...nested];
}

// ============================================================================
// Metadata
// ============================================================================

function extractJpkRoot(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const candidates = [o.JPK, o.JPK_FA];

  for (const c of candidates) {
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      return c as Record<string, unknown>;
    }
  }

  const key =
    Object.keys(o).find(
      (k) => k === 'JPK' || k.endsWith(':JPK') || /\bJPK$/u.test(k),
    ) ??
    Object.keys(o).find(
      (k) => k.includes('JPK_FA') || k.endsWith(':JPK_FA'),
    );
  if (!key || !o[key] || typeof o[key] !== 'object' || Array.isArray(o[key])) {
    return null;
  }
  return o[key] as Record<string, unknown>;
}

function readKodFormularzaVariant(naglowek: Record<string, unknown>): string {
  const kod = naglowek.KodFormularza;
  if (kod && typeof kod === 'object' && !Array.isArray(kod)) {
    const v = (kod as Record<string, unknown>)['@_wariantFormularza'];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  if (typeof kod === 'string') {
    const m = kod.match(/\((\d+)\)/);
    if (m) return m[1];
  }
  return '4';
}

function readNaglowekDate(nag: Record<string, unknown>, which: 'from' | 'to'): string {
  const directFrom = nag.DataOd;
  const directTo = nag.DataDo;
  const okres = nag.Okres && typeof nag.Okres === 'object' ? (nag.Okres as Record<string, unknown>) : undefined;

  const from =
    directFrom ??
    okres?.DataOd ??
    okres?.OkresOd ??
    okres?.PoczatekOkresu ??
    okres?.Od;
  const to =
    directTo ??
    okres?.DataDo ??
    okres?.OkresDo ??
    okres?.KoniecOkresu ??
    okres?.Do;

  const raw = which === 'from' ? from : to;
  return raw != null ? String(raw).slice(0, 10) : '';
}

function parseIssuerPodmiot(podmiot1: unknown): { nip: string; name: string } {
  if (!podmiot1 || typeof podmiot1 !== 'object') {
    return { nip: '', name: '' };
  }
  const p = podmiot1 as Record<string, unknown>;
  const id =
    p.IdentyfikatorPodmiotu && typeof p.IdentyfikatorPodmiotu === 'object'
      ? (p.IdentyfikatorPodmiotu as Record<string, unknown>)
      : p;

  const nip =
    id.NIP != null && String(id.NIP).trim() !== ''
      ? String(id.NIP).replace(/\s+/g, '')
      : '';
  const name =
    id.PelnaNazwa != null && String(id.PelnaNazwa).trim() !== ''
      ? String(id.PelnaNazwa).trim()
      : String(id.Nazwa ?? '').trim();

  return { nip, name };
}

// ============================================================================
// Kwoty (jak w FA, z obsługą P_13_6 vs P_13_6_*)
// ============================================================================

function summarizeTotalsFromJpkFaktura(fa: Record<string, unknown>): {
  grossTotal?: number;
  netTotal?: number;
  vatTotal?: number;
} {
  const grossTotal = optionalNum(fa.P_15);

  let netTotal = 0;
  let hasNetKey = false;

  for (const k of FA_NET_KEYS_BASE) {
    if (fa[k] != null && String(fa[k]).trim() !== '') {
      hasNetKey = true;
      netTotal += parseNum(fa[k]);
    }
  }

  const p13_6 = optionalNum(fa.P_13_6);
  let splitSum = 0;
  let hasSplit = false;
  for (const k of P_13_6_SPLIT) {
    if (fa[k] != null && String(fa[k]).trim() !== '') {
      hasSplit = true;
      splitSum += parseNum(fa[k]);
    }
  }

  if (p13_6 !== undefined) {
    hasNetKey = true;
    netTotal += p13_6;
  } else if (hasSplit) {
    hasNetKey = true;
    netTotal += splitSum;
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
  return { netTotal, vatTotal: 0 };
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
          'Brak lub niekompletne sum P_13_*/P_14_* w JPK — przyjęto sumę netto z pozycji',
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
      `Możliwa niezgodność kwot: netto+VAT=${calcGross.toFixed(2)} vs brutto(P_15)=${grossTotal.toFixed(2)}`,
    );
  }

  return { netTotal: roundCents(netTotal), vatTotal: roundCents(vatTotal), grossTotal };
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

function normalizeVatRate(raw: unknown): string {
  if (raw === undefined || raw === null) return '23';
  const str = String(raw).trim().toLowerCase();

  if (str === '0.23' || str === '23.00' || str === '23') return '23';
  if (str === '0.08' || str === '8.00' || str === '8') return '8';
  if (str === '0.05' || str === '5.00' || str === '5') return '5';
  if (str === '0.00' || str === '0') return '0';
  if (str === 'zw' || str === 'zwolnione') return 'zw';
  if (str === 'oo' || str === 'odwrotne') return 'oo';
  if (str === 'np' || str === 'nie podlega') return 'np';

  return str;
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
