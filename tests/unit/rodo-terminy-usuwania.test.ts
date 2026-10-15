import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import { GDPR_COOLING_OFF_DAYS } from '@/lib/gdpr/deletion';
import { renderPlainText } from '@/lib/legal/doc-model';
import { POLITYKA_PRYWATNOSCI, REGULAMIN, UMOWA_POWIERZENIA } from '@/lib/legal/documents';

/**
 * AUD-74 (decyzja I6): konto usuwa się po 14 dniach na wycofanie decyzji,
 * a dokumenty obiecują „najpóźniej w ciągu miesiąca”. Do 02.10 polityka,
 * strona RODO i okno usuwania konta mówiły o 30 dniach.
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\s+/g, ' ');

describe('terminy usuwania konta — kod i dokumenty mówią to samo', () => {
  it('kod: 14 dni na wycofanie decyzji', () => {
    expect(GDPR_COOLING_OFF_DAYS).toBe(14);
  });

  it('polityka prywatności: 14 dni i „najpóźniej w ciągu miesiąca”, bez 30 dni i bez noty „docelowo”', () => {
    // Od 15.10.2026 treść polityki żyje w lib/legal/documents (strona tylko ją
    // renderuje) — sprawdzamy tekst, który widzi klient.
    const text = renderPlainText(POLITYKA_PRYWATNOSCI, 'https://faktflow.example').replace(/\s+/g, ' ');
    expect(text).toContain('14 dni');
    expect(text).toContain('najpóźniej w ciągu miesiąca');
    expect(text).not.toContain('obecnie jest to 30 dni');
    expect(text).not.toContain('Uwaga planistyczna');
  });

  it('strona RODO: usunięcie konta najpóźniej w ciągu miesiąca', () => {
    const text = read('app/(marketing)/legal/rodo/page.tsx');
    expect(text).toContain('najpóźniej w ciągu miesiąca');
    expect(text).not.toContain('danych w 30 dni od żądania');
  });

  // Rewizja 15.10.2026: `components/settings/delete-account.tsx` NIE usuwa
  // konta — woła `requestAccountDeletionAction`, które oznacza do usunięcia
  // FIRMĘ (30 dni). Ten test wcześniej wymuszał w nim „14 dni” (termin
  // usunięcia konta) i utrwalał pomyłkę. Konto usuwa sekcja RODO.
  it('usuwanie konta (sekcja RODO): 14 dni na wycofanie decyzji', () => {
    const text = read('app/(dashboard)/settings/account/_components/gdpr-section.tsx');
    expect(text).toContain(`${GDPR_COOLING_OFF_DAYS}-dniowym okresem na wycofanie decyzji`);
  });

  it('przycisk usuwania firmy mówi, że usuwa firmę, i nie podaje terminu usunięcia konta', () => {
    for (const file of ['components/settings/delete-account.tsx', 'components/settings/delete-account-form.tsx']) {
      const text = read(file);
      expect(text, file).toContain('Usuń firmę');
      expect(text, file).not.toContain(`nieodwracalna po ${GDPR_COOLING_OFF_DAYS} dniach`);
    }
  });
});

/**
 * Usunięcie FIRMY nie działa w aplikacji: `tenants.deleted_at`, `hard_delete_at`
 * i `is_active` nie sprawdza logowanie, RLS (`is_member_of`,
 * `get_current_tenant_id`) ani żaden job, a subskrypcji nikt nie anuluje.
 * Od 15.10.2026 samoobsługa jest wstrzymana (osobny PR zmienia
 * `requestAccountDeletionAction` w odmowę z adresem pomocy), a usunięcie
 * firmy idzie przez pomoc techniczną. Ekrany i dokumenty nie mogą więc
 * obiecywać wyłączenia firmy ani usunięcia danych w terminie liczonym od
 * kliknięcia. Test nie przypina implementacji akcji — sprawdza teksty.
 */
describe('usuwanie firmy — teksty nie obiecują mechanizmu, którego nie ma', () => {
  // Komentarze w kodzie celowo cytują stare sformułowania — wycinamy je.
  const stripComments = (src: string) =>
    src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const visible = (p: string) => stripComments(readFileSync(p, 'utf8')).replace(/\s+/g, ' ');

  it('wycinanie komentarzy nie zjada kodu', () => {
    expect(stripComments('a /* x */ b {/* y */} c // z\nd https://e.pl')).toBe('a   b   c \nd https://e.pl');
  });

  const screens = [
    'components/settings/delete-account.tsx',
    'components/settings/delete-account-form.tsx',
    'app/(dashboard)/settings/page.tsx',
    'app/(dashboard)/settings/account/page.tsx',
  ];

  it.each(screens)('%s: bez „od razu wyłączona”, terminów usunięcia i „nieodwracalne”', (file) => {
    const text = visible(file);
    expect(text).not.toMatch(/od razu wyłączon/);
    expect(text).not.toMatch(/w ciągu kolejnych 30 dni/);
    expect(text).not.toMatch(/30 dni na zmianę decyzji/);
    expect(text).not.toMatch(/nieodwracaln/i);
    expect(text).not.toContain('Potwierdź usunięcie konta');
  });

  it.each(['components/settings/delete-account.tsx', 'app/(dashboard)/settings/account/page.tsx'])(
    '%s: kieruje do pomocy technicznej',
    (file) => {
      const text = visible(file);
      expect(text).toContain('SUPPORT_EMAIL');
      expect(text).toContain('przez pomoc techniczną');
    },
  );

  it('pomoc (czyta ją też asystent AI): usunięcie organizacji przez pomoc, serwery w Norymberdze', () => {
    const rodo = read('content/help/rodo-i-usuwanie-konta.mdx');
    expect(rodo).toContain('przez pomoc techniczną');
    expect(rodo).not.toContain('kasuje firmę z systemu (osobna sekcja');
    expect(rodo).not.toContain('Frankfurt');
    expect(read('content/help/role-i-uprawnienia.mdx')).not.toContain('może usunąć organizację');
  });

  it('regulamin i umowa powierzenia: usunięcie Organizacji zlecane e-mailem, bez „od razu wyłączona”', () => {
    for (const doc of [REGULAMIN, UMOWA_POWIERZENIA]) {
      const text = renderPlainText(doc, 'https://faktflow.example').replace(/\s+/g, ' ');
      expect(text, doc.title).not.toMatch(/od razu wyłączon/);
      expect(text, doc.title).not.toContain('usunięcie Organizacji (Ustawienia');
      expect(text, doc.title).not.toContain('przez usunięcie Organizacji');
    }
  });
});
