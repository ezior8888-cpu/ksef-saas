/**
 * Model domenowy faktury FA(3) dla MVP (MŚP / JDG).
 *
 * UWAGA: to jest model UPROSZCZONY - wspiera najczęstsze scenariusze:
 * - faktura krajowa B2B
 * - sprzedaż towarów/usług z VAT 23/8/5/0/zw/oo
 * - zapłata przelewem / gotówką
 * - jedna waluta (PLN)
 *
 * Scenariusze pominięte w MVP (dodamy później):
 * - faktury eksportowe (WDT, WSTO)
 * - procedura marży
 * - samofakturowanie
 * - faktury VAT RR (rolnicze)
 * - załączniki
 * - korekty wielokrotne
 */

// ═══════════════════════════════════════════════════════════════
// Adresy i kontakty
// ═══════════════════════════════════════════════════════════════

export interface Address {
  /** Kod kraju ISO (PL dla Polski) */
  countryCode: 'PL' | string;
  /** Adres w jednej linii (ulica, numer domu, numer lokalu) */
  addressLine1: string;
  /** Druga linia adresu - kod pocztowy i miejscowość */
  addressLine2: string;
  /** Kod GLN lub numer budynku (opcjonalnie) */
  gln?: string;
}

// ═══════════════════════════════════════════════════════════════
// Podmioty (sprzedawca, nabywca)
// ═══════════════════════════════════════════════════════════════

export interface SellerParty {
  nip: string; // 10 cyfr, obowiązkowo
  name: string; // nazwa firmy
  address: Address;
  email?: string;
  phone?: string;
}

export interface BuyerParty {
  /** NIP dla VAT-owców polskich (10 cyfr).
   *  Dla zagranicznych: pole vatUeNumber.
   *  Dla osób fizycznych: noIdMarker=1 + name z imieniem i nazwiskiem. */
  nip?: string;
  /** VAT UE (kraj + numer, np. DE123456789) dla kontrahentów zagranicznych */
  vatUeNumber?: string;
  /** Marker dla nabywcy bez identyfikatora podatkowego (B2C, pracownik) */
  noIdMarker?: boolean;
  name: string;
  address: Address;
  email?: string;
  /** Znacznik Jednostki Samorządu Terytorialnego (1 = JST, 2 = nie dotyczy).
   *  Obligatoryjne w FA(3). Domyślnie 2 w generatorze. */
  jst?: 1 | 2;
  /** Znacznik Grupy VAT (1 = członek Grupy VAT, 2 = nie dotyczy).
   *  Obligatoryjne w FA(3). Domyślnie 2 w generatorze. */
  gv?: 1 | 2;
}

// ═══════════════════════════════════════════════════════════════
// Pozycja faktury
// ═══════════════════════════════════════════════════════════════

export type VatRate =
  | '23' // podstawowa
  | '8' // obniżona
  | '5' // obniżona
  | '0' // zerowa (generator zmapuje na '0 KR' / '0 WDT' / '0 EX' wg kontekstu; MVP: '0 KR')
  | 'zw' // zwolniona z VAT (wymaga P_19 z podstawą prawną zamiast P_19N)
  | 'oo' // odwrotne obciążenie (wymaga P_18=1)
  | 'np'; // nie podlega opodatkowaniu (XSD: 'np I' / 'np II' - generator zmapuje)

export interface InvoiceLineItem {
  /** Kolejny numer porządkowy pozycji (1, 2, 3...) */
  ordinal: number;
  /** Nazwa towaru/usługi (max 512 znaków w FA(3) - zmiana z FA(2) 256) */
  name: string;
  /** Kod CN (towary), PKWiU (usługi) albo GTIN - opcjonalne */
  classificationCode?: string;
  /** Jednostka miary (szt, kg, godz, usł, mies., itd.) */
  unit: string;
  /** Ilość - do 4 miejsc po przecinku */
  quantity: number;
  /** Cena jednostkowa netto - do 4 miejsc po przecinku */
  unitPriceNet: number;
  /** Wartość netto pozycji (= quantity * unitPriceNet, zaokrąglone do 2 miejsc) */
  netAmount: number;
  /** Stawka VAT */
  vatRate: VatRate;
  /** Kwota VAT (= netAmount * rate / 100 dla stawek liczbowych; 0 dla zw/oo/np) */
  vatAmount: number;
  /** Wartość brutto pozycji */
  grossAmount: number;
}

// ═══════════════════════════════════════════════════════════════
// Płatność
// ═══════════════════════════════════════════════════════════════

export type PaymentMethod =
  | 'transfer' // przelew
  | 'cash' // gotówka
  | 'card' // karta
  | 'other';

export interface PaymentInfo {
  /** Kwota do zapłaty (P_15 = suma brutto wszystkich pozycji) */
  amountDue: number;
  /** Waluta (MVP: tylko PLN) */
  currency: 'PLN';
  /** Termin płatności (data) */
  dueDate: string; // ISO YYYY-MM-DD
  /** Metoda płatności */
  method: PaymentMethod;
  /** Numer rachunku (IBAN) - dla przelewu */
  bankAccount?: string;
  /** Nazwa banku - opcjonalnie */
  bankName?: string;
}

// ═══════════════════════════════════════════════════════════════
// Faktura - pełny model
// ═══════════════════════════════════════════════════════════════

export type InvoiceType =
  | 'VAT' // faktura podstawowa
  | 'KOR' // korygująca
  | 'ZAL' // zaliczkowa
  | 'ROZ'; // rozliczeniowa

export interface Invoice {
  /** Wewnętrzny numer faktury (np. FV 2026/04/001) */
  internalNumber: string;
  /** Typ faktury */
  type: InvoiceType;
  /** Data wystawienia (ISO YYYY-MM-DD) - P_1 */
  issueDate: string;
  /** Data sprzedaży/dostawy towaru (jeśli != issueDate) - P_6 */
  saleDate?: string;

  seller: SellerParty;
  buyer: BuyerParty;

  /** Pozycje faktury */
  lines: InvoiceLineItem[];

  /** Suma netto wszystkich pozycji */
  netTotal: number;
  /** Suma VAT ze wszystkich pozycji */
  vatTotal: number;
  /** Suma brutto = netTotal + vatTotal */
  grossTotal: number;

  payment: PaymentInfo;

  /** Uwagi dodatkowe - pole Stopka */
  notes?: string;
}
