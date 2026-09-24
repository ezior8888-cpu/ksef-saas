/**
 * Czy sekret trafił do przeglądarki — krok 1.4 audytu bezpieczeństwa.
 *
 * PO CO: to jedyny test w całym audycie, który odpowiada wprost, bez
 * wnioskowania. Nie „czy kod wygląda, jakby mógł wynieść sekret", tylko
 * „czy wartość klucza serwerowego znajduje się w pliku, który przeglądarka
 * pobiera z naszego serwera". Bierzemy PRAWDZIWE wartości ze zmiennych
 * środowiskowych i szukamy ich dosłownie w zbudowanym pakiecie klienta.
 *
 * ─── ZASADA, KTÓRA NIE MA WYJĄTKÓW ─────────────────────────────────
 * NIGDZIE nie wypisujemy wartości sekretu. Ani na ekran, ani do pliku
 * wynikowego. Raport mówi „zmienna X występuje w pliku Y" — i tyle.
 * Pliki wynikowe idą do repozytorium i czyta je druga sesja agenta.
 * ───────────────────────────────────────────────────────────────────
 *
 * DLACZEGO NIE KOPIUJEMY `.env.local` DO WORKTREE: druga kopia wszystkich
 * sekretów na dysku to trwały koszt za jednorazowy test. Skrypt czyta plik
 * tam, gdzie leży, i podaje wartości procesowi budowania przez środowisko
 * procesu potomnego. Na dysku nie powstaje nic nowego.
 *
 * SAMOKONTROLA: przed szukaniem sekretów skrypt sprawdza, czy w pakiecie
 * znajduje wartości zmiennych `NEXT_PUBLIC_*`. One TAM BYĆ MUSZĄ — taki
 * jest ich sens. Jeżeli ich nie ma, to znaczy, że szukamy w złym miejscu
 * albo build poszedł bez zmiennych, i wtedy „nie znaleziono sekretów"
 * jest wynikiem pustym, nie dobrym. Bez tej kontroli test potrafi
 * przechodzić na zielono, nie sprawdzając niczego.
 *
 * TYLKO ODCZYT (poza katalogiem `.next`, który i tak jest wynikiem builda).
 *
 * Uruchomienie:
 *   node scripts/security/audit-client-bundle.ts --env=C:/dev/ksef-saas/.env.local
 *   node scripts/security/audit-client-bundle.ts --env=... --scan-only
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findBundleMatchLocation, formatBundleReportCode } from './bundle-report-metadata.mjs';

const ROOT = process.cwd();
const OUT_MD = 'docs/security/audyt/04-bundle.md';

const args = process.argv.slice(2);
const envArg = args.find((a) => a.startsWith('--env='))?.slice('--env='.length);
const scanOnly = args.includes('--scan-only');

if (!envArg) {
  console.error('Podaj --env=<ścieżka do pliku .env>. Plik NIE jest kopiowany ani modyfikowany.');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// Wczytanie zmiennych
// ═══════════════════════════════════════════════════════════════

/**
 * Minimalny parser `.env`. Świadomie bez biblioteki: chcemy dokładnie
 * wiedzieć, co się dzieje z sekretami, a `dotenv` przy okazji wpisuje je
 * do `process.env` całego procesu, czego tu nie chcemy.
 */
function parseEnv(path: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim().replace(/^export\s+/, '');
    let val = t.slice(eq + 1).trim();
    // zdejmujemy cudzysłowy, jeśli otaczają całą wartość
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length > 1) ||
      (val.startsWith("'") && val.endsWith("'") && val.length > 1)
    ) {
      val = val.slice(1, -1);
    }
    if (key) out.set(key, val);
  }
  return out;
}

const env = parseEnv(envArg);
console.log(`Wczytano ${env.size} zmiennych. Raport pomija wartości i treść pakietu.`);

// ═══════════════════════════════════════════════════════════════
// Które wartości w ogóle nadają się do szukania
// ═══════════════════════════════════════════════════════════════

/**
 * Wartości bezużyteczne jako igła w stogu siana: krótkie, słownikowe,
 * logiczne. Szukanie `true` albo `production` w pakiecie JS da tysiące
 * trafień i zero informacji.
 */
const NIEPRZYDATNE = new Set([
  'true', 'false', 'test', 'production', 'development', 'local', 'localhost',
  '1', '0', 'yes', 'no', 'on', 'off', 'null', 'undefined', 'pl', 'PL', 'eu',
]);

function nadajeSieDoSzukania(val: string): boolean {
  if (val.length < 12) return false;
  if (NIEPRZYDATNE.has(val.toLowerCase())) return false;
  // Adresy URL bez ścieżki bywają publiczne i występują w pakiecie legalnie
  // — ale i tak je sprawdzamy, tylko raportujemy łagodniej (patrz `wagaDla`).
  return true;
}

/** Zmienna publiczna z definicji — Next.js wstawia ją do pakietu celowo. */
function jestPubliczna(key: string): boolean {
  return key.startsWith('NEXT_PUBLIC_');
}

/**
 * Zmienne, które NIE SĄ sekretami mimo braku przedrostka `NEXT_PUBLIC_`.
 *
 * Pierwszy przebieg zgłosił trzy takie trafienia i wszystkie okazały się
 * nieszkodliwe. Lista poniżej rozdziela je od sekretów. Raport zawiera
 * wyłącznie lokalizacje: otoczenie trafienia mogłoby ujawnić inny sekret,
 * więc nigdy nie kopiujemy fragmentów pakietu do raportu.
 *
 * `SENTRY_DSN` jest tu celowo: adres DSN z założenia trafia do przeglądarki,
 * bo bez niego klient nie wyśle raportu o błędzie. Pozwala obcemu wysyłać
 * fałszywe zdarzenia do naszego projektu (zużycie limitu, szum) i to jest
 * znany, przyjęty koszt — nie znalezisko.
 */
const NIE_SEKRETY = new Set([
  'SENTRY_DSN',
  'AWS_REGION',
  'VAPID_SUBJECT',
  'KSEF_ENV',
  'KSEF_TEST_URL',
  'KSEF_DEMO_URL',
  'KSEF_PROD_URL',
  'AWS_ARCHIVE_BUCKET',
  'NODE_ENV',
]);

/**
 * Waga trafienia. Nie każde jest równie groźne — i mieszanie ich w jedną
 * listę sprawia, że raport przestaje się czytać.
 */
function wagaDla(key: string, val: string): 'krytyczna' | 'wysoka' | 'do-oceny' | 'nie-sekret' {
  if (NIE_SEKRETY.has(key)) return 'nie-sekret';
  if (/SERVICE_ROLE|SECRET|PRIVATE|_KEY$|PASSWORD|TOKEN|CREDENTIALS|DATABASE_URL/i.test(key)) {
    return 'krytyczna';
  }
  // Adres bez poświadczeń rzadko jest sekretem, ale wyciek adresu bazy
  // albo panelu wewnętrznego to już rozpoznanie dla atakującego.
  if (/^https?:\/\//.test(val)) return 'do-oceny';
  return 'wysoka';
}

// ═══════════════════════════════════════════════════════════════
// Budowanie
// ═══════════════════════════════════════════════════════════════

if (!scanOnly) {
  console.log('Buduję pakiet produkcyjny. To potrwa kilka minut...');
  // Zmienne trafiają WYŁĄCZNIE do środowiska procesu potomnego.
  // Nie zapisujemy ich do `process.env` tego procesu ani na dysk.
  const r = spawnSync('pnpm', ['build'], {
    cwd: ROOT,
    env: { ...process.env, ...Object.fromEntries(env) },
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`\nBuild zakończył się kodem ${r.status}. Skan przerwany.`);
    console.error('Bez udanego builda wynik „nie znaleziono sekretów" nic nie znaczy.');
    process.exit(r.status ?? 1);
  }
}

// ═══════════════════════════════════════════════════════════════
// Zbieranie plików widocznych dla przeglądarki
// ═══════════════════════════════════════════════════════════════

/**
 * Co przeglądarka naprawdę pobiera:
 *   `.next/static/**`  — pakiety JS, CSS, mapy źródeł
 *   `public/**`        — pliki serwowane dosłownie
 *
 * Czego NIE liczymy: `.next/server/**`. To kod serwera i sekrety mają
 * pełne prawo tam być — właśnie po to jest ten podział.
 */
function zbierz(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) zbierz(full, out);
    else out.push(full);
  }
  return out;
}

const SKANOWANE_ROZSZERZENIA = new Set(['.js', '.mjs', '.cjs', '.css', '.map', '.json', '.txt', '.html']);

const pliki = [
  ...zbierz(join(ROOT, '.next', 'static')),
  ...zbierz(join(ROOT, 'public')),
].filter((f) => SKANOWANE_ROZSZERZENIA.has(extname(f)));

if (pliki.length === 0) {
  console.error('Nie znaleziono plików w `.next/static`. Czy build się wykonał?');
  process.exit(1);
}

console.log(`Przeszukuję ${pliki.length} plików widocznych dla przeglądarki...`);

// ═══════════════════════════════════════════════════════════════
// Szukanie
// ═══════════════════════════════════════════════════════════════

interface Trafienie {
  zmienna: string;
  publiczna: boolean;
  waga: string;
  /** Maksymalnie 10 lokalizacji; bez wartości ani otoczenia trafienia. */
  pliki: Array<{ file: string; offset: number }>;
}

const trafienia = new Map<string, Trafienie>();
const doSzukania = [...env.entries()].filter(([, v]) => nadajeSieDoSzukania(v));

for (const f of pliki) {
  let tresc: string;
  try {
    tresc = readFileSync(f, 'utf8');
  } catch {
    continue; // plik binarny — pomijamy
  }
  for (const [key, val] of doSzukania) {
    const rel = relative(ROOT, f).split('\\').join('/');
    const lokalizacja = findBundleMatchLocation(tresc, val, rel);
    if (!lokalizacja) continue;
    const istn = trafienia.get(key);
    if (istn) {
      if (istn.pliki.length < 10 && !istn.pliki.some((p) => p.file === rel)) istn.pliki.push(lokalizacja);
    } else {
      trafienia.set(key, {
        zmienna: key,
        publiczna: jestPubliczna(key),
        waga: jestPubliczna(key) ? 'oczekiwane' : wagaDla(key, val),
        pliki: [lokalizacja],
      });
    }
  }
}

const publiczneZnalezione = [...trafienia.values()].filter((t) => t.publiczna);
const sekretyZnalezione = [...trafienia.values()].filter(
  (t) => !t.publiczna && t.waga !== 'nie-sekret',
);
const nieSekretyZnalezione = [...trafienia.values()].filter((t) => t.waga === 'nie-sekret');

// ═══════════════════════════════════════════════════════════════
// Mapy źródeł — osobna kategoria
// ═══════════════════════════════════════════════════════════════

const mapy = pliki
  .filter((f) => extname(f) === '.map')
  .map((f) => relative(ROOT, f).split('\\').join('/'));

// ═══════════════════════════════════════════════════════════════
// Raport
// ═══════════════════════════════════════════════════════════════

const L: string[] = [];
L.push('# 04 — Sekrety w pakiecie przeglądarki');
L.push('');
L.push('Wygenerowane przez `scripts/security/audit-client-bundle.ts`. **Nie edytuj ręcznie.**');
L.push('');
L.push('> Raport pomija wartości sekretów i całe otoczenie trafień. Zapisuje nazwy zmiennych,');
L.push('> ścieżki plików i offset pierwszego wystąpienia (indeks UTF-16 liczony od zera).');
L.push('> Treści pakietu nie są kopiowane do raportu ani podsumowania na ekranie.');
L.push('');
L.push(`Data przebiegu: ${new Date().toISOString().slice(0, 10)}`);
L.push('');
L.push('## Samokontrola — czy ten test w ogóle działał');
L.push('');
L.push(`Zmiennych wczytanych z pliku: **${env.size}**`);
L.push(`Wartości nadających się do szukania (min. 12 znaków, nie słownikowe): **${doSzukania.length}**`);
L.push(`Plików przeszukanych (\`.next/static\` + \`public\`): **${pliki.length}**`);
L.push('');
if (publiczneZnalezione.length === 0) {
  L.push('🔴 **TEST NIEWIARYGODNY.** W pakiecie nie znaleziono ANI JEDNEJ wartości zmiennej');
  L.push('`NEXT_PUBLIC_*`, a te muszą tam być — na tym polega ich działanie. Znaczy to, że');
  L.push('build poszedł bez zmiennych albo skanujemy nie te pliki. Wynik „brak sekretów"');
  L.push('poniżej jest **pusty, nie dobry** — nie wolno go traktować jako potwierdzenia.');
} else {
  L.push(`✅ Test wiarygodny: znaleziono w pakiecie **${publiczneZnalezione.length}** zmiennych`);
  L.push('`NEXT_PUBLIC_*`, czyli wyszukiwanie działa i patrzy we właściwe pliki.');
  L.push('');
  L.push('Znalezione zmienne publiczne (obecność oczekiwana): ' +
    publiczneZnalezione.map((t) => formatBundleReportCode(t.zmienna)).join(', '));
}
L.push('');
L.push('## Wynik');
L.push('');
if (sekretyZnalezione.length === 0) {
  L.push('**Żadna zmienna serwerowa nie została znaleziona w plikach pobieranych przez przeglądarkę.**');
} else {
  L.push(`🔴 **Znaleziono ${sekretyZnalezione.length} zmiennych serwerowych w pakiecie klienta.**`);
  L.push('');
  L.push('| Waga | Zmienna | Plik(i) i offset |');
  L.push('|---|---|---|');
  for (const t of sekretyZnalezione.sort((a, b) => a.waga.localeCompare(b.waga))) {
    L.push(
      `| ${t.waga} | ${formatBundleReportCode(t.zmienna)} | ${t.pliki.map((p) => formatBundleReportCode(p.file) + ' @ ' + p.offset).join('<br>')} |`,
    );
  }
  L.push('');
  L.push('**Postępowanie przy wadze „krytyczna": klucz należy uznać za ujawniony i wymienić.**');
  L.push('Usunięcie go z kodu nie wystarczy — pakiet był serwowany publicznie, więc trzeba');
  L.push('założyć, że ktoś go pobrał. Procedura: `docs/runbooks/key-rotation.md`.');
}
L.push('');
L.push('## Zmienne bez przedrostka `NEXT_PUBLIC_`, które sekretami nie są');
L.push('');
L.push('Trafienia na liście `NIE_SEKRETY` w skrypcie. Pokazujemy je, bo *obecność* jest');
L.push('faktem, ale nie jest dowodem wycieku sekretu. Lokalizacja pozwala na ręczną');
L.push('weryfikację pochodzenia trafienia bez kopiowania zawartości pakietu do raportu.');
L.push('');
if (nieSekretyZnalezione.length === 0) {
  L.push('_Brak._');
} else {
  L.push('| Zmienna | Plik | Offset |');
  L.push('|---|---|---|');
  for (const t of nieSekretyZnalezione) {
    L.push(`| ${formatBundleReportCode(t.zmienna)} | ${formatBundleReportCode(t.pliki[0].file)} | ${t.pliki[0].offset} |`);
  }
}
L.push('');
L.push('## Mapy źródeł');
L.push('');
if (mapy.length === 0) {
  L.push('Brak plików `.map` w katalogach publicznych.');
} else {
  L.push(`Znaleziono **${mapy.length}** plików \`.map\`. Mapa źródeł odtwarza oryginalny kod`);
  L.push('wraz z komentarzami i nazwami zmiennych. Sama w sobie nie jest sekretem, ale');
  L.push('daje atakującemu czytelny kod zamiast zminifikowanego.');
  L.push('');
  L.push('**Pytanie do dnia 5:** czy te pliki są dostępne publicznie na produkcji.');
  L.push('Obecność w lokalnym buildzie tego nie przesądza — sprawdza to `audit-headers.ts`.');
  L.push('');
  for (const m of mapy.slice(0, 20)) L.push('- ' + formatBundleReportCode(m));
  if (mapy.length > 20) L.push(`- _...i ${mapy.length - 20} więcej_`);
}
L.push('');
L.push('## Czego ten test NIE sprawdza');
L.push('');
L.push('- **Sekretów, których nie ma w podanym pliku `.env`.** Szukamy wartości, które');
L.push('  znamy. Klucz wpisany na sztywno w kodzie źródłowym wykryje `audit-secrets.ts`.');
L.push('- **Wartości krótszych niż 12 znaków** i słownikowych — dają za dużo fałszywych trafień.');
L.push('- **Danych osobowych w pakiecie.** To osobna kategoria, krok 1.7.');
L.push('- **Tego, co pakiet POBIERA w czasie działania.** Sekret może nie być wbudowany,');
L.push('  a mimo to trafić do przeglądarki przez odpowiedź API. To dzień 2 i 5.');

mkdirSync(join(ROOT, 'docs/security/audyt'), { recursive: true });
writeFileSync(join(ROOT, OUT_MD), L.join('\n') + '\n', 'utf8');

console.log('');
console.log(`Zmienne publiczne znalezione w pakiecie: ${publiczneZnalezione.length} (test ${publiczneZnalezione.length ? 'wiarygodny' : 'NIEWIARYGODNY'})`);
console.log(`Zmienne serwerowe znalezione w pakiecie: ${sekretyZnalezione.length}`);
for (const t of sekretyZnalezione) console.log(`  [${t.waga}] ${JSON.stringify(t.zmienna)} → ${JSON.stringify(t.pliki[0].file)} @ ${t.pliki[0].offset}`);
console.log(`Znane nie-sekrety w pakiecie: ${nieSekretyZnalezione.length} (${nieSekretyZnalezione.map((t) => JSON.stringify(t.zmienna)).join(', ') || '—'})`);
console.log(`Mapy źródeł: ${mapy.length}`);
console.log(`→ ${OUT_MD}`);
