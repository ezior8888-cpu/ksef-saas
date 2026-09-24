/**
 * 206 wywołań omijających RLS — krok 2 audytu bezpieczeństwa.
 *
 * PO CO: `createAdminClient()` łączy się rolą `service_role`, dla której
 * Postgres NIE STOSUJE polityk RLS. W tych miejscach baza nie chroni już
 * niczego — cała izolacja między klientami zależy wyłącznie od kodu.
 *
 * WŁAŚCIWE PYTANIE NIE BRZMI „czy jest filtr `tenant_id`". Filtr wypełniony
 * wartością z ciasteczka wygląda identycznie jak bezpieczny, a nie chroni
 * przed niczym: atakujący podstawia cudzy identyfikator i filtr posłusznie
 * zwraca cudze dane. Skrypt śledzi więc ŹRÓDŁO wartości, nie jej obecność.
 *
 * ─── CZTERY WZORCE, KTÓRYCH PIERWSZA WERSJA NIE ZNAŁA ──────────────
 * Pierwszy przebieg dał 17 „krytycznych" i 126 „wysokich". Prawie wszystkie
 * fałszywe, bo skrypt nie rozumiał, że:
 *
 * 1. **Zapytanie o `memberships` po `user_id` to STRAŻNIK, nie wyciek.**
 *    Kod pyta bazę „czy ten użytkownik należy do tej organizacji" i przerywa,
 *    gdy nie. Pierwsza wersja zgłaszała samo sprawdzenie jako drogę wycieku.
 *
 * 2. **Zapytanie po `token_hash` to AUTORYZACJA.** Portal księgowej nie ma
 *    sesji — uprawnieniem jest token. Filtrowanie takiego zapytania po
 *    `tenant_id` byłoby niemożliwe, bo to właśnie z tokenu dowiadujemy się,
 *    o którego najemcę chodzi.
 *
 * 3. **Przy INSERT izolacja jest w TREŚCI WIERSZA, nie w filtrze.**
 *    `.insert({ tenant_id })` jest poprawne; oczekiwanie `.eq('tenant_id')`
 *    przy zapisie nie ma sensu.
 *
 * 4. **Zadanie w tle Z ZAŁOŻENIA przegląda wszystkich najemców.** Nocne
 *    sprzątanie faktur po terminie retencji MUSI widzieć całą tabelę.
 *    To nie jest wyciek, tylko inna kategoria — wymagająca sprawdzenia,
 *    czy uruchamia je zegar, a nie żądanie z internetu.
 * ───────────────────────────────────────────────────────────────────
 *
 * CZEGO SKRYPT NIE ZROBI: nie wykonuje kodu, nie śledzi wywołań między
 * plikami i nie rozumie przypisań pośrednich. Jego wynik to lista do
 * przeczytania, nie werdykt.
 *
 * TYLKO ODCZYT.
 *
 * Uruchomienie:  node scripts/security/audit-service-role.ts
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const OUT_MD = 'docs/security/audyt/02-service-role.md';
const OUT_JSON = 'docs/security/audyt/02-service-role.json';

// ═══════════════════════════════════════════════════════════════
// Krok 1: które tabele należą do najemcy
// ═══════════════════════════════════════════════════════════════

function kolumnyTabel(): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  const dir = join(ROOT, 'supabase', 'migrations');

  for (const plik of readdirSync(dir).sort()) {
    if (!plik.endsWith('.sql')) continue;
    const tresc = readFileSync(join(dir, plik), 'utf8');

    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z0-9_]+)["']?\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tresc)) !== null) {
      const tabela = m[1];
      let i = re.lastIndex;
      let glebokosc = 1;
      while (i < tresc.length && glebokosc > 0) {
        if (tresc[i] === '(') glebokosc++;
        else if (tresc[i] === ')') glebokosc--;
        i++;
      }
      const cialo = tresc.slice(re.lastIndex, i - 1);
      const kolumny = mapa.get(tabela) ?? new Set<string>();
      for (const linia of cialo.split(',')) {
        const k = linia.trim().match(/^["']?([a-z0-9_]+)["']?\s+[a-z]/i);
        if (k) kolumny.add(k[1].toLowerCase());
      }
      mapa.set(tabela, kolumny);
    }

    const reAlter =
      /alter\s+table\s+(?:only\s+)?(?:public\.)?["']?([a-z0-9_]+)["']?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?["']?([a-z0-9_]+)["']?/gi;
    let a: RegExpExecArray | null;
    while ((a = reAlter.exec(tresc)) !== null) {
      const kolumny = mapa.get(a[1]) ?? new Set<string>();
      kolumny.add(a[2].toLowerCase());
      mapa.set(a[1], kolumny);
    }
  }
  return mapa;
}

const KOLUMNY = kolumnyTabel();

/** Kolumna, po której izoluje się dana tabela. `null` = tabela globalna. */
function kolumnaIzolacji(tabela: string): string | null {
  const k = KOLUMNY.get(tabela);
  if (!k) return null;
  if (k.has('tenant_id')) return 'tenant_id';
  if (k.has('organization_id')) return 'organization_id';
  if (k.has('user_id')) return 'user_id';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Krok 2: pochodzenie wartości filtra
// ═══════════════════════════════════════════════════════════════

const GUARDS = [
  'requireUserAndActiveOrg', 'requireUserAndTenant', 'resolveApiUserAndActiveOrg',
  'requireOrgRole', 'requireOwner', 'getPageContext', 'getPageContextWithRole',
  'requireAdmin', 'getAdminContext',
];

type Zrodlo =
  | 'strażnik' | 'sprawdzone członkostwo' | 'ciasteczko'
  | 'argument funkcji' | 'ładunek zdarzenia' | 'wiersz z bazy'
  | 'literał' | 'nieustalone';

function zrodloWartosci(
  wyrazenie: string, zasieg: string, argumenty: string[], klasa: KlasaPliku,
): Zrodlo {
  const w = wyrazenie.trim();
  if (/^['"`]/.test(w)) return 'literał';
  const nazwa = w.split(/[.?![\]( ]/)[0].trim();
  if (!nazwa) return 'nieustalone';

  // Strażnik — rozpakowanie albo obiekt kontekstu.
  for (const g of GUARDS) {
    if (new RegExp(`(?:const|let)\\s*\\{[^}]*\\b${nazwa}\\b[^}]*\\}\\s*=\\s*await\\s+${g}\\b`).test(zasieg)) {
      return 'strażnik';
    }
    // Przypisanie do zmiennej — CELOWO bez wymogu `const`/`let` w tej samej
    // linii. Obronny wzorzec z tego repo deklaruje zmienną wcześniej, żeby
    // opakować strażnika w `try`:
    //     let auth;
    //     try { auth = await requireUserAndActiveOrg(); } catch { … }
    //     const { user, tenantId } = auth;
    // Pierwsza wersja wymagała `const` przy wywołaniu i przez to nie widziała
    // strażnika w `app/actions/expenses.ts` — czyli w pliku, który jest
    // wzorcowym przykładem poprawnej izolacji w tym projekcie.
    const mo = new RegExp(`(?:(?:const|let)\\s+)?(\\w+)\\s*=\\s*await\\s+${g}\\b`).exec(zasieg);
    if (mo && (nazwa === mo[1] || w.startsWith(mo[1] + '.'))) return 'strażnik';
    // …a potem rozpakowanie z tej zmiennej: `const { tenantId } = auth;`
    if (mo && new RegExp(`(?:const|let)\\s*\\{[^}]*\\b${nazwa}\\b[^}]*\\}\\s*=\\s*${mo[1]}\\b`).test(zasieg)) {
      return 'strażnik';
    }
  }

  // Członkostwo sprawdzone w miejscu — równie mocne co strażnik.
  if (/from\(\s*['"]memberships['"]\s*\)[\s\S]{0,500}?eq\(\s*['"]user_id['"]/.test(zasieg)) {
    return 'sprawdzone członkostwo';
  }

  // Ciasteczko bez weryfikacji członkostwa.
  if (new RegExp(`(?:const|let)\\s*(?:\\{[^}]*\\b${nazwa}\\b[^}]*\\}|\\b${nazwa}\\b)[^=]{0,40}=\\s*await\\s+getActiveOrgIdFromCookies`).test(zasieg)) {
    return 'ciasteczko';
  }

  // Wartość wyjęta z wiersza pobranego wcześniej z bazy.
  if (new RegExp(`(?:const|let)\\s*\\{?[^=]{0,60}\\b${nazwa}\\b[^=]{0,60}\\}?\\s*=\\s*await\\s+\\w+\\s*\\n?\\s*\\.from\\(`).test(zasieg)) {
    return 'wiersz z bazy';
  }
  if (/\bdata\s*:\s*\w+\s*\}\s*=\s*await/.test(zasieg) && /\.\s*from\(/.test(zasieg)) {
    if (new RegExp(`\\b${nazwa}\\b`).test(zasieg.slice(zasieg.lastIndexOf('.from(')))) {
      return 'wiersz z bazy';
    }
  }

  if (argumenty.includes(nazwa)) {
    return klasa === 'zadanie w tle' ? 'ładunek zdarzenia' : 'argument funkcji';
  }
  return 'nieustalone';
}

// ═══════════════════════════════════════════════════════════════
// Krok 3: klasyfikacja pliku
// ═══════════════════════════════════════════════════════════════

type KlasaPliku = 'wejście z internetu' | 'zadanie w tle' | 'biblioteka';

function klasaPliku(p: string): KlasaPliku {
  if (/^lib\/(inngest\/jobs|jobs|reminders|backup)\//.test(p)) return 'zadanie w tle';
  if (p.startsWith('app/')) return 'wejście z internetu';
  return 'biblioteka';
}

// ═══════════════════════════════════════════════════════════════
// Krok 4: analiza zapytań
// ═══════════════════════════════════════════════════════════════

type RodzajFiltra = 'brak' | 'najemca' | 'klucz' | 'użytkownik' | 'token' | 'inny';
type Ryzyko = 'krytyczne' | 'wysokie' | 'średnie' | 'do-przejrzenia' | 'ok';

interface Zapytanie {
  plik: string; linia: number; klasa: KlasaPliku; funkcja: string;
  tabela: string; operacja: string; kolumnaIzolacji: string | null;
  filtry: string[]; rodzajFiltra: RodzajFiltra; zrodlo: Zrodlo;
  ryzyko: Ryzyko; powod: string;
}

const KOLEJNOSC: Record<Ryzyko, number> = {
  krytyczne: 0, wysokie: 1, 'średnie': 2, 'do-przejrzenia': 3, ok: 4,
};
const ETYKIETA: Record<Ryzyko, string> = {
  krytyczne: '🔴 krytyczne', wysokie: '🟠 wysokie', 'średnie': '🟡 średnie',
  'do-przejrzenia': '⚪ do przejrzenia', ok: '✅ ok',
};

const POMIJANE = new Set(['node_modules', '.next', '.git', 'playwright-report', 'test-results']);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (POMIJANE.has(e)) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

/**
 * Funkcja otaczająca daną pozycję — nazwa, argumenty i POZYCJA POCZĄTKU.
 * Pozycja jest istotna: pierwsza wersja szukała zasięgu przez
 * `lastIndexOf('function')`, co trafiało w słowo „function" w komentarzu
 * i gubiło wywołanie strażnika. Stąd fałszywe „krytyczne" w `app/admin/**`,
 * gdzie `requireAdmin()` stoi w pierwszej linii funkcji.
 */
function funkcjaWokol(src: string, poz: number): { nazwa: string; argumenty: string[]; start: number } {
  const re =
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
  let wynik = { nazwa: '(najwyższy poziom)', argumenty: [] as string[], start: 0 };
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null && m.index < poz) {
    const args = (m[2] ?? m[4] ?? '')
      .replace(/:\s*[^,]+/g, '')
      .split(/[,{}]/)
      .map((s) => s.trim())
      .filter(Boolean);
    wynik = { nazwa: m[1] ?? m[3], argumenty: args, start: m.index };
  }
  return wynik;
}

const zapytania: Zapytanie[] = [];

for (const abs of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]) {
  const p = relative(ROOT, abs).split(sep).join('/');
  const src = readFileSync(abs, 'utf8');
  if (!src.includes('createAdminClient()')) continue;

  const klasa = klasaPliku(p);

  const klienciAdmin = new Set<string>();
  const reKlient = /(?:const|let)\s+(\w+)\s*=\s*createAdminClient\(\)/g;
  let mk: RegExpExecArray | null;
  while ((mk = reKlient.exec(src)) !== null) klienciAdmin.add(mk[1]);
  if (klienciAdmin.size === 0) continue;

  for (const klient of klienciAdmin) {
    const reFrom = new RegExp(`\\b${klient}\\s*\\.?\\s*\\n?\\s*\\.?\\s*from\\(\\s*['"]([a-z0-9_]+)['"]\\s*\\)`, 'g');
    let mf: RegExpExecArray | null;
    while ((mf = reFrom.exec(src)) !== null) {
      const tabela = mf[1];
      const koniec = src.indexOf(';', mf.index);
      const instrukcja = src.slice(mf.index, koniec === -1 ? mf.index + 900 : koniec);
      const linia = src.slice(0, mf.index).split('\n').length;
      const kol = kolumnaIzolacji(tabela);

      const operacja =
        /\.\s*(insert|upsert|update|delete)\s*\(/.exec(instrukcja)?.[1]?.toUpperCase() ?? 'SELECT';
      const zapis = operacja === 'INSERT' || operacja === 'UPSERT';

      const filtry = [
        ...instrukcja.matchAll(/\.\s*(?:eq|in|match|neq|is|gte|lte|filter)\(\s*['"]([a-z0-9_]+)['"]/g),
      ].map((m) => m[1]);

      let rodzajFiltra: RodzajFiltra = 'brak';
      let wyrazenieFiltra = '';
      const zlap = (kolumna: string) =>
        new RegExp(`\\.\\s*(?:eq|in|match)\\(\\s*['"]${kolumna}['"]\\s*,\\s*([^,)]+)`).exec(instrukcja)?.[1];

      if (filtry.some((f) => /token_hash|cancel_token/.test(f))) {
        rodzajFiltra = 'token';
      } else if (kol && filtry.includes(kol)) {
        rodzajFiltra = 'najemca';
        wyrazenieFiltra = zlap(kol) ?? '';
      } else if (filtry.includes('tenant_id') || filtry.includes('organization_id')) {
        rodzajFiltra = 'najemca';
        wyrazenieFiltra = zlap('tenant_id') ?? zlap('organization_id') ?? '';
      } else if (filtry.includes('user_id')) {
        rodzajFiltra = 'użytkownik';
        wyrazenieFiltra = zlap('user_id') ?? '';
      } else if (filtry.includes('id')) {
        rodzajFiltra = 'klucz';
        wyrazenieFiltra = zlap('id') ?? '';
      } else if (filtry.length > 0) {
        rodzajFiltra = 'inny';
      }

      const { nazwa: funkcja, argumenty, start } = funkcjaWokol(src, mf.index);
      const zasieg = src.slice(start, mf.index);

      // Przy zapisie izolacja siedzi w TREŚCI WIERSZA, nie w filtrze.
      if (zapis && kol) {
        const wCiele = new RegExp(`${kol}\\s*:\\s*([^,\\n}]+)`).exec(instrukcja);
        if (wCiele) {
          rodzajFiltra = 'najemca';
          wyrazenieFiltra = wCiele[1].trim();
        } else {
          // Wiersz zbudowany WYŻEJ i przekazany zmienną — bardzo częsty wzorzec:
          //   const rows = codes.map(c => ({ user_id: userId, … }));
          //   await admin.from('mfa_recovery_codes').insert(rows);
          // Pierwsza wersja zgłaszała to jako „zapis bez kolumny izolacji",
          // bo szukała kolumny wyłącznie wewnątrz wywołania `.insert(...)`.
          const arg = new RegExp(`\\.\\s*(?:insert|upsert)\\(\\s*([A-Za-z_$][\\w$]*)`).exec(instrukcja)?.[1];
          if (arg) {
            // Definicja zmiennej, `push` do niej albo funkcja budująca wiersz.
            const budowanie = new RegExp(
              `(?:(?:const|let)\\s+${arg}\\b|${arg}\\s*\\.\\s*push\\s*\\()[\\s\\S]{0,600}?${kol}\\s*:\\s*([^,\\n}]+)`,
            ).exec(zasieg);
            if (budowanie) {
              rodzajFiltra = 'najemca';
              wyrazenieFiltra = budowanie[1].trim();
            } else if (new RegExp(`(?:const|let)\\s+${arg}\\s*=\\s*\\w+\\([^)]*\\b(tenantId|tenant_id|organizationId)\\b`).test(zasieg)) {
              // `const row = mapSubscriptionToRow(subscription, tenantId);`
              // — wiersz buduje funkcja pomocnicza, dostając identyfikator najemcy.
              rodzajFiltra = 'najemca';
              wyrazenieFiltra = 'tenantId';
            }
          }
        }
      }

      const zrodlo: Zrodlo = wyrazenieFiltra
        ? zrodloWartosci(wyrazenieFiltra, zasieg, argumenty, klasa)
        : 'nieustalone';

      // ── Ocena ──────────────────────────────────────────────
      let ryzyko: Ryzyko = 'ok';
      let powod = '';

      if (!kol) {
        powod = 'Tabela globalna — nie ma kolumny izolacji, więc nie ma czego pilnować.';
      } else if (rodzajFiltra === 'token') {
        powod = 'Wyszukanie po skrócie tokenu — to JEST autoryzacja. Z tokenu dowiadujemy się, o którego najemcę chodzi.';
      } else if (tabela === 'memberships' && filtry.includes('user_id')) {
        powod = 'Sprawdzenie członkostwa po `user_id` — to jest strażnik, nie odczyt danych najemcy.';
      } else if (rodzajFiltra === 'najemca') {
        if (zrodlo === 'ciasteczko') {
          ryzyko = 'krytyczne';
          powod = 'Filtr jest, ale wartość pochodzi z ciasteczka niezweryfikowanego przez członkostwo. Podmiana ciasteczka = cudze dane.';
        } else if (zrodlo === 'argument funkcji') {
          // Operator platformy DZIAŁA w poprzek najemców — na tym polega jego rola.
          // Akcja z `requireAdmin()` przyjmująca dowolny `tenantId` jest poprawna,
          // a nie podejrzana. Pierwsza wersja zgłaszała `toggleTenantFlagAction`
          // jako „wysokie", mimo że strażnik stoi w pierwszej linii funkcji.
          const podAdminem = /requireAdmin\s*\(|getAdminContext\s*\(/.test(zasieg);
          if (podAdminem) {
            powod = 'Akcja operatora platformy (`requireAdmin`) przyjmuje `tenantId` jako argument — działanie w poprzek najemców jest tu zamierzone.';
          } else {
            ryzyko = klasa === 'wejście z internetu' ? 'wysokie' : 'do-przejrzenia';
            powod = 'Filtr wypełniony argumentem funkcji — bezpieczeństwo zależy od KAŻDEGO wywołującego.';
          }
        } else if (zrodlo === 'ładunek zdarzenia') {
          ryzyko = 'do-przejrzenia';
          powod = 'Zadanie w tle — wartość z ładunku zdarzenia. Bezpieczne, o ile zdarzenie tworzy kod, a nie użytkownik.';
        } else if (zrodlo === 'nieustalone') {
          ryzyko = 'średnie';
          powod = 'Filtr po kolumnie izolacji jest, ale nie ustaliłem pochodzenia wartości.';
        } else {
          powod = `Filtr po \`${kol}\`, wartość ze źródła: ${zrodlo}.`;
        }
      } else if (rodzajFiltra === 'brak') {
        if (zapis) {
          ryzyko = klasa === 'wejście z internetu' ? 'wysokie' : 'średnie';
          powod = `Zapis do tabeli z kolumną \`${kol}\`, a w treści wiersza nie widać tej kolumny. Wiersz może trafić do niewłaściwego najemcy albo bez przypisania.`;
        } else if (klasa === 'zadanie w tle') {
          ryzyko = 'do-przejrzenia';
          powod = `Odczyt CAŁEJ tabeli \`${tabela}\` w zadaniu w tle. Dla nocnych przeglądów to normalne — sprawdzić, czy uruchamia je zegar, a nie żądanie z internetu.`;
        } else {
          ryzyko = klasa === 'wejście z internetu' ? 'krytyczne' : 'wysokie';
          powod = `${operacja} na całej tabeli \`${tabela}\` — bez filtra po \`${kol}\` i z pominięciem RLS obejmuje wiersze wszystkich najemców.`;
        }
      } else {
        // klucz / użytkownik / inny
        ryzyko = zrodlo === 'wiersz z bazy' || zrodlo === 'strażnik' ? 'ok' : 'do-przejrzenia';
        powod =
          zrodlo === 'wiersz z bazy' || zrodlo === 'strażnik'
            ? `Filtr po \`${filtry.join(', ')}\`, wartość ze źródła: ${zrodlo}.`
            : `Filtr po \`${filtry.join(', ')}\` zamiast po \`${kol}\`. Bezpieczne, jeśli ten identyfikator pochodzi z zapytania już ograniczonego do najemcy — do sprawdzenia.`;
      }

      zapytania.push({
        plik: p, linia, klasa, funkcja, tabela, operacja,
        kolumnaIzolacji: kol, filtry, rodzajFiltra, zrodlo, ryzyko, powod,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Krok 5: kto woła funkcje, których źródła nie ustaliliśmy
// ═══════════════════════════════════════════════════════════════

/**
 * Największa kategoria wyniku to „funkcja w `lib/` bierze `tenantId`
 * argumentem". Sama w sobie nie jest ani bezpieczna, ani niebezpieczna —
 * rozstrzyga o tym KAŻDY wywołujący z osobna. Dopóki nie wiemy, kto to woła,
 * mamy listę nazwisk zamiast odpowiedzi.
 *
 * Ten przebieg szuka wywołań każdej takiej funkcji w całym repozytorium
 * i sprawdza, czy plik wywołujący ma strażnika. Nie jest to pełna analiza
 * przepływu — funkcja może być wołana z innej funkcji w tym samym pliku,
 * a strażnik stać gdzie indziej — ale zamienia „nieznane" w „wołana z trzech
 * miejsc, wszystkie strażone" albo „wołana z miejsca bez strażnika".
 */
const WSZYSTKIE_PLIKI = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))];
const TRESCI = new Map<string, string>();
for (const abs of WSZYSTKIE_PLIKI) {
  TRESCI.set(relative(ROOT, abs).split(sep).join('/'), readFileSync(abs, 'utf8'));
}

const WZORZEC_STRAZNIKA = new RegExp(
  `(?:${GUARDS.join('|')})\\s*\\(|from\\(\\s*['"]memberships['"]\\s*\\)[\\s\\S]{0,500}?eq\\(\\s*['"]user_id['"]`,
);

interface Wywolujacy { plik: string; zeStraznikiem: boolean; skad: string }

/**
 * Czy plik wywołujący jest chroniony — i czym.
 *
 * Trzy źródła ochrony, wszystkie równie prawdziwe:
 *  • strażnik wywołany w samym pliku,
 *  • **układ strony** — `app/admin/layout.tsx` woła `requireAdmin()`, więc
 *    KAŻDA strona w tej gałęzi jest strażona, choć sama nic nie woła.
 *    Zastrzeżenie z dnia 0 nadal obowiązuje: układ chroni STRONY, nie akcje
 *    serwerowe ani route handlery,
 *  • **zegar** — `lib/flo/tick.ts` i joby Inngest uruchamia harmonogram,
 *    a nie żądanie z internetu. Przegląd w poprzek najemców jest tam sensem
 *    działania, nie luką.
 */
function ochronaPliku(plik: string, tresc: string): { chroniony: boolean; skad: string } {
  if (WZORZEC_STRAZNIKA.test(tresc)) return { chroniony: true, skad: 'strażnik w pliku' };
  if (/^app\/admin\/.*page\.tsx$/.test(plik)) {
    return { chroniony: true, skad: 'układ `app/admin/layout.tsx` → requireAdmin' };
  }
  if (/^app\/\(dashboard\)\/.*page\.tsx$/.test(plik)) {
    return { chroniony: true, skad: 'układ `app/(dashboard)/layout.tsx` → sesja' };
  }
  if (/^lib\/(flo\/tick|inngest\/jobs|jobs)\//.test(plik) || plik === 'lib/flo/tick.ts') {
    return { chroniony: true, skad: 'uruchamiane zegarem, nie żądaniem' };
  }
  // Webhook nie ma sesji i mieć nie może — uprawnieniem jest podpis nadawcy.
  // Sprawdzamy, czy weryfikacja NAPRAWDĘ tam jest, a nie tylko czy plik
  // nazywa się „webhook".
  if (/webhook/i.test(plik) && /constructEvent|timingSafeEqual|verifySvix|createHmac/.test(tresc)) {
    return { chroniony: true, skad: 'weryfikacja podpisu nadawcy' };
  }
  return { chroniony: false, skad: '' };
}

function znajdzWywolujacych(nazwaFunkcji: string, wlasnyPlik: string): Wywolujacy[] {
  if (!nazwaFunkcji || nazwaFunkcji === '(najwyższy poziom)') return [];
  const re = new RegExp(`\\b${nazwaFunkcji}\\s*\\(`);
  const out: Wywolujacy[] = [];
  for (const [plik, tresc] of TRESCI) {
    if (plik === wlasnyPlik) continue;
    if (!re.test(tresc)) continue;
    const o = ochronaPliku(plik, tresc);
    out.push({ plik, zeStraznikiem: o.chroniony, skad: o.skad });
  }
  return out;
}

for (const z of zapytania) {
  if (z.ryzyko === 'ok' || z.ryzyko === 'krytyczne') continue;
  if (!['argument funkcji', 'ładunek zdarzenia', 'nieustalone'].includes(z.zrodlo)) continue;

  const wywolujacy = znajdzWywolujacych(z.funkcja, z.plik);
  if (wywolujacy.length === 0) {
    z.powod += ' **Nie znaleziono wywołujących poza własnym plikiem** — funkcja lokalna albo punkt wejścia.';
    continue;
  }
  const bezStraznika = wywolujacy.filter((w) => !w.zeStraznikiem);
  if (bezStraznika.length === 0) {
    // Wszyscy wywołujący mają strażnika — ryzyko schodzi o stopień.
    z.ryzyko = z.ryzyko === 'wysokie' ? 'średnie' : 'ok';
    z.powod += ` **Prześledzone:** wołana z ${wywolujacy.length} miejsc i KAŻDE jest chronione (${wywolujacy.map((w) => '`' + w.plik + '` — ' + w.skad).join('; ')}).`;
  } else {
    z.powod += ` **Prześledzone:** wołana z ${wywolujacy.length} miejsc, z czego ${bezStraznika.length} BEZ widocznego strażnika: ${bezStraznika.map((w) => '`' + w.plik + '`').join(', ')}.`;
  }
}

// ═══════════════════════════════════════════════════════════════
// Raport
// ═══════════════════════════════════════════════════════════════

zapytania.sort(
  (a, b) => KOLEJNOSC[a.ryzyko] - KOLEJNOSC[b.ryzyko] || a.plik.localeCompare(b.plik) || a.linia - b.linia,
);
const ile = (r: Ryzyko) => zapytania.filter((z) => z.ryzyko === r).length;
const doCzytania = zapytania.filter((z) => z.ryzyko !== 'ok');

const L: string[] = [];
L.push('# 02 — Zapytania omijające RLS');
L.push('');
L.push('Wygenerowane przez `scripts/security/audit-service-role.ts`. **Nie edytuj ręcznie.**');
L.push('');
L.push(`Data przebiegu: ${new Date().toISOString().slice(0, 10)}`);
L.push('');
L.push('## O czym jest ten plik');
L.push('');
L.push('`createAdminClient()` łączy się rolą `service_role`, dla której Postgres **nie stosuje**');
L.push('polityk RLS. Baza nie chroni tu już niczego — izolacja zależy wyłącznie od kodu.');
L.push('');
L.push('Właściwe pytanie nie brzmi „czy jest filtr", tylko **skąd pochodzi jego wartość**.');
L.push('Filtr wypełniony identyfikatorem z ciasteczka wygląda identycznie jak bezpieczny.');
L.push('');
L.push('## Podsumowanie');
L.push('');
L.push(`Zapytań przez klienta omijającego RLS: **${zapytania.length}**`);
L.push('');
L.push('| Ryzyko | Ile |');
L.push('|---|---|');
for (const r of ['krytyczne', 'wysokie', 'średnie', 'do-przejrzenia', 'ok'] as Ryzyko[]) {
  L.push(`| ${ETYKIETA[r]} | ${ile(r)} |`);
}
L.push('');
L.push('| Rodzaj filtra | Ile | Znaczenie |');
L.push('|---|---|---|');
const opisFiltra: Record<RodzajFiltra, string> = {
  najemca: 'filtruje po kolumnie izolacji — właściwy wzorzec',
  klucz: 'filtruje po kluczu głównym — bezpieczne, jeśli klucz pochodzi z zapytania już ograniczonego',
  'użytkownik': 'filtruje po `user_id`',
  token: 'wyszukanie po tokenie — to jest autoryzacja',
  inny: 'filtruje po czymś innym',
  brak: 'brak jakiegokolwiek filtra',
};
for (const f of ['brak', 'najemca', 'klucz', 'użytkownik', 'token', 'inny'] as RodzajFiltra[]) {
  L.push(`| ${f} | ${zapytania.filter((z) => z.rodzajFiltra === f).length} | ${opisFiltra[f]} |`);
}
L.push('');
L.push('## Do przeczytania ręcznie');
L.push('');
if (doCzytania.length === 0) {
  L.push('_Brak._');
} else {
  L.push('| Ryzyko | Miejsce | Tabela | Op. | Filtr | Źródło | Na czym polega |');
  L.push('|---|---|---|---|---|---|---|');
  for (const z of doCzytania) {
    L.push(
      `| ${ETYKIETA[z.ryzyko]} | \`${z.plik}:${z.linia}\`<br>\`${z.funkcja}()\` | \`${z.tabela}\` | ${z.operacja} | ${z.rodzajFiltra}${z.filtry.length ? ' (' + z.filtry.join(', ') + ')' : ''} | ${z.zrodlo} | ${z.powod} |`,
    );
  }
}
L.push('');
L.push('## Uznane za w porządku');
L.push('');
L.push('| Miejsce | Tabela | Op. | Dlaczego |');
L.push('|---|---|---|---|');
for (const z of zapytania.filter((x) => x.ryzyko === 'ok')) {
  L.push(`| \`${z.plik}:${z.linia}\` | \`${z.tabela}\` | ${z.operacja} | ${z.powod} |`);
}
L.push('');
L.push('## Czego ten skrypt NIE ustali');
L.push('');
L.push('1. **Nie wykonuje kodu** — nie wie, którą gałęzią `if` pójdzie wykonanie.');
L.push('2. **Nie śledzi wywołań między plikami.** Funkcja w `lib/` biorąca `tenantId`');
L.push('   jako argument jest bezpieczna albo nie — zależnie od każdego ze swoich');
L.push('   wywołujących. Kategoria „argument funkcji" to wskazanie miejsca do');
L.push('   prześledzenia, nie ocena.');
L.push('3. **Nie rozumie przypisań pośrednich** (`const t = ctx.tenantId`).');
L.push('4. **Kolumny czyta z plików migracji**, nie z produkcji. Jeśli produkcja');
L.push('   rozjechała się z repozytorium (SEC-C-01), rozjedzie się i ta analiza.');

mkdirSync(join(ROOT, 'docs/security/audyt'), { recursive: true });
writeFileSync(join(ROOT, OUT_MD), L.join('\n') + '\n', 'utf8');
writeFileSync(join(ROOT, OUT_JSON), JSON.stringify(zapytania, null, 2), 'utf8');

console.log(`Zapytań omijających RLS: ${zapytania.length}`);
for (const r of ['krytyczne', 'wysokie', 'średnie', 'do-przejrzenia', 'ok'] as Ryzyko[]) {
  console.log(`  ${r.padEnd(16)} ${ile(r)}`);
}
console.log(`→ ${OUT_MD}`);
