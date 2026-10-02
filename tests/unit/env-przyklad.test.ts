import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUD-126: `.env.example` i `scripts/check-env.ts` rozjechały się z kodem —
 * martwe zmienne (NextAuth, Vercel Edge Config), brak używanych (`JOBS_BACKEND`,
 * `WORKER_*`, `APP_ENV`), a Slack wymagany, choć alarmy idą też na Telegram.
 * Operator ustawiał nie to, co trzeba. Czytamy wyłącznie NAZWY zmiennych.
 */

const ROOT = process.cwd();
const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
const exampleNames = new Set([...example.matchAll(/^#? ?([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!));
const checkEnv = readFileSync(join(ROOT, 'scripts/check-env.ts'), 'utf8');
const specs = [...checkEnv.matchAll(/\{ name: '([A-Z0-9_]+)', feature: '[^']*', level: '(required|deferred|optional)'/g)]
  .map((m) => ({ name: m[1]!, level: m[2]! }));

describe('.env.example i check-env', () => {
  it('każda zmienna z check-env ma wpis w .env.example', () => {
    expect(specs.map((s) => s.name).filter((n) => !exampleNames.has(n))).toEqual([]);
  });

  it('bez martwych zmiennych (NextAuth, Vercel Edge Config)', () => {
    for (const dead of ['AUTH_SECRET', 'AUTH_URL', 'AUTH_GOOGLE_ID', 'EDGE_CONFIG', 'NEXT_PUBLIC_VERCEL_ENV']) {
      expect(exampleNames.has(dead), dead).toBe(false);
    }
  });

  it('zmienne workera i jobów są opisane', () => {
    for (const name of ['JOBS_BACKEND', 'DATABASE_URL', 'WORKER_HEALTH_PORT', 'WORKER_DISABLE_SCHEDULES', 'APP_ENV']) {
      expect(exampleNames.has(name), name).toBe(true);
      expect(specs.some((s) => s.name === name), name).toBe(true);
    }
  });

  it('Slack nie jest wymagany (alarmy mają też Telegram)', () => {
    expect(specs.filter((s) => s.name.startsWith('SLACK_WEBHOOK_') && s.level === 'required')).toEqual([]);
  });
});
