/**
 * Sekrety w kodzie i w historii — kroki 1.1 i 1.2 audytu bezpieczeństwa.
 *
 * PO CO: `.gitignore` w tym repo wygląda porządnie i `.env.local` jest w nim
 * wymieniony. Ale `.gitignore` chroni tylko przed przyszłością — plik dodany
 * do repozytorium ZANIM trafił do `.gitignore` zostaje w historii na zawsze.
 * Tak samo klucz wklejony do kodu „na chwilę" i usunięty następnym commitem:
 * z bieżącego drzewa znika, z historii nie. Każdy, kto ma dostęp do repo,
 * odczyta go jedną komendą.
 *
 * Dlatego ten skrypt przeszukuje DWA miejsca:
 *   1. drzewo robocze (pliki śledzone przez gita),
 *   2. pełną historię wszystkich gałęzi (`git log --all -p`).
 *
 * ─── ZASADA, KTÓRA NIE MA WYJĄTKÓW ─────────────────────────────────
 * NIGDY nie wypisujemy znalezionej wartości. Ani na ekran, ani do pliku.
 * Raport podaje rodzaj sekretu, miejsce i podgląd zamaskowany do trzech
 * pierwszych znaków plus długość. Wypisanie sekretu do pliku, który trafia
 * do repozytorium, byłoby powtórzeniem dokładnie tego błędu, który tropimy.
 * ───────────────────────────────────────────────────────────────────
 *
 * TYLKO ODCZYT.
 *
 * Uruchomienie:
 *   node scripts/security/audit-secrets.ts            (drzewo + historia)
 *   node scripts/security/audit-secrets.ts --tree     (samo drzewo, szybciej)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Wywołanie gita BEZ pośrednictwa powłoki.
 *
 * Na Windowsie `execSync` idzie przez `cmd.exe`, a ten zjada znaki `|`, `%`,
 * `<` i `>`. Format `--format=@@AUDYT@@%H|%ad|%s` rozpadał się na potok
 * i kończył błędem „'%ad' is not recognized as an internal command".
 * Przekazanie argumentów tablicą omija powłokę i problem znika — przy okazji
 * odpada cała klasa błędów z cytowaniem ścieżek ze spacjami.
 */
function git(args: string[], maxBuffer = 512 * 1024 * 1024): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer });
}

const ROOT = process.cwd();
const OUT_MD = 'docs/security/audyt/03-sekrety.md';
const tylkoDrzewo = process.argv.includes('--tree');

// ═══════════════════════════════════════════════════════════════
// Wzorce
// ═══════════════════════════════════════════════════════════════

interface Wzorzec {
  nazwa: string;
  re: RegExp;
  waga: 'krytyczna' | 'wysoka' | 'średnia';
  /** Co zrobić, jeśli to wypłynie. Trafia wprost do raportu. */
  skutek: string;
}

/**
 * Prefiksy dostawców są najlepszymi wzorcami, jakie mamy: prawie nie dają
 * fałszywych trafień, bo nikt nie pisze `sk-ant-` w innym celu. Wzorce
 * ogólne (wysoka entropia) idą na końcu i mają niższą wagę, bo szumią.
 */
const WZORCE: Wzorzec[] = [
  {
    nazwa: 'Klucz API Anthropic',
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    waga: 'krytyczna',
    skutek: 'Obcy rachunek za model i dostęp do promptów. Unieważnić w konsoli Anthropic.',
  },
  {
    nazwa: 'Klucz Stripe (live/test)',
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g,
    waga: 'krytyczna',
    skutek: 'Dostęp do płatności i danych klientów. Unieważnić w panelu Stripe.',
  },
  {
    nazwa: 'Sekret webhooka Stripe',
    re: /\bwhsec_[A-Za-z0-9]{20,}/g,
    waga: 'krytyczna',
    skutek: 'Podszycie się pod Stripe i wstrzyknięcie fałszywych zdarzeń płatności.',
  },
  {
    nazwa: 'Klucz Resend',
    re: /\bre_[A-Za-z0-9]{20,}/g,
    waga: 'wysoka',
    skutek: 'Wysyłka poczty z naszej domeny. Phishing na naszych klientów.',
  },
  {
    nazwa: 'Klucz dostępu AWS / R2',
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    waga: 'krytyczna',
    skutek: 'Dostęp do magazynu XML-i faktur. Unieważnić natychmiast.',
  },
  {
    nazwa: 'Token JWT (możliwy klucz Supabase)',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    waga: 'krytyczna',
    skutek:
      'Jeśli to `service_role`, daje pełny dostęp do bazy z pominięciem RLS — ' +
      'czyli do danych wszystkich klientów naraz. Rozróżnienie: zdekodować ' +
      'środkową część i sprawdzić pole `role`. NIE wklejaj tokenu do raportu.',
  },
  {
    nazwa: 'Klucz prywatny (PEM)',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    waga: 'krytyczna',
    skutek: 'Zależnie od klucza: dostęp SSH do serwerów albo podpisywanie w KSeF.',
  },
  {
    nazwa: 'Adres bazy z hasłem',
    re: /\b(?:postgres|postgresql|mysql|mongodb)(?:\+srv)?:\/\/[^\s:@/'"]+:[^\s:@/'"]{6,}@/g,
    waga: 'krytyczna',
    skutek: 'Bezpośrednie połączenie z bazą, z pominięciem aplikacji i RLS.',
  },
  {
    // Klucze Turnstile mają kształt `0x4AAAAAAA…` i długość ok. 35 znaków.
    // Pierwsza wersja wzorca brzmiała `0x[A-Za-z0-9_-]{30,}` i złapała trzy
    // fragmenty base64 z osadzonego obrazka w `public/favicon/favicon.svg`.
    // Przypięcie do `0x4` i ograniczenie długości z góry zamyka temat.
    nazwa: 'Sekret Cloudflare Turnstile',
    re: /\b0x4[A-Za-z0-9_-]{28,44}\b/g,
    waga: 'wysoka',
    skutek: 'Obejście ochrony przed botami na logowaniu i rejestracji.',
  },
  {
    nazwa: 'Przypisanie o wysokiej entropii',
    re: /\b(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY|CREDENTIALS?|ENCRYPTION_KEY)\w*\s*[:=]\s*['"`]([A-Za-z0-9+/=_-]{24,})['"`]/gi,
    waga: 'średnia',
    skutek: 'Do oceny ręcznej — wzorzec ogólny, łapie też atrapy i przykłady.',
  },
];

/**
 * Wartości, które WYGLĄDAJĄ jak sekret, ale nim nie są. Bez tej listy raport
 * tonie w atrapach z `.env.example`, testów i dokumentacji — a raport,
 * którego nikt nie doczyta, nie chroni przed niczym.
 */
const ATRAPY =
  // `\[[^\]]{1,20}\]` łapie podstawienia w nawiasach kwadratowych — `[ref]`,
  // `[HASŁO]`, `[TWÓJ-KLUCZ]`. Bez tego skrypt zgłaszał jako ustalenie
  // krytyczne komunikat pomocy w `scripts/supabase-push-production.mjs`,
  // który POKAZUJE użytkownikowi, jak zbudować adres bazy.
  /(?:your[-_]?|my[-_]?|test[-_]?|example|placeholder|changeme|dummy|sample|fake|xxx+|<[^>]+>|\[[^\]]{1,20}\]|\.\.\.|zmien[-_]?to|tutaj|wstaw|redacted|\*{4,}|0{10,}|1234567890)/i;

/** Ścieżki, których nie skanujemy — same fałszywe trafienia. */
const POMIJANE =
  /(?:^|\/)(?:node_modules|\.next|dist|build|coverage|playwright-report|test-results)\//;

/** Pliki, w których atrapy są NORMALNE i oczekiwane. */
const PLIKI_Z_ATRAPAMI = /(?:\.env\.example|\.md$|\.mdx$|fixtures?\.|mock|stub|\.test\.|\.spec\.)/i;

// ═══════════════════════════════════════════════════════════════
// Maskowanie — jedyny sposób, w jaki sekret opuszcza ten skrypt
// ═══════════════════════════════════════════════════════════════

function zamaskuj(s: string): string {
  const czysty = s.replace(/\s+/g, '');
  if (czysty.length <= 6) return '***';
  return `${czysty.slice(0, 3)}…[${czysty.length} znaków]`;
}

// ═══════════════════════════════════════════════════════════════
// Zbieranie trafień
// ═══════════════════════════════════════════════════════════════

interface Trafienie {
  wzorzec: string;
  waga: string;
  gdzie: string;
  podglad: string;
  atrapa: boolean;
}

function przeszukaj(tekst: string, gdzie: string, wPlikuZAtrapami: boolean, out: Trafienie[]): void {
  for (const w of WZORCE) {
    w.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = w.re.exec(tekst)) !== null) {
      const trafione = m[1] ?? m[0];
      // Kontekst: 60 znaków wokół trafienia — do rozpoznania atrapy.
      const kontekst = tekst.slice(Math.max(0, m.index - 60), m.index + trafione.length + 20);
      const atrapa = ATRAPY.test(kontekst) || ATRAPY.test(trafione) || wPlikuZAtrapami;
      out.push({
        wzorzec: w.nazwa,
        waga: w.waga,
        gdzie,
        podglad: zamaskuj(trafione),
        atrapa,
      });
    }
  }
}

// ─── Faza A: drzewo robocze ────────────────────────────────────

console.log('Faza A — pliki śledzone przez gita...');
const pliki = git(['ls-files'], 64 * 1024 * 1024)
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s && !POMIJANE.test(s));

const wDrzewie: Trafienie[] = [];
for (const f of pliki) {
  const abs = join(ROOT, f);
  if (!existsSync(abs)) continue;
  let tresc: string;
  try {
    // Czytamy jako bajty, żeby odsiać pliki binarne PRZED dekodowaniem.
    // Bajt zerowy to wystarczająco pewny znacznik — pliki tekstowe go nie
    // zawierają. Sprawdzamy go na buforze, nie na napisie, bo literał bajtu
    // zerowego w kodzie źródłowym sprawia, że git uznaje TEN plik za binarny
    // i przestaje pokazywać jego zmiany.
    const bajty = readFileSync(abs);
    if (bajty.includes(0)) continue;
    tresc = bajty.toString('utf8');
  } catch {
    continue;
  }
  przeszukaj(tresc, f, PLIKI_Z_ATRAPAMI.test(f), wDrzewie);
}
console.log(`  przeszukano ${pliki.length} plików, trafień: ${wDrzewie.length}`);

// ─── Faza B: historia ──────────────────────────────────────────

const wHistorii: Trafienie[] = [];
if (!tylkoDrzewo) {
  console.log('Faza B — pełna historia wszystkich gałęzi...');
  const diff = git([
    'log', '--all', '-p', '-U0', '--no-color',
    '--format=@@AUDYT@@%H|%ad|%s',
  ]);

  let commit = '(nieznany)';
  let data = '';
  let plik = '';
  for (const linia of diff.split('\n')) {
    if (linia.startsWith('@@AUDYT@@')) {
      const [h, d] = linia.slice('@@AUDYT@@'.length).split('|');
      commit = (h ?? '').slice(0, 8);
      data = (d ?? '').slice(0, 16);
      continue;
    }
    if (linia.startsWith('+++ b/')) {
      plik = linia.slice(6);
      continue;
    }
    // Interesują nas WYŁĄCZNIE linie DODANE. Linia usunięta i tak jest
    // w historii, ale trafienie zgłosimy przy commicie, który ją dodał —
    // inaczej ten sam sekret pojawia się w raporcie dwa razy.
    if (!linia.startsWith('+') || linia.startsWith('+++')) continue;
    if (POMIJANE.test(plik)) continue;
    przeszukaj(
      linia.slice(1),
      `${plik} @ ${commit} (${data})`,
      PLIKI_Z_ATRAPAMI.test(plik),
      wHistorii,
    );
  }
  console.log(`  trafień w historii: ${wHistorii.length}`);
}

// ─── Faza C: pliki .env kiedykolwiek dodane do repo ────────────

console.log('Faza C — czy jakikolwiek plik `.env` trafił kiedyś do repozytorium...');
const envWHistorii = git([
  'log', '--all', '--diff-filter=A', '--name-only', '--format=',
  '--', '*.env', '*.env.*', '.env*',
], 32 * 1024 * 1024)
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const envUnikalne = [...new Set(envWHistorii)];

// ═══════════════════════════════════════════════════════════════
// Raport
// ═══════════════════════════════════════════════════════════════

const prawdziweDrzewo = wDrzewie.filter((t) => !t.atrapa);
const prawdziweHistoria = wHistorii.filter((t) => !t.atrapa);

/** Zwijamy powtórki — ten sam sekret w wielu commitach to jedno ustalenie. */
function zwin(lista: Trafienie[]): Map<string, { t: Trafienie; ile: number; miejsca: string[] }> {
  const m = new Map<string, { t: Trafienie; ile: number; miejsca: string[] }>();
  for (const t of lista) {
    const klucz = t.wzorzec + '|' + t.podglad;
    const istn = m.get(klucz);
    if (istn) {
      istn.ile++;
      if (istn.miejsca.length < 8 && !istn.miejsca.includes(t.gdzie)) istn.miejsca.push(t.gdzie);
    } else {
      m.set(klucz, { t, ile: 1, miejsca: [t.gdzie] });
    }
  }
  return m;
}

const L: string[] = [];
L.push('# 03 — Sekrety w kodzie i w historii');
L.push('');
L.push('Wygenerowane przez `scripts/security/audit-secrets.ts`. **Nie edytuj ręcznie.**');
L.push('');
L.push('> **Ten plik NIE ZAWIERA żadnych sekretów.** Każde trafienie jest zamaskowane');
L.push('> do trzech pierwszych znaków i długości. Żeby zobaczyć wartość, trzeba wejść');
L.push('> we wskazane miejsce w repozytorium — i to jest zamierzone.');
L.push('');
L.push(`Data przebiegu: ${new Date().toISOString().slice(0, 10)}`);
L.push(`Przeszukano: ${pliki.length} plików w drzewie` + (tylkoDrzewo ? ' (historia pominięta — `--tree`)' : `, ${git(['rev-list', '--all', '--count']).trim()} commitów w historii`));
L.push('');
L.push('## Podsumowanie');
L.push('');
L.push('| Gdzie | Trafień prawdziwych | Rozpoznanych jako atrapy |');
L.push('|---|---|---|');
L.push(`| Drzewo robocze | **${prawdziweDrzewo.length}** | ${wDrzewie.length - prawdziweDrzewo.length} |`);
L.push(`| Historia gita | **${prawdziweHistoria.length}** | ${wHistorii.length - prawdziweHistoria.length} |`);
L.push('');

L.push('## Pliki `.env` dodane kiedykolwiek do repozytorium');
L.push('');
if (envUnikalne.length === 0) {
  L.push('Żaden plik `.env` nigdy nie został dodany. Czysto.');
} else {
  for (const f of envUnikalne) {
    const bezpieczny = /\.env\.example$/.test(f);
    L.push(`- \`${f}\` — ${bezpieczny ? '✅ wzorzec bez wartości, w porządku' : '🔴 **DO SPRAWDZENIA RĘCZNIE**'}`);
  }
  L.push('');
  L.push('Plik inny niż `.env.example` na tej liście znaczy, że prawdziwe wartości');
  L.push('są w historii — nawet jeśli plik został potem usunięty. Usunięcie commitem');
  L.push('NIE usuwa go z historii; trzeba przyjąć, że sekrety wyciekły, i je wymienić.');
}
L.push('');

for (const [tytul, lista] of [
  ['Drzewo robocze', prawdziweDrzewo],
  ['Historia gita', prawdziweHistoria],
] as [string, Trafienie[]][]) {
  L.push(`## ${tytul}`);
  L.push('');
  if (lista.length === 0) {
    L.push('_Brak trafień poza rozpoznanymi atrapami._');
    L.push('');
    continue;
  }
  L.push('| Waga | Rodzaj | Podgląd (zamaskowany) | Wystąpień | Gdzie |');
  L.push('|---|---|---|---|---|');
  const zwiniete = [...zwin(lista).values()].sort((a, b) => {
    const w = { krytyczna: 0, wysoka: 1, średnia: 2 } as Record<string, number>;
    return (w[a.t.waga] ?? 9) - (w[b.t.waga] ?? 9) || b.ile - a.ile;
  });
  for (const z of zwiniete) {
    L.push(
      `| ${z.t.waga} | ${z.t.wzorzec} | \`${z.t.podglad}\` | ${z.ile} | ${z.miejsca.map((m) => '`' + m + '`').join('<br>')} |`,
    );
  }
  L.push('');
}

L.push('## Trafienia rozpoznane jako atrapy');
L.push('');
L.push('Skrypt uznaje trafienie za atrapę, gdy w otoczeniu jest słowo w rodzaju');
L.push('`example`, `placeholder`, `your-`, `xxx`, albo gdy plik jest wzorcem,');
L.push('dokumentacją, testem lub atrapą danych. **To jest heurystyka** — przy');
L.push('wątpliwości należy zajrzeć do pliku.');
L.push('');
const atrapyRazem = [...wDrzewie, ...wHistorii].filter((t) => t.atrapa);
const atrapyZwin = zwin(atrapyRazem);
L.push(`Zwinięto ${atrapyRazem.length} trafień do ${atrapyZwin.size} pozycji:`);
L.push('');
for (const z of [...atrapyZwin.values()].slice(0, 25)) {
  L.push(`- ${z.t.wzorzec} \`${z.t.podglad}\` ×${z.ile} — np. \`${z.miejsca[0]}\``);
}
L.push('');
L.push('## Czego ten skrypt NIE wykryje');
L.push('');
L.push('- **Sekretu bez rozpoznawalnego kształtu** — hasła w rodzaju `Kot2024!` nie');
L.push('  odróżnimy od zwykłego tekstu. Wzorce łapią klucze dostawców i ciągi');
L.push('  o wysokiej entropii, nie wszystko, co jest tajne.');
L.push('- **Sekretu w pliku binarnym** — obrazy, PDF-y, archiwa są pomijane.');
L.push('- **Sekretu, który nigdy nie był w gicie** — np. wklejonego do panelu Coolify.');
L.push('  Zmienne środowiskowe na produkcji to osobny temat (dzień 5).');
L.push('- **Tego, czy klucz nadal działa.** Znaleziony ≠ ważny. Ale przy braku');
L.push('  pewności zakładamy, że działa.');

mkdirSync(join(ROOT, 'docs/security/audyt'), { recursive: true });
writeFileSync(join(ROOT, OUT_MD), L.join('\n') + '\n', 'utf8');

console.log('');
console.log(`Drzewo: ${prawdziweDrzewo.length} prawdziwych, ${wDrzewie.length - prawdziweDrzewo.length} atrap`);
console.log(`Historia: ${prawdziweHistoria.length} prawdziwych, ${wHistorii.length - prawdziweHistoria.length} atrap`);
console.log(`Pliki .env kiedykolwiek w repo: ${envUnikalne.length ? envUnikalne.join(', ') : 'brak'}`);
console.log(`→ ${OUT_MD}`);
