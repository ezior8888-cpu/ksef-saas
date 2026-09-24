/**
 * Produkcja od zewnątrz — kroki 5.1–5.4 audytu bezpieczeństwa.
 *
 * PO CO: cały audyt do tej pory czytał kod i bazę. Ten krok pyta ŻYWĄ
 * produkcję tym, czym pyta ją każdy przechodzień z internetu — zwykłym GET.
 * Sprawdza nagłówki bezpieczeństwa, czy trasy deweloperskie odpowiadają na
 * prod, czy strony za logowaniem nie są cache'owane przez pośredniki, i czy
 * baza nie jest wystawiona bez tokenu.
 *
 * TYLKO GET-y. Nic nie zapisuje, nie loguje się, nie wysyła danych.
 * Zgodne z ustalonym zakresem („odczyt produkcji, tylko GET-y").
 *
 * Uruchomienie:  node scripts/security/audit-headers.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_MD = 'docs/security/audyt/07-produkcja.md';
const BASE = 'https://www.faktflow.pl';

// Adres bazy z bundla/konfiguracji dev do próby „czy PostgREST publiczny".
// Produkcja to self-hosted Supabase — sprawdzamy oba możliwe wejścia.
const SUPABASE_PROBES = [
  'https://www.faktflow.pl/rest/v1/invoices?limit=1',
  'https://db.faktflow.pl/rest/v1/invoices?limit=1',
];

interface Sonda {
  sciezka: string;
  metoda?: string;
  /** Jak interpretować wynik. */
  oczekiwanie: string;
}

// ── 5.1/5.4: nagłówki i cache na różnych typach tras ────────────
const SCIEZKI: Sonda[] = [
  { sciezka: '/', oczekiwanie: 'marketing — publiczna, cache OK' },
  { sciezka: '/login', oczekiwanie: 'publiczna, ale bez cache danych' },
  { sciezka: '/dashboard', oczekiwanie: 'ZA LOGOWANIEM — musi być no-store, nie cache' },
  { sciezka: '/invoices', oczekiwanie: 'ZA LOGOWANIEM — no-store' },
  { sciezka: '/api/health', oczekiwanie: 'endpoint — no-store' },
];

// ── 5.2: trasy, których na produkcji być nie powinno ────────────
const DEV_ROUTES: Sonda[] = [
  { sciezka: '/api/dev/load-test-session', oczekiwanie: '404/403 — NIE powinno działać na prod' },
  { sciezka: '/api/dev/posthog-test', oczekiwanie: '404/403 — NIE powinno działać na prod' },
  { sciezka: '/api/sentry-example-api', oczekiwanie: '404 — trasa demonstracyjna' },
  { sciezka: '/api/sentry-test-log', oczekiwanie: '404 — trasa testowa' },
  { sciezka: '/sentry-example-page', oczekiwanie: '404 — strona demonstracyjna' },
];

const SEC_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
];

interface Wynik {
  sciezka: string;
  status: number | string;
  cacheControl: string;
  ujawnia: string[];
  uwagi: string[];
}

async function sonda(sciezka: string, metoda = 'GET'): Promise<Wynik> {
  const url = sciezka.startsWith('http') ? sciezka : BASE + sciezka;
  const uwagi: string[] = [];
  try {
    const r = await fetch(url, { method: metoda, redirect: 'manual' });
    const h = r.headers;
    const ujawnia: string[] = [];
    if (h.get('x-powered-by')) ujawnia.push(`x-powered-by: ${h.get('x-powered-by')}`);
    if (h.get('server')) ujawnia.push(`server: ${h.get('server')}`);
    // 3xx z przekierowaniem na /login = trasa CHRONIONA bramką auth, nie
    // publicznie dostępna. Bez tego rozróżnienia skrypt myli „przekierowana
    // na logowanie" z „działa na produkcji".
    const location = h.get('location') ?? '';
    if (r.status >= 300 && r.status < 400 && /\/login/.test(location)) {
      uwagi.push('redirect→/login (chroniona bramką auth)');
    }
    return {
      sciezka,
      status: r.status,
      cacheControl: h.get('cache-control') ?? '(brak)',
      ujawnia,
      uwagi,
    };
  } catch (e) {
    return {
      sciezka,
      status: e instanceof Error ? e.name : 'błąd',
      cacheControl: '—',
      ujawnia: [],
      uwagi: ['nie połączono'],
    };
  }
}

async function main() {
  // Nagłówki bezpieczeństwa — raz, ze strony głównej (są globalne w next.config).
  const rGlobal = await fetch(BASE + '/', { redirect: 'manual' });
  const naglowki: Record<string, string> = {};
  for (const nazwa of SEC_HEADERS) {
    const v = rGlobal.headers.get(nazwa);
    if (v) naglowki[nazwa] = v;
  }

  const trasy: Wynik[] = [];
  for (const s of SCIEZKI) trasy.push(await sonda(s.sciezka));

  const dev: Wynik[] = [];
  for (const s of DEV_ROUTES) dev.push(await sonda(s.sciezka));

  const db: Wynik[] = [];
  for (const u of SUPABASE_PROBES) db.push(await sonda(u));

  // ── Raport ────────────────────────────────────────────────
  const L: string[] = [];
  L.push('# 07 — Produkcja od zewnątrz');
  L.push('');
  L.push('Wygenerowane przez `scripts/security/audit-headers.ts` (tylko GET-y). **Nie edytuj ręcznie.**');
  L.push('');
  L.push(`Data: ${new Date().toISOString().slice(0, 10)} · cel: ${BASE}`);
  L.push('');

  L.push('## 5.1 — Nagłówki bezpieczeństwa');
  L.push('');
  L.push('| Nagłówek | Wartość |');
  L.push('|---|---|');
  for (const n of SEC_HEADERS) {
    const v = naglowki[n];
    L.push(`| \`${n}\` | ${v ? v.slice(0, 120) + (v.length > 120 ? '…' : '') : '**BRAK**'} |`);
  }
  L.push('');
  const cspEnforce = !!naglowki['content-security-policy'];
  const cspReport = !!naglowki['content-security-policy-report-only'];
  if (!cspEnforce && cspReport) {
    L.push('🟡 **CSP tylko w trybie Report-Only** — polityka jest zdefiniowana, ale przeglądarka');
    L.push('jej NIE egzekwuje, tylko raportuje naruszenia. XSS nie jest blokowany przez CSP.');
    L.push('To znane (`next.config.ts`), ale przed launchem powinno przejść w tryb egzekwowany.');
    L.push('');
  }

  L.push('## 5.4 — Cache-Control (trasy za logowaniem NIE mogą być cache\'owane)');
  L.push('');
  L.push('| Trasa | Status | Cache-Control | Ujawnia |');
  L.push('|---|---|---|---|');
  for (const w of trasy) {
    L.push(`| \`${w.sciezka}\` | ${w.status} | \`${w.cacheControl}\` | ${w.ujawnia.join(', ') || '—'} |`);
  }
  L.push('');
  L.push('Trasa za logowaniem z `s-maxage`/`public` w Cache-Control = ryzyko, że pośrednik');
  L.push('(CDN, proxy) zcache\'uje odpowiedź jednego użytkownika i poda ją innemu. Oczekiwane');
  L.push('dla takich tras: `no-store` albo `private`.');
  L.push('');

  L.push('## 5.2 — Trasy deweloperskie na produkcji');
  L.push('');
  L.push('| Trasa | Status | Werdykt |');
  L.push('|---|---|---|');
  for (const w of dev) {
    const chroniona = w.uwagi.some((u) => u.includes('bramką auth'));
    const dostepna = typeof w.status === 'number' && w.status >= 200 && w.status < 300;
    const werdykt = dostepna
      ? '🔴 ODPOWIADA publicznie — do wyłączenia'
      : chroniona
        ? '✅ za bramką auth (redirect→/login)'
        : '✅ niedostępna';
    L.push(`| \`${w.sciezka}\` | ${w.status} | ${werdykt} |`);
  }
  L.push('');
  L.push('Uwaga: `307 → /login` znaczy, że trasa jest za bramką auth (`proxy.ts`),');
  L.push('a nie że działa publicznie. Zagrożeniem byłby dopiero status `2xx` bez logowania.');
  L.push('');

  L.push('## 5.3 — PostgREST od zewnątrz (bez tokenu)');
  L.push('');
  L.push('| Adres | Status | Werdykt |');
  L.push('|---|---|---|');
  for (const w of db) {
    const otwarte = typeof w.status === 'number' && w.status === 200;
    L.push(`| \`${w.sciezka}\` | ${w.status} | ${otwarte ? '🔴 200 — SPRAWDZIĆ czy zwraca dane' : w.status === 401 || w.status === 403 ? '✅ odmowa' : 'brak/nieosiągalne'} |`);
  }
  L.push('');
  L.push('Uwaga: pełny test dostępu bazy bez tokenu zrobiliśmy już od wnętrza sieci');
  L.push('(dzień 3, `run-prod-readonly.sh` 5.4b — 47 tabel odmawia, 0 otwartych). Tu tylko');
  L.push('sprawdzamy, czy `/rest/v1` jest w ogóle wystawiony publicznie na domenie.');

  mkdirSync(join(ROOT, 'docs/security/audyt'), { recursive: true });
  writeFileSync(join(ROOT, OUT_MD), L.join('\n') + '\n', 'utf8');

  console.log('Nagłówki:', Object.keys(naglowki).join(', '));
  console.log('CSP:', cspEnforce ? 'ENFORCE' : cspReport ? 'tylko Report-Only' : 'BRAK');
  console.log('Trasy dev odpowiadające PUBLICZNIE (2xx):', dev.filter((w) => typeof w.status === 'number' && w.status >= 200 && w.status < 300).map((w) => w.sciezka).join(', ') || 'żadna');
  console.log('Cache za logowaniem:');
  for (const w of trasy) console.log(`  ${w.sciezka} → ${w.status} · ${w.cacheControl}`);
  console.log(`→ ${OUT_MD}`);
}

main();
