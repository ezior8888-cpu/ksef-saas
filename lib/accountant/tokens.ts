import { createHash, randomBytes } from 'node:crypto';

/**
 * Generuje token dla księgowej.
 * Zwraca pełny token (pokazać userowi raz) oraz SHA-256 hex do zapisu w DB.
 */
export function generateAccountantToken(): { token: string; hash: string } {
  const bytes = randomBytes(32);
  const token = bytes.toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
