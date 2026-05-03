// VIES - VAT Information Exchange System (Komisja Europejska)
// SOAP API ale jest też REST wrapper: https://ec.europa.eu/taxation_customs/vies/rest-api/
// Używamy REST endpointu udostępnionego przez KE

const VIES_REST_API =
  'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{country}/vat/{vatNumber}';
const TIMEOUT_MS = 10_000;

export const EU_COUNTRY_CODES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'EL',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'XI', // Northern Ireland
] as const;

export type EuCountryCode = (typeof EU_COUNTRY_CODES)[number];

const EU_COUNTRY_SET = new Set<string>(EU_COUNTRY_CODES);

function isEuCountryCode(code: string): code is EuCountryCode {
  return EU_COUNTRY_SET.has(code);
}

export interface ViesResult {
  success: true;
  countryCode: string;
  vatNumber: string;
  isValid: boolean;
  legalName?: string;
  registeredAddress?: string;
  requestDate: string;
  rawResponse: unknown;
}

export interface ViesError {
  success: false;
  error: string;
  errorCode: 'INVALID_FORMAT' | 'API_ERROR' | 'TIMEOUT' | 'SERVICE_DOWN';
}

export type ViesResponse = ViesResult | ViesError;

// ============================================================================
// MAIN: lookup VAT number w VIES
// ============================================================================

export async function checkVatInVies(
  countryCode: string,
  vatNumber: string
): Promise<ViesResponse> {
  const country = countryCode.toUpperCase();

  if (!isEuCountryCode(country)) {
    return {
      success: false,
      error: `Kraj ${country} nie jest w UE`,
      errorCode: 'INVALID_FORMAT',
    };
  }

  const cleanVat = vatNumber.replace(/[\s\-]/g, '').toUpperCase();
  if (cleanVat.length < 4) {
    return {
      success: false,
      error: 'Numer VAT za krótki',
      errorCode: 'INVALID_FORMAT',
    };
  }

  const url = VIES_REST_API.replace(
    '{country}',
    encodeURIComponent(country)
  ).replace('{vatNumber}', encodeURIComponent(cleanVat));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KSeF-SaaS/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 503) {
      return {
        success: false,
        error: 'VIES tymczasowo niedostępny (awaria po stronie KE)',
        errorCode: 'SERVICE_DOWN',
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `VIES zwrócił ${response.status}`,
        errorCode: 'API_ERROR',
      };
    }

    const data: unknown = await response.json();
    const parsed = parseViesBody(data);

    return {
      success: true,
      countryCode: country,
      vatNumber: cleanVat,
      isValid: parsed.isValid,
      legalName: parsed.legalName,
      registeredAddress: parsed.registeredAddress,
      requestDate: parsed.requestDate,
      rawResponse: data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown';

    if (
      message.includes('aborted') ||
      message.includes('timeout') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return {
        success: false,
        error: 'VIES nie odpowiada (timeout - to się czasem zdarza)',
        errorCode: 'TIMEOUT',
      };
    }

    return {
      success: false,
      error: `Błąd VIES: ${message}`,
      errorCode: 'API_ERROR',
    };
  }
}

// ============================================================================
// Helper: ekstrakcja country code z NIP-a typu "DE12345678" lub "5260250995"
// ============================================================================

export function extractCountryFromVatNumber(input: string): {
  countryCode: string;
  vatNumber: string;
} {
  const cleaned = input.replace(/[\s\-]/g, '').toUpperCase();

  const match = cleaned.match(/^([A-Z]{2})(.+)$/);
  if (match && isEuCountryCode(match[1])) {
    return { countryCode: match[1], vatNumber: match[2] };
  }

  return { countryCode: 'PL', vatNumber: cleaned };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseViesBody(data: unknown): {
  isValid: boolean;
  legalName?: string;
  registeredAddress?: string;
  requestDate: string;
} {
  if (!isRecord(data)) {
    return { isValid: false, requestDate: new Date().toISOString() };
  }

  return {
    isValid: data.isValid === true,
    legalName: optionalString(data.name),
    registeredAddress: optionalString(data.address),
    requestDate:
      optionalString(data.requestDate) ?? new Date().toISOString(),
  };
}
