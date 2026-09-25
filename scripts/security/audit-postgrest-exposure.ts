/**
 * Co baza oddaje niezalogowanemu — test empiryczny RLS.
 *
 * PO CO: czytanie polityk RLS w plikach migracji mówi, co ZAMIERZALIŚMY.
 * Ten skrypt pyta bazę, co ONA NAPRAWDĘ ROBI — wysyła prawdziwe żądania
 * kluczem `anon`, czyli dokładnie tym, który ma każdy odwiedzający naszą
 * stronę, bo jest wbudowany w pakiet przeglądarki. Jeżeli którakolwiek
 * tabela odpowie danymi, izolacja między klientami nie istnieje.
 *
 * DLACZEGO TO JEST MOCNIEJSZE NIŻ PRZEGLĄD POLITYK: polityka może być
 * poprawna, a mimo to nieskuteczna — bo tabela ma `GRANT` dla `anon` i pustą
 * politykę, bo `FORCE ROW LEVEL SECURITY` jest wyłączone i łączymy się rolą
 * właściciela, albo bo widok omija RLS tabel źródłowych. Żądanie HTTP
 * przechodzi przez wszystkie te warstwy naraz i odpowiada na pytanie, które
 * naprawdę nas interesuje.
 *
 * ─── ZASADA ────────────────────────────────────────────────────────
 * Skrypt NIE POBIERA DANYCH. Prosi o `limit=0` i czyta wyłącznie kod
 * odpowiedzi oraz nagłówek z liczbą wierszy. Gdy tabela jest otwarta,
 * raport mówi „odpowiedziała danymi, N wierszy" — nigdy co w nich było.
 * ───────────────────────────────────────────────────────────────────
 *
 * TYLKO ODCZYT. Same żądania GET.
 *
 * Uruchomienie:
 *   node scripts/security/audit-postgrest-exposure.ts --env=C:/dev/ksef-saas/.env.local
 *
 * Aby wycelować w produkcję, wystarczy podać plik z jej zmiennymi:
 *   node scripts/security/audit-postgrest-exposure.ts --env=/sciezka/do/prod.env
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_MD = 'docs/security/audyt/05-postgrest.md';

const envArg = process.argv
  .slice(2)
  .find((a) => a.startsWith('--env='))
  ?.slice('--env='.length);

if (!envArg) {
  console.error('Podaj --env=<ścieżka do pliku .env>.');
  process.exit(1);
}

function parseEnv(path: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if (v.length > 1 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
      v = v.slice(1, -1);
    }
    out.set(t.slice(0, eq).trim(), v);
  }
  return out;
}

const env = parseEnv(envArg);
const URL_BAZY = env.get('NEXT_PUBLIC_SUPABASE_URL');
const KLUCZ_ANON = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!URL_BAZY || !KLUCZ_ANON) {
  console.error('Brak NEXT_PUBLIC_SUPABASE_URL lub NEXT_PUBLIC_SUPABASE_ANON_KEY w podanym pliku.');
  process.exit(1);
}

/** Identyfikator projektu z adresu — do raportu, żeby było wiadomo, co badaliśmy. */
const projekt = URL_BAZY.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? '(nieznany)';

// ═══════════════════════════════════════════════════════════════
// Tabele do sprawdzenia
// ═══════════════════════════════════════════════════════════════

/**
 * Lista wyciągnięta z plików migracji — wszystkie tabele, jakie repozytorium
 * tworzy. Dzięki temu test obejmuje też tabele, o których nikt już nie
 * pamięta, a które PostgREST i tak wystawia.
 */
function tabeleZMigracji(): string[] {
  const dir = join(ROOT, 'supabase', 'migrations');
  const zbior = new Set<string>();
  for (const plik of readdirSync(dir)) {
    if (!plik.endsWith('.sql')) continue;
    const tresc = readFileSync(join(dir, plik), 'utf8');
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z0-9_]+)["']?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tresc)) !== null) zbior.add(m[1]);
  }
  return [...zbior].sort();
}

/**
 * Tabele, których otwarcie na `anon` byłoby najgorsze. Wyróżniamy je
 * w raporcie, żeby wynik dało się przeczytać w pięć sekund.
 */
const NAJWRAZLIWSZE = new Set([
  'invoices', 'invoice_items', 'contractors', 'tenants', 'memberships',
  'audit_logs', 'accountant_access', 'xml_documents', 'ocr_jobs',
  'expenses', 'payments', 'users', 'profiles',
]);

const tabele = tabeleZMigracji();
console.log(`Projekt: ${projekt}`);
console.log(`Sprawdzam ${tabele.length} tabel kluczem \`anon\` (żądania GET, bez pobierania danych)...`);

// ═══════════════════════════════════════════════════════════════
// Odpytywanie
// ═══════════════════════════════════════════════════════════════

type Werdykt = 'ODMOWA' | 'BRAK-TABELI' | 'OTWARTA' | 'PUSTA-ODPOWIEDŹ' | 'BŁĄD';

interface Wynik {
  tabela: string;
  status: number;
  kod: string;
  werdykt: Werdykt;
  wierszy: string;
  wrazliwa: boolean;
}

/**
 * `limit=0` z nagłówkiem `count=exact`: PostgREST zwraca liczbę wierszy
 * w nagłówku `content-range`, a w ciele pustą tablicę. Dostajemy odpowiedź
 * na pytanie „czy w ogóle wpuszcza", nie widząc ani jednego rekordu.
 */
async function sprawdz(tabela: string): Promise<Wynik> {
  const url = `${URL_BAZY}/rest/v1/${tabela}?select=*&limit=0`;
  const wrazliwa = NAJWRAZLIWSZE.has(tabela);
  try {
    const r = await fetch(url, {
      headers: {
        apikey: KLUCZ_ANON!,
        Authorization: `Bearer ${KLUCZ_ANON}`,
        Prefer: 'count=exact',
      },
    });
    const zakres = r.headers.get('content-range') ?? '';
    const wierszy = zakres.split('/')[1] ?? '?';

    if (r.ok) {
      return {
        tabela, status: r.status, kod: '—',
        werdykt: wierszy === '0' ? 'PUSTA-ODPOWIEDŹ' : 'OTWARTA',
        wierszy, wrazliwa,
      };
    }
    // Ciało błędu PostgREST-a zawiera kod, nie dane — bezpiecznie je odczytać.
    let kod = String(r.status);
    try {
      const j = (await r.json()) as { code?: string };
      if (j?.code) kod = j.code;
    } catch { /* brak ciała JSON */ }

    const werdykt: Werdykt =
      kod === '42501' || r.status === 401 || r.status === 403
        ? 'ODMOWA'
        : kod === 'PGRST205' || r.status === 404
          ? 'BRAK-TABELI'
          : 'BŁĄD';
    return { tabela, status: r.status, kod, werdykt, wierszy: '—', wrazliwa };
  } catch (e) {
    return {
      tabela, status: 0, kod: e instanceof Error ? e.name : 'sieć',
      werdykt: 'BŁĄD', wierszy: '—', wrazliwa,
    };
  }
}

const wyniki: Wynik[] = [];
// Po kilka naraz — nie zalewamy bazy, ale nie czekamy też pół godziny.
for (let i = 0; i < tabele.length; i += 6) {
  wyniki.push(...(await Promise.all(tabele.slice(i, i + 6).map(sprawdz))));
  process.stdout.write('.');
}
console.log('');

// ═══════════════════════════════════════════════════════════════
// Raport
// ═══════════════════════════════════════════════════════════════

const otwarte = wyniki.filter((w) => w.werdykt === 'OTWARTA');
const puste = wyniki.filter((w) => w.werdykt === 'PUSTA-ODPOWIEDŹ');
const odmowy = wyniki.filter((w) => w.werdykt === 'ODMOWA');
const brakujace = wyniki.filter((w) => w.werdykt === 'BRAK-TABELI');
const bledy = wyniki.filter((w) => w.werdykt === 'BŁĄD');

const L: string[] = [];
L.push('# 05 — Co baza oddaje niezalogowanemu');
L.push('');
L.push('Wygenerowane przez `scripts/security/audit-postgrest-exposure.ts`. **Nie edytuj ręcznie.**');
L.push('');
L.push('> Skrypt **nie pobiera danych**: pyta z `limit=0` i czyta wyłącznie kod odpowiedzi');
L.push('> oraz liczbę wierszy z nagłówka. Żaden rekord nie opuszcza bazy.');
L.push('');
L.push(`Data przebiegu: ${new Date().toISOString().slice(0, 10)}`);
L.push(`Badany projekt: \`${projekt}\``);
L.push(`Sprawdzono tabel: ${tabele.length} (lista wyciągnięta z plików migracji)`);
L.push('');
L.push('## Wynik');
L.push('');
L.push('| Werdykt | Ile | Co znaczy |');
L.push('|---|---|---|');
L.push(`| 🔴 OTWARTA | ${otwarte.length} | odpowiedziała danymi niezalogowanemu |`);
L.push(`| 🟡 PUSTA-ODPOWIEDŹ | ${puste.length} | wpuściła, ale wierszy nie ma (patrz niżej) |`);
L.push(`| ✅ ODMOWA | ${odmowy.length} | odmówiła — zachowanie poprawne |`);
L.push(`| ⚪ BRAK-TABELI | ${brakujace.length} | nie istnieje albo nie jest wystawiona |`);
L.push(`| ⚠ BŁĄD | ${bledy.length} | nie udało się rozstrzygnąć |`);
L.push('');

if (otwarte.length > 0) {
  L.push('## 🔴 Tabele otwarte dla niezalogowanego');
  L.push('');
  L.push('| Tabela | Wierszy | Wrażliwa |');
  L.push('|---|---|---|');
  for (const w of otwarte.sort((a, b) => Number(b.wrazliwa) - Number(a.wrazliwa))) {
    L.push(`| \`${w.tabela}\` | ${w.wierszy} | ${w.wrazliwa ? '**TAK**' : 'nie' } |`);
  }
  L.push('');
  L.push('Każdy wiersz z kolumną „wrażliwa = TAK" to ustalenie krytyczne.');
  L.push('');
}

if (puste.length > 0) {
  L.push('## 🟡 Wpuściła, ale zwróciła zero wierszy');
  L.push('');
  L.push('**To jest niejednoznaczne i wymaga rozstrzygnięcia ręcznego.** Zero wierszy może');
  L.push('znaczyć jedno z dwóch, a różnica jest zasadnicza:');
  L.push('');
  L.push('1. **Polityka RLS działa** i odfiltrowała wszystko — zachowanie poprawne.');
  L.push('2. **Tabela jest po prostu pusta**, a polityki nie ma wcale. Wtedy pierwszy');
  L.push('   wiersz, który tam trafi, będzie publiczny — i nikt się nie dowie.');
  L.push('');
  L.push('Rozróżnia je zapytanie 02 z `scripts/security/sql/` (treść polityk).');
  L.push('');
  L.push('| Tabela | Wrażliwa |');
  L.push('|---|---|');
  for (const w of puste.sort((a, b) => Number(b.wrazliwa) - Number(a.wrazliwa))) {
    L.push(`| \`${w.tabela}\` | ${w.wrazliwa ? '**TAK**' : 'nie'} |`);
  }
  L.push('');
}

L.push('## Pełne zestawienie');
L.push('');
L.push('| Tabela | Werdykt | HTTP | Kod |');
L.push('|---|---|---|---|');
for (const w of wyniki.sort((a, b) => a.tabela.localeCompare(b.tabela))) {
  L.push(`| \`${w.tabela}\` | ${w.werdykt} | ${w.status} | ${w.kod} |`);
}
L.push('');
L.push('## Jak czytać kody');
L.push('');
L.push('- **`42501 permission denied`** — odpowiedź POPRAWNA. Tabela istnieje, a odmowa');
L.push('  nastąpiła na autoryzacji. Dokładnie tego oczekujemy.');
L.push('- **`PGRST205`** — PostgREST nie widzi tabeli. Albo jej nie ma, albo nie jest');
L.push('  w wystawionym schemacie, albo cache schematu nie został przeładowany.');
L.push('- **`200` z wierszami** — tabela oddaje dane komuś, kto się nie zalogował.');
L.push('');
L.push('## Ograniczenie tego testu');
L.push('');
L.push('Test pokazuje, co widzi **niezalogowany gość**. Nie odpowiada na pytanie,');
L.push('czy zalogowany klient A widzi dane klienta B — do tego potrzeba dwóch kont');
L.push('i to jest osobne narzędzie (`probe-idor.ts`, dzień 5).');
L.push('');
L.push('Wynik dotyczy **tego projektu**, którego adres podano w pliku `.env`.');
L.push('Przeniesienie wniosków na inną instalację wymaga powtórzenia przebiegu');
L.push('z jej zmiennymi — instalacja produkcyjna jest osobna i może się różnić.');

mkdirSync(join(ROOT, 'docs/security/audyt'), { recursive: true });
writeFileSync(join(ROOT, OUT_MD), L.join('\n') + '\n', 'utf8');

console.log('');
console.log(`OTWARTE:          ${otwarte.length} ${otwarte.length ? '← ' + otwarte.map((w) => w.tabela).join(', ') : ''}`);
console.log(`PUSTA-ODPOWIEDŹ:  ${puste.length} ${puste.length ? '← ' + puste.map((w) => w.tabela).join(', ') : ''}`);
console.log(`ODMOWA:           ${odmowy.length}`);
console.log(`BRAK-TABELI:      ${brakujace.length}`);
console.log(`BŁĄD:             ${bledy.length}`);
console.log(`→ ${OUT_MD}`);
