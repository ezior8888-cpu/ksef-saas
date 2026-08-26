/**
 * Odcisk danych i re-walidacja przy wykonaniu (krok 10 planu agenta FLO).
 *
 * PROBLEM, KTÓRY TO ROZWIĄZUJE: propozycja powstaje o 9:02, a człowiek klika
 * o 14:30. Przez te pięć godzin świat mógł się zmienić — kontrahent zapłacił,
 * faktura została skorygowana, koszt przejrzany ręcznie. Wykonanie
 * propozycji na nieaktualnych danych to najgorsza klasa awarii w całym
 * agencie: ponaglenie do kogoś, kto zapłacił wczoraj, kompromituje klienta
 * przed jego własnym kontrahentem.
 *
 * JAK: przy tworzeniu propozycji zapisujemy FAKTY, na których się opiera,
 * i ich skrót. Przy kliknięciu czytamy te same fakty jeszcze raz i liczymy
 * skrót ponownie. Różnica = brak wykonania i konkretne zdanie o tym, co się
 * zmieniło. Nie „coś poszło nie tak”, tylko „Nowak zapłacił wczoraj”.
 *
 * PODZIAŁ NA FAKTY I KONTEKST jest celowy. Do skrótu wchodzą wyłącznie
 * rzeczy, których zmiana ma unieważnić propozycję (kwoty, statusy, terminy).
 * Nazwa kontrahenta czy numer faktury to kontekst — służy do napisania
 * komunikatu, ale jej zmiana nie ma blokować wysyłki, bo nie zmienia sensu
 * decyzji.
 */

import { createHash } from 'node:crypto';

import type { FloProposalRow } from '@/lib/flo/db-types';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FloProposalKind } from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Typy
// ═══════════════════════════════════════════════════════════════

/** Fakty wchodzące do skrótu — ich zmiana unieważnia propozycję. */
export type FloFacts = Record<string, string | number | null>;

/** Kontekst do komunikatów — jego zmiana niczego nie unieważnia. */
export type FloContext = Record<string, string>;

export interface FloState {
  facts: FloFacts;
  context: FloContext;
}

export class FloStaleError extends Error {
  readonly changes: string;

  constructor(changes: string) {
    super(changes);
    this.name = 'FloStaleError';
    this.changes = changes;
  }
}

// ═══════════════════════════════════════════════════════════════
// Skrót (funkcja czysta)
// ═══════════════════════════════════════════════════════════════

/**
 * Deterministyczny skrót faktów.
 *
 * Klucze sortujemy, bo kolejność pól w obiekcie nie jest faktem o świecie —
 * bez sortowania ten sam stan dawałby różne skróty w zależności od tego,
 * w jakiej kolejności ktoś akurat zbudował obiekt.
 */
export function fingerprintOf(facts: FloFacts): string {
  const material = Object.keys(facts)
    .sort()
    .map((key) => `${key}=${facts[key] ?? ''}`)
    .join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/** Fakty, które się zmieniły — podstawa komunikatu dla człowieka. */
export function diffFacts(
  before: FloFacts,
  after: FloFacts,
): Array<{ key: string; before: string | number | null; after: string | number | null }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: Array<{
    key: string;
    before: string | number | null;
    after: string | number | null;
  }> = [];
  for (const key of [...keys].sort()) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (a !== b) changed.push({ key, before: a, after: b });
  }
  return changed;
}

// ═══════════════════════════════════════════════════════════════
// Komunikat (funkcja czysta)
// ═══════════════════════════════════════════════════════════════

/**
 * Zdanie po polsku o tym, co się zmieniło.
 *
 * Kolejność sprawdzeń nie jest przypadkowa: najpierw to, co dla człowieka
 * najważniejsze („zapłacił”), potem reszta. Komunikat ma odpowiadać na
 * pytanie „dlaczego nic nie wysłałeś”, a nie opisywać stan bazy.
 */
export function describeChange(
  kind: FloProposalKind,
  before: FloFacts,
  after: FloFacts,
  context: FloContext = {},
  now: Date = new Date(),
): string {
  const who = context.contractorName ?? 'Kontrahent';
  const paidBefore = toNumber(before.paidAmount);
  const paidAfter = toNumber(after.paidAmount);
  const gross = toNumber(after.grossTotal);

  if (
    (kind === 'payment.chase' ||
      kind === 'payment.confirm' ||
      kind === 'payment.interest') &&
    paidAfter > paidBefore
  ) {
    const when = relativeDay(after.lastPaymentAt, now);
    if (gross > 0 && paidAfter >= gross) {
      return `${who} zapłacił${when ? ` ${when}` : ''} — anulowałem.`;
    }
    return `${who} wpłacił część należności${when ? ` ${when}` : ''} — treść była już nieaktualna.`;
  }

  if (before.status !== after.status) {
    return `Status zmienił się w międzyczasie (${before.status ?? '—'} → ${after.status ?? '—'}), więc nic nie zrobiłem.`;
  }

  if (before.remindersPaused !== after.remindersPaused) {
    return after.remindersPaused
      ? 'Przypomnienia dla tej faktury zostały wstrzymane.'
      : 'Przypomnienia dla tej faktury zostały wznowione — przygotuję treść od nowa.';
  }

  if (before.grossTotal !== after.grossTotal) {
    return 'Kwota na fakturze zmieniła się od czasu, gdy to przygotowałem.';
  }

  if (before.dueDate !== after.dueDate) {
    return 'Termin płatności został zmieniony — przeliczę to od nowa.';
  }

  if (before.reviewedAt !== after.reviewedAt) {
    return 'Ten dokument został już przejrzany ręcznie.';
  }

  const changed = diffFacts(before, after);
  if (changed.length === 0) {
    return 'Dane zmieniły się od czasu przygotowania tej propozycji.';
  }
  return `Dane zmieniły się od czasu przygotowania tej propozycji (${changed
    .map((c) => c.key)
    .join(', ')}).`;
}

// ═══════════════════════════════════════════════════════════════
// Odczyt stanu z bazy
// ═══════════════════════════════════════════════════════════════

interface StateClient {
  from: (table: 'invoices' | 'expenses') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/**
 * Czyta fakty, na których opiera się propozycja danego rodzaju.
 *
 * Rodzaj bez własnego odczytu dostaje fakty z samego ładunku. To nie jest
 * niedbałość: propozycja, która nie zależy od niczego poza tym, co sama
 * w sobie niesie (np. podsumowanie roku), nie ma jak się zdezaktualizować.
 */
export async function readState(
  kind: FloProposalKind,
  payload: Record<string, unknown>,
): Promise<FloState> {
  const invoiceId = readString(payload.invoiceId);
  const expenseId = readString(payload.expenseId);

  if (invoiceId && isInvoiceKind(kind)) {
    // Klient bazy powstaje dopiero tutaj: propozycja, która nie zależy od
    // żadnego rekordu (np. podsumowanie roku), nie ma powodu otwierać
    // połączenia — ani wymagać zmiennych środowiskowych w testach.
    const db = createAdminClient() as unknown as StateClient;
    const { data, error } = await db
      .from('invoices')
      .select(
        'id, ksef_status, gross_total, paid_amount, payment_due_date, reminders_paused, buyer_data, internal_number, updated_at',
      )
      .eq('id', invoiceId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      // Faktura zniknęła — propozycja jest bezprzedmiotowa i musi paść.
      return { facts: { missing: 'invoice' }, context: {} };
    }

    return {
      facts: {
        status: readString(data.ksef_status),
        grossTotal: toNumber(data.gross_total),
        paidAmount: toNumber(data.paid_amount),
        dueDate: readString(data.payment_due_date),
        remindersPaused: data.reminders_paused === true ? 1 : 0,
        stage: readString(payload.stage),
      },
      context: {
        contractorName: buyerName(data.buyer_data) ?? 'Kontrahent',
        invoiceNumber: readString(data.internal_number) ?? 'bez numeru',
      },
    };
  }

  if (expenseId) {
    const db = createAdminClient() as unknown as StateClient;
    const { data, error } = await db
      .from('expenses')
      .select('id, gross_amount, kpir_column, is_reviewed, is_deductible')
      .eq('id', expenseId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { facts: { missing: 'expense' }, context: {} };

    return {
      facts: {
        grossTotal: toNumber(data.gross_amount),
        kpirColumn: readString(data.kpir_column),
        reviewedAt: data.is_reviewed === true ? 1 : 0,
        deductible: data.is_deductible === true ? 1 : 0,
      },
      context: {},
    };
  }

  return { facts: factsFromPayload(payload), context: {} };
}

export async function computeFingerprint(
  kind: FloProposalKind,
  payload: Record<string, unknown>,
): Promise<{ fingerprint: string; state: FloState }> {
  const state = await readState(kind, payload);
  return { fingerprint: fingerprintOf(state.facts), state };
}

/**
 * Sprawdza, czy propozycję nadal wolno wykonać.
 *
 * Wołane przez wykonawcę (krok 11) jako PIERWSZY krok — przed zużyciem
 * żetonu zgody i przed jakimkolwiek działaniem. Rzuca `FloStaleError`
 * z gotowym zdaniem dla człowieka.
 */
export async function assertFresh(
  row: Pick<FloProposalRow, 'kind' | 'payload' | 'fingerprint'>,
  now: Date = new Date(),
): Promise<void> {
  const kind = row.kind as FloProposalKind;
  const { fingerprint, state } = await computeFingerprint(kind, row.payload);

  if (fingerprint === row.fingerprint) return;

  const before = readFacts(row.payload.facts) ?? {};
  throw new FloStaleError(
    describeChange(kind, before, state.facts, state.context, now),
  );
}

// ═══════════════════════════════════════════════════════════════
// Pomocnicze
// ═══════════════════════════════════════════════════════════════

function isInvoiceKind(kind: FloProposalKind): boolean {
  return (
    kind.startsWith('payment.') ||
    kind.startsWith('invoice.') ||
    kind === 'ksef.fix' ||
    kind === 'ksef.status'
  );
}

/** Strefa, w której liczą się wszystkie terminy w tym produkcie. */
const WARSAW = 'Europe/Warsaw';

const WARSAW_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: WARSAW,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Numer dnia kalendarzowego w polskiej strefie.
 *
 * DLACZEGO NIE `new Date().getDate()`: serwer chodzi w UTC (kontenery
 * domyślnie tak mają), a klient żyje w Warszawie. Wpłata o 23:30 czasu
 * polskiego to dla serwera 21:30 UTC tego samego dnia, ale wpłata o 00:30
 * czasu polskiego to dla serwera 22:30 dnia POPRZEDNIEGO — i agent
 * powiedziałby „wczoraj” o czymś, co dla klienta wydarzyło się dziś.
 * Granicę doby wyznaczamy więc jawnie w strefie Europe/Warsaw.
 */
function warsawDayNumber(ms: number): number {
  const iso = WARSAW_DATE.format(new Date(ms)); // YYYY-MM-DD
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** „dziś”, „wczoraj” albo data — tak, jak powiedziałby to człowiek. */
export function relativeDay(
  value: string | number | null | undefined,
  now: Date = new Date(),
): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const then = Date.parse(value);
  if (Number.isNaN(then)) return null;

  const days = warsawDayNumber(now.getTime()) - warsawDayNumber(then);

  if (days <= 0) return 'dziś';
  if (days === 1) return 'wczoraj';
  if (days < 7) return `${days} dni temu`;
  return new Date(then).toLocaleDateString('pl-PL', { timeZone: WARSAW });
}

function factsFromPayload(payload: Record<string, unknown>): FloFacts {
  const facts: FloFacts = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'facts' || key === 'preview' || key === 'items') continue;
    if (typeof value === 'string' || typeof value === 'number') {
      facts[key] = value;
    }
  }
  return facts;
}

function readFacts(value: unknown): FloFacts | null {
  if (typeof value !== 'object' || value === null) return null;
  const out: FloFacts = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' || typeof raw === 'number' || raw === null) {
      out[key] = raw;
    }
  }
  return out;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function buyerName(buyerData: unknown): string | null {
  if (typeof buyerData !== 'object' || buyerData === null) return null;
  const record = buyerData as Record<string, unknown>;
  const name = record.name ?? record.nazwa ?? record.buyer_name;
  return typeof name === 'string' && name.trim().length > 0
    ? name.trim()
    : null;
}
