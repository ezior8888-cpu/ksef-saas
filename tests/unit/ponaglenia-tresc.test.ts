import { describe, expect, it } from 'vitest';

import { recoveryCompensationEur } from '@/lib/reminders/pdf-demand-letter';
import { DEFAULT_TEMPLATES } from '@/lib/reminders/templates';

/**
 * AUD-99: domyślne ponaglenia miały znaczniki markdown (`**`, `` ` ``), które
 * w mailu tekstowym i w HTML z ucieczką (deliveryHtml) widać dosłownie jako
 * gwiazdki. Pismo PDF podawało rekompensatę „40 EUR” niezależnie od kwoty,
 * a art. 10 ust. 1 ustawy o przeciwdziałaniu nadmiernym opóźnieniom
 * w transakcjach handlowych ma trzy progi. [DO WERYFIKACJI — Igor]
 */

describe('treść ponagleń', () => {
  it.each(Object.entries(DEFAULT_TEMPLATES))('%s: bez znaczników markdown', (_stage, t) => {
    expect(t.body).not.toMatch(/\*\*|`/);
    expect(t.subject).not.toMatch(/\*\*|`/);
  });

  it.each([
    [1230, 40],
    [5000, 40],
    [5000.01, 70],
    [49_999.99, 70],
    [50_000, 100],
    [120_000, 100],
  ])('rekompensata za %s zł: %s EUR', (kwota, eur) => {
    expect(recoveryCompensationEur(kwota)).toBe(eur);
  });
});
