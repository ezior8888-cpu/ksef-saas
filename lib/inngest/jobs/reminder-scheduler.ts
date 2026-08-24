// Cron: co godzinę szuka faktur po terminie i PROPONUJE ponaglenie.
//
// ZMIANA Z 24.08.2026 (krok 6 planu agenta FLO — spłata długu):
// do tej pory ten cron sam planował wysyłkę, a `send-reminder` sam wysyłał
// maila do kontrahenta — bez jednego kliknięcia człowieka. To łamie zasadę,
// na której stoi cały agent: nic nie wychodzi na zewnątrz w imieniu klienta
// bez jego decyzji. Nie chodzi o teorię — ponaglenie wysłane komuś, kto
// zapłacił trzy dni temu, kompromituje klienta przed jego własnym
// kontrahentem, a winą obciąży narzędzie.
//
// Od teraz cron tworzy PROPOZYCJĘ w `flo_proposals`. Mail wychodzi dopiero
// z kliknięcia człowieka, przez wykonawcę propozycji (krok 11 planu).
// Nie ma i nie będzie przełącznika „wysyłaj automatycznie", także
// w ustawieniach — to jest dokładnie ten przełącznik, o którym ktoś
// zapomni, że go włączył.

import { cron } from 'inngest';

import { inngest } from '@/lib/inngest/client';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import { computeFingerprint } from '@/lib/flo/fingerprint';
import { createProposal } from '@/lib/flo/proposals';
import {
  decideNextReminder,
  findInvoicesRequiringReminders,
} from '@/lib/reminders/scheduler';

/** Ponaglenie starzeje się szybko — po dwóch dobach sytuacja jest już inna. */
const PROPOSAL_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runReminderScheduler({ step }: JobContext) {
  const candidates = await step.run('find-candidates', async () => {
    return findInvoicesRequiringReminders();
  });

  if (candidates.length === 0) {
    return { processed: 0, proposed: 0, message: 'Brak kandydatów' };
  }

  let proposedCount = 0;
  const errors: Array<{ invoiceId: string; error: string }> = [];

  for (const invoice of candidates) {
    try {
      const decision = await step.run(`decide-${invoice.id}`, async () => {
        return decideNextReminder(invoice);
      });

      if (!decision.shouldSend || !decision.stage || !decision.scheduledFor) {
        continue;
      }

      const created = await step.run(`propose-${invoice.id}`, async () => {
        const stage = decision.stage!;
        const payload = { invoiceId: invoice.id, stage };

        // Odcisk liczymy TĄ SAMĄ drogą, którą policzy go re-walidacja przy
        // kliknięciu. Gdyby cron budował fakty po swojemu, a wykonawca po
        // swojemu, każda propozycja wyglądałaby na nieaktualną w chwili
        // otwarcia — i agent milczałby zawsze.
        const { fingerprint, state } = await computeFingerprint(
          'payment.chase',
          payload,
        );

        const outstanding =
          Number(state.facts.grossTotal ?? 0) -
          Number(state.facts.paidAmount ?? 0);
        const who = state.context.contractorName ?? 'Kontrahent';
        const number = state.context.invoiceNumber ?? 'bez numeru';
        const overdueDays = daysOverdue(invoice.payment_due_date);

        const result = await createProposal({
          tenantId: invoice.tenant_id,
          kind: 'payment.chase',
          // Etap w kluczu tematu, bo drugie i trzecie ponaglenie to osobne
          // decyzje, a nie powtórka tej samej.
          topicKey: `payment.chase:${invoice.id}:${stage}`,
          priority: 10,
          title: `${who} — ${formatPln(outstanding)}, ${overdueDays} dni po terminie`,
          body: 'Przygotowałem wiadomość do wysłania. Przeczytaj ją i zdecyduj — sam jej nie wyślę.',
          fingerprint,
          expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
          payload: {
            ...payload,
            // Fakty zapisujemy razem z propozycją, żeby przy kliknięciu dało
            // się powiedzieć nie tylko „nieaktualne”, ale CO się zmieniło.
            facts: state.facts,
            suggestedFor: coerceStepDate(decision.scheduledFor).toISOString(),
          },
          evidence: [
            { label: `Faktura ${number}`, href: `/invoices/${invoice.id}` },
            { label: 'Przeterminowane', href: '/payments/overdue' },
          ],
        });

        return result.status === 'created';
      });

      if (created) proposedCount++;
    } catch (e) {
      errors.push({
        invoiceId: invoice.id,
        error: e instanceof Error ? e.message : 'Unknown',
      });
    }
  }

  return {
    processed: candidates.length,
    proposed: proposedCount,
    errors: errors.length,
  };
}

export const reminderSchedulerJob = inngest.createFunction(
  {
    id: 'reminder-scheduler',
    name: 'Wkurzacz: propozycje ponagleń (co godzinę)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 0 * * * *')],
  },
  async ({ step, logger, attempt }) =>
    runReminderScheduler(toJobContext({ step, logger, attempt })),
);

// ═══════════════════════════════════════════════════════════════
// Pomocnicze
//
// TYMCZASOWE: `formatPln` przenosi się do `lib/flo/money.ts` (krok 14),
// razem z resztą formatowania kwot po stronie serwera.
// ═══════════════════════════════════════════════════════════════

function coerceStepDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(NaN);
}

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((Date.now() - due) / 86_400_000));
}

function formatPln(amount: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
  }).format(amount);
}
