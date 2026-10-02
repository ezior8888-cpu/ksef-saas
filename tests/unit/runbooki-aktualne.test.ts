import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUD-110 (+AUD-101): runbooki i opisy stacku zalecały procedury z czasów
 * Vercela i Supabase Cloud — operator albo agent AI w incydencie wykonałby
 * złą procedurę. `pnpm db:push:prod` nie działa (AGENTS.md). Dokument
 * w całości nieaktualny ma baner „NIEAKTUALNY”; w pozostałych żadna linia
 * nie może zalecać `db:push:prod` bez ostrzeżenia, że to nie działa.
 */

const ROOT = process.cwd();
const docs = [
  'AGENTS.md',
  'docs/onboarding.md',
  ...readdirSync(join(ROOT, 'docs/runbooks')).filter((f) => f.endsWith('.md')).map((f) => `docs/runbooks/${f}`),
];

const isMarkedOutdated = (text: string) => /NIEAKTUALN/.test(text.slice(0, 1500));

describe('runbooki bez nieaktualnych procedur', () => {
  it.each(docs)('%s nie zaleca `pnpm db:push:prod`', (file) => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    if (isMarkedOutdated(text)) return;
    const offending = text.split('\n').filter((line) => line.includes('db:push:prod') && !/NIE (działa|DZIAŁA)|nie działa/.test(line));
    expect(offending).toEqual([]);
  });

  it.each(['docs/runbooks/disaster-recovery.md', 'docs/runbooks/key-rotation.md', 'docs/runbooks/scaling-triggers.md', 'docs/architecture/system-overview.md'])(
    '%s opisuje Vercela/Inngest — ma baner NIEAKTUALNY',
    (file) => {
      expect(isMarkedOutdated(readFileSync(join(ROOT, file), 'utf8'))).toBe(true);
    },
  );

  it('AGENTS.md: stack zgodny z infrastrukturą (bez Vercela i NextAuth w sekcji Stack)', () => {
    const text = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
    const stack = text.slice(text.indexOf('## Stack'), text.indexOf('## Konwencje kodu'));
    expect(stack).not.toMatch(/Vercel|NextAuth|eu-central-1/);
    expect(stack).toMatch(/pg-boss/);
  });

  it('jest runbook jobów pg-boss', () => {
    expect(readFileSync(join(ROOT, 'docs/runbooks/joby-pg-boss.md'), 'utf8')).toMatch(/pg-boss/);
  });
});
