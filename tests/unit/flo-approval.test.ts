import { describe, expect, it } from 'vitest';

import {
  evaluateApproval,
  FloApprovalError,
  requireApprovalId,
} from '@/lib/flo/approval';
import type { FloApprovalRow } from '@/lib/flo/db-types';

/**
 * Żeton zgody — reguła, od której zależy, czy agent jest bezpieczny
 * (krok 8 planu).
 *
 * Testujemy część czystą: sam warunek „czy tym żetonem wolno to wykonać”.
 * Operacja bazodanowa (atomowy UPDATE) jest cienką warstwą nad tą regułą
 * i sprawdza się ją na prawdziwej bazie, nie w teście jednostkowym.
 */

const NOW = new Date('2026-08-24T12:00:00.000Z');

function approval(overrides: Partial<FloApprovalRow> = {}): FloApprovalRow {
  return {
    id: 'apr-1',
    proposal_id: 'prop-1',
    tenant_id: 'ten-1',
    user_id: 'usr-1',
    snapshot: { title: 'Ponaglenie do Nowaka' },
    created_at: '2026-08-24T11:50:00.000Z',
    consumed_at: null,
    expires_at: '2026-08-24T12:20:00.000Z',
    ...overrides,
  };
}

describe('żeton zgody — strażnik wejścia', () => {
  it('odmawia, gdy żetonu w ogóle nie ma', () => {
    for (const value of [undefined, null, '', '   ', 42, {}]) {
      expect(() => requireApprovalId(value, 'Wysyłka')).toThrowError(
        FloApprovalError,
      );
    }
  });

  it('podaje powód odmowy, a nie ogólny błąd', () => {
    try {
      requireApprovalId(undefined, 'Wysyłka faktury 8/2026');
      expect.unreachable('powinno rzucić');
    } catch (e) {
      expect(e).toBeInstanceOf(FloApprovalError);
      expect((e as FloApprovalError).reason).toBe('missing');
      // Komunikat musi wskazywać, CZEGO dotyczyła odmowa — inaczej zgłoszenie
      // do wsparcia jest bezużyteczne.
      expect((e as FloApprovalError).message).toContain('8/2026');
    }
  });

  it('przepuszcza poprawny identyfikator', () => {
    expect(requireApprovalId('apr-1', 'Wysyłka')).toBe('apr-1');
  });
});

describe('żeton zgody — ocena', () => {
  it('przepuszcza żeton świeży, niezużyty i dotyczący tej sprawy', () => {
    expect(evaluateApproval(approval(), 'prop-1', NOW)).toBe('ok');
  });

  it('odmawia, gdy żeton nie istnieje', () => {
    expect(evaluateApproval(null, 'prop-1', NOW)).toBe('not_found');
  });

  it('odmawia, gdy żeton dotyczy innej propozycji', () => {
    // To jest obrona przed pomyleniem spraw: zgoda na ponaglenie do Nowaka
    // nie może wysłać faktury do ACME.
    expect(evaluateApproval(approval(), 'prop-INNA', NOW)).toBe(
      'wrong_proposal',
    );
  });

  it('odmawia, gdy żeton został już zużyty', () => {
    // Obrona przed podwójnym wykonaniem: dwa kliknięcia, jedna wysyłka.
    const used = approval({ consumed_at: '2026-08-24T11:55:00.000Z' });
    expect(evaluateApproval(used, 'prop-1', NOW)).toBe('already_used');
  });

  it('odmawia, gdy żeton wygasł', () => {
    // Zgoda sprzed pół godziny nie jest zgodą na teraz — w międzyczasie
    // kontrahent mógł zapłacić.
    const stale = approval({ expires_at: '2026-08-24T11:59:59.000Z' });
    expect(evaluateApproval(stale, 'prop-1', NOW)).toBe('expired');
  });

  it('traktuje moment wygaśnięcia jako już wygasły', () => {
    const edge = approval({ expires_at: NOW.toISOString() });
    expect(evaluateApproval(edge, 'prop-1', NOW)).toBe('expired');
  });

  it('sprawdza przynależność do sprawy przed zużyciem i terminem', () => {
    // Kolejność ma znaczenie dla komunikatu: „to zgoda na coś innego” jest
    // dla człowieka bardziej zrozumiałe niż „zgoda wygasła”.
    const wrongAndExpired = approval({
      proposal_id: 'prop-2',
      expires_at: '2026-08-24T10:00:00.000Z',
    });
    expect(evaluateApproval(wrongAndExpired, 'prop-1', NOW)).toBe(
      'wrong_proposal',
    );
  });
});
