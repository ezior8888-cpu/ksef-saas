import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { siteUrl, SUPPORT_EMAIL } from '@/lib/site';
import { isPublicPath } from '@/lib/supabase/middleware';

/**
 * Krok 10 planu automatyzacji (MAN-18, MAN-19). W kodzie było siedem adresów
 * kontaktowych, w tym cztery w domenie `ksef-saas.pl`, której już nikt nie
 * ma zarejestrowanej — zgłoszenia, żądania RODO i prośby o zwrot mogły trafić
 * do obcej osoby. Sitemap i robots.txt wskazywały tę domenę wyszukiwarkom.
 */

const ROOT = join(__dirname, '..', '..');
const SCANNED = ['app', 'components', 'lib', 'content'];
const EXTENSIONS = /\.(tsx?|mdx?)$/;
// Adresy @faktway.pl dozwolone poza jedną skrzynką: nadawcy maili z konwencji
// w lib/email/send.ts (odpowiedzi idą na SUPPORT_EMAIL przez Reply-To).
const ALLOWED_FAKTWAY = new Set([SUPPORT_EMAIL, 'no-reply@app.faktway.pl', 'hello@hello.faktway.pl']);
// Stara domena (zmiana marki 10.2026) zostaje tylko w lustrze tekstów RAISE
// migracji 00148 — zmieni je dopiero nowa migracja. Do tego czasu
// pomoc@faktflow.pl musi odbierać pocztę (ops/poczta/worker.mjs).
const OLD_DOMAIN_ALLOWED_FILES = new Set(['lib/ksef/duplicate-decision.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path);
    return EXTENSIONS.test(name) ? [path] : [];
  });
}

function scan(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const dir of SCANNED) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).replaceAll('\\', '/');
      if (rel === 'lib/site.ts') continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(pattern)) hits.push(`${rel}:${i + 1} ${m[0]}`);
      });
    }
  }
  return hits;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('jeden adres kontaktowy', () => {
  it('żadnych odwołań do niezarejestrowanej domeny ksef-saas.pl', () => {
    expect(scan(/ksef-saas\.pl/g)).toEqual([]);
  });

  it('adresy @faktway.pl tylko z listy (jedna skrzynka + nadawca no-reply)', () => {
    const others = scan(/[a-z0-9._-]+@(?:[a-z0-9-]+\.)*faktway\.pl/gi)
      .filter((hit) => !ALLOWED_FAKTWAY.has(hit.split(' ').at(-1) ?? ''));
    expect(others).toEqual([]);
  });

  it('adresy @faktflow.pl tylko w lustrze tekstów SQL 00148 (zmiana marki)', () => {
    const others = scan(/[a-z0-9._-]+@(?:[a-z0-9-]+\.)*faktflow\.pl/gi)
      .filter((hit) => !OLD_DOMAIN_ALLOWED_FILES.has(hit.split(':')[0]));
    expect(others).toEqual([]);
  });

  it('adres strony z NEXT_PUBLIC_APP_URL, bez końcowego ukośnika; domyślnie faktway.pl', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://faktway.pl/');
    expect(siteUrl()).toBe('https://faktway.pl');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(siteUrl()).toBe('https://faktway.pl');
    expect(SUPPORT_EMAIL).toBe('pomoc@faktway.pl');
  });
});

describe('ścieżki dla wyszukiwarek i podglądów linków są publiczne', () => {
  it.each(['/robots.txt', '/sitemap.xml', '/opengraph-image'])('%s bez logowania', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(['/robots.txt/x', '/sitemap.xml.bak', '/dashboard', '/settings/billing'])('%s nadal chronione', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
