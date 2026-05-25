// lib/exports/jpk-v7m-generator.ts
// Generator JPK_V7M — Jednolity Plik Kontrolny: ewidencja VAT + deklaracja.
//
// JPK_V7M łączy ewidencję sprzedaży/zakupów z częścią deklaracyjną (VAT-7).
// Składany miesięcznie do urzędu skarbowego.
//
// ⚠️ WERYFIKACJA SCHEMATU: namespace i wersja schemy MF zmieniają się
// okresowo. Przed realnym złożeniem księgowa/użytkownik MUSI sprawdzić
// aktualny wzór JPK_V7M na stronie MF i — jeśli trzeba — zaktualizować
// `JPK_V7M_NAMESPACE` poniżej. Generator produkuje strukturę zgodną z
// wariantem 2 (obowiązuje od 2021/2022).

import { create } from 'xmlbuilder2';
import type { JpkInvoice } from './jpk-fa-generator';

const JPK_V7M_NAMESPACE = 'http://crd.gov.pl/wzor/2021/12/27/11148/';
const ETD_NAMESPACE =
  'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/';

export interface JpkV7mInputData {
  issuer: {
    nip: string;
    name: string;
    email?: string;
  };
  /** Okres — z period wyciągamy rok i miesiąc. */
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  issuedInvoices: JpkInvoice[];
  receivedInvoices?: JpkInvoice[];
  /** Kod urzędu skarbowego (4 cyfry). Bez tego pliku nie da się złożyć. */
  kodUrzedu?: string;
  /** 1 = złożenie, 2 = korekta. */
  goal?: '1' | '2';
  systemName?: string;
}

/** Sumy netto/VAT pogrupowane wg stawki. */
interface RateBucket {
  net23: number;
  vat23: number;
  net8: number;
  vat8: number;
  net5: number;
  vat5: number;
  net0: number;
  netZw: number;
}

function emptyBucket(): RateBucket {
  return {
    net23: 0,
    vat23: 0,
    net8: 0,
    vat8: 0,
    net5: 0,
    vat5: 0,
    net0: 0,
    netZw: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return round2(n).toFixed(2);
}

/** Agreguje pozycje faktur sprzedaży wg stawek VAT. */
function aggregateSales(invoices: JpkInvoice[]): RateBucket {
  const b = emptyBucket();
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const vatAmount = round2(
        line.vatRate === '23'
          ? line.netAmount * 0.23
          : line.vatRate === '8'
            ? line.netAmount * 0.08
            : line.vatRate === '5'
              ? line.netAmount * 0.05
              : 0,
      );
      switch (line.vatRate) {
        case '23':
          b.net23 += line.netAmount;
          b.vat23 += vatAmount;
          break;
        case '8':
          b.net8 += line.netAmount;
          b.vat8 += vatAmount;
          break;
        case '5':
          b.net5 += line.netAmount;
          b.vat5 += vatAmount;
          break;
        case '0':
          b.net0 += line.netAmount;
          break;
        case 'zw':
          b.netZw += line.netAmount;
          break;
        default:
          // oo / np — pomijamy w podstawowej ewidencji krajowej
          break;
      }
    }
  }
  return b;
}

/**
 * Generuje XML JPK_V7M. Część deklaracyjna jest uproszczona do pól
 * podstawowych (sprzedaż krajowa wg stawek + zakupy krajowe) — pełne
 * pola specjalne (WDT, eksport, import usług, korekty) wymagają
 * rozszerzenia w przyszłej iteracji.
 */
export function generateJpkV7m(data: JpkV7mInputData): string {
  const issued = data.issuedInvoices;
  const received = data.receivedInvoices ?? [];
  const sales = aggregateSales(issued);

  const vatNalezny = round2(sales.vat23 + sales.vat8 + sales.vat5);

  // Zakupy: VAT naliczony do odliczenia — suma vatTotal faktur kosztowych.
  const purchaseNet = round2(
    received.reduce((s, inv) => s + inv.netTotal, 0),
  );
  const vatNaliczony = round2(
    received.reduce((s, inv) => s + inv.vatTotal, 0),
  );

  const balance = round2(vatNalezny - vatNaliczony);

  const year = data.periodStart.slice(0, 4);
  const month = String(Number(data.periodStart.slice(5, 7)));

  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('JPK', {
    xmlns: JPK_V7M_NAMESPACE,
    'xmlns:etd': ETD_NAMESPACE,
  });

  // ── Nagłówek ──────────────────────────────────────────────
  const header = root.ele('Naglowek');
  header
    .ele('KodFormularza', {
      kodSystemowy: 'JPK_V7M (2)',
      wersjaSchemy: '1-0E',
    })
    .txt('JPK_VAT')
    .up();
  header.ele('WariantFormularza').txt('2').up();
  header.ele('DataWytworzeniaJPK').txt(new Date().toISOString()).up();
  header.ele('NazwaSystemu').txt(data.systemName ?? 'FaktFlow').up();
  header.ele('CelZlozenia', { poz: 'P_7' }).txt(data.goal ?? '1').up();
  header.ele('KodUrzedu').txt(data.kodUrzedu ?? '0000').up();
  header.ele('Rok').txt(year).up();
  header.ele('Miesiac').txt(month).up();

  // ── Podmiot1 ──────────────────────────────────────────────
  const podmiot = root.ele('Podmiot1', { rola: 'Podatnik' });
  const osoba = podmiot.ele('OsobaNiefizyczna');
  osoba.ele('NIP').txt(data.issuer.nip).up();
  osoba.ele('PelnaNazwa').txt(data.issuer.name).up();
  if (data.issuer.email) {
    osoba.ele('Email').txt(data.issuer.email).up();
  }

  // ── Deklaracja ────────────────────────────────────────────
  const dekl = root.ele('Deklaracja');
  const dHeader = dekl.ele('Naglowek');
  dHeader
    .ele('KodFormularzaDekl', {
      kodSystemowy: 'VAT-7 (22)',
      kodPodatku: 'VAT',
      rodzajZobowiazania: 'Z',
      wersjaSchemy: '1-0E',
    })
    .txt('VAT-7')
    .up();
  dHeader.ele('WariantFormularzaDekl').txt('22').up();

  const poz = dekl.ele('PozycjeSzczegolowe');
  // Podstawa opodatkowania + podatek należny wg stawek.
  poz.ele('P_15').txt(money(sales.net5)).up();
  poz.ele('P_16').txt(money(sales.vat5)).up();
  poz.ele('P_17').txt(money(sales.net8)).up();
  poz.ele('P_18').txt(money(sales.vat8)).up();
  poz.ele('P_19').txt(money(sales.net23)).up();
  poz.ele('P_20').txt(money(sales.vat23)).up();
  poz.ele('P_38').txt(money(vatNalezny)).up();
  // Nabycia + podatek naliczony.
  poz.ele('P_42').txt(money(0)).up(); // środki trwałe — pominięte w MVP
  poz.ele('P_43').txt(money(0)).up();
  poz.ele('P_44').txt(money(purchaseNet)).up();
  poz.ele('P_45').txt(money(vatNaliczony)).up();
  poz.ele('P_48').txt(money(vatNaliczony)).up();
  // Rozliczenie.
  if (balance >= 0) {
    poz.ele('P_51').txt(money(balance)).up(); // kwota do zapłaty
  } else {
    poz.ele('P_53').txt(money(Math.abs(balance))).up(); // nadwyżka do przeniesienia
  }
  dekl.ele('Pouczenia').txt('1').up();

  // ── Ewidencja ─────────────────────────────────────────────
  const ewid = root.ele('Ewidencja');

  issued.forEach((inv, idx) => {
    const s = ewid.ele('SprzedazWiersz');
    s.ele('LpSprzedazy').txt(String(idx + 1)).up();
    s.ele('NrKontrahenta').txt(inv.buyerNip ?? 'BRAK').up();
    s.ele('NazwaKontrahenta').txt(inv.buyerName).up();
    s.ele('DowodSprzedazy').txt(inv.invoiceNumber).up();
    s.ele('DataWystawienia').txt(inv.issueDate).up();
    s.ele('DataSprzedazy').txt(inv.saleDate ?? inv.issueDate).up();
    const b = aggregateSales([inv]);
    if (b.net23 || b.vat23) {
      s.ele('K_19').txt(money(b.net23)).up();
      s.ele('K_20').txt(money(b.vat23)).up();
    }
    if (b.net8 || b.vat8) {
      s.ele('K_17').txt(money(b.net8)).up();
      s.ele('K_18').txt(money(b.vat8)).up();
    }
    if (b.net5 || b.vat5) {
      s.ele('K_15').txt(money(b.net5)).up();
      s.ele('K_16').txt(money(b.vat5)).up();
    }
  });

  ewid
    .ele('SprzedazCtrl')
    .ele('LiczbaWierszySprzedazy')
    .txt(String(issued.length))
    .up()
    .ele('PodatekNalezny')
    .txt(money(vatNalezny))
    .up();

  received.forEach((inv, idx) => {
    const z = ewid.ele('ZakupWiersz');
    z.ele('LpZakupu').txt(String(idx + 1)).up();
    z.ele('NrDostawcy').txt(inv.buyerNip ?? 'BRAK').up();
    z.ele('NazwaDostawcy').txt(inv.buyerName).up();
    z.ele('DowodZakupu').txt(inv.invoiceNumber).up();
    z.ele('DataZakupu').txt(inv.issueDate).up();
    z.ele('K_42').txt(money(inv.netTotal)).up();
    z.ele('K_43').txt(money(inv.vatTotal)).up();
  });

  ewid
    .ele('ZakupCtrl')
    .ele('LiczbaWierszyZakupow')
    .txt(String(received.length))
    .up()
    .ele('PodatekNaliczony')
    .txt(money(vatNaliczony))
    .up();

  return root.end({ prettyPrint: true });
}
