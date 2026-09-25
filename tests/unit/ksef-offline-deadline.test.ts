import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateDeadline, nearestFutureDeadline } from '@/lib/flo/functions/ksef-outage';

/**
 * Podczas awarii KSeF zaległy wpis Offline24 zostaje w kolejce (oznaczanie
 * 'expired' jest w innej gałęzi joba). Gdy alarm brał NAJSTARSZY termin,
 * przekroczony wpis zasłaniał fakturę z terminem za dwie godziny —
 * `evaluateDeadline` milczy o przeszłych. (Recenzja ChatGPT nr 7, 25.09.2026.)
 */

// Środa, poza weekendem — żeby liczył się próg godzinowy, nie weekendowy.
const NOW = new Date('2026-09-23T10:00:00Z');
const za = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('alarm terminu Offline24', () => {
  it('sam przyszły termin za 2 h: alarm', () => {
    const d = nearestFutureDeadline([za(2)], NOW);
    expect(evaluateDeadline(d!, NOW).kind).toBe('approaching');
  });

  it('przekroczony wpis NIE zasłania terminu za 2 h', () => {
    const d = nearestFutureDeadline([za(-1), za(2)], NOW);
    expect(d?.toISOString()).toBe(za(2));
    expect(evaluateDeadline(d!, NOW).kind).toBe('approaching');
  });

  it('bierze najbliższy z przyszłych, niezależnie od kolejności', () => {
    expect(nearestFutureDeadline([za(30), za(-5), za(3), za(10)], NOW)?.toISOString()).toBe(za(3));
  });

  it('same przekroczone albo pusto: brak terminu do alarmu', () => {
    expect(nearestFutureDeadline([za(-1), za(-3)], NOW)).toBeNull();
    expect(nearestFutureDeadline([], NOW)).toBeNull();
  });

  it('job używa najbliższego PRZYSZŁEGO terminu, nie najstarszego', () => {
    const kod = readFileSync(join(process.cwd(), 'lib/inngest/jobs/process-offline-queue.ts'), 'utf8');
    expect(kod).toMatch(/nearestFutureDeadline\(deadlines, now\)/);
    expect(kod).not.toMatch(/deadlines\.sort\(\)\[0\]/);
  });
});
