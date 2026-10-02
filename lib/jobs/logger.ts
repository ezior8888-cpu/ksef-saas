/**
 * Prosty logger workera — stdout w formacie zbieralnym przez Coolify.
 * (Odpowiednik `logger` z kontekstu Inngest w portowanych jobach.)
 */

export interface JobLogger {
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
  debug(msg: string, extra?: unknown): void;
}

/** NIP w logu: trzy ostatnie cyfry wystarczą do rozpoznania firmy przy awarii. */
export function maskNip(nip: string | null | undefined): string {
  if (!nip) return '—';
  return nip.length <= 3 ? '***' : '*'.repeat(nip.length - 3) + nip.slice(-3);
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? `${email[0]}***${email.slice(at)}` : '***';
}

// AUD-98: NIP osoby prowadzącej firmę i e-mail to dane osobowe. Maskujemy po
// nazwie pola — liczby i identyfikatory w innych polach zostają czytelne.
const NIP_KEY = /nip$/i;
const EMAIL_KEY = /^(e-?mail\w*|email\w*|\w*email|to|recipients?)$/i;

function redact(key: string, value: unknown): unknown {
  if (NIP_KEY.test(key) && typeof value === 'string') return maskNip(value);
  if (EMAIL_KEY.test(key)) {
    if (typeof value === 'string') return maskEmail(value);
    if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? maskEmail(v) : v));
  }
  return value;
}

function fmt(extra: unknown): string {
  if (extra === undefined) return '';
  if (extra instanceof Error) return ` :: ${extra.name}: ${extra.message}`;
  try {
    return ` :: ${JSON.stringify(extra, redact)}`;
  } catch {
    return ' :: [nieserializowalne]';
  }
}

export function createJobLogger(scope: string): JobLogger {
  const prefix = () => `[${new Date().toISOString()}] [${scope}]`;
  return {
    info: (m, e) => console.log(`${prefix()} ${m}${fmt(e)}`),
    warn: (m, e) => console.warn(`${prefix()} WARN ${m}${fmt(e)}`),
    error: (m, e) => console.error(`${prefix()} ERROR ${m}${fmt(e)}`),
    debug: (m, e) => {
      if (process.env.JOBS_DEBUG === 'true') {
        console.log(`${prefix()} DEBUG ${m}${fmt(e)}`);
      }
    },
  };
}
