import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import { GDPR_COOLING_OFF_DAYS } from '@/lib/gdpr/deletion';

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
    const text = read('app/(marketing)/legal/polityka-prywatnosci/page.tsx');
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

  it('okno usuwania konta: nieodwracalne po 14 dniach', () => {
    const text = read('components/settings/delete-account.tsx');
    expect(text).toContain(`nieodwracalna po ${GDPR_COOLING_OFF_DAYS} dniach`);
  });
});
