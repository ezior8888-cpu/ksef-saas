/**
 * Dane oryginału przy nierozstrzygniętym duplikacie 440 (D-A4-1b-3, PR A —
 * plan „zero zgubionych faktur”). Runner zapisuje je na otwartym wpisie
 * próby ze znacznikiem 440 (`ksef_submissions.original_check`, 00144), zanim
 * zostawi fakturę w `KSEF_DUPLICATE_RECONCILE`. Klient i operator widzą, co
 * KSeF ma pod tym numerem: numer KSeF, datę, nabywcę, kwotę, program — na
 * tych danych klient podejmie decyzję („ta sama sprzedaż” / „inna”).
 *
 * CZYSTY moduł (importowany w komponencie): bez KSeF, bazy i Node.
 */

import type { OriginalInvoiceSummary } from './duplicate-verdict';

/** Dlaczego automat nie rozstrzygnął duplikatu — to samo słowo w danych, alarmie i runbooku. */
export const DUPLICATE_CHECK_REASONS = [
  /** Numer KSeF oryginału ma już inna faktura sprzedaży tej firmy w FaktFlow — anomalia, operator. */
  'known-number',
  /** KSeF odmówił pobrania oryginału (403 — token bez InvoiceRead, inne 4xx). */
  'download-refused',
  /** Pobranie oryginału chwilowo nieudane (5xx, 429, 401, 21164, 21165) — ponowienie. */
  'download-pending',
  /** Nie udało się odczytać naszego pliku z magazynu — ponowienie. */
  'storage-pending',
  /** Oryginał wygenerował FaktFlow, treść inna niż nasza. */
  'faktflow-original',
  /** Inny program, ta sama treść co nasza (poza nagłówkiem). */
  'same-content-other-program',
  /** Oryginał spoza FaktFlow, a historia nie ma naszego pliku do porównania. */
  'no-own-file',
  /** W archiwum jest już inny plik pod tym numerem KSeF — wymaga wyjaśnienia. */
  'archive-conflict',
] as const;

export type DuplicateCheckReason = (typeof DUPLICATE_CHECK_REASONS)[number];

export interface KsefDuplicateCheck {
  v: 1;
  /** Środowisko KSeF, w którym sprawdzono oryginał. */
  env: string;
  checkedAt: string;
  reason: DuplicateCheckReason;
  /** SHA-256 (hex) pobranych bajtów oryginału; `null`, gdy nie pobrano. */
  sha256: string | null;
  /** Klucz archiwum bajtów oryginału (`<firma>/ksef-import/<numer KSeF>.xml`). */
  archivePath: string | null;
  sizeBytes: number | null;
  summary: OriginalInvoiceSummary | null;
  /** Treść zgodna z naszą poza nagłówkiem; `null`, gdy nie było czego porównać. */
  sameContentExceptHeader: boolean | null;
  /** Sesja albo plik oryginału jest w historii tej faktury. */
  ownHistory: boolean | null;
  /** Data nadania numeru oryginałowi (metadane KSeF); `null`, gdy nieznana. */
  acquiredAt: string | null;
  /** Status HTTP odmowy pobrania. */
  httpStatus: number | null;
  /** Faktura sprzedaży w FaktFlow, która ma już ten numer KSeF (`known-number`). */
  knownInvoice: { id: string; internalNumber: string | null } | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

function parseSummary(v: unknown): OriginalInvoiceSummary | null {
  if (!isRecord(v)) return null;
  return {
    systemInfo: str(v.systemInfo),
    number: str(v.number),
    issueDate: str(v.issueDate),
    buyerNip: str(v.buyerNip),
    buyerName: str(v.buyerName),
    gross: str(v.gross),
    currency: str(v.currency),
  };
}

/** Odczyt `original_check` z bazy (jsonb) — `null` dla braku albo nieznanego kształtu. */
export function parseDuplicateCheck(value: unknown): KsefDuplicateCheck | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const reason = value.reason;
  if (typeof reason !== 'string' || !(DUPLICATE_CHECK_REASONS as readonly string[]).includes(reason)) return null;
  const known = isRecord(value.knownInvoice) && str(value.knownInvoice.id)
    ? { id: str(value.knownInvoice.id)!, internalNumber: str(value.knownInvoice.internalNumber) }
    : null;
  return {
    v: 1,
    env: str(value.env) ?? '',
    checkedAt: str(value.checkedAt) ?? '',
    reason: reason as DuplicateCheckReason,
    sha256: str(value.sha256),
    archivePath: str(value.archivePath),
    sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : null,
    summary: parseSummary(value.summary),
    sameContentExceptHeader: bool(value.sameContentExceptHeader),
    ownHistory: bool(value.ownHistory),
    acquiredAt: str(value.acquiredAt),
    httpStatus: typeof value.httpStatus === 'number' ? value.httpStatus : null,
    knownInvoice: known,
  };
}

export interface DuplicateOriginalView {
  /** Nagłówek panelu na karcie faktury. */
  title: string;
  /** Wiersze „etykieta — wartość” danych oryginału (tylko znane). */
  rows: ReadonlyArray<{ label: string; value: string }>;
  /** Co to znaczy i co robić (bez obietnic przycisku, którego jeszcze nie ma). */
  note: string;
}

/** Data `RRRR-MM-DD` z numeru KSeF (`NIP-RRRRMMDD-…`) — gdy KSeF nie podał daty nadania. */
function dateFromKsefNumber(ksefNumber: string): string | null {
  const m = /^\d{10}-(\d{4})(\d{2})(\d{2})-/.exec(ksefNumber);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const PROGRAM_FAKTFLOW = 'KSeF SaaS v1.0';

/**
 * Panel „W KSeF jest już faktura o tym numerze” dla klienta. Same fakty
 * z KSeF; decyzję („ta sama sprzedaż” / „inna”) dostanie przyciskiem
 * w kolejnym kroku (D-A4-1b-3, PR B/C).
 */
export function describeDuplicateOriginal(
  invoiceNumber: string | null,
  ksefNumber: string,
  check: KsefDuplicateCheck | null,
): DuplicateOriginalView {
  const s = check?.summary ?? null;
  const rows: Array<{ label: string; value: string }> = [{ label: 'Numer KSeF', value: ksefNumber }];
  const assigned = check?.acquiredAt?.slice(0, 10) ?? dateFromKsefNumber(ksefNumber);
  if (assigned) rows.push({ label: 'Numer nadany w KSeF', value: assigned });
  if (s?.number) rows.push({ label: 'Numer faktury', value: s.number });
  if (s?.issueDate) rows.push({ label: 'Data wystawienia', value: s.issueDate });
  const buyer = [s?.buyerName, s?.buyerNip ? `NIP ${s.buyerNip}` : null].filter(Boolean).join(', ');
  if (buyer) rows.push({ label: 'Nabywca', value: buyer });
  if (s?.gross) rows.push({ label: 'Kwota brutto', value: `${s.gross} ${s.currency ?? 'PLN'}` });
  if (s?.systemInfo) {
    rows.push({ label: 'Program', value: s.systemInfo === PROGRAM_FAKTFLOW ? 'FaktFlow' : s.systemInfo });
  }

  const doc = invoiceNumber ? `Faktura ${invoiceNumber}` : 'Ta faktura';
  let note: string;
  switch (check?.reason) {
    case 'download-refused':
      note = check.httpStatus === 403
        ? 'Nie mogliśmy pobrać treści tej faktury z KSeF — token KSeF nie ma uprawnienia do odczytu faktur (InvoiceRead). ' +
          'Nadaj je w Aplikacji Podatnika KSeF. Nie wystawiaj tej faktury ponownie.'
        : 'Nie mogliśmy pobrać treści tej faktury z KSeF. Nie wystawiaj tej faktury ponownie — zajmujemy się tym.';
      break;
    case 'download-pending':
    case 'storage-pending':
      note = 'Sprawdzamy w KSeF treść tej faktury — odśwież za kilka minut. Nie wystawiaj tej faktury ponownie.';
      break;
    default:
      note = `${doc} nie została przyjęta, bo KSeF ma już fakturę Twojej firmy o tym numerze (dane wyżej). ` +
        'Nie wystawiaj jej ponownie — zajmujemy się tym i poprosimy Cię o decyzję, czy to ta sama sprzedaż.';
  }
  return { title: 'W KSeF jest już faktura o tym numerze', rows, note };
}
