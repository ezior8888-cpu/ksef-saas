import { headers } from 'next/headers';

/**
 * Wyciąga client IP z proxy headers. Vercel zawsze dokleja `x-forwarded-for`
 * (lista przez przecinek, pierwszy = klient). Fallback `x-real-ip` na
 * wypadek innego deploymentu.
 *
 * Zwraca 'unknown' lokalnie — wtedy rate limiting per-IP staje się
 * globalny (wszyscy w dev mają wspólny bucket), co jest OK do testów.
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headersList.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
