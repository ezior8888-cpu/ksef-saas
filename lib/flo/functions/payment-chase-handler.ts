/**
 * Wykonawca ponagleń (krok 23 planu) — WYŁĄCZNIE ta część, która wysyła.
 *
 * Osobny plik od `payment-chase.ts`, bo tamten importuje cron budujący
 * propozycje. Gdyby wysyłka siedziała w tym samym module, w grafie
 * zależności powstałaby ścieżka „cron → wysyłka na zewnątrz" — i test
 * architektoniczny miałby rację, zgłaszając ją jako naruszenie.
 *
 * Ten plik importuje wyłącznie rejestr funkcji agenta, ładowany przez
 * workera i przez akcje serwerowe.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  evaluateChaseSafety,
  latestPaymentMoment,
  paymentDateWindowStart,
  SAFETY_WINDOW_MS,
} from '@/lib/flo/functions/payment-chase';
import { registerFloHandler } from '@/lib/flo/handlers';
import { remindersSendRequested } from '@/lib/inngest/client';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  Constants,
  type Database,
  type TablesInsert,
} from '@/types/database';

type ReminderStage = Database['public']['Enums']['reminder_stage_enum'];

function isReminderStage(value: unknown): value is ReminderStage {
  return (Constants.public.Enums.reminder_stage_enum as readonly unknown[]).includes(
    value,
  );
}

/** Wystarczy jedna świeża wpłata — reszta niczego nie zmienia w decyzji. */
const RECENT_PAYMENTS_LIMIT = 20;

// ═══════════════════════════════════════════════════════════════
// Okno bezpieczeństwa — odczyt
// ═══════════════════════════════════════════════════════════════

/**
 * Ostatnia wpłata od kontrahenta tej faktury, na DOWOLNĄ jego fakturę.
 *
 * DLACZEGO PO KONTRAHENCIE: przelew bywa zaksięgowany na inną pozycję tego
 * samego klienta, a mimo to znaczy „ten człowiek właśnie zapłacił". Kontrahent
 * to NIP nabywcy na fakturze w obrębie konta. Faktura bez NIP-u (konsument)
 * nie ma po czym szukać innych faktur — wtedy liczą się wpłaty do niej samej.
 *
 * Filtr w zapytaniu to tylko zawężenie; o blokadzie decyduje
 * `latestPaymentMoment` + `evaluateChaseSafety`. Dwa warunki w `or`, bo
 * wiersz może być świeży z dwóch powodów (patrz `latestPaymentMoment`).
 */
async function readLastContractorPayment(
  client: SupabaseClient<Database>,
  input: {
    tenantId: string;
    invoiceId: string;
    buyerNip: string | null;
    now: Date;
  },
): Promise<string | null> {
  const since = new Date(input.now.getTime() - SAFETY_WINDOW_MS);
  const nip = input.buyerNip?.trim() || null;

  const query = client
    .from('payments')
    .select('payment_date, created_at, invoices!inner(buyer_nip)')
    .eq('tenant_id', input.tenantId)
    .or(
      `created_at.gte.${since.toISOString()},payment_date.gte.${paymentDateWindowStart(since)}`,
    );

  const scoped = nip
    ? query.eq('invoices.buyer_nip', nip)
    : query.eq('invoice_id', input.invoiceId);

  const { data, error } = await scoped
    .order('created_at', { ascending: false })
    .limit(RECENT_PAYMENTS_LIMIT);

  if (error) throw new Error(error.message);
  return latestPaymentMoment(data ?? []);
}

// ═══════════════════════════════════════════════════════════════
// Wykonawca
// ═══════════════════════════════════════════════════════════════

/**
 * Wysyłka ponaglenia.
 *
 * Wiersz w `payment_reminders` powstaje DOPIERO TUTAJ — czyli po zgodzie
 * człowieka. Od kroku 6 cron go nie tworzy, bo kolejka wpisów „pending",
 * których nikt nigdy nie wyśle, to śmieci w bazie i fałszywy obraz w raportach.
 *
 * Żeton zgody idzie dalej do zadania wysyłki. To jest ten sam identyfikator,
 * który wykonawca zużył przed wywołaniem tego kodu — dowód, że wysyłka ma
 * pokrycie w decyzji człowieka.
 */
registerFloHandler('payment.chase', async (ctx) => {
  const now = new Date();
  const payload = ctx.proposal.payload ?? {};
  const invoiceId = payload.invoiceId;
  const stage = payload.stage;

  if (typeof invoiceId !== 'string' || !isReminderStage(stage)) {
    throw new Error('Propozycja ponaglenia bez kompletu danych');
  }

  const tenantId = ctx.proposal.tenant_id;

  // KLIENT TYPOWANY, NIE RZUTOWANY. Poprzednia wersja rzutowała klienta na
  // ręczny interfejs przyjmujący dowolny napis kolumny i pytała o
  // `payments.paid_at`, którego tabela nie ma. Typecheck milczał, zapytanie
  // zwracało błąd, a każde zatwierdzone ponaglenie kończyło się
  // „Nie udało mi się tego dokończyć".
  const client: SupabaseClient<Database> = createAdminClient();

  // Klient administracyjny omija RLS — przynależność faktury do konta
  // sprawdzamy jawnie, zanim cokolwiek o niej przeczytamy.
  const invoice = await client
    .from('invoices')
    .select('buyer_nip')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (invoice.error) throw new Error(invoice.error.message);
  if (!invoice.data) {
    throw new Error('Faktury z tego ponaglenia nie ma na tym koncie');
  }

  // ── Okno bezpieczeństwa ──────────────────────────────────────
  const lastPaymentAt = await readLastContractorPayment(client, {
    tenantId,
    invoiceId,
    buyerNip: invoice.data.buyer_nip,
    now,
  });

  const facts = (payload.facts ?? {}) as Record<string, unknown>;
  const outstanding =
    Number(facts.grossTotal ?? 0) - Number(facts.paidAmount ?? 0);

  const safety = evaluateChaseSafety({
    outstanding,
    lastPaymentFromContractorAt: lastPaymentAt,
    remindersPaused: facts.remindersPaused === 1,
    now,
  });

  if (!safety.ok) {
    // Blokada w handlerze, a nie po drodze: to ostatni moment, w którym
    // da się zatrzymać coś, czego nie da się cofnąć.
    throw new Error(safety.message);
  }

  // ── Wiersz przypomnienia dopiero po zgodzie ──────────────────
  const reminder: TablesInsert<'payment_reminders'> = {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    stage,
    channel: 'email',
    scheduled_for: now.toISOString(),
    status: 'pending',
  };

  const created = await client
    .from('payment_reminders')
    .insert(reminder)
    .select('id')
    .maybeSingle();

  if (created.error) throw new Error(created.error.message);
  const reminderId = created.data?.id;
  if (!reminderId) throw new Error('Nie udało się zapisać przypomnienia');

  // ── Wysyłka z żetonem zgody ──────────────────────────────────
  await sendJobEvent(
    remindersSendRequested.create({
      reminderId,
      approvalId: ctx.approvalId,
    }),
  );

  return {
    summary: `ponaglenie ${stage} przekazane do wysyłki`,
    details: { invoiceId, reminderId, stage },
  };
});
