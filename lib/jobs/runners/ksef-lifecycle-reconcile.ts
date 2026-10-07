import { randomUUID } from 'node:crypto';

import * as Sentry from '@sentry/nextjs';

import { todayInWarsaw } from '@/lib/format/warsaw-date';
import {
  buildKsefRequeueEvent,
  KSEF_RESEND_SOURCE_COLUMNS,
  type KsefRequeueRefusal,
  type KsefRequeueSourceRow,
} from '@/lib/invoices/ksef-requeue-event';
import { isOpenCorrectionConflict, ksefSendTransactionStep } from '@/lib/invoices/ksef-send-step';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import type { JobContext } from '@/lib/jobs/registry';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { sendableSpecialKinds } from '@/lib/ksef/kind-holds';
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
 *   I6  `failed` z kodem klasy transient z listy `AUTO_REQUEUE_CODES` (lustro
 *       `auto_requeue`: awaria KSeF, limit, sesja, nasza baza) →
 *       `requeue_ksef_send` nie częściej niż co godzinę; po 24 automatycznych
 *       ponowieniach w ciągu doby `TRANSIENT_EXHAUSTED` (decyzja D1) — dalej
 *       klient albo operator.
 *   I7  `failed KSEF_PAUSED` po zdjęciu wyłącznika operatora → ponowienie.
 *       KOR_HOLD i ROZ_HOLD zostają operatorowi (zdejmuje je C4).
 *   I5  (A3) otwarty wpis `sent` albo zamiar `intent` starszy niż 48 h przy
 *       fakturze `failed`/`rejected` → „tylko uzgodnij” (`requeue_ksef_send`
 *       z `p_reconcile_only`): runner pyta KSeF o tamtą wysyłkę i NIGDY nie
 *       wysyła od nowa. Najwyżej raz na dobę na fakturę; po trzech próbach
 *       w tygodniu cron przestaje i alarmuje — faktura czeka na operatora.
 *       Wynik uzgodnienia: `accepted`, `rejected` albo `NOT_IN_KSEF`
 *       (A2b — klient wysyła ponownie albo wraca do szkicu).
 *
 * Dokumenty specjalne (A4b PR2a) — zdarzenie z kopii na wierszu
 * (`ksef-requeue-event.ts`): I6/I7 ponawiają KOR/ZAL z zapisanymi danymi
 * tylko w dniu wystawienia i tylko rodzaj niewstrzymany w tym środowisku
 * (KOR nie na PROD, ROZ nigdy — C4; decyzja Bartosza 06.10.2026 b).
 * Ponowienie, które dojdzie do KSeF po północy, worker kończy kodem
 * `ISSUE_DATE_PASSED` (00147). I5 uzgadnia KOR/ZAL z danymi bez względu na
 * datę (uzgodnienie nie wysyła); KOR na PROD i ROZ — tylko alarm.
 *
 * Każde ponowienie to RPC w jednej transakcji ze zleceniem pg-boss (jak
 * kolejkowanie z akcji klienta), z aktorem NULL — po tym cron rozpoznaje
 * swoje ponowienia w `audit_logs` i liczy je do limitu. Przy włączonym
 * hamulcu (albo gdy nie da się go odczytać) cron niczego nie ponawia;
 * I1 obsługuje zawsze, bo to porządkowanie, nie wysyłka.
 *
 * Pozostałe naruszenia (I2–I4, I9 oraz I5 przy fakturze w innym stanie)
 * tylko alarmuje monitor alarmów (`checkKsefLifecycleViolations`) — tam nie
 * ma bezpiecznej akcji automatu.
 */

/** Nie częściej niż raz na godzinę dla jednej faktury. */
export const LIFECYCLE_REQUEUE_MIN_AGE_MS = 60 * 60 * 1000;
/** 24 automatyczne ponowienia ≈ doba (D1). */
export const LIFECYCLE_REQUEUE_MAX = 24;
/** Okno zliczania ponowień w audycie — doba z zapasem na przesunięcia przebiegów. */
export const LIFECYCLE_REQUEUE_WINDOW_MS = 25 * 60 * 60 * 1000;
/** Rozsądna paczka na przebieg — przy zaległości kolejne przebiegi dobiorą resztę. */
export const LIFECYCLE_BATCH = 100;
/** I5 (A3): „tylko uzgodnij” z crona najwyżej raz na dobę na fakturę… */
export const LIFECYCLE_RECONCILE_MIN_GAP_MS = 24 * 60 * 60 * 1000;
/** …i najwyżej trzy razy w tygodniu — potem operator. */
export const LIFECYCLE_RECONCILE_MAX = 3;
export const LIFECYCLE_RECONCILE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Stany, z których `requeue_ksef_send` przyjmuje tryb uzgodnienia (00131). */
const RECONCILABLE_STATUSES: readonly string[] = ['failed', 'rejected'];

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
  /** Brak danych do odtworzenia zdarzenia: zwykła bez pozycji albo stary dokument specjalny. */
  skippedNoData: number;
  /** Rodzaj wstrzymany w tym środowisku (w praktyce I5: KOR na PROD, ROZ). */
  skippedHeld: number;
  /** Data wystawienia dokumentu specjalnego minęła między odczytem a zleceniem (północ). */
  skippedIssueDate: number;
  /** Odrzucona korekta czeka na inną korektę tej samej faktury pierwotnej (00135). */
  skippedConflict: number;
  /** I5: zlecone „tylko uzgodnij”. */
  i5Reconciled: number;
  /** I5: ostatnia próba z crona młodsza niż doba — czekamy. */
  i5Deferred: number;
  /** I5: trzy próby w tygodniu bez skutku — operator. */
  i5NeedsOperator: number;
  /** I5 przy fakturze poza failed/rejected — tylko alarm. */
  i5Other: number;
  errors: number;
}

interface ViolationRow {
  invariant: string;
  invoice_id: string;
  tenant_id: string;
}

type CandidateRow = KsefRequeueSourceRow & { last_error_code: string | null; ksef_status?: string | null };
/** Kolumny źródła ponowienia + to, czego potrzebuje cron (jeden zestaw dla I5/I6/I7). */
const CANDIDATE_COLUMNS = `${KSEF_RESEND_SOURCE_COLUMNS}, id, tenant_id, last_error_code, tenants(nip)` as const;
const STALE_COLUMNS = `${CANDIDATE_COLUMNS}, ksef_status` as const;
type RequeueOutcome = 'sent' | 'conflict' | KsefRequeueRefusal;

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.ksef-lifecycle-reconcile).
 */
export async function runKsefLifecycleReconcile({ step, logger }: JobContext): Promise<LifecycleReconcileReport> {
  const env = requireConfiguredKsefEnvironment();
  const supabase = createAdminClient();
  const report: LifecycleReconcileReport = {
    paused: null, i1Released: 0, i1Lost: 0, requeued: 0, exhausted: 0, resumedAfterPause: 0,
    skippedNoData: 0, skippedHeld: 0, skippedIssueDate: 0, skippedConflict: 0,
    i5Reconciled: 0, i5Deferred: 0, i5NeedsOperator: 0, i5Other: 0, errors: 0,
  };
  const countSkip = (outcome: Exclude<RequeueOutcome, 'sent'>) => {
    if (outcome === 'missing-special-data' || outcome === 'incomplete') report.skippedNoData += 1;
    else if (outcome === 'kind-held') report.skippedHeld += 1;
    else if (outcome === 'issue-date') report.skippedIssueDate += 1;
    else if (outcome === 'conflict') report.skippedConflict += 1;
    // 'no-nip' — tylko log (jak dotąd).
  };
  /**
   * Faktury do ponowienia: zwykłe i dokumenty specjalne osobnymi zapytaniami,
   * żeby specjalne pominięte w tym przebiegu nie zajmowały paczki zwykłych.
   * Specjalne tylko z dzisiejszą datą wystawienia i rodzaju niewstrzymanego.
   */
  const candidates = async (
    narrow: (query: ReturnType<typeof baseCandidates>) => ReturnType<typeof baseCandidates>,
    errorText: string,
  ): Promise<CandidateRow[]> => {
    const regular = await narrow(baseCandidates()).eq('invoice_kind', 'regular')
      .order('updated_at', { ascending: true }).limit(LIFECYCLE_BATCH);
    if (regular.error) throw new Error(`${errorText}: ${regular.error.message}`);
    const kinds = sendableSpecialKinds(env);
    if (kinds.length === 0) return (regular.data ?? []) as unknown as CandidateRow[];
    const special = await narrow(baseCandidates()).in('invoice_kind', kinds).eq('issue_date', todayInWarsaw())
      .order('updated_at', { ascending: true }).limit(LIFECYCLE_BATCH);
    if (special.error) throw new Error(`${errorText}: ${special.error.message}`);
    return [...(regular.data ?? []), ...(special.data ?? [])] as unknown as CandidateRow[];
  };
  function baseCandidates() {
    return supabase
      .from('invoices')
      .select(CANDIDATE_COLUMNS)
      .eq('direction', 'outgoing')
      .eq('ksef_status', 'failed');
  }

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
    const transient = await step.run('find-transient', (): Promise<CandidateRow[]> => candidates(
      (query) => query.in('last_error_code', [...AUTO_REQUEUE_CODES]).lt('updated_at', cutoffIso),
      'Cykl życia: nie można odczytać faktur do ponowienia',
    ));

    const autoCounts = transient.length === 0
      ? new Map<string, number>()
      : await step.run('count-auto-requeues', async (): Promise<Map<string, number>> => {
        const sinceIso = new Date(Date.now() - LIFECYCLE_REQUEUE_WINDOW_MS).toISOString();
        const ids = transient.map((row) => row.id);
        const counts = new Map<string, number>();
        // Paczkami: zwykłe + specjalne to do 200 identyfikatorów — za długi adres dla jednego zapytania.
        for (let i = 0; i < ids.length; i += LIFECYCLE_BATCH) {
          const { data, error } = await supabase
            .from('audit_logs')
            .select('entity_id')
            .eq('action', 'invoice.send_requeued')
            .is('user_id', null)
            .in('entity_id', ids.slice(i, i + LIFECYCLE_BATCH))
            .gte('created_at', sinceIso);
          if (error) throw new Error(`Cykl życia: nie można policzyć ponowień: ${error.message}`);
          for (const row of (data ?? []) as Array<{ entity_id: string | null }>) {
            if (row.entity_id) counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
          }
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
        else countSkip(outcome);
      } catch (e) {
        report.errors += 1;
        logger.error('Cykl życia: ponowienie nieudane', { invoiceId: row.id, code: row.last_error_code, error: e instanceof Error ? e.message : String(e) });
        Sentry.captureException(e, { tags: { job: 'ksef-lifecycle-reconcile', invariant: 'I6' }, extra: { invoiceId: row.id, code: row.last_error_code } });
      }
    }

    // ── I7: wznowienie po zdjęciu hamulca operatora ─────────────────
    const held = await step.run('find-paused', (): Promise<CandidateRow[]> => candidates(
      (query) => query.eq('last_error_code', SEND_ERROR_CODES.KSEF_PAUSED),
      'Cykl życia: nie można odczytać faktur po hamulcu',
    ));
    for (const row of held) {
      try {
        const outcome = await step.run(`resume-${row.id}`, () => requeue(row));
        if (outcome === 'sent') report.resumedAfterPause += 1;
        else countSkip(outcome);
      } catch (e) {
        report.errors += 1;
        logger.error('Cykl życia: wznowienie po hamulcu nieudane', { invoiceId: row.id, error: e instanceof Error ? e.message : String(e) });
        Sentry.captureException(e, { tags: { job: 'ksef-lifecycle-reconcile', invariant: 'I7' }, extra: { invoiceId: row.id } });
      }
    }

    // ── I5: zalegający wpis sent / zamiar intent → „tylko uzgodnij” (A3) ──
    // Faktury z I6/I7 tego przebiegu pomijamy: ponowione i tak zaczynają od
    // uzgodnienia (A2), a pominięte (brak danych, NIP) I5 pominąłby z tego
    // samego powodu — liczymy je raz. KOR/ZAL z I6/I7 mają dzisiejszą datę,
    // więc nie mają wpisu starszego niż 48 h.
    const alreadyQueued = new Set([...transient, ...held].map((row) => row.id));
    const staleIds = [...new Set(violations.filter((v) => v.invariant === 'I5').map((v) => v.invoice_id))]
      .filter((id) => !alreadyQueued.has(id))
      .slice(0, LIFECYCLE_BATCH);
    const stale = staleIds.length === 0 ? [] : await step.run('find-stale-submissions', async (): Promise<CandidateRow[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select(STALE_COLUMNS)
        .eq('direction', 'outgoing')
        .in('id', staleIds);
      if (error) throw new Error(`Cykl życia: nie można odczytać faktur z zalegającym wpisem: ${error.message}`);
      return (data ?? []) as unknown as CandidateRow[];
    });
    const reconcilable = stale.filter((row) => RECONCILABLE_STATUSES.includes(row.ksef_status ?? ''));
    report.i5Other += stale.length - reconcilable.length;

    const reconcileAttempts = reconcilable.length === 0
      ? new Map<string, string[]>()
      : await step.run('count-auto-reconciles', async (): Promise<Map<string, string[]>> => {
        const sinceIso = new Date(Date.now() - LIFECYCLE_RECONCILE_WINDOW_MS).toISOString();
        const { data, error } = await supabase
          .from('audit_logs')
          .select('entity_id, created_at')
          .eq('action', 'invoice.send_requeued')
          .is('user_id', null)
          .eq('details_json->>reconcile_only', 'true')
          .in('entity_id', reconcilable.map((row) => row.id))
          .gte('created_at', sinceIso);
        if (error) throw new Error(`Cykl życia: nie można policzyć uzgodnień: ${error.message}`);
        const attempts = new Map<string, string[]>();
        for (const row of (data ?? []) as Array<{ entity_id: string | null; created_at: string }>) {
          if (row.entity_id) attempts.set(row.entity_id, [...(attempts.get(row.entity_id) ?? []), row.created_at]);
        }
        return attempts;
      });

    const recentIso = new Date(Date.now() - LIFECYCLE_RECONCILE_MIN_GAP_MS).toISOString();
    for (const row of reconcilable) {
      try {
        const attempts = reconcileAttempts.get(row.id) ?? [];
        if (attempts.length >= LIFECYCLE_RECONCILE_MAX) {
          report.i5NeedsOperator += 1;
          continue;
        }
        if (attempts.some((at) => at >= recentIso)) {
          report.i5Deferred += 1;
          continue;
        }
        const outcome = await step.run(`reconcile-${row.id}`, () => requeue(row, { reconcileOnly: true }));
        if (outcome === 'sent') report.i5Reconciled += 1;
        else countSkip(outcome);
      } catch (e) {
        report.errors += 1;
        logger.error('Cykl życia: uzgodnienie zalegającej wysyłki nieudane', { invoiceId: row.id, error: e instanceof Error ? e.message : String(e) });
        Sentry.captureException(e, { tags: { job: 'ksef-lifecycle-reconcile', invariant: 'I5' }, extra: { invoiceId: row.id } });
      }
    }
  }

  if (report.exhausted > 0 || report.i1Lost > 0 || report.i5NeedsOperator > 0) {
    // Nie wyjątek: to decyzja dla operatora, widoczna w /admin/ksef.
    Sentry.captureMessage('Cykl życia faktury: faktury czekają na operatora', {
      level: 'warning',
      tags: { job: 'ksef-lifecycle-reconcile' },
      extra: { ...report },
    });
  }
  logger.info('Cykl życia: przebieg zakończony', { ...report });
  return report;

  /**
   * Ponowienie przez RPC w transakcji ze zleceniem; aktor NULL = automat.
   * `reconcileOnly` (I5): runner tylko uzgadnia — jak „Tylko uzgodnij” operatora.
   */
  async function requeue(
    row: CandidateRow,
    options: { reconcileOnly: boolean } = { reconcileOnly: false },
  ): Promise<RequeueOutcome> {
    const built = buildKsefRequeueEvent(row, env, randomUUID(), { reconcileOnly: options.reconcileOnly });
    if (!built.ok) {
      // Brak pozycji albo NIP-u to błąd danych; reszta to stan oczekiwany (co 15 min) — bez ostrzeżenia.
      const context = { invoiceId: row.id, reason: built.reason };
      if (built.reason === 'incomplete' || built.reason === 'no-nip') logger.warn('Cykl życia: faktury nie da się ponowić automatycznie', context);
      else logger.info('Cykl życia: faktury nie da się ponowić automatycznie', context);
      return built.reason;
    }
    try {
      await sendJobEvent(built.event, {
        inTransaction: ksefSendTransactionStep(
          { kind: 'requeue', actorUserId: null, reconcileOnly: options.reconcileOnly },
          { invoiceId: row.id, tenantId: row.tenant_id, attemptId: built.sendAttemptId },
        ),
      });
    } catch (e) {
      // 00135: inna korekta tej faktury pierwotnej w toku (I5 z rejected) — RPC wycofane
      // bez zlecenia i audytu; ponowi następny przebieg. Każdy inny błąd → errors + Sentry.
      if (isOpenCorrectionConflict(e)) {
        logger.info('Cykl życia: korekta czeka na inną korektę tej faktury pierwotnej', { invoiceId: row.id });
        return 'conflict';
      }
      throw e;
    }
    return 'sent';
  }
}
