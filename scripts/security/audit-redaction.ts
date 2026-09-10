/**
 * Lokalny test rozpoznawalnych identyfikatorów w helperze redactForModel.
 * Regexy nie potrafią zagwarantować usunięcia dowolnych nazwisk i opisów.
 * Granica modelu w generateCopy używa osobno zamkniętego słownika FLO_HINTS.
 *
 * Zapisuje wyłącznie raport z fikcyjnych danych testowych; nie łączy usług.
 * Uruchomienie: corepack pnpm exec tsx scripts/security/audit-redaction.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { redactForModel } from '../../lib/flo/redact';

const ROOT = process.cwd();
const OUT_MD = 'docs/security/audyt/06-redakcja.md';

interface Przypadek {
  co: string;
  wejscie: string;
  /** Fragment, który MUSI zniknąć z wyniku. Jeśli został — przeciek. */
  wrazliwe: string;
  allowNip?: boolean;
}

// Przypadki dobrane pod realne dane z polskiej faktury i pod kształty,
// które regex łatwo przepuszcza.
const PRZYPADKI: Przypadek[] = [
  { co: 'NIP ciągiem (10 cyfr)', wejscie: 'Kontrahent NIP 1234567890 zalega', wrazliwe: '1234567890' },
  { co: 'NIP z myślnikami', wejscie: 'Kontrahent NIP 123-456-78-90 zalega', wrazliwe: '123-456-78-90' },
  { co: 'NIP ze spacjami', wejscie: 'NIP 123 456 78 90', wrazliwe: '123 456 78 90' },
  { co: 'NIP z prefiksem PL', wejscie: 'PL1234567890', wrazliwe: '1234567890' },
  { co: 'IBAN polski', wejscie: 'Przelew na PL61109010140000071219812874', wrazliwe: '109010140000071219812874' },
  { co: 'IBAN polski w grupach', wejscie: 'konto PL61 1090 1014 0000 0712 1981 2874', wrazliwe: '1090 1014' },
  { co: 'IBAN niemiecki', wejscie: 'IBAN DE89370400440532013000', wrazliwe: '370400440532013000' },
  { co: 'IBAN brytyjski (litery w środku)', wejscie: 'GB29NWBK60161331926819', wrazliwe: 'NWBK60161331926819' },
  { co: 'e-mail', wejscie: 'napisz do jan.kowalski@firma.pl w sprawie', wrazliwe: 'jan.kowalski@firma.pl' },
  { co: 'telefon +48', wejscie: 'tel +48 500 600 700', wrazliwe: '500 600 700' },
  { co: 'telefon ciągiem', wejscie: 'dzwoń 500600700', wrazliwe: '500600700' },
  { co: 'PESEL', wejscie: 'PESEL 90010112345', wrazliwe: '90010112345' },
  { co: 'kod pocztowy', wejscie: 'wyślij na 00-950 Warszawa', wrazliwe: '00-950' },
  { co: 'adres z ul.', wejscie: 'ul. Marszałkowska 12/34, Warszawa', wrazliwe: 'Marszałkowska 12/34' },
  { co: 'adres bez prefiksu', wejscie: 'Marszałkowska 12/34, 00-950', wrazliwe: 'Marszałkowska 12/34' },
  { co: 'nazwisko osoby fizycznej', wejscie: 'faktura dla Jana Kowalskiego', wrazliwe: 'Jana Kowalskiego' },
  { co: 'numer konta 26 cyfr ciągiem', wejscie: 'konto 61109010140000071219812874', wrazliwe: '61109010140000071219812874' },
];

interface Wynik extends Przypadek {
  po: string;
  przeciek: boolean;
}

const wyniki: Wynik[] = PRZYPADKI.map((p) => {
  const po = redactForModel(p.wejscie, p.allowNip ? { allowNip: true } : {});
  // Przeciek: wrażliwy fragment (bez separatorów też) nadal obecny.
  const poNorm = po.replace(/[\s-]/g, '');
  const wrazNorm = p.wrazliwe.replace(/[\s-]/g, '');
  const przeciek = po.includes(p.wrazliwe) || (wrazNorm.length >= 6 && poNorm.includes(wrazNorm));
  return { ...p, po, przeciek };
});

const przecieki = wyniki.filter((w) => w.przeciek);

const L: string[] = [];
L.push('# 06 — Skuteczność maskowania przed modelem');
L.push('');
L.push('Wygenerowane przez `scripts/security/audit-redaction.ts`. **Nie edytuj ręcznie.**');
L.push('');
L.push(`Data: ${new Date().toISOString().slice(0, 10)}`);
L.push('');
L.push('Test puszcza realistyczne dane z polskiej faktury przez `redactForModel`');
L.push('i sprawdza, czy wrażliwy fragment zniknął. „Przeciek" = został.');
L.push('');
L.push(`Przypadków: ${wyniki.length}. Przecieków: **${przecieki.length}**.`);
L.push('');
L.push('| Przeciek? | Co | Wejście | Po maskowaniu |');
L.push('|---|---|---|---|');
for (const w of wyniki) {
  const flaga = w.przeciek ? '🔴 TAK' : '✅ nie';
  L.push(`| ${flaga} | ${w.co} | \`${w.wejscie}\` | \`${w.po}\` |`);
}
L.push('');
L.push('## Jak czytać');
L.push('');
L.push('Helper maskowania wychwytuje wiele typowych identyfikatorów');
L.push('(NIP także z separatorami, IBAN z literami, e-mail, telefon, PESEL, adres).');
L.push('Pozostały tekst pokazuje ograniczenia regexów: nie są one gwarancją');
L.push('anonimizacji dowolnych nazwisk i opisów.');
L.push('');
L.push('**Granica wysyłki FLO została zmieniona:** `generateCopy` przyjmuje w `hints`');
L.push('wyłącznie kody ze stałego słownika `FLO_HINTS`. Wolny tekst, także nazwiska');
L.push('nierozpoznane przez regex, jest odrzucany przed budową promptu. Model dostaje');
L.push('nazwy placeholderów wyłącznie z szablonu; wartości pozostają lokalnie.');
L.push('');
L.push('Tabela mierzy skuteczność pomocniczych regexów, NIE potwierdza transferu');
L.push('pozostałego tekstu do modelu. Granicę wysyłki testuje osobno');
L.push('`tests/unit/flo-privacy.test.ts` na rzeczywistym `generateCopy` z atrapą modelu.');

mkdirSync(join(ROOT, 'docs/security/audyt'), { recursive: true });
writeFileSync(join(ROOT, OUT_MD), L.join('\n') + '\n', 'utf8');

console.log(`Przypadków: ${wyniki.length}, przecieków: ${przecieki.length}`);
for (const w of przecieki) console.log(`  🔴 ${w.co}: „${w.po}"`);
console.log(`→ ${OUT_MD}`);
