/**
 * Mapa powierzchni ataku — krok 0.3 audytu bezpieczeństwa.
 *
 * PO CO: zanim zaczniemy szukać dziur, trzeba wiedzieć, ile jest drzwi.
 * Skrypt znajduje KAŻDE miejsce, w którym żądanie z internetu wchodzi do
 * naszego kodu, i przy każdym zapisuje, kto ma prawo tam wejść i czy kod
 * to sprawdza.
 *
 * CZEGO TEN SKRYPT NIE ROBI: nie orzeka, że coś jest bezpieczne. Wykrywa
 * OBECNOŚĆ wywołania strażnika w pliku — nie to, czy strażnik jest wołany
 * na właściwej ścieżce wykonania, przed właściwą operacją, i czy jego wynik
 * jest w ogóle użyty. To zostaje dla człowieka. Zadaniem skryptu jest
 * zawęzić czytanie ze 150 plików do kilkunastu.
 *
 * Odczyt lokalnego kodu; zapis wyłącznie nowych raportów w jawnym --output-dir.
 * Bez odczytu .env i połączeń z usługami. Kod 0 nie oznacza braku podatności.
 *
 * Uruchomienie: node scripts/security/inventory-entrypoints.ts --output-dir <lokalny-katalog>
 * (Node 24 czyta TypeScript natywnie — nie trzeba `pnpm install` w worktree.)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { configureOfflineAudit } from './offline-audit-output.mjs';

const ROOT = process.cwd();
const { markdownPath: OUT_MD, jsonPath: OUT_JSON, writeReports } = configureOfflineAudit({
  args: process.argv.slice(2), root: ROOT, reportName: '01-powierzchnia', script: 'inventory-entrypoints.ts',
});

// ═══════════════════════════════════════════════════════════════
// Słownik strażników — nazwy wzięte z kodu, nie z głowy.
// Źródła: lib/supabase/auth-context.ts, lib/supabase/page-context.ts,
//         lib/auth/admin-guard.ts
// ═══════════════════════════════════════════════════════════════

/** Strażnik MOCNY: waliduje członkostwo w organizacji, zwraca tenantId. */
const GUARDS_STRONG = [
  'requireUserAndActiveOrg',
  'requireUserAndTenant',
  'resolveApiUserAndActiveOrg',
  'requireOrgRole',
  'requireOwner',
  'withActionAuth',
  'getPageContextWithRole',
  'getPageContext',
];

/** Strażnik operatora platformy (lista e-maili w `ADMIN_EMAILS`). */
const GUARDS_ADMIN = ['requireAdmin', 'getAdminContext', 'isAdminEmail'];

/**
 * SŁABY odczyt organizacji: czyta ciasteczko i sprawdza tylko format UUID.
 * Bezpieczny WYŁĄCZNIE wtedy, gdy zapytanie idzie przez RLS. W parze
 * z `createAdminClient()` (który RLS omija) to jest droga wycieku.
 */
const ORG_READ_WEAK = ['getActiveOrgIdFromCookies'];

/** Klient OMIJAJĄCY RLS — service_role. Baza nie chroni już niczego. */
const RLS_BYPASS = 'createAdminClient';

/**
 * Klient RESPEKTUJĄCY RLS. Ważne rozróżnienie: przy nim ochrona leży
 * w bazie, nie w kodzie. Słaby odczyt organizacji z ciasteczka jest wtedy
 * bezpieczny, bo `public.get_current_tenant_id()` waliduje członkostwo
 * i przy obcym identyfikatorze zwraca NULL, co blokuje wszystkie polityki.
 * TO ZAŁOŻENIE WERYFIKUJE ZADANIE SQL DLA BARTOSZA (dzień 3).
 */
const RLS_CLIENT = 'createClient';

/** Sprawdzenie samej tożsamości, bez organizacji. */
const AUTH_CHECK = /auth\.getUser\(\)/;

/**
 * STRAŻNIK WPISANY W MIEJSCU — czwarty wzorzec ochrony w tym repo.
 *
 * Zamiast wołać nazwany helper, kod sam pyta bazę o członkostwo:
 *   .from('memberships').eq('user_id', user.id).eq('organization_id', tenantId)
 * i przerywa, gdy wiersza nie ma. Jest to równie mocne co `requireUserAndActiveOrg()`
 * — pierwsza wersja tego skryptu zgłaszała takie miejsca jako krytyczne, bo szukała
 * nazw funkcji zamiast zachowania. Stąd ta reguła.
 */
const INLINE_MEMBERSHIP =
  /from\(\s*['"]memberships['"]\s*\)[\s\S]{0,400}?eq\(\s*['"]user_id['"]/;

/**
 * AUTORYZACJA TOKENEM — portal biura rachunkowego i zaproszenia.
 * Tu uprawnieniem JEST token: kod liczy jego skrót, znajduje wiersz dostępu
 * i z niego bierze `tenant_id`. Sesji użytkownika nie ma i być nie może.
 * Sprawdzenia wymaga co innego (wygaśnięcie, cofnięcie, poziom dostępu) —
 * i to jest zadanie na dzień 3, nie dla tego skryptu.
 */
const TOKEN_AUTH = /hashToken\(|token_hash/;

/**
 * Treść wyjątku odsyłana klientowi. Osobna klasa wycieku: komunikat błędu
 * potrafi zawierać nazwę tabeli, fragment zapytania albo ścieżkę na serwerze.
 * Dla atakującego to darmowa mapa środka aplikacji.
 *
 * Lookbehind `(?<![.\w])` odsiewa `parsed.error.message` z walidacji Zod —
 * tamten komunikat dotyczy danych od użytkownika i odesłanie go jest w porządku.
 */
const ERROR_TO_CLIENT =
  /NextResponse\.json\([\s\S]{0,300}?(?<![.\w])(?:e|err|error|cause)\.message/;

// ═══════════════════════════════════════════════════════════════
// Chodzenie po drzewie
// ═══════════════════════════════════════════════════════════════

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'playwright-report',
  'test-results',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Klasyfikacja
// ═══════════════════════════════════════════════════════════════

type Kind = 'route-handler' | 'server-action' | 'page-dynamic' | 'page' | 'proxy';

type Access =
  | 'publiczny'
  | 'zalogowany'
  | 'czlonek organizacji'
  | 'operator platformy'
  | 'token bez logowania'
  | 'podpis webhooka'
  | 'wewnetrzny (Inngest)';

interface Entry {
  file: string;
  kind: Kind;
  /** Ścieżka URL odtworzona z układu katalogów, o ile ma sens. */
  url: string | null;
  /** Parametry z URL-a — czyli wartości sterowane przez atakującego. */
  params: string[];
  /** Eksportowane metody HTTP albo nazwy akcji serwerowych. */
  exports: string[];
  /** Kto POWINIEN mieć dostęp — z układu katalogów i konwencji projektu. */
  expected: Access;
  guardsStrong: string[];
  guardsAdmin: string[];
  orgReadWeak: string[];
  /** Ile razy plik omija RLS (`createAdminClient`). */
  rlsBypass: number;
  /** Ile razy plik używa klienta respektującego RLS (`createClient`). */
  rlsClient: number;
  /** Czy plik w ogóle sprawdza tożsamość (`auth.getUser()`). */
  authCheck: boolean;
  /**
   * Kontekst strażnika w układzie strony (`layout.tsx`) wyżej w drzewie.
   * Nie dowodzi autoryzacji przed odczytem danych komponentu potomnego.
   * Akcje serwerowe i route handlery nie dziedziczą nawet tego kontekstu.
   */
  layoutGuard: string | null;
  /** Strażnik wpisany w miejscu: własne zapytanie o członkostwo. */
  inlineMembership: boolean;
  /** Autoryzacja tokenem (portal księgowej, zaproszenie). */
  tokenAuth: boolean;
  /** Treść wyjątku wraca w odpowiedzi HTTP. */
  errorToClient: boolean;
  /** `krytyczne` | `wysokie` | `srednie` | `do-przejrzenia` | `ok` */
  risk: Risk;
  /** Podejrzenia do przeczytania ręcznie. */
  flags: string[];
}

type Risk = 'krytyczne' | 'wysokie' | 'srednie' | 'do-przejrzenia' | 'ok';

const RISK_ORDER: Record<Risk, number> = {
  krytyczne: 0,
  wysokie: 1,
  srednie: 2,
  'do-przejrzenia': 3,
  ok: 4,
};

const RISK_LABEL: Record<Risk, string> = {
  krytyczne: '🔴 krytyczne',
  wysokie: '🟠 wysokie',
  srednie: '🟡 średnie',
  'do-przejrzenia': '⚪ do przejrzenia',
  ok: '✅ ok',
};

/** Ścieżka URL z układu katalogów App Routera. */
function toUrl(rel: string): string | null {
  const parts = rel.split(sep);
  if (parts[0] !== 'app') return null;
  const segs = parts
    .slice(1, -1)
    // grupy routingu `(dashboard)` nie tworzą segmentu URL-a
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    // katalogi prywatne `_components` nie są trasowane
    .filter((s) => !s.startsWith('_'));
  return '/' + segs.join('/');
}

function paramsOf(rel: string): string[] {
  return [...rel.matchAll(/\[(?:\.\.\.)?([a-zA-Z0-9_]+)\]/g)].map((m) => m[1]);
}

function expectedAccess(rel: string, src: string): Access {
  const p = rel.split(sep).join('/');
  if (/webhook/i.test(p)) return 'podpis webhooka';
  if (p.includes('/api/inngest')) return 'wewnetrzny (Inngest)';
  if (p.startsWith('app/admin/')) return 'operator platformy';
  if (/\[token\]/.test(p)) return 'token bez logowania';
  if (p.startsWith('app/(auth)/') || p.startsWith('app/(marketing)/')) {
    return 'publiczny';
  }
  if (p.startsWith('app/(dashboard)/') || p.startsWith('app/actions/')) {
    return 'czlonek organizacji';
  }
  // Reszta `app/api/**` — rozstrzygamy po tym, czy kod w ogóle sięga po
  // sesję. Brak sesji w kodzie = trasa z założenia publiczna.
  if (/auth\.getUser|requireUser|resolveApi/.test(src)) return 'zalogowany';
  return 'publiczny';
}

function countOccurrences(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

function found(src: string, names: string[]): string[] {
  return names.filter((n) => src.includes(n + '('));
}

/** Eksportowane metody HTTP w route handlerze. */
function httpMethods(src: string): string[] {
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  return [...src.matchAll(re)].map((m) => m[1]);
}

/** Eksportowane funkcje w pliku z akcjami serwerowymi. */
function actionNames(src: string): string[] {
  const re = /export\s+async\s+function\s+([a-zA-Z0-9_]+)/g;
  return [...src.matchAll(re)].map((m) => m[1]);
}

// ═══════════════════════════════════════════════════════════════
// Strażnicy w układach stron (`layout.tsx`)
// ═══════════════════════════════════════════════════════════════

/**
 * Mapa: katalog → strażnik w jego `layout.tsx`.
 *
 * Layout opisuje kontrolę dostępu do interfejsu, ale nie gwarantuje, że
 * strażnik wykona się przed odczytem w komponencie potomnym. Zachowujemy
 * tę informację jako kontekst do ręcznego prześledzenia warstwy danych;
 * sama obecność `requireAdmin()` w layoucie nie daje stronie oceny „ok".
 *
 * Akcje serwerowe i route handlery są osobnymi punktami wejścia.
 * Ich autoryzację trzeba sprawdzać niezależnie od układu strony.
 */
function buildLayoutGuards(root: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const abs of walk(join(root, 'app'))) {
    if (!/[\\/]layout\.tsx?$/.test(abs)) continue;
    const src = readFileSync(abs, 'utf8');
    const g = [...found(src, GUARDS_ADMIN), ...found(src, GUARDS_STRONG)];
    if (g.length) {
      map.set(abs.replace(/[\\/]layout\.tsx?$/, ''), g[0]);
    } else if (AUTH_CHECK.test(src)) {
      map.set(abs.replace(/[\\/]layout\.tsx?$/, ''), 'auth.getUser');
    }
  }
  return map;
}

const LAYOUT_GUARDS = buildLayoutGuards(ROOT);

/** Najbliższy strażnik w układzie wyżej w drzewie. */
function inheritedGuard(abs: string): string | null {
  let dir = abs.slice(0, Math.max(abs.lastIndexOf(sep), 0));
  const appDir = join(ROOT, 'app');
  while (dir.length >= appDir.length) {
    const g = LAYOUT_GUARDS.get(dir);
    if (g) return g;
    const up = dir.slice(0, dir.lastIndexOf(sep));
    if (up === dir) break;
    dir = up;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Analiza pojedynczego pliku
// ═══════════════════════════════════════════════════════════════

function analyse(abs: string): Entry | null {
  const rel = relative(ROOT, abs);
  const p = rel.split(sep).join('/');
  const src = readFileSync(abs, 'utf8');

  const isRoute = /\/route\.tsx?$/.test(p);
  const isAction = /^\s*['"]use server['"]/m.test(src);
  const isPage = /\/page\.tsx?$/.test(p);
  const isProxy = p === 'proxy.ts';

  if (!isRoute && !isAction && !isPage && !isProxy) return null;
  // Strony marketingowe bez parametrów to nie powierzchnia ataku na dane.
  if (isPage && !isAction && p.startsWith('app/(marketing)/') && !p.includes('[')) {
    return null;
  }

  const params = paramsOf(p);
  const kind: Kind = isProxy
    ? 'proxy'
    : isRoute
      ? 'route-handler'
      : isAction
        ? 'server-action'
        : params.length > 0
          ? 'page-dynamic'
          : 'page';

  const guardsStrong = found(src, GUARDS_STRONG);
  const guardsAdmin = found(src, GUARDS_ADMIN);
  const orgReadWeak = found(src, ORG_READ_WEAK);
  const rlsBypass = countOccurrences(src, RLS_BYPASS + '()');
  // `createAdminClient` zawiera w sobie `createClient`, więc odejmujemy.
  const rlsClient = countOccurrences(src, RLS_CLIENT + '()') - rlsBypass;
  const authCheck = AUTH_CHECK.test(src);
  const expected = expectedAccess(rel, src);

  // Kontekst layoutu dotyczy stron, ale nie jest dowodem autoryzacji danych.
  // Akcje i route handlery trzeba analizować jako niezależne wejścia.
  const hasLayoutContext = isPage && !isAction;
  const layoutGuard = hasLayoutContext ? inheritedGuard(abs) : null;

  const exports = isRoute ? httpMethods(src) : isAction ? actionNames(src) : [];

  const inlineMembership = INLINE_MEMBERSHIP.test(src);
  const tokenAuth = TOKEN_AUTH.test(src);
  const errorToClient = ERROR_TO_CLIENT.test(src);
  // Dla webhooka uprawnieniem jest podpis nadawcy — sesji nie ma i nie będzie.
  const signatureAuth =
    expected === 'podpis webhooka' &&
    /timingSafeEqual|constructEvent|verifySvix|createHmac/.test(src);

  const anyGuard =
    guardsStrong.length > 0 ||
    guardsAdmin.length > 0 ||
    inlineMembership ||
    tokenAuth ||
    signatureAuth;
  const layoutOnly = layoutGuard !== null && !anyGuard;
  const tenantData = expected === 'czlonek organizacji' || rlsBypass > 0;

  // ── Ocena ────────────────────────────────────────────────────
  const flags: string[] = [];
  let risk: Risk = 'ok';
  const raise = (r: Risk) => {
    if (RISK_ORDER[r] < RISK_ORDER[risk]) risk = r;
  };

  if (layoutOnly) {
    flags.push(
      'LAYOUT-BEZ-AUTORYZACJI-DANYCH: widoczny strażnik jest tylko w layoucie. ' +
        'Prześledzić, czy strona lub wywoływany helper autoryzuje użytkownika przed odczytem danych. ' +
        'Sam layout nie dowodzi ani bezpieczeństwa, ani podatności.',
    );
    raise('do-przejrzenia');
  }

  // Najgroźniejsza para w całym kodzie: RLS wyłączony, a organizacja
  // pochodzi z ciasteczka, którego nikt nie zweryfikował przez członkostwo.
  if (
    rlsBypass > 0 &&
    orgReadWeak.length > 0 &&
    guardsStrong.length === 0 &&
    !inlineMembership
  ) {
    flags.push(
      'RLS-WYŁĄCZONY-ORG-Z-CIASTECZKA: `createAdminClient()` omija bazę, a organizacja pochodzi ' +
        'z `getActiveOrgIdFromCookies()`, które sprawdza tylko format UUID. Podmiana ciasteczka = cudze dane.',
    );
    raise('krytyczne');
  }

  if (rlsBypass > 0 && !anyGuard && !layoutOnly && expected !== 'wewnetrzny (Inngest)') {
    flags.push(
      'OMIJA-RLS-BEZ-STRAŻNIKA: w pliku nie ma żadnego strażnika. Prześledzić, skąd bierze się `tenantId`.',
    );
    raise(expected === 'publiczny' ? 'wysokie' : 'krytyczne');
  }

  if (params.length > 0 && rlsBypass > 0) {
    flags.push(
      `IDOR: identyfikator z URL-a (${params.join(', ')}) trafia do zapytania omijającego RLS. ` +
        'Sprawdzić, czy zapytanie filtruje po `tenant_id` ze strażnika.',
    );
    raise(anyGuard ? 'srednie' : 'wysokie');
  }

  // Akcja publiczna (rejestracja, reset hasła, zapis na newsletter) NIE MOŻE
  // wymagać sesji — to nie jest brak zabezpieczenia, tylko jej przeznaczenie.
  // Dla nich właściwym pytaniem jest limit żądań, nie tożsamość.
  if (
    isAction &&
    expected !== 'publiczny' &&
    !authCheck &&
    guardsStrong.length === 0 &&
    guardsAdmin.length === 0 &&
    !inlineMembership
  ) {
    flags.push(
      'AKCJA-BEZ-TOŻSAMOŚCI: akcja serwerowa bez `auth.getUser()` i bez strażnika. ' +
        'Układ strony jej NIE chroni — akcje wchodzą bezpośrednio po POST.',
    );
    raise('wysokie');
  }

  if (isAction && expected === 'publiczny' && !/checkRateLimit|rateLimit|turnstile/i.test(src)) {
    flags.push(
      'PUBLICZNA-AKCJA-BEZ-LIMITU: akcja dostępna bez logowania i bez widocznego ' +
        'limitu żądań ani ochrony przed botami.',
    );
    raise('do-przejrzenia');
  }

  if (errorToClient) {
    flags.push(
      'BŁĄD-DO-KLIENTA: treść wyjątku wraca w odpowiedzi HTTP. Komunikat potrafi zawierać ' +
        'nazwę tabeli, fragment zapytania albo ścieżkę na serwerze.',
    );
    raise('srednie');
  }

  if (isRoute && tenantData && !anyGuard && !authCheck && expected !== 'podpis webhooka') {
    flags.push('ROUTE-BEZ-TOŻSAMOŚCI: route handler dotykający danych najemcy bez sprawdzenia sesji.');
    raise('wysokie');
  }

  if (expected === 'podpis webhooka' && !/verif|signature|constructEvent|whsec/i.test(src)) {
    flags.push('WEBHOOK-BEZ-PODPISU: nie widać weryfikacji podpisu.');
    raise('krytyczne');
  }

  if (p.startsWith('app/api/dev/') || /sentry-(example|test)/.test(p)) {
    flags.push('TRASA-DEWELOPERSKA: sprawdzić, czy odpowiada na produkcji (dzień 5).');
    raise('do-przejrzenia');
  }

  if (expected === 'czlonek organizacji' && !anyGuard && !authCheck && flags.length === 0) {
    flags.push('BRAK-SPRAWDZENIA: trasa dla członka organizacji bez widocznego sprawdzenia dostępu.');
    raise('do-przejrzenia');
  }

  return {
    file: p,
    kind,
    url: toUrl(rel),
    params,
    exports,
    expected,
    guardsStrong,
    guardsAdmin,
    orgReadWeak,
    rlsBypass,
    rlsClient,
    authCheck,
    layoutGuard,
    inlineMembership,
    tokenAuth,
    errorToClient,
    risk,
    flags,
  };
}

// ═══════════════════════════════════════════════════════════════
// Raport
// ═══════════════════════════════════════════════════════════════

const files = [...walk(join(ROOT, 'app')), join(ROOT, 'proxy.ts')];
const entries = files
  .map(analyse)
  .filter((e): e is Entry => e !== null)
  .sort(
    (a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.file.localeCompare(b.file),
  );

const flagged = entries.filter((e) => e.flags.length > 0);
const byKind = (k: Kind) => entries.filter((e) => e.kind === k).length;
const byRisk = (r: Risk) => entries.filter((e) => e.risk === r).length;

function guardCell(e: Entry): string {
  const parts: string[] = [];
  if (e.guardsStrong.length) parts.push(...e.guardsStrong);
  if (e.guardsAdmin.length) parts.push(...e.guardsAdmin);
  if (e.layoutGuard) parts.push('kontekst układu: ' + e.layoutGuard);
  if (e.inlineMembership) parts.push('sprawdza members');
  if (e.tokenAuth) parts.push('token');
  if (e.expected === 'podpis webhooka' && e.flags.every((f) => !f.startsWith('WEBHOOK'))) parts.push('podpis');
  if (e.authCheck && !e.guardsStrong.length) parts.push('auth.getUser');
  if (e.orgReadWeak.length) parts.push(...e.orgReadWeak.map((n) => '⚠ ' + n));
  return parts.length ? parts.map((s) => '`' + s + '`').join(' ') : '—';
}

/** Skąd bierze się ochrona: z kodu, z bazy, czy znikąd. */
function shieldCell(e: Entry): string {
  if (e.rlsBypass > 0 && e.rlsClient > 0) return `mieszane (RLS ×${e.rlsClient}, omija ×${e.rlsBypass})`;
  if (e.rlsBypass > 0) return `**omija RLS** ×${e.rlsBypass}`;
  if (e.rlsClient > 0) return `RLS ×${e.rlsClient}`;
  return '—';
}

const L: string[] = [];
L.push('# 01 — Powierzchnia ataku');
L.push('');
L.push('Wygenerowane przez `scripts/security/inventory-entrypoints.ts`.');
L.push('**Nie edytuj ręcznie** — każdy przebieg zapisuj w osobnym katalogu wyników.');
L.push('Wnioski i ustalenia idą do `REJESTR-USTALEN.md`.');
L.push('');
L.push(`Data przebiegu: ${new Date().toISOString().slice(0, 10)}`);
L.push('Klasyfikacje są heurystyczną listą do ręcznej oceny, nie potwierdzonymi podatnościami.');
L.push('');
L.push('## Podsumowanie');
L.push('');
L.push('| Rodzaj wejścia | Ile |');
L.push('|---|---|');
L.push(`| Route handlery (\`route.ts\`) | ${byKind('route-handler')} |`);
L.push(`| Pliki z akcjami serwerowymi | ${byKind('server-action')} |`);
L.push(`| Strony z parametrem w URL | ${byKind('page-dynamic')} |`);
L.push(`| Pozostałe strony | ${byKind('page')} |`);
L.push(`| **Razem wejść** | **${entries.length}** |`);
L.push('');
L.push('| Ryzyko | Ile |');
L.push('|---|---|');
for (const r of ['krytyczne', 'wysokie', 'srednie', 'do-przejrzenia', 'ok'] as Risk[]) {
  L.push(`| ${RISK_LABEL[r]} | ${byRisk(r)} |`);
}
L.push('');
L.push('## Do przeczytania ręcznie');
L.push('');
if (flagged.length === 0) {
  L.push('_Brak podejrzeń._');
} else {
  L.push('| Ryzyko | Plik | Kto powinien wejść | Ochrona | Klient bazy | Na czym polega podejrzenie |');
  L.push('|---|---|---|---|---|---|');
  for (const e of flagged) {
    L.push(
      `| ${RISK_LABEL[e.risk]} | \`${e.file}\` | ${e.expected} | ${guardCell(e)} | ${shieldCell(e)} | ${e.flags.join('<br><br>')} |`,
    );
  }
}
L.push('');
L.push('## Pełna mapa');
L.push('');
L.push('| Plik | URL | Rodzaj | Parametry | Eksporty | Kto powinien wejść | Ochrona | Klient bazy |');
L.push('|---|---|---|---|---|---|---|---|');
for (const e of [...entries].sort((a, b) => a.file.localeCompare(b.file))) {
  L.push(
    `| \`${e.file}\` | ${e.url ?? '—'} | ${e.kind} | ${e.params.join(', ') || '—'} | ${e.exports.join(', ') || '—'} | ${e.expected} | ${guardCell(e)} | ${shieldCell(e)} |`,
  );
}
L.push('');
L.push('## Jak to czytać');
L.push('');
L.push('### Kolumna „Ochrona"');
L.push('');
L.push('- `requireUserAndActiveOrg` i pokrewne — **strażnik mocny**: waliduje członkostwo w organizacji i zwraca `tenantId`.');
L.push('- `requireAdmin` — operator platformy, lista z `ADMIN_EMAILS`.');
L.push('- `kontekst układu: <nazwa>` — strażnik obecny w `layout.tsx` wyżej w drzewie.');
L.push('  Nie gwarantuje autoryzacji przed odczytem danych strony. Gdy to jedyny widoczny');
L.push('  strażnik, strona dostaje co najmniej „do przejrzenia"; to zadanie dla ręcznej analizy,');
L.push('  nie potwierdzenie luki. Akcje serwerowe i route handlery nie dziedziczą tej ochrony.');
L.push('- `auth.getUser` — sprawdzone, KTO to jest, ale nie do której organizacji ma prawo.');
L.push('- `⚠ getActiveOrgIdFromCookies` — czyta ciasteczko i sprawdza tylko format UUID.');
L.push('');
L.push('### Kolumna „Klient bazy" — to jest właściwe pytanie');
L.push('');
L.push('- `RLS ×n` — `createClient()`. Ochrona leży w bazie: nawet jeśli kod poda obcy identyfikator');
L.push('  organizacji, `public.get_current_tenant_id()` zwróci `NULL` i polityki odmówią. Dlatego');
L.push('  słaby odczyt ciasteczka w parze z tym klientem **nie jest** znaleziskiem.');
L.push('- `**omija RLS** ×n` — `createAdminClient()`, czyli `service_role`. Baza nie sprawdza już');
L.push('  niczego. Cała izolacja najemców zależy od tego, czy programista dopisał filtr `tenant_id`');
L.push('  i czy wartość tego filtra pochodzi ze strażnika, a nie z danych od użytkownika.');
L.push('- `mieszane` — plik używa obu. Wymaga przeczytania: liczy się to, którym klientem idzie');
L.push('  zapytanie dotykające danych.');
L.push('');
L.push('### Czego ten plik NIE mówi');
L.push('');
L.push('Skrypt widzi obecność wywołań w pliku, nie kolejność wykonania. Nie odróżni strażnika');
L.push('wywołanego przed zapytaniem od wywołanego po nim, ani strażnika, którego wynik jest');
L.push('ignorowany. Kolumna „ok" znaczy „brak przesłanek do czytania w pierwszej kolejności",');
L.push('nie „sprawdzone i bezpieczne".');

writeReports(L.join('\n') + '\n', JSON.stringify(entries, null, 2));

console.log(`Wejść: ${entries.length}, z podejrzeniem: ${flagged.length}`);
console.log(`→ ${OUT_MD}`);
console.log(`→ ${OUT_JSON}`);
