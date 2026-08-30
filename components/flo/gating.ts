import type { FloProposalView } from '@/types/flo';

/**
 * Kiedy główny przycisk karty jest zablokowany (kroki 5–10 toru B).
 *
 * DLACZEGO TO JEST OSOBNY PLIK, A NIE `if` W KOMPONENCIE: to są jedyne
 * reguły w całym interfejsie, których złamanie kosztuje klienta pieniądze
 * albo reputację — wysłaną fakturę, której nie obejrzał, wiadomość do obcej
 * firmy, paczkę na zły adres. Jako czysta funkcja dają się przetestować bez
 * przeglądarki i nie da się ich zgubić przy przebudowie wyglądu.
 *
 * Zasada nadrzędna (część II.3 planu): wszystko, co nieodwracalne albo
 * wychodzące na zewnątrz, wymaga świadomego kliknięcia. „Świadomego” znaczy
 * tutaj: po obejrzeniu tego, co dokładnie poleci.
 */

/** Co człowiek zdążył zrobić z kartą. */
export interface FloCardState {
  /** czy podgląd karty został otwarty choć raz */
  previewSeen: boolean;
  /** zaznaczone pozycje (wariant `list`) */
  selectedIds: readonly string[];
  /** pozycje listy, które człowiek rozwinął i obejrzał */
  seenItemIds: readonly string[];
  /** wpisana wartość (wariant `input`) */
  value: string;
  /** czy potwierdził wpisaną wartość na ekranie potwierdzenia */
  valueConfirmed: boolean;
}

export const EMPTY_CARD_STATE: FloCardState = {
  previewSeen: false,
  selectedIds: [],
  seenItemIds: [],
  value: '',
  valueConfirmed: false,
};

export type FloLock =
  | { locked: false }
  | { locked: true; reason: string };

const UNLOCKED: FloLock = { locked: false };

/**
 * Adres e-mail. Celowo luźno: to jest podpowiedź dla człowieka, a nie
 * ostateczna walidacja — tę robi serwer. Zbyt ostry wzorzec odrzuciłby
 * poprawne adresy i zablokowałby klientowi wysyłkę do własnej księgowej.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Kwota po polsku: „1 234,56”, „1234,56”, „1234”. Kropka też przejdzie. */
const AMOUNT = /^\d{1,3}(?:[  ]?\d{3})*(?:[.,]\d{1,2})?$/;

/** Czy wpisana wartość ma sens dla danego rodzaju pola. */
export function isValueValid(
  value: string,
  kind: 'email' | 'text' | 'amount' | undefined,
): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;

  if (kind === 'email') return EMAIL.test(trimmed);
  if (kind === 'amount') return AMOUNT.test(trimmed);
  return true;
}

/**
 * Czy pozycję listy wolno zaznaczyć.
 *
 * Pozycja odstająca (`needsPreview`) jest zablokowana, dopóki człowiek jej
 * nie rozwinie. To jest ten bezpiecznik, który stoi między klientem
 * a hurtową wysyłką faktury na złą kwotę — silnik pilnuje go po swojej
 * stronie (`preselected: false` niezależnie od ładunku), interfejs po swojej.
 */
export function canSelectItem(
  item: { id: string; needsPreview: boolean },
  state: Pick<FloCardState, 'seenItemIds'>,
): boolean {
  if (!item.needsPreview) return true;
  return state.seenItemIds.includes(item.id);
}

/**
 * Czy główny przycisk karty jest zablokowany, i dlaczego.
 *
 * Powód jest napisem dla człowieka, nie kodem błędu — trafia na `title`
 * przycisku i pod niego. „Coś poszło nie tak” nie pomaga nikomu.
 */
export function primaryLock(
  view: FloProposalView,
  state: FloCardState,
  expired = false,
): FloLock {
  if (expired) {
    return { locked: true, reason: 'Termin tej sprawy minął.' };
  }

  if (view.variant === 'list') {
    const items = view.items ?? [];
    const selected = items.filter((item) =>
      state.selectedIds.includes(item.id),
    );

    if (selected.length === 0) {
      return { locked: true, reason: 'Zaznacz przynajmniej jedną pozycję.' };
    }

    const unseen = selected.find((item) => !canSelectItem(item, state));
    if (unseen) {
      return {
        locked: true,
        reason: `Najpierw obejrzyj pozycję: ${unseen.label}`,
      };
    }

    return UNLOCKED;
  }

  // Podgląd obowiązkowy — promień 4. Gdy serwer każe obejrzeć, a podglądu
  // w ładunku nie ma, blokujemy i mówimy wprost: to jest błąd po stronie
  // silnika i lepiej, żeby ktoś go zobaczył, niż żeby wysyłka poszła w ciemno.
  if (view.primary.requiresPreview === true) {
    if (!view.preview) {
      return {
        locked: true,
        reason: 'Brak podglądu — nie wyślę czegoś, czego nie mogę pokazać.',
      };
    }
    if (!state.previewSeen) {
      return {
        locked: true,
        reason: 'Najpierw otwórz podgląd — zobacz, co dokładnie poleci.',
      };
    }
  }

  if (view.variant === 'input' || view.primary.intent === 'input') {
    if (!isValueValid(state.value, view.primary.inputKind)) {
      return {
        locked: true,
        reason:
          view.primary.inputKind === 'email'
            ? 'Wpisz adres e-mail.'
            : 'Uzupełnij pole.',
      };
    }

    // Adres potwierdzamy osobnym ekranem: „wysyłam do anna@biuro.pl —
    // zgadza się?”. Literówka w adresie to paczka z dokumentami firmy
    // u obcej osoby, a tego nie da się cofnąć.
    if (view.primary.inputKind === 'email' && !state.valueConfirmed) {
      return { locked: true, reason: 'Potwierdź adres.' };
    }
  }

  return UNLOCKED;
}
