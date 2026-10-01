/**
 * Adres strony i jedyny adres kontaktowy FaktFlow (krok 10 planu automatyzacji).
 *
 * Dawniej w kodzie było siedem adresów w dwóch domenach. `ksef-saas.pl` nie
 * jest już zarejestrowana (NASK, 1.10.2026) — każdy mógł ją kupić i odbierać
 * zgłoszenia, żądania RODO i prośby o zwrot. Teraz wszystko idzie na jedną
 * skrzynkę, a test `jeden-adres-kontaktowy` pilnuje, żeby stara domena nie
 * wróciła. Poczta przychodząca: docs/runbooks/skrzynka-pomoc.md.
 */

export const SUPPORT_EMAIL = 'pomoc@faktflow.pl';

const DEFAULT_SITE_URL = 'https://faktflow.pl';

/** Adres strony bez końcowego ukośnika (NEXT_PUBLIC_APP_URL albo faktflow.pl). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
}
