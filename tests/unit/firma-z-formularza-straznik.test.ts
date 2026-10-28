import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Strażnik UX-01 (WZR-02 / MOD-S01): każda akcja, która z danych formularza
 * tworzy NOWY dokument (szkic albo „Wystaw i wyślij”), musi przyjąć
 * `expectedTenantId` i przekazać go do `requireUserAndActiveOrg`, które
 * porównuje go z firmą z ciasteczka. Zachowanie sprawdza
 * `firma-z-formularza.test.ts`; ten test pilnuje, żeby nowa akcja nie ominęła
 * reguły po cichu.
 *
 * Każda eksportowana akcja w `components/invoices/*actions*.ts` musi być
 * sklasyfikowana: na liście wystawiania albo na liście wyjątków z powodem.
 * Nowa akcja spoza obu list wywala test — trzeba świadomie zdecydować.
 */

const DIR = join(process.cwd(), 'components', 'invoices');

/** Akcje tworzące dokument z formularza — firma formularza musi zgadzać się z firmą z ciasteczka. */
const ISSUING: Record<string, string[]> = {
  'actions.ts': ['saveDraftAction', 'saveAndSendInvoiceAction'],
  'advance-actions.ts': ['saveAdvanceAction', 'saveAndSendAdvanceAction'],
  'final-actions.ts': ['saveFinalAction', 'saveAndSendFinalAction'],
  'correction-actions.ts': ['saveCorrectionDraftAction', 'saveAndSendCorrectionAction'],
};

/**
 * Akcje bez kontroli firmy formularza. Powód musi tłumaczyć, czemu pomylenie
 * firm nie wystawi dokumentu za inną firmę.
 */
const ID_BOUND = 'działa na istniejącym dokumencie wskazanym id; zapytanie filtruje tenant_id firmy z sesji, więc dokument innej firmy to „nie znaleziono”';
const EXEMPT: Record<string, string> = {
  lookupBuyerAction: 'odczyt nabywcy z bazy kontrahentów albo GUS; zapisuje tylko podpowiedź kontrahenta, nie dokument',
  prefillFromLastInvoiceAction: 'tylko odczyt podkładu formularza; nic nie zapisuje',
  prefillFromInvoiceAction: 'tylko odczyt podkładu formularza; nic nie zapisuje',
  getCorrectionParentContextAction: 'tylko odczyt faktury pierwotnej korekty; zapis korekty sprawdza firmę formularza',
  downloadInvoiceXmlAction: ID_BOUND,
  resendInvoiceAction: ID_BOUND,
  resetInvoiceToDraftAction: ID_BOUND,
  decideKsefDuplicateAction: ID_BOUND,
  emailInvoiceAction: ID_BOUND,
  sendDraftInvoiceAction: ID_BOUND,
  deleteDraftInvoiceAction: ID_BOUND,
};

interface ExportedAction {
  file: string;
  name: string;
  params: string;
  /** Tekst od deklaracji do następnego eksportu — sygnatura i ciało. */
  text: string;
}

/** Zawartość nawiasów od `open` (indeks znaku `(`), z zagnieżdżeniami. */
function balancedParens(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error('niedomknięty nawias');
}

function exportedActions(): ExportedAction[] {
  const files = readdirSync(DIR).filter((f) => /actions.*\.ts$/.test(f) || /-actions\.ts$/.test(f));
  return files.flatMap((file) => {
    const source = readFileSync(join(DIR, file), 'utf8');
    const starts = [...source.matchAll(/^export async function (\w+)\s*\(/gm)];
    const nextExports = [...source.matchAll(/^export /gm)].map((m) => m.index!);
    return starts.map((m) => {
      const start = m.index!;
      const end = nextExports.find((i) => i > start) ?? source.length;
      return {
        file,
        name: m[1]!,
        params: balancedParens(source, start + m[0].length - 1),
        text: source.slice(start, end),
      };
    });
  });
}

const actions = exportedActions();
const issuing = actions.filter((a) => ISSUING[a.file]?.includes(a.name));

describe('UX-01 strażnik: akcje wystawiania sprawdzają firmę formularza', () => {
  it('skan widzi pliki akcji i wszystkie akcje wystawiania', () => {
    expect(actions.length).toBeGreaterThan(10);
    expect(issuing.map((a) => a.name).sort()).toEqual(Object.values(ISSUING).flat().sort());
  });

  it('każda eksportowana akcja jest sklasyfikowana (wystawianie albo wyjątek z powodem)', () => {
    const unclassified = actions
      .filter((a) => !ISSUING[a.file]?.includes(a.name) && !(a.name in EXEMPT))
      .map((a) => `${a.file}: ${a.name}`);
    expect(unclassified).toEqual([]);
  });

  it('lista wyjątków nie ma martwych wpisów', () => {
    const names = new Set(actions.map((a) => a.name));
    expect(Object.keys(EXEMPT).filter((n) => !names.has(n))).toEqual([]);
  });

  it.each(issuing.map((a) => [`${a.file}: ${a.name}`, a] as const))(
    '%s przyjmuje expectedTenantId i przekazuje go do kontroli firmy',
    (_label, action) => {
      expect(action.params).toMatch(/\bexpectedTenantId\b/);
      const source = readFileSync(join(DIR, action.file), 'utf8');
      const direct = /requireUserAndActiveOrg\(\s*\{\s*expectedTenantId\s*\}\s*\)/.test(action.text);
      const viaHelper = action.text.match(/\b(\w*[tT]enantContext)\(\s*\{\s*expectedTenantId\s*\}\s*\)/);
      expect(direct || viaHelper, 'akcja musi wołać kontekst firmy z { expectedTenantId }').toBeTruthy();
      if (!direct && viaHelper) {
        // Pomocnik pliku przekazuje parametr dalej, a nie gubi go po drodze.
        const helper = new RegExp(
          `async function ${viaHelper[1]}\\(\\s*(\\w+)\\??:[\\s\\S]*?requireUserAndActiveOrg\\(\\s*\\1\\s*\\)`,
        );
        expect(source).toMatch(helper);
      }
    },
  );

  it('każda akcja wystawiania ma wiersz w tabeli ISSUE_PATHS testu zachowania (ciasteczko ≠ firma formularza)', () => {
    const behaviour = readFileSync(join(process.cwd(), 'tests', 'unit', 'firma-z-formularza.test.ts'), 'utf8');
    // Tylko tabela — wywołania poza nią (ścieżki szczęśliwe) nie zastępują wiersza.
    const table = behaviour.match(/const ISSUE_PATHS[\s\S]*?\r?\n\];/)?.[0] ?? '';
    expect(table).not.toBe('');
    const missing = issuing.map((a) => a.name).filter((n) => !new RegExp(`\\b${n}\\(`).test(table));
    expect(missing).toEqual([]);
  });

  it('formularze odsyłają firmę strony: każde wywołanie akcji wystawiania ma tenantId jako drugi argument', () => {
    const names = Object.values(ISSUING).flat();
    const forms = ['invoice-form.tsx', 'advance-form.tsx', 'final-form.tsx', 'correction-form.tsx'];
    const calls = forms.flatMap((file) => {
      const source = readFileSync(join(DIR, file), 'utf8');
      return [...source.matchAll(new RegExp(`\\b(${names.join('|')})\\(`, 'g'))].map((m) => ({
        call: `${file}: ${m[1]}`,
        args: balancedParens(source, m.index! + m[0].length - 1),
      }));
    });
    // Każdy formularz woła swoje dwie akcje (szkic i wyślij).
    expect(calls).toHaveLength(names.length);
    expect(calls.filter((c) => !/,\s*tenantId\s*$/.test(c.args)).map((c) => c.call)).toEqual([]);
  });
});
