// lib/ksef/error-translator.ts
// Tłumaczy surowe błędy KSeF na zrozumiałe komunikaty po polsku

import { createAdminClient } from '@/lib/supabase/server';

// ============================================================================
// Typy
// ============================================================================

export interface RawKsefError {
  code?: string;
  message: string;
  xpath?: string;
  details?: Record<string, unknown>;
}

export interface TranslatedError {
  userMessage: string;
  fixSuggestion?: string;
  fieldHint?: string;
  severity: 'error' | 'warning' | 'info';
  technicalCode: string;
  rawXpath?: string;
}

type DbErrorTranslation = {
  id: string;
  error_code: string;
  error_xpath: string | null;
  user_message_pl: string;
  technical_description: string | null;
  field_hint: string | null;
  fix_suggestion: string | null;
  severity: string;
  occurrence_count: number | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

// ============================================================================
// Główna funkcja: tłumacz
// ============================================================================

export async function translateKsefError(error: RawKsefError): Promise<TranslatedError> {
  const exact = await lookupExactError(error.code);
  if (exact) {
    const xpathHasLine =
      typeof error.xpath === 'string' && /FaWiersz\[\d+\]/.test(error.xpath);
    if (xpathHasLine) {
      return enrichWithLineNumber(
        exact,
        error.xpath,
        error.code ?? exact.error_code ?? 'UNKNOWN'
      );
    }
    return {
      userMessage: exact.user_message_pl,
      fixSuggestion: exact.fix_suggestion ?? undefined,
      fieldHint: exact.field_hint ?? undefined,
      severity: coerceSeverity(exact.severity),
      technicalCode: error.code ?? exact.error_code ?? 'UNKNOWN',
      rawXpath: error.xpath,
    };
  }

  const xpathMatch = await lookupByXpathPattern(error.xpath);
  if (xpathMatch) {
    return enrichWithLineNumber(xpathMatch, error.xpath, 'XPATH_MATCH');
  }

  const keywordMatch = matchByKeywords(error.message);
  if (keywordMatch) {
    return keywordMatch;
  }

  return {
    userMessage: 'KSeF zwrócił błąd, którego nie potrafimy automatycznie wyjaśnić',
    fixSuggestion: `Skontaktuj się z supportem (kod: ${error.code ?? 'unknown'})`,
    severity: 'error',
    technicalCode: error.code ?? 'UNKNOWN',
    rawXpath: error.xpath,
  };
}

function coerceSeverity(s: string | null | undefined): 'error' | 'warning' | 'info' {
  if (s === 'warning' || s === 'info') return s;
  return 'error';
}

// ============================================================================
// Lookup: dokładne dopasowanie po error_code
// ============================================================================

async function lookupExactError(code?: string): Promise<DbErrorTranslation | null> {
  if (!code) return null;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('error_translations')
    .select('*')
    .eq('error_code', code)
    .maybeSingle();

  if (error || !data) return null;

  void bumpErrorTranslationOccurrence(data.id, data.occurrence_count);

  return data as DbErrorTranslation;
}

async function bumpErrorTranslationOccurrence(
  rowId: string,
  previousCount: number | null
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('error_translations')
    .update({
      occurrence_count: (previousCount ?? 0) + 1,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', rowId);
}

// ============================================================================
// Lookup: pattern XPath
// ============================================================================

async function lookupByXpathPattern(xpath?: string): Promise<DbErrorTranslation | null> {
  if (!xpath) return null;
  const supabase = createAdminClient();

  const segments = xpath.split('/').filter(Boolean);
  const rawLast = segments[segments.length - 1];
  const lastSegment = rawLast?.replace(/\[\d+\]/g, '') ?? '';
  if (!lastSegment) return null;

  const { data, error } = await supabase
    .from('error_translations')
    .select('*')
    .ilike('error_xpath', `%${lastSegment}%`)
    .maybeSingle();

  if (error) return null;
  return data as DbErrorTranslation | null;
}

// ============================================================================
// Wzbogać tłumaczenie o numer pozycji
// ============================================================================

function enrichWithLineNumber(
  translation: DbErrorTranslation,
  xpath: string | undefined,
  technicalCode: string
): TranslatedError {
  const lineMatch = xpath?.match(/FaWiersz\[(\d+)\]/);
  const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : null;

  let message = translation.user_message_pl;
  let fieldHint = translation.field_hint ?? undefined;

  if (lineNumber !== null) {
    if (message.includes('{N}')) {
      message = message.split('{N}').join(String(lineNumber));
    } else {
      message = `Pozycja ${lineNumber}: ${message.toLowerCase()}`;
    }

    if (fieldHint && !fieldHint.startsWith('lines.')) {
      const fieldName = fieldHint;
      fieldHint = `lines.${lineNumber - 1}.${fieldName}`;
    }
  }

  return {
    userMessage: message,
    fixSuggestion: translation.fix_suggestion ?? undefined,
    fieldHint,
    severity: coerceSeverity(translation.severity),
    technicalCode,
    rawXpath: xpath,
  };
}

// ============================================================================
// Match po słowach kluczowych
// ============================================================================

const KEYWORD_PATTERNS: Array<{
  patterns: RegExp[];
  translation: TranslatedError;
}> = [
  {
    patterns: [/timeout/i, /timed out/i, /etimedout/i],
    translation: {
      userMessage: 'KSeF nie odpowiada — timeout połączenia',
      fixSuggestion:
        'Spróbujemy ponownie automatycznie. Jeśli problem się powtarza, sprawdź status MF na https://ksef-test.mf.gov.pl',
      severity: 'warning',
      technicalCode: 'NETWORK_TIMEOUT',
      rawXpath: undefined,
    },
  },
  {
    patterns: [/unauthorized/i, /401/, /authentication/i],
    translation: {
      userMessage: 'Błąd uwierzytelnienia w KSeF',
      fixSuggestion: 'Sprawdź ustawienia certyfikatu w Settings → Ustawienia KSeF',
      severity: 'error',
      technicalCode: 'AUTH_FAILED',
      rawXpath: undefined,
    },
  },
  {
    patterns: [/rate limit/i, /429/, /too many requests/i],
    translation: {
      userMessage: 'Limit zapytań do KSeF przekroczony',
      fixSuggestion: 'Spróbujemy ponownie za chwilę',
      severity: 'warning',
      technicalCode: 'RATE_LIMIT',
      rawXpath: undefined,
    },
  },
  {
    patterns: [/internal server error/i, /500/, /503/, /502/, /504/],
    translation: {
      userMessage: 'Awaria po stronie KSeF',
      fixSuggestion:
        'Faktura zostanie wysłana automatycznie gdy serwer wstanie. Otrzymasz powiadomienie.',
      severity: 'warning',
      technicalCode: 'SERVER_ERROR',
      rawXpath: undefined,
    },
  },
  {
    patterns: [/invalid signature/i, /bad signature/i],
    translation: {
      userMessage: 'Niepoprawny podpis kryptograficzny',
      fixSuggestion:
        'Sprawdź czy klucz prywatny pasuje do certyfikatu (powinny być z tej samej generacji)',
      severity: 'error',
      technicalCode: 'INVALID_SIGNATURE',
      rawXpath: undefined,
    },
  },
  {
    patterns: [/certificate.*expired/i, /cert.*invalid/i],
    translation: {
      userMessage: 'Certyfikat KSeF wygasł lub jest niepoprawny',
      fixSuggestion:
        'Wygeneruj nowy certyfikat w Aplikacji Podatnika KSeF i wgraj go w Settings',
      severity: 'error',
      technicalCode: 'CERT_INVALID',
      rawXpath: undefined,
    },
  },
];

function matchByKeywords(message: string): TranslatedError | null {
  for (const { patterns, translation } of KEYWORD_PATTERNS) {
    if (patterns.some((p) => p.test(message))) {
      return { ...translation };
    }
  }
  return null;
}

// ============================================================================
// Zapis komunikatu na fakturze (`last_error` + kolumny z migracji 00016)
// ============================================================================

function formatLastErrorPayload(translated: TranslatedError): string {
  const lines = [`[${translated.technicalCode}] ${translated.userMessage}`];
  if (translated.fixSuggestion) lines.push(translated.fixSuggestion);
  if (translated.fieldHint) lines.push(`Pole UI: ${translated.fieldHint}`);
  if (translated.rawXpath) lines.push(`XPath: ${translated.rawXpath}`);
  return lines.join('\n\n');
}

export async function logTranslatedErrorToInvoice(
  invoiceId: string,
  rawError: RawKsefError
): Promise<TranslatedError> {
  const translated = await translateKsefError(rawError);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('invoices')
    .update({
      last_error: formatLastErrorPayload(translated),
      last_error_code: translated.technicalCode,
      last_error_field: translated.fieldHint ?? null,
      last_error_suggestion: translated.fixSuggestion ?? null,
    })
    .eq('id', invoiceId);

  if (error) {
    throw new Error(`logTranslatedErrorToInvoice: ${error.message}`);
  }

  return translated;
}
