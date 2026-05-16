import { createHash } from 'crypto';
import { getRedis, isRedisConfigured } from '@/lib/cache/redis';

/**
 * Pwned Passwords (haveibeenpwned.com) — k-anonymity API.
 *
 * Protokół (privacy-preserving):
 *   1. Liczymy SHA-1 hasła.
 *   2. Wysyłamy tylko pierwsze 5 znaków hashu (HEX).
 *   3. Otrzymujemy ~700-800 sufiksów + countów dla wszystkich hashów
 *      zaczynających się od tego prefixu.
 *   4. Sprawdzamy lokalnie czy nasz suffix tam jest.
 *
 * Hasło NIGDY nie opuszcza naszego serwera. SHA-1 jest słaby kryptograficznie,
 * ale tu używamy go tylko jako lookup key — nie do storage.
 *
 * `Add-Padding: true` powoduje że HIBP wymusza identyczną długość odpowiedzi
 * niezależnie od prefixu — utrudnia analizę traffic timing.
 *
 * Cache: 24h w Redis pod kluczem SHA-256(suffix). Trafia top haseł szybko —
 * w pierwszym tygodniu prod ~80% requestów hituje cache.
 *
 * Fail-open: jeśli HIBP padnie / timeout, NIE blokujemy registracji.
 * Strength check już odrzucił najgorsze hasła, więc nawet bez HIBP mamy
 * sensowny baseline.
 */
const HIBP_API_BASE = 'https://api.pwnedpasswords.com/range/';
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 3000;

export interface BreachCheckResult {
  breached: boolean;
  occurrences: number;
  /** True gdy HIBP nie odpowiedział i przechodzimy w fail-open. */
  fallback?: boolean;
}

export async function checkPasswordBreach(
  password: string,
): Promise<BreachCheckResult> {
  if (!password) return { breached: false, occurrences: 0 };

  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const cached = await readCache(suffix);
  if (cached !== null) {
    return { breached: cached > 0, occurrences: cached };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`${HIBP_API_BASE}${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'ksef-saas-password-check',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { breached: false, occurrences: 0, fallback: true };
    }

    const body = await res.text();
    const occurrences = parseOccurrences(body, suffix);
    await writeCache(suffix, occurrences);
    return { breached: occurrences > 0, occurrences };
  } catch (err) {
    console.error('[breach-check] HIBP error, fail-open:', err);
    return { breached: false, occurrences: 0, fallback: true };
  }
}

function parseOccurrences(body: string, suffix: string): number {
  for (const line of body.split('\n')) {
    const [hashSuffix, count] = line.trim().split(':');
    if (hashSuffix === suffix) {
      return Number.parseInt(count ?? '0', 10) || 0;
    }
  }
  return 0;
}

async function readCache(suffix: string): Promise<number | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getRedis();
    const value = await redis.get<number>(cacheKey(suffix));
    return value ?? null;
  } catch {
    return null;
  }
}

async function writeCache(suffix: string, occurrences: number): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getRedis();
    await redis.set(cacheKey(suffix), occurrences, { ex: CACHE_TTL_SECONDS });
  } catch {
    // ignore — cache miss przy następnej weryfikacji to nie blokada
  }
}

function cacheKey(suffix: string): string {
  // Hashujemy suffix przed kluczem żeby snapshot Redisa nie wyciekał
  // bezpośrednio fragmentów SHA-1 popularnych haseł.
  const h = createHash('sha256').update(suffix).digest('hex').slice(0, 32);
  return `hibp:${h}`;
}
