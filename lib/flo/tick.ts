/**
 * Puls agenta FLO (krok 13 planu).
 *
 * Codziennie o 07:30 czasu polskiego — czyli zanim ktokolwiek otworzy
 * aplikację, ale już po ciszy nocnej. Ten cron jest miejscem, w którym
 * agent „patrzy na dane”: sprząta po sobie, a potem przechodzi reguły
 * funkcji — pierwszą codzienną jest K-01 (plan FLO 2, zadanie 1.1).
 *
 * ŚWIADOMIE NIE MA TU DRUGIEJ DEFINICJI DLA INNGESTA. Produkcja pracuje na
 * pg-boss od 18 sierpnia, a Inngest jest w trakcie odpinania — dokładanie
 * do niego nowych funkcji byłoby długiem w chwili powstania. Starsze zadania
 * mają jeszcze bliźniaki z okresu przejściowego, nowe już nie.
 */

import { logAuditSystem } from '@/lib/audit/log-system';
import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { runKsefAuditSweep } from '@/lib/flo/functions/audit-sweep';
import {
  productionExpenseMissingSources,
  runMissingDocsSweep,
  type ExpenseMissingSources,
} from '@/lib/flo/functions/expense-missing-producer';
import {
  productionInvoiceMissingSources,
  runMissingInvoiceSweep,
  type InvoiceMissingSources,
} from '@/lib/flo/functions/invoice-missing-producer';
import {
  productionOnboardingSources,
  runOnboardingSweep,
  type OnboardingSources,
} from '@/lib/flo/functions/onboarding-producer';
import {
  productionPaymentConfirmSources,
  runPaymentConfirmSweep,
  type PaymentConfirmSources,
} from '@/lib/flo/functions/payment-confirm-producer';
import { expireStale } from '@/lib/flo/proposals';
import type { JobContext } from '@/lib/jobs/registry';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Po tylu minutach propozycja w stanie „wykonuję” jest uznana za porzuconą.
 *
 * Wykonawca zwalnia ją sam, gdy coś pójdzie nie tak — ale jeśli worker
 * zginie w połowie (restart kontenera, OOM), nie ma kto tego zrobić.
 * Bez tego strażnika karta zostałaby zablokowana na zawsze, a klient
 * patrzyłby na „wykonuję” do końca świata. Cisza jest stanem zabronionym,
 * więc i wieczne „w toku” też.
 */
const STUCK_AFTER_MS = 15 * 60_000;

export interface FloTickResult {
  expired: number;
  released: number;
  audited: number;
  /** K-01: nowe pytania „zapłacił?". */
  confirmAsked: number;
  /** K-01: otwarte pytania zamknięte, bo faktura przestała być zaległa. */
  confirmClosed: number;
  /** W-04: nowe pytania „zgubił się dokument?". */
  missingDocsAsked: number;
  /** W-04: pytania zamknięte, bo dokument się znalazł. */
  missingDocsClosed: number;
  /** P-03: pytania „wystawiłeś ją gdzie indziej?". */
  missingInvoicesAsked: number;
  /** O-01: karty kreatora postawione na młodych kontach. */
  onboardingGuided: number;
  /** O-01: kreatory zamknięte, bo pierwsza faktura poszła. */
  onboardingFinished: number;
  /**
   * Nieudane przebiegi reguł na kontach — każda reguła liczona osobno, więc
   * konto, na którym padły dwie, liczy się dwa razy. Puls za każdym razem
   * szedł dalej.
   */
  failedTenants: number;
}

/**
 * Skąd puls bierze dane poza tabelami agenta.
 *
 * Wstrzykiwalne z tego samego powodu co `db`: testy pulsu mają chodzić na
 * atrapie, a nie po bazie z `.env.local`.
 */
export interface FloTickSources {
  /** Konta, na które puls patrzy. */
  listTenantIds: () => Promise<string[]>;
  paymentConfirm: PaymentConfirmSources;
  expenseMissing: ExpenseMissingSources;
  invoiceMissing: InvoiceMissingSources;
  onboarding: OnboardingSources;
  /**
   * Globalny wyłącznik dla reguł, które nie mają własnych źródeł (X-05).
   * Wstrzykiwany tylko w testach.
   */
  readGlobalKill?: () => Promise<boolean>;
}

export async function runFloTick(
  ctx?: JobContext,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
  sources: FloTickSources = productionTickSources(),
): Promise<FloTickResult> {
  const expired = await expireStale(now, db);
  const released = await releaseStuck(now, db);

  // ── reguły funkcji ─────────────────────────────────────────
  //
  // Jedna lista kont dla wszystkich reguł. Audyt miał kiedyś własne
  // `limit(200)` bez sortowania — konta ponad dwusetne mogły go nie dostać
  // nigdy.
  const tenantIds = await sources.listTenantIds();

  // Audyt porządku (X-05) chodzi RAZ W MIESIĄCU, nie codziennie: to jest
  // przegląd papierów, a nie sprawa bieżąca. Codzienne przypominanie o tych
  // samych zaległościach zamieniłoby go w listę zarzutów.
  const audit = isFirstBusinessDay(now)
    ? await runKsefAuditSweep(tenantIds, now, db, {
        readGlobalKill: sources.readGlobalKill,
        logger: ctx?.logger,
      })
    : { created: 0, failed: 0 };

  // K-01 (zadanie 1.1 planu FLO 2): „zapłacił?" dobę po terminie.
  // Idzie PRZED regułami, które coś proponują: agent najpierw ustala, co
  // wpłynęło, a dopiero potem ma prawo cokolwiek na tej podstawie sugerować.
  const confirm = await runPaymentConfirmSweep(
    tenantIds,
    now,
    db,
    sources.paymentConfirm,
    ctx?.logger,
  );

  // W-04 (K1.9): „co miesiąc masz tu koszt, a w tym miesiącu nie widzę
  // dokumentu". Po K-01, bo to już propozycja, a nie ustalanie faktu.
  // Sama reguła milczy przed dziesiątym dniem miesiąca.
  const missingDocs = await runMissingDocsSweep(
    tenantIds,
    now,
    db,
    sources.expenseMissing,
    ctx?.logger,
  );

  // P-03 (K1.10): „zwykle fakturujesz ich około 10., w tym miesiącu nie
  // widzę faktury". TYLKO pytanie — szkice to P-01/P-02 i osobna decyzja.
  const missingInvoices = await runMissingInvoiceSweep(
    tenantIds,
    now,
    db,
    sources.invoiceMissing,
    ctx?.logger,
  );

  // O-01 (K1.11): pierwsze kroki na nowym koncie. NA KOŃCU, bo to najmiększa
  // z reguł: prowadzenie za rękę ustępuje wszystkiemu, co dotyczy pieniędzy
  // albo terminów.
  const onboarding = await runOnboardingSweep(
    tenantIds,
    now,
    db,
    sources.onboarding,
    ctx?.logger,
  );

  // ── miejsce na kolejne reguły ──────────────────────────────
  //
  // Kolejność ma znaczenie: najpierw fakty, potem propozycje, na końcu
  // miękkie podpowiedzi. Nowe reguły dopisujemy NA KOŃCU, a nie wciskamy
  // między istniejące.

  return {
    expired,
    released,
    audited: audit.created,
    confirmAsked: confirm.asked,
    confirmClosed: confirm.closed,
    missingDocsAsked: missingDocs.asked,
    missingDocsClosed: missingDocs.closed,
    missingInvoicesAsked: missingInvoices.asked,
    onboardingGuided: onboarding.guided,
    onboardingFinished: onboarding.finished,
    failedTenants:
      audit.failed +
      confirm.failed +
      missingDocs.failed +
      missingInvoices.failed +
      onboarding.failed,
  };
}

export function productionTickSources(): FloTickSources {
  return {
    listTenantIds: readActiveTenantIds,
    paymentConfirm: productionPaymentConfirmSources(),
    expenseMissing: productionExpenseMissingSources(),
    invoiceMissing: productionInvoiceMissingSources(),
    onboarding: productionOnboardingSources(),
  };
}

/** Rozmiar strony przy czytaniu kont — PostgREST i tak tnie duże odpowiedzi. */
const TENANT_PAGE = 500;

/**
 * Aktywne, nieusunięte konta — ta sama definicja co w metrykach panelu.
 *
 * Czytane stronami do końca. Stały limit bez stronicowania oznaczałby, że
 * konto numer 501 nie dostaje pytań nigdy, i nikt by tego nie zauważył.
 */
async function readActiveTenantIds(): Promise<string[]> {
  const supabase = createAdminClient();
  const ids: string[] = [];

  for (let from = 0; ; from += TENANT_PAGE) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('id')
      .range(from, from + TENANT_PAGE - 1);

    if (error) throw new Error(error.message);
    const page = data ?? [];
    ids.push(...page.map((row) => row.id));
    if (page.length < TENANT_PAGE) return ids;
  }
}

/**
 * Podnosi propozycje porzucone w połowie wykonania.
 *
 * Wracają do stanu „zatwierdzona”, a nie „otwarta”: człowiek już się na nie
 * zgodził, więc odbieranie mu tej zgody byłoby cofaniem jego decyzji.
 * Żeton zgody jest w tym momencie zużyty, więc realne wykonanie i tak
 * wymaga ponownego kliknięcia — i dobrze, bo nie wiemy, jak daleko zaszła
 * przerwana próba.
 */
async function releaseStuck(now: Date, db: FloDbClient): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();

  const stuck = await db
    .from('flo_proposals')
    .select('id, tenant_id, kind, approved_at')
    .eq('status', 'executing')
    .lt('approved_at', cutoff);

  if (stuck.error) throw new Error(stuck.error.message);
  const rows = stuck.data ?? [];
  if (rows.length === 0) return 0;

  const { error } = await db
    .from('flo_proposals')
    .update({ status: 'approved' })
    .in(
      'id',
      rows.map((r) => r.id),
    );
  if (error) throw new Error(error.message);

  for (const row of rows) {
    // Operator ma o tym wiedzieć: pojedynczy przypadek to restart kontenera,
    // seria oznacza, że wykonawca gdzieś się wiesza.
    await logAuditSystem({
      tenantId: row.tenant_id,
      userId: null,
      action: 'flo.proposal.failed',
      entityType: 'flo_proposal',
      entityId: row.id,
      metadata: {
        actor: 'flo',
        kind: row.kind,
        error: 'porzucona w stanie „wykonuję" — podniesiona przez flo.tick',
      },
    });
  }

  return rows.length;
}

/**
 * Czy dziś jest pierwszy dzień miesiąca (albo poniedziałek po nim).
 *
 * Audyt wpadający w sobotę zobaczyłby klient dopiero po weekendzie, kiedy
 * karta ma już trzy dni i wygląda na zaniedbaną przez agenta.
 */
function isFirstBusinessDay(now: Date): boolean {
  const day = now.getUTCDate();
  const weekday = now.getUTCDay();
  if (day === 1) return weekday !== 0 && weekday !== 6;
  if (day === 2) return weekday === 1;
  if (day === 3) return weekday === 1;
  return false;
}
