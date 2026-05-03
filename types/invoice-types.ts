// types/invoice-types.ts
// Typy domenowe dla różnych rodzajów faktur

import type { Database } from './database';

// ============================================================================
// Aliasy bazowe z DB
// ============================================================================

export type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];

export type InvoiceType = 'regular' | 'correction' | 'advance' | 'final';
export type CorrectionType = 'before_after' | 'amount_change' | 'cancellation';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';
export type BuyerIdType = 'nip' | 'pesel' | 'id_card' | 'passport' | 'no_id';

// ============================================================================
// Pola wspólne dla wszystkich faktur
// ============================================================================

export interface InvoiceCommonFields {
  internalNumber: string;
  issueDate: string; // ISO YYYY-MM-DD
  paymentMethod: 'transfer' | 'card' | 'cash' | 'compensation' | 'other';
  paymentDueDate: string;
  bankAccount?: string;
  notes?: string;
}

// ============================================================================
// Sprzedawca (dane tenanta - auto-fill z DB)
// ============================================================================

export interface SellerData {
  nip: string;
  name: string;
  address: {
    addressLine1: string;
    addressLine2: string;
    countryCode: string; // 'PL'
  };
  email?: string;
}

// ============================================================================
// Nabywca - może być B2B lub B2C
// ============================================================================

export interface BuyerB2B {
  type: 'b2b';
  idType: 'nip';
  nip: string;
  name: string;
  address: {
    addressLine1: string;
    addressLine2: string;
    countryCode: string;
  };
  email?: string;
}

export interface BuyerB2C {
  type: 'b2c';
  idType: 'pesel' | 'id_card' | 'passport' | 'no_id';

  // Identyfikator (jeden z poniższych w zależności od idType)
  pesel?: string;
  idNumber?: string; // dowód lub paszport

  name: string; // imię i nazwisko (lub "Konsument" dla no_id)
  address: {
    addressLine1: string;
    addressLine2: string;
    countryCode: string;
  };
  email?: string;
}

export type BuyerData = BuyerB2B | BuyerB2C;

// ============================================================================
// Pozycja faktury
// ============================================================================

export interface InvoiceLine {
  name: string;
  unit: string; // 'szt.', 'godz.', 'kg', 'mb'
  quantity: number;
  unitPriceNet: number;
  vatRate: '23' | '8' | '5' | '0' | 'zw' | 'oo' | 'np';
  pkwiuCode?: string;
  gtuCode?: string;
}

// ============================================================================
// FAKTURA ZWYKŁA (regular)
// ============================================================================

export interface RegularInvoiceData extends InvoiceCommonFields {
  invoiceType: 'regular';
  seller: SellerData;
  buyer: BuyerData;
  lines: InvoiceLine[];
}

// ============================================================================
// FAKTURA KORYGUJĄCA (correction)
// ============================================================================

export interface CorrectionInvoiceData extends InvoiceCommonFields {
  invoiceType: 'correction';
  parentInvoiceId: string; // UUID faktury pierwotnej
  parentInvoiceNumber: string; // wewnętrzny numer faktury pierwotnej (do wyświetlania)
  /** Data wystawienia faktury pierwotnej (`Fa`, `DataWystFaKorygowanej`). */
  parentInvoiceIssueDate?: string;
  parentKsefNumber?: string; // numer KSeF faktury pierwotnej (jeśli zaakceptowana)

  correctionType: CorrectionType;
  correctionReason: string; // wymagane! np. "Błąd w nazwie nabywcy", "Zwrot towaru"

  seller: SellerData;
  buyer: BuyerData;

  // Korekty typu before_after
  linesBefore?: InvoiceLine[]; // pozycje z faktury pierwotnej
  linesAfter?: InvoiceLine[]; // pozycje po korekcie

  // Korekty typu amount_change (zwroty/rabaty)
  amountChange?: {
    netDelta: number; // może być ujemne (zwrot)
    vatDelta: number;
    grossDelta: number;
    description: string;
  };
}

// ============================================================================
// FAKTURA ZALICZKOWA (advance)
// ============================================================================

export interface AdvanceInvoiceData extends InvoiceCommonFields {
  invoiceType: 'advance';
  seller: SellerData;
  buyer: BuyerData;

  // Zaliczka jest na konkretną przyszłą dostawę/usługę
  advanceAmount: number; // kwota zaliczki (brutto)
  totalContractAmount: number; // łączna wartość umowy (brutto)
  expectedDeliveryDate?: string; // przewidywana data realizacji

  // Stawka VAT zaliczki (zwykle ta sama co finalnej)
  vatRate: '23' | '8' | '5' | '0';

  description: string; // czego dotyczy (np. "Zaliczka na wykonanie projektu strony WWW")
}

// ============================================================================
// FAKTURA ROZLICZAJĄCA / FINALNA (final)
// ============================================================================

export interface FinalInvoiceData extends InvoiceCommonFields {
  invoiceType: 'final';
  seller: SellerData;
  buyer: BuyerData;

  // Zaliczki które rozliczamy
  advanceInvoiceIds: string[]; // UUIDs faktur zaliczkowych
  totalAdvances: number; // suma zaliczek (do auto-policzenia)

  // Pozycje finalne (cała usługa/dostawa)
  lines: InvoiceLine[];

  // Do zapłaty = grossTotal(lines) - totalAdvances
}

// ============================================================================
// Union type dla formularza
// ============================================================================

export type InvoiceFormData =
  | RegularInvoiceData
  | CorrectionInvoiceData
  | AdvanceInvoiceData
  | FinalInvoiceData;

// ============================================================================
// Helpers - type guards
// ============================================================================

export function isRegularInvoice(data: InvoiceFormData): data is RegularInvoiceData {
  return data.invoiceType === 'regular';
}

export function isCorrectionInvoice(data: InvoiceFormData): data is CorrectionInvoiceData {
  return data.invoiceType === 'correction';
}

export function isAdvanceInvoice(data: InvoiceFormData): data is AdvanceInvoiceData {
  return data.invoiceType === 'advance';
}

export function isFinalInvoice(data: InvoiceFormData): data is FinalInvoiceData {
  return data.invoiceType === 'final';
}

export function isB2C(buyer: BuyerData): buyer is BuyerB2C {
  return buyer.type === 'b2c';
}

// ============================================================================
// UI labels (po polsku)
// ============================================================================

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  regular: 'Faktura zwykła',
  correction: 'Faktura korygująca',
  advance: 'Faktura zaliczkowa',
  final: 'Faktura rozliczająca',
};

export const CORRECTION_TYPE_LABELS: Record<CorrectionType, string> = {
  before_after: 'Korekta danych (było → jest)',
  amount_change: 'Korekta kwotowa (zwrot/rabat)',
  cancellation: 'Anulowanie faktury',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Niezapłacona',
  partial: 'Częściowo zapłacona',
  paid: 'Zapłacona',
  overdue: 'Przeterminowana',
};

export const BUYER_ID_TYPE_LABELS: Record<BuyerIdType, string> = {
  nip: 'NIP (firma)',
  pesel: 'PESEL',
  id_card: 'Dowód osobisty',
  passport: 'Paszport',
  no_id: 'Bez identyfikatora (konsument)',
};
