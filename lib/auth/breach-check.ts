import { createHash } from 'node:crypto';

/**
 * Pwned Passwords range lookup: SHA-1 is required by the HIBP protocol,
 * not used to store or authenticate account passwords.
 * Only its first five hex characters leave this process; compare locally.
 * https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 *
 * Do not persist a password-derived cache key (even a hash of its suffix):
 * it would allow offline guessing against a cache snapshot. The range
 * request explicitly bypasses the Next.js fetch cache as well.
 * Add-Padding adds dummy zero-count entries, not a fixed response size.
 *
 * Preserve the existing fail-open contract when this supplementary check
 * is unavailable; callers still enforce the local password policy.
 */
const HIBP_API_BASE = 'https://api.pwnedpasswords.com/range/';
const REQUEST_TIMEOUT_MS = 3000;
// Application safety limit, not a claimed maximum in the HIBP protocol.
const MAX_RESPONSE_BYTES = 256 * 1024;

export interface BreachCheckResult {
  breached: boolean;
  occurrences: number;
  /** True when the check is unavailable, not proof the password is safe. */
  fallback?: boolean;
}

export async function checkPasswordBreach(
  password: string,
): Promise<BreachCheckResult> {
  if (!password) return { breached: false, occurrences: 0 };

  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(HIBP_API_BASE + prefix, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'ksef-saas-password-check',
      },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status !== 200) throw new Error('Unavailable password check');

    const body = await readBoundedBody(response);
    const occurrences = parseOccurrences(body, suffix);
    return { breached: occurrences > 0, occurrences };
  } catch {
    // Never log the exception, request URL, hash, response or password.
    console.warn('[breach-check] Password breach check unavailable');
    return { breached: false, occurrences: 0, fallback: true };
  } finally {
    clearTimeout(timeout);
    // Also close a rejected/non-200 response without consuming its body.
    controller.abort();
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing password check response');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        return body + decoder.decode();
      }
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Password check response too large');
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function parseOccurrences(body: string, suffix: string): number {
  const lines = body.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) throw new Error('Empty password check response');
  const seen = new Set<string>();
  let occurrences = 0;
  for (const line of lines) {
    const match = /^([A-F0-9]{35}):(0|[1-9][0-9]{0,15})$/.exec(line);
    if (!match) throw new Error('Invalid password check response');
    const [, hashSuffix, count] = match;
    const value = Number(count);
    if (!Number.isSafeInteger(value) || seen.has(hashSuffix)) {
      throw new Error('Invalid password check response');
    }
    seen.add(hashSuffix);
    if (hashSuffix === suffix) occurrences = value;
  }
  return occurrences;
}
