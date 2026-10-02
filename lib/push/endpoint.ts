/**
 * Adres subskrypcji Web Push (AUD-61).
 *
 * Adres podaje przeglądarka, ale do akcji serwera może trafić cokolwiek —
 * a serwer wysyła na niego żądania (`web-push`). Dowolny adres pozwalał
 * kierować te żądania np. do sieci wewnętrznej. Przyjmujemy tylko HTTPS
 * do usług push przeglądarek: Chrome/Edge/Android (FCM), Firefox (Mozilla),
 * Safari (Apple), stare Edge (WNS).
 */

const ALLOWED_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
] as const;

/** Domeny, których subdomeny są dozwolone (np. `wns2-par02p.notify.windows.com`). */
const ALLOWED_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'] as const;

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return (
    (ALLOWED_HOSTS as readonly string[]).includes(host) ||
    ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/** Klucze Web Push: `p256dh` (65 bajtów) i `auth` (16 bajtów) w base64url. */
export function isValidPushKeys(p256dh: string, auth: string): boolean {
  return /^[A-Za-z0-9_-]{86,88}={0,2}$/.test(p256dh) && /^[A-Za-z0-9_-]{22,24}={0,2}$/.test(auth);
}
