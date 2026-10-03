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

import type { JobContext } from '@/lib/jobs/registry';
import { computeFingerprint } from '@/lib/flo/fingerprint';
import { buildChaseProposal } from '@/lib/flo/functions/payment-chase';
import { createProposal } from '@/lib/flo/proposals';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  decideNextReminder,
  findInvoicesRequiringReminders,
} from '@/lib/reminders/scheduler';

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runReminderScheduler({ step, logger }: JobContext) {
  const candidates = await step.run('find-candidates', async () => {
    return findInvoicesRequiringReminders();
  });

  if (candidates.length === 0) {
    return { processed: 0, proposed: 0, message: 'Brak kandydatów' };
  }

  // Firmy z włączonym Wkurzaczem — jedno zapytanie zamiast pytania o
  // ustawienia przy każdej z setek faktur co godzinę (AUD-89). Decyzja per
  // faktura i tak sprawdza ustawienia jeszcze raz; tu tylko odsiew.
  const enabledTenants = await step.run('load-enabled-tenants', () =>
    readEnabledTenants([...new Set(candidates.map((c) => c.tenant_id))]),
  );
  const enabled = new Set(enabledTenants);

  let proposedCount = 0;
  const errors: Array<{ invoiceId: string; error: string }> = [];

  for (const invoice of candidates) {
    if (!enabled.has(invoice.tenant_id)) continue;
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
        // Odcisk trafia do propozycji przez `buildChaseProposal`; tutaj
        // potrzebujemy samych faktów do treści.
        const { state } = await computeFingerprint(
          'payment.chase',
          payload,
          invoice.tenant_id,
        );

        // ROZ: do zapłaty jest reszta po zaliczkach (`amountDue` w faktach
        // z `readState`), nie całe `grossTotal` — zapasowy grossTotal tylko
        // dla faktów bez tego pola (C-16, 00130).
        const outstanding =
          Number(state.facts.amountDue ?? state.facts.grossTotal ?? 0) -
          Number(state.facts.paidAmount ?? 0);
        const who = state.context.contractorName ?? 'Kontrahent';
        const number = state.context.invoiceNumber ?? 'bez numeru';
        const overdueDays = daysOverdue(invoice.payment_due_date);

        const result = await createProposal(
          buildChaseProposal({
            tenantId: invoice.tenant_id,
            invoiceId: invoice.id,
            invoiceNumber: number,
            contractorName: who,
            outstanding,
            daysOverdue: overdueDays,
            stage,
            recipientEmail: null,
            facts: state.facts,
          }),
        );

        return result.status === 'created';
      });

      if (created) proposedCount++;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown';
      errors.push({ invoiceId: invoice.id, error });
      // Do 02.10 błąd był tylko liczony — propozycja ponaglenia nie
      // powstawała, a w logach nie było śladu dlaczego.
      logger.warn('Nie udało się przygotować propozycji ponaglenia', {
        invoiceId: invoice.id,
        tenantId: invoice.tenant_id,
        error,
      });
    }
  }

  if (errors.length > 0) {
    logger.error('Scheduler ponagleń: faktury z błędem', {
      errors: errors.length,
      processed: candidates.length,
    });
  }

  return {
    processed: candidates.length,
    proposed: proposedCount,
    errors: errors.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// Pomocnicze
//
// Treść karty buduje `buildChaseProposal` (krok 23) — jedno źródło prawdy
// dla tekstu, progów i bezpieczników. Tutaj zostaje wyłącznie to, czego
// scheduler potrzebuje do wyliczeń.
// ═══════════════════════════════════════════════════════════════

/** Lista uczestnicząca w odsiewie musi być pełna: błąd odczytu rzuca. */
const SETTINGS_CHUNK = 100;

async function readEnabledTenants(tenantIds: string[]): Promise<string[]> {
  const supabase = createAdminClient();
  const out: string[] = [];
  for (let i = 0; i < tenantIds.length; i += SETTINGS_CHUNK) {
    const { data, error } = await supabase
      .from('reminder_settings')
      .select('tenant_id')
      .in('tenant_id', tenantIds.slice(i, i + SETTINGS_CHUNK))
      .eq('enabled', true);
    // „Nie wiem, kto ma włączone” to nie „nikt” — inaczej awaria bazy
    // wyglądałaby jak spokojna godzina bez ponagleń.
    if (error) throw new Error(`Nie można odczytać ustawień ponagleń: ${error.message}`);
    for (const row of (data ?? []) as Array<{ tenant_id: string }>) out.push(row.tenant_id);
  }
  return out;
}

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((Date.now() - due) / 86_400_000));
}
