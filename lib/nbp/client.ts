/**
 * Kursy średnie NBP (tabela A) z publicznego API — do przeliczenia kosztu
 * w walucie obcej na złote.
 *
 * Reguła wyboru tabeli mieszka w `lib/flo/nbp.ts` (`rateBefore`): kurs
 * z OSTATNIEGO dnia roboczego PRZED datą zdarzenia (art. 11a ust. 2 PIT
 * dla kosztów). Tu tylko pobieramy tabele z okna przed tą datą — funkcja
 * wyboru odrzuci tabelę z samego dnia i zbyt stary zapas.
 */

import { rateBefore, type NbpRate, type RateLookup } from '@/lib/flo/nbp';

const NBP_API = 'https://api.nbp.pl/api/exchangerates/rates/a';
/** Okno wstecz — dłuższe niż najdłuższa przerwa w publikacji (święta). */
const WINDOW_DAYS = 10;
const TIMEOUT_MS = 10_000;
const DAY_MS = 86_400_000;

function isoDayOffset(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

interface NbpApiResponse {
  code?: string;
  rates?: Array<{ no?: string; effectiveDate?: string; mid?: number }>;
}

/**
 * Tabele A dla waluty z okna [data − 10 dni, data − 1 dzień].
 *
 * 404 z NBP znaczy „brak tabel w zakresie” (albo nieznana waluta) — zwracamy
 * pustą listę, a `rateBefore` powie człowiekowi, czego brakuje. Każdy inny
 * błąd (sieć, 5xx, timeout) RZUCA: to sytuacja chwilowa, job ma ją ponowić
 * zamiast zapisać koszt bez kursu.
 */
export async function fetchNbpTablesBefore(currency: string, date: string): Promise<NbpRate[]> {
  const code = currency.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(code)) return [];
  const url = `${NBP_API}/${code}/${isoDayOffset(date, -WINDOW_DAYS)}/${isoDayOffset(date, -1)}/?format=json`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`NBP: HTTP ${response.status}`);

  const body = (await response.json()) as NbpApiResponse;
  const upper = code.toUpperCase();
  return (body.rates ?? [])
    .filter((r) => typeof r.mid === 'number' && r.mid > 0 && typeof r.effectiveDate === 'string' && typeof r.no === 'string')
    .map((r) => ({ currency: upper, mid: r.mid!, tableNo: r.no!, effectiveDate: r.effectiveDate! }));
}

/** Kurs do przeliczenia kosztu z dnia `date` — tabela z ostatniego dnia roboczego PRZED nim. */
export async function nbpRateForCost(currency: string, date: string): Promise<RateLookup> {
  return rateBefore(await fetchNbpTablesBefore(currency, date), currency, date);
}
