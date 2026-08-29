/**
 * B-02 — format pod program księgowej (krok 42 planu).
 *
 * Księgowa pracuje w jakimś programie i to on decyduje, w czym ma przyjść
 * paczka. Klient zwykle nie wie, w czym ona pracuje — i to jest jedyne
 * pytanie, jakie agent musi tu zadać.
 *
 * DWA BEZPIECZNIKI, KTÓRE ROZWIĄZUJĄ TEN SAM PROBLEM Z DWÓCH STRON:
 *
 * 1. PIERWSZA PACZKA ZAWSZE ZAWIERA UNIWERSALNY CSV OBOK WYBRANEGO FORMATU.
 *    Klient zgaduje, w czym pracuje jego księgowa, i ma prawo zgadnąć źle.
 *    Jeżeli zgadł źle, a w paczce jest tylko jeden plik, to księgowa dzwoni
 *    do niego, on do nas, i mija tydzień. Z uniwersalnym CSV obok — ona
 *    otwiera drugi plik i pracuje dalej, a poprawka formatu jest już tylko
 *    porządkiem, nie awarią.
 *
 * 2. ZGŁOSZENIE NIEUDANEGO IMPORTU JEDNYM KLIKNIĘCIEM. Jeżeli mimo wszystko
 *    nie weszło, klient mówi to jednym przyciskiem w wątku, a nie mailem
 *    do wsparcia, którego nie napisze.
 *
 * WERSJA GENERATORA W NAZWIE PLIKU I W MANIFEŚCIE PACZKI — nie w samych
 * plikach. Dopisanie wiersza nagłówka do CSV-a pod Subiekta albo Symfonię
 * zepsułoby import, czyli zrobiłoby dokładnie to, przed czym ten mechanizm
 * ma chronić. Manifest jest osobnym plikiem, który czyta człowiek.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

const DAY_MS = 86_400_000;

/**
 * Wersja generatorów eksportu.
 *
 * PODNIEŚ przy każdej zmianie kształtu któregokolwiek pliku wyjściowego.
 * Bez tego zgłoszenie „nie zaimportowało się” jest nie do odtworzenia:
 * nie wiadomo, którą wersją plik powstał.
 */
export const GENERATOR_VERSION = '1.0';

export type AccountantFormat =
  | 'jpk_fa'
  | 'jpk_v7m'
  | 'kpir_excel'
  | 'comarch_optima'
  | 'insert_subiekt'
  | 'symfonia'
  | 'wapro'
  | 'csv_universal';

/** Format, który wchodzi do każdej pierwszej paczki obok wybranego. */
export const FALLBACK_FORMAT: AccountantFormat = 'csv_universal';

interface FormatDescriptor {
  label: string;
  /** Rozszerzenie pliku w paczce. */
  extension: string;
}

export const ACCOUNTANT_FORMATS: Record<AccountantFormat, FormatDescriptor> = {
  jpk_fa: { label: 'JPK_FA', extension: 'xml' },
  jpk_v7m: { label: 'JPK_V7M', extension: 'xml' },
  kpir_excel: { label: 'KPiR w Excelu', extension: 'xlsx' },
  comarch_optima: { label: 'Comarch Optima', extension: 'xml' },
  insert_subiekt: { label: 'Insert Subiekt', extension: 'csv' },
  symfonia: { label: 'Symfonia', extension: 'csv' },
  wapro: { label: 'WAPRO', extension: 'csv' },
  csv_universal: { label: 'uniwersalny CSV', extension: 'csv' },
};

export function isAccountantFormat(value: string): value is AccountantFormat {
  return value in ACCOUNTANT_FORMATS;
}

// ═══════════════════════════════════════════════════════════════
// Skład paczki
// ═══════════════════════════════════════════════════════════════

/**
 * Które formaty wchodzą do paczki.
 *
 * Pierwsza paczka: wybrany format PLUS uniwersalny CSV. Kolejne: sam wybrany,
 * bo skoro poprzednia weszła, to zapasowy plik jest już tylko zaśmiecaniem
 * skrzynki księgowej.
 */
export function packageFormats(input: {
  chosen: AccountantFormat;
  isFirstPackage: boolean;
}): AccountantFormat[] {
  if (!input.isFirstPackage) return [input.chosen];
  if (input.chosen === FALLBACK_FORMAT) return [FALLBACK_FORMAT];
  return [input.chosen, FALLBACK_FORMAT];
}

/**
 * Nazwa pliku z wersją generatora.
 *
 * Wersja w nazwie, a nie w treści: plik pod Subiekta z dopisanym wierszem
 * nagłówka nie zaimportuje się w ogóle.
 */
export function versionedFilename(input: {
  format: AccountantFormat;
  nip: string;
  periodKey: string;
  version?: string;
}): string {
  const version = (input.version ?? GENERATOR_VERSION).replace(/\./g, '-');
  const nip = input.nip.replace(/[^0-9]/g, '');
  const { extension } = ACCOUNTANT_FORMATS[input.format];

  return `${input.format}_${nip}_${input.periodKey}_v${version}.${extension}`;
}

/**
 * Manifest paczki — jedyne miejsce, w którym wersja stoi w treści.
 *
 * Czyta go człowiek: klient, księgowa albo my przy zgłoszeniu nieudanego
 * importu. Dlatego jest zwykłym tekstem, a nie kolejnym formatem do parsowania.
 */
export function buildPackageManifest(input: {
  periodKey: string;
  companyName: string;
  nip: string;
  formats: readonly AccountantFormat[];
  documentCount: number;
  generatedAt: Date;
  version?: string;
}): string {
  const version = input.version ?? GENERATOR_VERSION;
  const files = input.formats.map(
    (format) =>
      `  - ${ACCOUNTANT_FORMATS[format].label}: ${versionedFilename({
        format,
        nip: input.nip,
        periodKey: input.periodKey,
        version,
      })}`,
  );

  return [
    `Paczka księgowa — ${input.companyName} (NIP ${input.nip})`,
    `Okres: ${input.periodKey}`,
    `Dokumentów: ${input.documentCount}`,
    `Wygenerowano: ${input.generatedAt.toISOString().slice(0, 10)}`,
    `Wersja generatora: ${version}`,
    '',
    'Pliki w paczce:',
    ...files,
    '',
    'Jeżeli któryś plik nie zaimportował się do programu księgowego,',
    'zgłoś to jednym kliknięciem w aplikacji — podaj wersję generatora',
    'z tego pliku, wtedy odtworzymy dokładnie ten sam plik.',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Pytanie o format
// ═══════════════════════════════════════════════════════════════

/**
 * Pytanie zadawane PRZY PIERWSZEJ PACZCE, nie w ustawieniach.
 *
 * W ustawieniach nikt go nie znajdzie, a pytanie zadane w oderwaniu od
 * powodu („w czym pracuje Twoja księgowa?”, zanim jakakolwiek paczka
 * istnieje) brzmi jak formularz, a nie jak sensowne pytanie.
 */
export function buildFormatQuestion(input: {
  tenantId: string;
  periodKey: string;
  now?: Date;
}): CreateProposalInput {
  const now = input.now ?? new Date();

  return {
    tenantId: input.tenantId,
    kind: 'accountant.format',
    topicKey: 'accountant.format',
    title: 'W czym pracuje Twoja księgowa?',
    body:
      'Przygotuję paczkę w formacie jej programu. Jeżeli nie wiesz — wybierz ' +
      'uniwersalny CSV; wchodzi wszędzie. Do pierwszej paczki i tak dołożę go ' +
      'obok wybranego formatu, żeby jedna pomyłka nie kosztowała tygodnia.',
    fingerprint: fingerprintOf({ period: input.periodKey }),
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    priority: 25,
    payload: {
      periodKey: input.periodKey,
      options: Object.entries(ACCOUNTANT_FORMATS).map(([value, descriptor]) => ({
        value,
        label: descriptor.label,
      })),
      primaryLabel: 'Zapisz format',
    },
    evidence: [{ label: 'Ustawienia paczki dla księgowej', href: '/settings/accountant' }],
  };
}

/**
 * Zmiana formatu — proponowana Z KARTY DOMKNIĘCIA, nie z ustawień.
 *
 * Moment, w którym klient myśli o księgowej, to moment wysyłania jej paczki.
 * Ustawienia odwiedza raz w życiu, przy zakładaniu konta.
 */
export function formatChangeAction(current: AccountantFormat): {
  label: string;
  intent: 'correct';
} {
  return {
    label: `Księgowa pracuje w czymś innym niż ${ACCOUNTANT_FORMATS[current].label}`,
    intent: 'correct',
  };
}

// ═══════════════════════════════════════════════════════════════
// Nieudany import
// ═══════════════════════════════════════════════════════════════

export interface ImportFailureReport {
  format: AccountantFormat;
  version: string;
  periodKey: string;
  /** Co powiedziała księgowa; puste, jeżeli klient nic nie dopisał. */
  note: string;
}

/**
 * Zgłoszenie nieudanego importu — jedno kliknięcie w wątku.
 *
 * Zgłoszenie BEZ WERSJI GENERATORA jest bezużyteczne: za miesiąc nie
 * odtworzymy pliku, który nie wszedł. Dlatego wersja jest częścią zgłoszenia,
 * a nie czymś, o co dopytujemy później.
 */
export function buildImportFailureReport(input: {
  format: AccountantFormat;
  periodKey: string;
  note?: string;
  version?: string;
}): ImportFailureReport {
  return {
    format: input.format,
    version: input.version ?? GENERATOR_VERSION,
    periodKey: input.periodKey,
    note: input.note?.trim() ?? '',
  };
}

/** Akcja drugorzędna doklejana do karty doręczenia. */
export function importFailureAction(): { label: string; intent: 'correct' } {
  return { label: 'Nie zaimportowało się', intent: 'correct' };
}
