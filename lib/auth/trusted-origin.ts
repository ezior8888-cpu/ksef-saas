import 'server-only';

/** The public app origin is configuration, never a request-header fallback. */
export function getTrustedAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw || !/^https?:\/\/[^/]+\/?$/i.test(raw) || /[\s\\@?#]/u.test(raw)) return null;
  if (Array.from(raw).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || (code >= 0x7f && code <= 0x9f);
  })) return null;

  try {
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol === 'https:') return url.origin;
    const localDevelopment = process.env.NEXT_PUBLIC_APP_ENV === 'development' && process.env.NODE_ENV !== 'production';
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.protocol === 'http:' && localDevelopment && loopback ? url.origin : null;
  } catch {
    return null;
  }
}
