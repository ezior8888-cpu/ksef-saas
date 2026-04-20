/**
 * Konwertuje Buffer na Postgres bytea literal (`\x<hex>`).
 * Supabase/PostgREST akceptuje ten format dla kolumn BYTEA.
 */
export function bufferToByteaLiteral(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`;
}
