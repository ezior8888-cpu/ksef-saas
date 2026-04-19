/**
 * Typy dla KSeF API 2.0 (wersja 2.2.1)
 * Dokumentacja: https://api-test.ksef.mf.gov.pl/docs/v2/
 *
 * Definiujemy TYLKO endpointy, których realnie używamy w MVP.
 * Gdy potrzebujesz nowego - dopisz go tutaj zamiast generować cały OpenAPI.
 */

// ═══════════════════════════════════════════════════════════════
// WSPÓLNE
// ═══════════════════════════════════════════════════════════════

export type KsefEnvironment = 'test' | 'demo' | 'production';

export interface KsefErrorResponse {
  exception: {
    serviceCtx: string;
    serviceCode: string;
    serviceName: string;
  };
  exceptionDetailList: Array<{
    exceptionCode: number;
    exceptionDescription: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// AUTENTYKACJA: POST /auth/challenge
// ═══════════════════════════════════════════════════════════════

export interface AuthChallengeResponse {
  /** Wyzwanie do podpisania - unikalny string */
  challenge: string;
  /** Timestamp wygenerowania challenge (ISO 8601) */
  timestamp: string;
  /** Timestamp w milisekundach od 1970-01-01 */
  timestampMs: number;
  /** IP klienta widziane przez KSeF (użyj do AuthorizationPolicy) */
  clientIp: string;
}

// ═══════════════════════════════════════════════════════════════
// AUTENTYKACJA: POST /auth/xades-signature
// Wysyłka podpisanego XML-a uwierzytelniającego
// ═══════════════════════════════════════════════════════════════

export interface AuthTokenResponse {
  /** Numer referencyjny żądania uwierzytelniania (do sprawdzania statusu) */
  referenceNumber: string;
  /** Tymczasowy token do pobrania accessToken */
  authenticationToken: {
    token: string;
    validUntil: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// AUTENTYKACJA: POST /auth/token/redeem
// Wymiana authenticationToken na accessToken
// ═══════════════════════════════════════════════════════════════

export interface AccessTokenResponse {
  accessToken: {
    token: string;
    validUntil: string;
  };
  refreshToken: {
    token: string;
    validUntil: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// AUTENTYKACJA: GET /auth/{referenceNumber}
// Status żądania uwierzytelniania
// ═══════════════════════════════════════════════════════════════

export interface AuthStatusResponse {
  authenticationToken: {
    token: string;
    validUntil: string;
  };
  status: {
    code: number;
    description: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// SESJE: POST /sessions/online
// Otwarcie sesji interaktywnej
// ═══════════════════════════════════════════════════════════════

export interface OpenOnlineSessionRequest {
  formCode: {
    systemCode: 'FA (3)';
    schemaVersion: '1-0E';
    value: 'FA';
  };
  encryption: {
    encryptedSymmetricKey: string; // Base64: klucz AES zaszyfrowany RSA-OAEP
    initializationVector: string; // Base64
  };
}

export interface OpenOnlineSessionResponse {
  /** Numer referencyjny sesji - używamy w kolejnych wywołaniach */
  referenceNumber: string;
}

// ═══════════════════════════════════════════════════════════════
// SESJE: POST /sessions/online/{referenceNumber}/invoices
// Wysłanie faktury
// ═══════════════════════════════════════════════════════════════

/**
 * Payload dla POST /sessions/online/{ref}/invoices w KSeF 2.0.
 * Źródło schemy: https://github.com/CIRFMF/ksef-docs/blob/main/sesja-interaktywna.md
 *
 * KSeF wymaga hash + size dla BYTES dwóch wariantów dokumentu:
 *   (a) oryginalny XML (niezaszyfrowany UTF-8) - do weryfikacji po dekryptacji
 *   (b) zaszyfrowane body (raw bytes PRZED Base64) - do weryfikacji transportu
 *
 * `encryptedInvoiceContent` to base64 szyfrogramu AES-256-CBC (bez IV w prefixie -
 * IV jest przekazywany osobno przy otwarciu sesji).
 */
export interface SendInvoiceRequest {
  /** SHA-256 hash oryginalnego XML (niezaszyfrowanego), Base64. */
  invoiceHash: string;
  /** Rozmiar oryginalnego XML w bajtach UTF-8. */
  invoiceSize: number;
  /** SHA-256 hash zaszyfrowanego body (bytes przed Base64), Base64. */
  encryptedInvoiceHash: string;
  /** Rozmiar zaszyfrowanego body w bajtach (przed Base64). */
  encryptedInvoiceSize: number;
  /** Zaszyfrowana treść XML FA(3) (AES-256-CBC + PKCS#7), Base64. */
  encryptedInvoiceContent: string;
}

export interface SendInvoiceResponse {
  /** Numer referencyjny faktury w ramach sesji */
  referenceNumber: string;
}

// ═══════════════════════════════════════════════════════════════
// SESJE: GET /sessions/{referenceNumber}/invoices/{invoiceRef}
// Status wysyłki konkretnej faktury
// ═══════════════════════════════════════════════════════════════

export interface InvoiceStatusResponse {
  referenceNumber: string;
  /** Przypisany numer KSeF po akceptacji */
  ksefNumber?: string;
  invoiceHash: string;
  status: {
    code: number;
    description: string;
    details?: string[];
  };
  /** Data akceptacji faktury przez KSeF */
  acquisitionTimestamp?: string;
  /** URL do pobrania UPO (Urzędowego Poświadczenia Odbioru) */
  upoDownloadUrl?: string;
}

// Kody statusów faktury (patrz dokumentacja MF)
export const INVOICE_STATUS = {
  QUEUED: 150, // W trakcie przetwarzania
  ACCEPTED: 200, // Zaakceptowana
  REJECTED: 400, // Odrzucona
} as const;

// ═══════════════════════════════════════════════════════════════
// SESJE: POST /sessions/online/{referenceNumber}/close
// Zamknięcie sesji
// ═══════════════════════════════════════════════════════════════

// Zwraca 200 bez body w sukcesie

// ═══════════════════════════════════════════════════════════════
// CERTYFIKATY: GET /security/public-key-certificates
// Publiczne klucze MF (do szyfrowania)
// ═══════════════════════════════════════════════════════════════

/**
 * Użycie certyfikatu klucza publicznego MF.
 * Cert może mieć wiele usage (KSeF zwraca tablicę).
 */
export type PublicKeyCertificateUsage = 'KsefTokenEncryption' | 'SymmetricKeyEncryption';

export interface PublicKeyCertificate {
  /** Certyfikat X.509 w formacie DER, zakodowany Base64 (BEZ nagłówków PEM) */
  certificate: string;
  /** Lista zastosowań, do których można użyć certyfikatu */
  usage: PublicKeyCertificateUsage[];
  validFrom: string;
  validTo: string;
}

/** Odpowiedź z GET /security/public-key-certificates to tablica. */
export type PublicKeyCertificatesResponse = PublicKeyCertificate[];

// ═══════════════════════════════════════════════════════════════
// POBIERANIE FAKTUR: POST /invoices/query/metadata
// Wyszukanie otrzymanych faktur
// ═══════════════════════════════════════════════════════════════

/**
 * Kryterium filtrowania po dacie w query metadata.
 *
 * KSeF 2.0 akceptuje TYLKO dwa pola:
 *   - `Invoicing` - data wystawienia (`P_1` z FA(3))
 *   - `Issue`     - data wystawienia (alias `Invoicing`, API honoruje oba)
 *
 * UWAGA: KSeF 2.0 **nie** udostępnia filtru po dacie nadania/akceptacji
 * (`Acquisition`), mimo że to pole występuje w response (`acquisitionDate`).
 * Polling skrzynki musi używać `Invoicing` i akceptować opóźnienie między
 * wystawieniem a wpłynięciem (zwykle sekundy, w wyjątkach godziny).
 */
export type InvoiceQueryDateType = 'Invoicing' | 'Issue';

export interface QueryInvoicesRequest {
  /** `subject1` = sprzedawca, `subject2` = nabywca. */
  subjectType: 'subject1' | 'subject2';
  dateRange: {
    dateType: InvoiceQueryDateType;
    from: string;
    to: string;
  };
}

/**
 * Pojedynczy wiersz odpowiedzi `/invoices/query/metadata` (KSeF 2.0).
 *
 * Zweryfikowane przez bezpośrednie wywołanie API test-ksef (04/2026):
 *   - `seller` ma płaski `{ nip, name }` (zakładamy polski NIP sprzedawcy).
 *   - `buyer` ma `{ identifier: { type, value }, name }` (wspiera NIP/VatUe/Other).
 *   - `formCode` jest OBIEKTEM (w v1 był stringiem) - trzyma tryplet systemu FA(3).
 *   - `acquisitionDate` (nie `acquisitionTimestamp` z v1).
 *   - `grossAmount`/`netAmount`/`vatAmount` (nie `gross`).
 */
export interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  /** ISO 8601 z timezone, np. `2026-04-02T10:25:49.746565+00:00`. */
  invoicingDate: string;
  acquisitionDate: string;
  permanentStorageDate: string;
  invoicingMode: 'Online' | 'Offline' | 'Offline24';
  invoiceType: 'Vat' | 'VatCorrective' | 'VatSimplified' | string;
  seller: {
    nip: string;
    name: string;
  };
  buyer: {
    identifier: {
      type: 'Nip' | 'VatUe' | 'Other';
      value: string;
    };
    name: string;
  };
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  currency: string;
  invoiceHash: string;
  formCode: {
    systemCode: string;
    schemaVersion: string;
    value: string;
  };
  isSelfInvoicing: boolean;
  hasAttachment: boolean;
}

export interface QueryInvoicesResponse {
  invoices: InvoiceMetadata[];
  /** Token paginacji - przekaż w następnym request, jeśli niepusty. */
  continuationToken?: string;
  hasMore: boolean;
  /** `true` gdy API ucięło wynik przy pierwszym page'u (soft limit MF). */
  isTruncated?: boolean;
}
