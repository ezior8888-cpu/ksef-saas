import { describe, expect, it } from 'vitest';

import {
  approveInputFor,
  canSelectItem,
  EMPTY_CARD_STATE,
  isValueValid,
  primaryLock,
} from '@/components/flo/gating';
import { FLO_FIXTURES } from '@/lib/flo/fixtures';
import type { FloProposalView } from '@/types/flo';

/**
 * Blokady akcji głównej (kroki 5–10 toru B).
 *
 * To jest najważniejszy test w moim torze. Reguły tutaj są jedynym, co stoi
 * między klientem a wysyłką, której nie obejrzał — do rejestru państwowego
 * albo do obcej firmy. Dlatego są czystą funkcją i mają test bez przeglądarki.
 */

function fixture(id: string): FloProposalView {
  const found = FLO_FIXTURES.find((f) => f.id === id);
  if (!found) throw new Error(`brak atrapy ${id}`);
  return found;
}

describe('primaryLock — podgląd obowiązkowy (promień 4)', () => {
  const chase = fixture('fx-preview-chase');

  it('blokuje wysyłkę, dopóki podgląd nie został otwarty', () => {
    const lock = primaryLock(chase, EMPTY_CARD_STATE);

    expect(lock.locked).toBe(true);
    expect(lock.locked && lock.reason).toContain('podgląd');
  });

  it('odblokowuje po otwarciu podglądu', () => {
    const lock = primaryLock(chase, {
      ...EMPTY_CARD_STATE,
      previewSeen: true,
    });

    expect(lock.locked).toBe(false);
  });

  it('gdy serwer każe obejrzeć, a podglądu nie przysłał — blokada zostaje', () => {
    const broken: FloProposalView = { ...chase, preview: undefined };
    const lock = primaryLock(broken, {
      ...EMPTY_CARD_STATE,
      previewSeen: true,
    });

    expect(lock.locked).toBe(true);
    expect(lock.locked && lock.reason).toContain('Brak podglądu');
  });

  it('wygasła propozycja jest zablokowana niezależnie od reszty', () => {
    const lock = primaryLock(
      chase,
      { ...EMPTY_CARD_STATE, previewSeen: true },
      true,
    );

    expect(lock.locked).toBe(true);
  });
});

describe('primaryLock — paczka pozycji', () => {
  const batch = fixture('fx-list-batch');
  const items = batch.items ?? [];
  const safe = items.filter((i) => !i.needsPreview).map((i) => i.id);
  const risky = items.find((i) => i.needsPreview)!;

  it('atrapa faktycznie ma pozycje odstające', () => {
    expect(items.length).toBeGreaterThan(0);
    expect(risky).toBeDefined();
    expect(risky.preselected).toBe(false);
  });

  it('nic nie zaznaczone = nie ma czego wysyłać', () => {
    const lock = primaryLock(batch, EMPTY_CARD_STATE);

    expect(lock.locked).toBe(true);
    expect(lock.locked && lock.reason).toContain('Zaznacz');
  });

  it('same bezpieczne pozycje przechodzą', () => {
    const lock = primaryLock(batch, {
      ...EMPTY_CARD_STATE,
      selectedIds: safe,
    });

    expect(lock.locked).toBe(false);
  });

  it('pozycja odstająca blokuje wysyłkę, dopóki nie zostanie obejrzana', () => {
    const withRisky = { ...EMPTY_CARD_STATE, selectedIds: [...safe, risky.id] };

    const before = primaryLock(batch, withRisky);
    expect(before.locked).toBe(true);
    expect(before.locked && before.reason).toContain(risky.label);

    const after = primaryLock(batch, {
      ...withRisky,
      seenItemIds: [risky.id],
    });
    expect(after.locked).toBe(false);
  });

  it('canSelectItem: odstającej nie da się zaznaczyć bez obejrzenia', () => {
    expect(canSelectItem(risky, EMPTY_CARD_STATE)).toBe(false);
    expect(
      canSelectItem(risky, { ...EMPTY_CARD_STATE, seenItemIds: [risky.id] }),
    ).toBe(true);

    const calm = items.find((i) => !i.needsPreview)!;
    expect(canSelectItem(calm, EMPTY_CARD_STATE)).toBe(true);
  });
});

describe('primaryLock — pytanie o dane', () => {
  const pack = fixture('fx-input-accountant');
  const seen = { ...EMPTY_CARD_STATE, previewSeen: true };

  it('bez adresu nie ma wysyłki', () => {
    expect(primaryLock(pack, seen).locked).toBe(true);
  });

  it('zły adres nie przechodzi', () => {
    const lock = primaryLock(pack, { ...seen, value: 'anna(at)biuro' });
    expect(lock.locked).toBe(true);
  });

  it('poprawny, ale niepotwierdzony adres nadal blokuje', () => {
    const lock = primaryLock(pack, { ...seen, value: 'anna@biuro.pl' });

    expect(lock.locked).toBe(true);
    expect(lock.locked && lock.reason).toContain('Potwierdź');
  });

  it('poprawny i potwierdzony adres odblokowuje', () => {
    const lock = primaryLock(pack, {
      ...seen,
      value: 'anna@biuro.pl',
      valueConfirmed: true,
    });

    expect(lock.locked).toBe(false);
  });

  it('potwierdzenie nie omija podglądu', () => {
    const lock = primaryLock(pack, {
      ...EMPTY_CARD_STATE,
      value: 'anna@biuro.pl',
      valueConfirmed: true,
    });

    expect(lock.locked).toBe(true);
    expect(lock.locked && lock.reason).toContain('podgląd');
  });
});

describe('isValueValid', () => {
  it('adres e-mail', () => {
    expect(isValueValid('anna@biuro.pl', 'email')).toBe(true);
    expect(isValueValid('  anna@biuro.pl  ', 'email')).toBe(true);
    expect(isValueValid('anna@biuro', 'email')).toBe(false);
    expect(isValueValid('anna biuro.pl', 'email')).toBe(false);
    expect(isValueValid('', 'email')).toBe(false);
  });

  it('kwota po polsku', () => {
    expect(isValueValid('1 234,56', 'amount')).toBe(true);
    expect(isValueValid('1234,56', 'amount')).toBe(true);
    expect(isValueValid('1234.56', 'amount')).toBe(true);
    expect(isValueValid('300', 'amount')).toBe(true);
    expect(isValueValid('dużo', 'amount')).toBe(false);
    expect(isValueValid('12,345', 'amount')).toBe(false);
  });

  it('zwykły tekst — wystarczy, żeby nie był pusty', () => {
    expect(isValueValid('cokolwiek', 'text')).toBe(true);
    expect(isValueValid('   ', 'text')).toBe(false);
  });
});

describe('primaryLock — warianty bez blokad', () => {
  it('informacja i pojedyncza akcja nie mają czego blokować', () => {
    for (const id of ['fx-info-ksef', 'fx-single-expense']) {
      expect(primaryLock(fixture(id), EMPTY_CARD_STATE).locked).toBe(false);
    }
  });
});

describe('approveInputFor — co leci na serwer razem z kliknięciem', () => {
  it('paczka przekazuje zaznaczone pozycje', () => {
    const batch = fixture('fx-list-batch');
    const input = approveInputFor(batch, {
      ...EMPTY_CARD_STATE,
      selectedIds: ['b1', 'b2'],
    });

    expect(input).toEqual({ selectedIds: ['b1', 'b2'] });
  });

  it('pytanie o dane przekazuje wpisaną wartość bez spacji na brzegach', () => {
    const pack = fixture('fx-input-accountant');
    const input = approveInputFor(pack, {
      ...EMPTY_CARD_STATE,
      value: '  anna@biuro.pl ',
      valueConfirmed: true,
    });

    expect(input).toEqual({ value: 'anna@biuro.pl' });
  });

  it('poprawiona treść wiadomości jedzie dalej', () => {
    const chase = fixture('fx-preview-chase');
    const input = approveInputFor(chase, {
      ...EMPTY_CARD_STATE,
      editedBody: 'Dzień dobry, przypominam o płatności.',
    });

    expect(input).toEqual({
      editedBody: 'Dzień dobry, przypominam o płatności.',
    });
  });

  it('nietknięta treść NIE jedzie — serwer wysyła swoją wersję', () => {
    const chase = fixture('fx-preview-chase');
    expect(approveInputFor(chase, EMPTY_CARD_STATE)).toBeUndefined();
  });

  it('karta bez pól i bez listy nie dokłada niczego', () => {
    expect(
      approveInputFor(fixture('fx-info-ksef'), EMPTY_CARD_STATE),
    ).toBeUndefined();
  });
});
