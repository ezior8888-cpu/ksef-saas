const FALLBACK = '/dashboard';
const VALIDATION_ORIGIN = 'https://redirect.example.test';

function containsUnsafeCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return character === '\\' || code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

/** Return one canonical internal path; never an origin, executable scheme or protocol-relative URL. */
export function safeRedirectPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || containsUnsafeCharacter(raw)) {
    return FALLBACK;
  }
  try {
    const destination = new URL(raw, VALIDATION_ORIGIN);
    if (destination.origin !== VALIDATION_ORIGIN || destination.pathname.startsWith('//')) return FALLBACK;
    // A router may decode a path before using it. Validate that representation too.
    const decodedPath = decodeURIComponent(destination.pathname);
    if (decodedPath.startsWith('//') || containsUnsafeCharacter(decodedPath)) return FALLBACK;
    const decodedDestination = new URL(decodedPath, VALIDATION_ORIGIN);
    if (decodedDestination.origin !== VALIDATION_ORIGIN || decodedDestination.pathname.startsWith('//')) return FALLBACK;
    return destination.pathname + destination.search + destination.hash;
  } catch {
    return FALLBACK;
  }
}
