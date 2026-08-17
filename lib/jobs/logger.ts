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

function fmt(extra: unknown): string {
  if (extra === undefined) return '';
  if (extra instanceof Error) return ` :: ${extra.name}: ${extra.message}`;
  try {
    return ` :: ${JSON.stringify(extra)}`;
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
