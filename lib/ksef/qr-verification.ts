/**
 * KOD I — kod QR weryfikacji faktury w KSeF, na wizualizacji przekazywanej
 * poza KSeF (PDF, wydruk, e-mail). Specyfikacja MF: CIRFMF/ksef-docs,
 * `kody-qr.md` (21.08.2025):
 *
 *   {adres QR środowiska}/invoice/{NIP sprzedawcy}/{P_1 jako DD-MM-RRRR}/{SHA-256 pliku faktury, Base64URL}
 *
 * Pod kodem: numer KSeF, a gdy go jeszcze nie ma — napis „OFFLINE”.
 *
 * Do 29.09 PDF kodował w QR sam numer KSeF — kod nie prowadził do weryfikacji
 * i nie spełniał wymogu dla faktur udostępnianych poza KSeF.
 */

import type { KsefEnvironment } from '@/types/ksef';

const QR_BASE: Record<KsefEnvironment, string> = {
  test: 'https://qr-test.ksef.mf.gov.pl',
  demo: 'https://qr-demo.ksef.mf.gov.pl',
  production: 'https://qr.ksef.mf.gov.pl',
};

/** Adres usługi weryfikacyjnej MF dla danego środowiska. */
export function qrVerificationBaseUrl(env: KsefEnvironment): string {
  return QR_BASE[env];
}

/** Środowisko z konfiguracji (`KSEF_ENV`) — domyślnie testowe, jak klient KSeF. */
export function ksefEnvForQr(raw: string | undefined = process.env.KSEF_ENV): KsefEnvironment {
  return raw === 'production' || raw === 'demo' ? raw : 'test';
}

/** SHA-256 zapisany szesnastkowo → Base64URL bez dopełnienia. */
export function hexToBase64Url(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64url');
}

/**
 * Link KOD I albo `null`, gdy brakuje danych, z których da się go uczciwie
 * zbudować (np. szkic bez pliku XML) — lepiej bez kodu niż z kodem,
 * który prowadzi donikąd.
 */
export function invoiceVerificationUrl(input: {
  env: KsefEnvironment;
  sellerNip: string | null | undefined;
  /** P_1, YYYY-MM-DD. */
  issueDate: string;
  /** SHA-256 pliku XML wysłanego do KSeF, szesnastkowo (`xml_documents.sha256_hash`). */
  sha256Hex: string | null | undefined;
}): string | null {
  const nip = input.sellerNip?.replace(/\D/g, '') ?? '';
  const hex = input.sha256Hex?.trim().toLowerCase() ?? '';
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.issueDate);
  if (nip.length !== 10 || !/^[0-9a-f]{64}$/.test(hex) || !date) return null;
  return `${qrVerificationBaseUrl(input.env)}/invoice/${nip}/${date[3]}-${date[2]}-${date[1]}/${hexToBase64Url(hex)}`;
}

/** Napis pod kodem QR. */
export function qrLabel(ksefNumber: string | null | undefined): string {
  return ksefNumber?.trim() || 'OFFLINE';
}
