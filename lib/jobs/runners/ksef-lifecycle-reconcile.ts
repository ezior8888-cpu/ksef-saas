import { randomUUID } from 'node:crypto';

import * as Sentry from '@sentry/nextjs';

import { buildKsefRequeueEvent, type KsefRequeueSourceRow } from '@/lib/invoices/ksef-requeue-event';
import { ksefSendTransactionStep } from '@/lib/invoices/ksef-send-step';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import type { JobContext } from '@/lib/jobs/registry';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { AUTO_REQUEUE_CODES, SEND_ERROR_CODES } from '@/lib/ksef/send-error-classes';
import { isKsefSubmissionPaused } from '@/lib/ksef/submission-holds';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Cron `cron.ksef-lifecycle-reconcile` (co 15 min) — automat cyklu życia
 * faktury (PR 4b; docs/architecture/cykl-zycia-faktury-ksef.md, sekcja 5):
 *
 *   I1  `queued` ponad 15 min bez zlecenia w pg-boss → `release_ksef_enqueue`
 *       (powrót do szkicu, gdy nie ma dowodu kontaktu z KSeF); gdy dowód jest,
 *       `failed ENQUEUE_LOST` (klasa reconcile — operator).
 *   I6  `failed` z kodem klasy transient oznaczonym `auto_requeue` (awaria
 *       KSeF, limit, sesja, nasza baza) → `requeue_ksef_send` nie częściej
 *       niż co godzinę; po 24 automatycznych ponowieniach w ciągu doby
 *       `TRANSIENT_EXHAUSTED` (decyzja D1) — dalej klient albo operator.
 *   I7  `failed KSEF_PAUSED` po zdjęciu wyłącznika operatora → ponowienie.
 *       KOR_HOLD i ROZ_HOLD dotyczą dokumentów specjalnych, których zdarzenia
 *       wysyłki nie da się odtworzyć z wiersza — zostają operatorowi.
 *
 * Każde ponowienie to RPC w jednej transakcji ze zleceniem pg-boss (jak
 * kolejkowanie z akcji klienta), z aktorem NULL — po tym cron rozpoznaje
 * swoje ponowienia w `audit_logs` i liczy je do limitu. Przy włączonym
 * hamulcu (albo gdy nie da się go odczytać) cron niczego nie ponawia;
 * I1 obsługuje zawsze, bo to porządkowanie, nie wysyłka.
 *
 * Pozostałe naruszenia (I2–I5, I9) tylko alarmuje monitor alarmów
 * (`checkKsefLifecycleViolations`) — tam nie ma bezpiecznej akcji automatu.
 */

/** Nie częściej niż raz na godzinę dla jednej faktury. */
export const LIFECYCLE_REQUEUE_MIN_AGE_MS = 60 * 60 * 1000;
/** 24 automatyczne ponowienia ≈ doba (D1). */
export const LIFECYCLE_REQUEUE_MAX = 24;
/** Okno zliczania ponowień w audycie — doba z zapasem na przesunięcia przebiegów. */
export const LIFECYCLE_REQUEUE_WINDOW_MS = 25 * 60 * 60 * 1000;
/** Rozsądna paczka na przebieg — przy zaległości kolejne przebiegi dobiorą resztę. */
export const LIFECYCLE_BATCH = 100;

export const TRANSIENT_EXHAUSTED_MESSAGE =
  'Automatyczne ponowienia przez 24 godziny nie powiodły się. Wyślij fakturę ponownie ręcznie albo wróć do szkicu.';
export const ENQUEUE_LOST_MESSAGE =
  'Zlecenie wysyłki zaginęło, a faktura ma ślad kontaktu z KSeF — wymaga uzgodnienia przez operatora.';
export const I1_RELEASE_REASON = 'I1: queued ponad 15 min bez zlecenia w pg-boss';

export interface LifecycleReconcileReport {
  /** `null` = nie udało się odczytać hamulca (ponowienia pominięte). */
  paused: boolean | null;
  i1Released: number;
  i1Lost: number;
  requeued: number;
  exhausted: number;
  resumedAfterPause: number;
  skippedSpecial: number;
  errors: number;
}

interface ViolationRow {
  invariant: string;
  invoice_id: string;
  tenant_id: string;
}

type CandidateRow = KsefRequeueSourceRow & { last_error_code: string | null };

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.ksef-lifecycle-reconcile).
 */
export async function runKsefLifecycleReconcile({ step, logger }: JobContext): Promise<LifecycleReconcileReport> {
  const env = requireConfiguredKsefEnvironment();
  const supabase = createAdminClient();
  const report: LifecycleReconcileReport = {
    paused: null, i1Released: 0, i1Lost: 0, requeued: 0, exhausted: 0, resumedAfterPause: 0, skippedSpecial: 0, errors: 0,
  };

  // Hamulec operatora: odczyt autorytatywny, awaria = brak ponowień (fail-closed).
  report.paused = await step.run('read-pause-flag', async (): Promise<boolean | null> => {
    try {
      return await isKsefSubmissionPaused();
    } catch {
      return null;
    }
  });

  // ── I1: queued bez zlecenia ───────────────────────────────────────
  const violations = await step.run('read-violations', async (): Promise<ViolationRow[]> => {
    const { data, error } = await supabase.rpc('ksef_lifecycle_violations');
    if (error) throw new Error(`ksef_lifecycle_violations: ${error.message}`);
    return (data ?? []) as ViolationRow[];
  });
  for (const v of violations.filter((row) => row.invariant === 'I1').slice(0, LIFECYCLE_BATCH)) {
    try {
      const released = await step.run(`i1-release-${v.invoice_id}`, async (): Promise<boolean> => {
        const { data, error } = await supabase.rpc('release_ksef_enqueue', {
          p_invoice_id: v.invoice_id,
          p_tenant_id: v.tenant_id,
          p_reason: I1_RELEASE_REASON,
        });
        if (error) throw new Error(`release_ksef_enqueue: ${error.message}`);
        return data === true;
      });
      if (released) {
        report.i1Released += 1;
        continue;
      }
      // Dowód kontaktu z KSeF jest, a zlecenia nie ma — nie wiadomo, co KSeF dostał.
      await step.run(`i1-lost-${v.invoice_id}`, async () => {
        const { error } = await supabase
          .from('invoices')
          .update({
            ksef_status: 'failed',
            last_error_code: SEND_ERROR_CODES.ENQUEUE_LOST,
            last_error: ENQUEUE_LOST_MESSAGE,
            ksef_send_owner: null,
          })
          .eq('id', v.invoice_id)
          .eq('tenant_id', v.tenant_id)
          .eq('ksef_status', 'queued');
        if (error) throw new Error(`ENQUEUE_LOST: ${error.message}`);
      });
      report.i1Lost += 1;
    } catch (e) {
      report.errors += 1;
      logger.error('Cykl życia: I1 nieobsłużone', { invoiceId: v.invoice_id, error: e instanceof Error ? e.message : String(e) });
      Sentry.captureException(e, { tags: { job: 'ksef-lifecycle-reconcile', invariant: 'I1' }, extra: { invoiceId: v.invoice_id } });
    }
  }

  if (report.paused !== false) {
    logger.warn(report.paused === null
      ? 'Cykl życia: nie można odczytać hamulca — ponowienia pominięte'
      : 'Cykl życia: wysyłki wstrzymane wyłącznikiem — ponowienia pominięte');
  } else {
    // ── I6: automatyczne ponowienie klasy transient ─────────────────
    const cutoffIso = new Date(Date.now() - LIFECYCLE_REQUEUE_MIN_AGE_MS).toISOString();
    const transient = await step.run('find-transient', async (): Promise<CandidateRow[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, tenant_id, invoice_kind, last_error_code, fa3_data, tenants(nip)')
        .eq('direction', 'outgoing')
        .eq('ksef_status', 'failed')
        .in('last_error_code', [...AUTO_REQUEUE_CODES])
        .lt('updated_at', cutoffIso)
        .order('updated_at', { ascending: true })
        .limit(LIFECYCLE_BATCH);
      if (error) throw new Error(`Cykl życia: nie można odczytać faktur do ponowienia: ${error.message}`);
      return (data ?? []) as CandidateRow[];
    });

    const autoCounts = transient.length === 0
      ? new Map<string, number>()
      : await step.run('count-auto-requeues', async (): Promise<Map<string, number>> => {
        const sinceIso = new Date(Date.now() - LIFECYCLE_REQUEUE_WINDOW_MS).toISOString();
        const { data, error } = await supabase
          .from('audit_logs')
          .select('entity_id')
          .eq('action', 'invoice.send_requeued')
          .is('user_id', null)
          .in('entity_id', transient.map((row) => row.id))
          .gte('created_at', sinceIso);
        if (error) throw new Error(`Cykl życia: nie można policzyć ponowień: ${error.message}`);
        const counts = new Map<string, number>();
        for (const row of (data ?? []) as Array<{ entity_id: string | null }>) {
          if (row.entity_id) counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
        }
        return counts;
      });

    for (const row of transient) {
      try {
        if ((autoCounts.get(row.id) ?? 0) >= LIFECYCLE_REQUEUE_MAX) {
          await step.run(`exhaust-${row.id}`, async () => {
            const { error } = await supabase
              .from('invoices')
              .update({
                last_error_code: SEND_ERROR_CODES.TRANSIENT_EXHAUSTED,
                last_error: TRANSIENT_EXHAUSTED_MESSAGE,
              })
              .eq('id', row.id)
              .eq('tenant_id', row.tenant_id)
              .eq('ksef_status', 'failed')
              .eq('last_error_code', row.last_error_code ?? '');
            if (error) throw new Error(`TRANSIENT_EXHAUSTED: ${error.message}`);
          });
          report.exhausted += 1;
          continue;
        }
        const outcome = await step.run(`requeue-${row.id}`, () => requeue(row));
        if (outcome === 'sent') report.requeued += 1;
        else if (outcome === 'special-kind') report.skippedSpecial += 1;
      } catch (e) {
        report.errors += 1;
        logger.error('Cykl życia: ponowienie nieudane', { invoiceId: row.id, code: row.last_error_code, error: e instanceof Error ? e.message : String(e) });
        Sentry.captureException(e, { tags: { job: 'ksef-lifecycle-reconcile', invariant: 'I6' }, extra: { invoiceId: row.id, code: row.last_error_code } });
      }
    }

    // ── I7: wznowienie po zdjęciu hamulca operatora ─────────────────
    const held = await step.run('find-paused', async (): Promise<CandidateRow[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, tenant_id, invoice_kind, last_error_code, fa3_data, tenants(nip)')
        .eq('direction', 'outgoing')
        .eq('ksef_status', 'failed')
        .eq('last_error_code', SEND_ERROR_CODES.KSEF_PAUSED)
        .order('updated_at', { ascending: true })
        .limit(LIFECYCLE_BATCH);
      if (error) throw new Error(`Cykl życia: nie można odczytać faktur po hamulcu: ${error.message}`);
      return (data ?? []) as CandidateRow[];
    });
    for (const row of held) {
      try {
        const outcome = await step.run(`resume-${row.id}`, () => requeue(row));
        if (outcome === 'sent') report.resumedAfterPause += 1;
        else if (outcome === 'special-kind') report.skippedSpecial += 1;
      } catch (e) {
        report.errors += 1;
        logger.error('Cykl życia: wznowienie po hamulcu nieudane', { invoiceId: row.id, error: e instanceof Error ? e.message : String(e) });
        Sentry.captureException(e, { tags: { job: 'ksef-lifecycle-reconcile', invariant: 'I7' }, extra: { invoiceId: row.id } });
      }
    }
  }

  if (report.exhausted > 0 || report.i1Lost > 0) {
    // Nie wyjątek: to decyzja dla operatora, widoczna w /admin/ksef.
    Sentry.captureMessage('Cykl życia faktury: faktury czekają na operatora', {
      level: 'warning',
      tags: { job: 'ksef-lifecycle-reconcile' },
      extra: { ...report },
    });
  }
  logger.info('Cykl życia: przebieg zakończony', { ...report });
  return report;

  /** Ponowienie przez RPC w transakcji ze zleceniem; aktor NULL = automat. */
  async function requeue(row: CandidateRow): Promise<'sent' | 'special-kind' | 'incomplete' | 'no-nip'> {
    const built = buildKsefRequeueEvent(row, env, randomUUID());
    if (!built.ok) {
      logger.warn('Cykl życia: faktury nie da się ponowić automatycznie', { invoiceId: row.id, reason: built.reason });
      return built.reason;
    }
    await sendJobEvent(built.event, {
      inTransaction: ksefSendTransactionStep(
        { kind: 'requeue', actorUserId: null, reconcileOnly: false },
        { invoiceId: row.id, tenantId: row.tenant_id, attemptId: built.sendAttemptId },
      ),
    });
    return 'sent';
  }
}
