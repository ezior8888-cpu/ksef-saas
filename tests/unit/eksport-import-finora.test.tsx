import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/exports', () => ({ startExportAction: vi.fn(), downloadExportFileAction: vi.fn() }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: ctx.get }));
// Okno importu z pliku woła akcję serwera — tu tylko render, bez kolejki jobów.
vi.mock('@/app/onboarding/magic-import/actions', () => ({ startFileImportAction: vi.fn() }));

import ImportDanychPage from '@/app/(dashboard)/import-danych/page';
import {
  ExportsCenter,
  NewExportForm,
  RecentExports,
  type ManualExportJobWithFiles,
} from '@/components/exports/exports-center';

/**
 * Eksport i Import danych (P13): karty z ikonami w stylu Accounts Finory.
 *
 * Poprawka Bartosza 21.10.2026 (przeprojektowanie Księgowości) — świadome
 * zmiany oczekiwań: kafelki formatów to grupa radiowa (zaznaczenie widać po
 * atrybutach Base UI, nie po „Wybrany” / `aria-pressed`), pod nazwą jest
 * przeznaczenie pliku („Księga dla księgowej”) zamiast rodzaju („Plik XML”),
 * domyślny jest KPiR, okres w historii czyta się „Wrzesień 2026”, a pola
 * wyboru są tylko tam, gdzie zmieniają plik (CSV). Sens bez zmian: formaty,
 * „Wygeneruj plik”, historia z „Pobierz” i powodem błędu.
 */

function job(overrides: Partial<ManualExportJobWithFiles> = {}): ManualExportJobWithFiles {
  return {
    id: 'job-1', tenant_id: 't', format: 'jpk_fa', status: 'completed', period_start: '2026-09-01',
    period_end: '2026-09-30', invoices_count: 12, error_message: null, trigger_source: 'manual',
    export_files: [{ id: 'f1', filename: 'jpk.xml', format: 'jpk_fa', size_bytes: 10, download_count: 0 }],
    ...overrides,
  } as ManualExportJobWithFiles;
}

/** Atrybuty `<span role="radio">` Base UI z SSR, po kolei. */
const radios = (html: string) => [...html.matchAll(/<span([^>]*role="radio"[^>]*)>/g)].map(([, attrs]) => attrs!);

describe('Eksport — karty formatów w stylu Accounts', () => {
  const html = renderToStaticMarkup(<ExportsCenter recentJobs={[job()]} currentMonth="2026-10" />);
  // Formularz stoi przed kartą z zakładkami, historia w niej. Wiersz historii (wrzesień)
  // i domyślny okres formularza (też wrzesień) mają te same napisy — bez podziału
  // sprawdzenie jednego przechodziłoby dzięki drugiemu.
  const nav = html.indexOf('<nav aria-label="Księgowość"');
  const form = html.slice(0, nav);
  const history = html.slice(nav);

  it('nagłówek, kafelki formatów z przeznaczeniem pliku i zaznaczonym KPiR', () => {
    expect(html).toContain('<h1 class="sr-only">Eksport danych księgowych</h1>');
    expect(html).toContain('JPK_FA(4)');
    expect(html).toContain('KPiR Excel');
    expect(html).toContain('CSV uniwersalny');
    expect(html).toContain('Księga dla księgowej');
    expect(html).toContain('Urząd, Symfonia, Wapro');
    expect(html).toContain('Optima, Subiekt i inne programy');
    expect(html).toContain('Wygeneruj plik');

    // Grupa „Format pliku”: dokładnie jedno radio zaznaczone — to przy KPiR.
    expect(html).toContain('role="radiogroup" data-slot="radio-group" aria-label="Format pliku"');
    const formatGroup = html.slice(html.indexOf('aria-label="Format pliku"'), html.indexOf('aria-label="Rodzaj okresu"'));
    const checked = radios(formatGroup).filter((attrs) => attrs.includes('aria-checked="true"'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('data-checked=""');
    const kpirTile = /<input type="radio" id="[^"]*" [^>]*checked="" value="kpir_excel"\/>/.exec(formatGroup);
    expect(kpirTile).not.toBeNull();
    expect(radios(formatGroup).filter((attrs) => attrs.includes('data-unchecked=""'))).toHaveLength(2);

    // Domyślny okres: poprzedni miesiąc, czytelnie — w samym formularzu.
    expect(nav).toBeGreaterThan(0);
    expect(form).toContain('Wrzesień 2026');
    expect(form).toContain('01.09.2026 – 30.09.2026');
    expect(form).not.toContain('Październik 2026');

    // Dawny wygląd przycisków-kart zniknął.
    expect(html).not.toContain('Wybrany');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Plik XML');
    expect(html).not.toContain('Arkusz Excel');
  });

  it('pola wyboru tylko przy CSV (przy KPiR zakres jest stały)', () => {
    expect(html).not.toContain('role="checkbox"');
    const csv = renderToStaticMarkup(<NewExportForm initialFormat="csv_universal" currentMonth="2026-10" />);
    expect(csv.match(/role="checkbox"/g)).toHaveLength(3);
    expect(csv).toContain('Faktury wystawione');
    expect(csv).toContain('Faktury otrzymane');
  });

  it('historia: okres, liczba faktur, status i „Pobierz” przy gotowym pliku', () => {
    expect(history).toContain('Wrzesień 2026');
    expect(history).toContain('title="01.09.2026 – 30.09.2026"');
    expect(history).toContain('12 faktur');
    expect(history).toContain('Gotowe');
    expect(history).toContain('Pobierz');
    expect(html).not.toContain('01.09.2026 — 30.09.2026');
  });

  it('okres „Inny” odwrócony: oba pola dat wskazują komunikat o błędzie (aria-describedby)', () => {
    // Samo aria-invalid dawało czytnikowi „nieprawidłowe” bez powodu; powód był tylko
    // pod wyłączonym przyciskiem, do którego klawiaturą się nie dojdzie.
    const reversed = renderToStaticMarkup(
      <NewExportForm currentMonth="2026-10" initialPeriod={{ mode: 'custom', from: '2026-09-30', to: '2026-09-01' }} />,
    );
    const error = /<p id="([^"]+)"[^>]*>Koniec okresu jest przed początkiem\.<\/p>/.exec(reversed);
    expect(error, 'komunikat bez id').not.toBeNull();
    const dates = [...reversed.matchAll(/<input[^>]*type="date"[^>]*>/g)].map(([tag]) => tag);
    expect(dates).toHaveLength(2);
    for (const tag of dates) {
      expect(tag).toContain('aria-invalid="true"');
      expect(tag).toContain(`aria-describedby="${error![1]}"`);
    }

    // Puste pole: odsyłacz do linii „Wybierz obie daty.”, drugie pole bez odsyłacza.
    const blank = renderToStaticMarkup(
      <NewExportForm currentMonth="2026-10" initialPeriod={{ mode: 'custom', from: '', to: '2026-09-15' }} />,
    );
    const hint = /<p id="([^"]+)"[^>]*>Wybierz obie daty\.<\/p>/.exec(blank);
    expect(hint, 'linia zakresu bez id').not.toBeNull();
    const [fromTag, toTag] = [...blank.matchAll(/<input[^>]*type="date"[^>]*>/g)].map(([tag]) => tag);
    expect(fromTag).toContain(`aria-describedby="${hint![1]}"`);
    expect(toTag).not.toContain('aria-describedby');

    // Poprawny zakres: ani błędu, ani odsyłacza.
    const valid = renderToStaticMarkup(
      <NewExportForm currentMonth="2026-10" initialPeriod={{ mode: 'custom', from: '2026-09-01', to: '2026-09-15' }} />,
    );
    expect(valid).not.toContain('Koniec okresu jest przed początkiem.');
    expect(valid).not.toContain('aria-describedby');
  });

  it('bez dawnego wyglądu: szkło, ikony Material', () => {
    expect(html).not.toContain('ff-glass-pane');
    expect(html).not.toContain('material-symbols');
    expect(html).not.toContain('backdrop-blur');
  });

  it('pusta historia, nieudany eksport z powodem i gotowy bez pliku', () => {
    const empty = renderToStaticMarkup(<RecentExports jobs={[]} />);
    expect(empty).toContain('Brak eksportów');
    expect(empty).not.toContain('po lewej');
    const failed = renderToStaticMarkup(<RecentExports jobs={[job({ status: 'failed', error_message: 'JPK wstrzymany: brak urzędu', export_files: [] })]} />);
    expect(failed).toContain('JPK wstrzymany: brak urzędu');
    expect(failed).toContain('Błąd');
    expect(failed).not.toContain('Pobierz');
    const blank = renderToStaticMarkup(<RecentExports jobs={[job({ export_files: [] })]} />);
    expect(blank).toContain('Pusty');
    expect(blank).toContain('Brak dokumentów w tym okresie');
    expect(blank).not.toContain('Gotowe');
    expect(blank).not.toContain('Pobierz');
  });

  it('powłoka: ff-page-fill, karta z zakładkami Księgowości sięga stopki', () => {
    expect(html).toMatch(/^<div class="ff-page-fill flex flex-col gap-6"><h1 class="sr-only">/);
    expect(html).toContain('<nav aria-label="Księgowość"');
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/reports\/exports">Eksport<\/a>/);
  });
});

/**
 * Klient z dwoma odczytami strony: `tenants` (`.single()`) i ostatnie
 * `import_jobs` (`.order().limit()`). Poprawka Bartosza 22.10.2026 (import
 * danych w stylu Finory): strona czyta też historię importów.
 */
function tenantClient(row: Record<string, unknown> | null, jobs: Record<string, unknown>[] = []) {
  return {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        single: async () => ({ data: row, error: null }),
        limit: async () => ({ data: table === 'import_jobs' ? jobs : [], error: null }),
      };
      return builder;
    },
  };
}

/**
 * Poprawka Bartosza 22.10.2026 (import danych w stylu Finory) — świadome
 * zmiany oczekiwań: jedna karta „Magiczny Import historii” stała się siatką
 * źródeł (KSeF i pięć programów), tytuł karty to „Magiczny import z KSeF”,
 * plakietka bez certyfikatu to „Wymaga certyfikatu”, a bez certyfikatu cała
 * karta prowadzi do `/settings/ksef` („Wgraj certyfikat KSeF”). Sens bez
 * zmian: z certyfikatem start pod tym samym adresem, bez — wyjście do
 * ustawień KSeF i żadnego startu importu, firma z NIP-em widoczna.
 */
describe('Import danych — karty źródeł w stylu Accounts', () => {
  it('z certyfikatem: karta KSeF prowadzi do magicznego importu', async () => {
    ctx.get.mockResolvedValue({ supabase: tenantClient({ name: 'Firma', nip: '1234567890', has_ksef_credentials: true }), tenantId: 'org-1' });
    const html = renderToStaticMarkup(await ImportDanychPage());
    expect(html).toContain('Magiczny import z KSeF');
    expect(html).toContain('Gotowy');
    expect(html).toContain('href="/onboarding/magic-import?tenantId=org-1"');
    expect(html).toContain('Rozpocznij import');
    expect(html).toContain('NIP <span class="font-mono">1234567890</span>');
  });

  it('bez certyfikatu: plakietka i link do ustawień KSeF, bez startu importu', async () => {
    ctx.get.mockResolvedValue({ supabase: tenantClient({ name: 'Firma', nip: null, has_ksef_credentials: false }), tenantId: 'org-1' });
    const html = renderToStaticMarkup(await ImportDanychPage());
    expect(html).toContain('Wymaga certyfikatu');
    expect(html).toContain('Wgraj certyfikat KSeF');
    expect(html).toContain('href="/settings/ksef"');
    expect(html).not.toContain('/onboarding/magic-import');
    expect(html).not.toContain('ff-glass-pane');
  });
});
