/**
 * W-04 — łowca zapomnianych kosztów (krok 21 planu).
 *
 * Co miesiąc ten sam hosting, ta sama subskrypcja, ten sam abonament.
 * W tym miesiącu dokumentu nie ma. Agent pyta, czy się zgubił.
 *
 * ZASADA JĘZYKOWA, KTÓRA JEST TU WAŻNIEJSZA OD KODU:
 *
 * Mówimy WYŁĄCZNIE o dokumencie, nigdy o kwocie do dopisania. Zdanie
 * „brakuje kosztu za hosting — dodać?" czyta się jak propozycja dorobienia
 * dokumentu, czyli zachęta do zaniżenia podatku. Zdanie „czy zgubił się
 * dokument za hosting?" pyta o to samo i nie proponuje niczego, czego nie
 * wolno. Różnica jest w jednym słowie i w tym, kto poniesie konsekwencje.
 *
 * Dlatego w tym module NIE MA i nie będzie ścieżki tworzącej wydatek.
 * Jedyne wyjście z tej karty prowadzi do wgrania pliku albo zdjęcia —
 * pilnuje tego osobny test przeszukujący źródła.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPlnPlain } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';

// ═══════════════════════════════════════════════════════════════
// Wykrywanie cykli
// ═══════════════════════════════════════════════════════════════

/** Ile miesięcy z rzędu musi wystąpić koszt, żeby nazwać to cyklem. */
const CYCLE_MIN_MONTHS = 3;

/** O ile kwota może się wahać, a nadal jest „tym samym kosztem". */
const AMOUNT_TOLERANCE = 0.35;

/** Ile pozycji pokazujemy wprost. Reszta zwinięta. */
export const MAX_SHOWN = 3;

export interface ExpenseRecord {
  id: string;
  sellerName: string | null;
  grossAmount: number;
  /** YYYY-MM-DD */
  issueDate: string;
}

export interface RecurringCycle {
  sellerName: string;
  /** Mediana kwoty — do opisu, nie do księgowania. */
  typicalAmount: number;
  /** Miesiące, w których koszt wystąpił, jako YYYY-MM. */
  months: string[];
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Znajduje koszty powtarzające się miesiąc w miesiąc.
 *
 * Wymagamy trzech różnych miesięcy, nie trzech dokumentów: dwie faktury
 * z tego samego miesiąca to nie jest rytm, tylko dwa zakupy.
 */
export function detectRecurringCycles(
  expenses: readonly ExpenseRecord[],
): RecurringCycle[] {
  const bySeller = new Map<string, ExpenseRecord[]>();

  for (const expense of expenses) {
    if (!expense.sellerName) continue;
    const key = expense.sellerName.trim().toLowerCase();
    const list = bySeller.get(key) ?? [];
    list.push(expense);
    bySeller.set(key, list);
  }

  const cycles: RecurringCycle[] = [];

  for (const records of bySeller.values()) {
    const months = [...new Set(records.map((r) => monthKey(r.issueDate)))].sort();
    if (months.length < CYCLE_MIN_MONTHS) continue;

    const typical = median(records.map((r) => r.grossAmount));
    if (typical <= 0) continue;

    // Kwoty muszą być do siebie podobne. Sprzedawca, u którego raz jest
    // 50 zł, a raz 5000, nie ma rytmu — ma po prostu dużo zakupów.
    const consistent = records.every(
      (r) => Math.abs(r.grossAmount - typical) / typical <= AMOUNT_TOLERANCE,
    );
    if (!consistent) continue;

    cycles.push({
      sellerName: records[0]!.sellerName!,
      typicalAmount: typical,
      months,
    });
  }

  return cycles;
}

export interface MissingDocument {
  sellerName: string;
  typicalAmount: number;
  /** Miesiąc, w którym brakuje dokumentu (YYYY-MM). */
  month: string;
}

/**
 * Które cykle nie mają dokumentu w bieżącym miesiącu.
 *
 * Sprawdzamy dopiero po dziesiątym dniu: faktura za hosting potrafi przyjść
 * piątego, a pytanie pierwszego byłoby nagabywaniem o coś, co jest w drodze.
 */
export function findMissingThisMonth(
  cycles: readonly RecurringCycle[],
  now: Date,
  minDayOfMonth = 10,
): MissingDocument[] {
  if (now.getUTCDate() < minDayOfMonth) return [];

  const current = now.toISOString().slice(0, 7);

  return cycles
    .filter((cycle) => !cycle.months.includes(current))
    .map((cycle) => ({
      sellerName: cycle.sellerName,
      typicalAmount: cycle.typicalAmount,
      month: current,
    }))
    // Kolejność po kwocie: największa realna strata na górze.
    .sort((a, b) => b.typicalAmount - a.typicalAmount);
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

export function buildMissingDocsProposal(input: {
  tenantId: string;
  missing: readonly MissingDocument[];
  month: string;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  if (input.missing.length === 0) return null;

  const shown = input.missing.slice(0, MAX_SHOWN);
  const hidden = input.missing.length - shown.length;

  const list = shown
    .map((m) => `${m.sellerName} (zwykle ${formatPlnPlain(m.typicalAmount)})`)
    .join(', ');

  const title =
    input.missing.length === 1
      ? `Brakuje dokumentu: ${shown[0]!.sellerName}`
      : `Brakuje dokumentów za ten miesiąc`;

  const tail = hidden > 0 ? ` i jeszcze ${hidden} podobnych` : '';

  return {
    tenantId: input.tenantId,
    kind: 'expense.missing',
    topicKey: `expense.missing:${input.month}`,
    title,
    // Zdanie mówi o DOKUMENCIE, nigdy o dopisaniu kwoty.
    body: `Co miesiąc masz tu koszt: ${list}${tail}. W tym miesiącu nie widzę dokumentu — zgubił się?`,
    fingerprint: fingerprintOf({
      month: input.month,
      sellers: input.missing.map((m) => m.sellerName).join('|'),
    }),
    expiresAt: new Date(now.getTime() + 21 * 86_400_000),
    priority: 75,
    payload: {
      month: input.month,
      // Ładunek niesie nazwy i typowe kwoty WYŁĄCZNIE do treści karty.
      // Nie ma tu niczego, z czego dałoby się utworzyć wydatek.
      missing: input.missing.map((m) => ({
        sellerName: m.sellerName,
        typicalAmount: m.typicalAmount,
      })),
      hiddenCount: hidden,
      // Ta karta nie ma czego wykonać — prowadzi do wgrania dokumentu.
      // Gdyby miała akcję „wykonaj", handler musiałby udawać, że coś zrobił.
      primaryIntent: 'open',
      primaryLabel: 'Wgraj dokument',
    },
    evidence: [{ label: 'Twoje koszty', href: '/expenses' }],
  };
}

/**
 * „Już tego nie mam" — kasuje cykl na stałe.
 *
 * Zwraca listę sprzedawców do wyciszenia; zapis idzie przez pamięć decyzji,
 * a nie przez kasowanie dokumentów. Klient rezygnujący z hostingu ma usłyszeć
 * pytanie raz, nie co miesiąc do końca świata.
 */
export function sellersToForget(
  payload: Record<string, unknown>,
): string[] {
  const missing = payload.missing;
  if (!Array.isArray(missing)) return [];
  return missing
    .map((entry) =>
      typeof entry === 'object' && entry !== null
        ? String((entry as Record<string, unknown>).sellerName ?? '')
        : '',
    )
    .filter((name) => name.length > 0);
}
