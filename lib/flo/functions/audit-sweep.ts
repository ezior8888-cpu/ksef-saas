/**
 * Przegląd porządku w dokumentach — spięcie X-05 z bazą (krok 30, wpięcie).
 *
 * Osobno od `ksef-audit.ts`, bo tamten moduł jest czysty i testowalny bez
 * bazy. Tutaj mieszka wyłącznie odczyt i pętla po organizacjach — czyli to,
 * co i tak trzeba by wyciąć z testów.
 *
 * NAPRAWA Z 17.09.2026 (plan FLO 2, krok 1.1c). Do tego dnia audyt na
 * produkcji nie znalazł NICZEGO. Pytał o `invoices.source` i
 * `expenses.image_path`, których tabele nie mają, a błąd zapytania znikał
 * w `data ?? []` — każde konto wyglądało na takie, które nie wystawiło ani
 * jednej faktury. Bez wyjątku i bez śladu w logach. Stąd trzy zasady:
 *
 * 1. KAŻDE ZAPYTANIE SPRAWDZA `error`. Błąd to wyjątek, nigdy „zero wierszy".
 * 2. WYJĄTEK NA JEDNYM KONCIE idzie do Sentry i logów workera, a pozostałe
 *    konta lecą dalej — inaczej jedno uszkodzone konto zabrałoby audyt
 *    wszystkim.
 * 3. KLIENT TYPOWANY. Nieistniejąca kolumna nie przejdzie przez `tsc` —
 *    przy złym `select` cały wiersz dostaje typ „błąd zapytania", a wtedy
 *    typecheck przestaje sprawdzać cokolwiek dalej (tak przeszło też
 *    porównanie `source === 'ksef_invoice'` z wartością, której enum nie ma).
 *
 * X-05 JEST W KANARKU (decyzja właściciela produktu z 17.09.2026, patrz
 * `ROLLOUT_ORDER`). Bramki sprawdzamy PRZED odczytem dokumentów — konto poza
 * kanarkiem nie kosztuje ani jednego zapytania o faktury.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { unlimitedCap, type DailyCap } from '@/lib/flo/daily-cap';
import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { isMuted } from '@/lib/flo/decisions';
import { buildAuditProposal, findAuditIssues } from '@/lib/flo/functions/ksef-audit';
import { isKindEnabledForTenant, shouldCompute } from '@/lib/flo/kind-switch';
import { createProposal } from '@/lib/flo/proposals';
import { runSweep, type FloSweepResult } from '@/lib/flo/sweep';
import type { JobLogger } from '@/lib/jobs/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

const KIND = 'ksef.audit' as const;

/** Ile dokumentów każdego rodzaju przegląda audyt jednego konta. */
const DOCUMENT_LIMIT = 500;

/**
 * Ile identyfikatorów faktur w jednym zapytaniu o poświadczenia.
 *
 * `in('invoice_id', …)` idzie w adresie żądania. Pięćset identyfikatorów to
 * ok. 18 KB adresu — więcej, niż przepuszcza typowa bramka przed PostgREST-em.
 */
const UPO_CHUNK = 100;


export async function runKsefAuditSweep(
  tenantIds: readonly string[],
  now: Date = new Date(),
  db: FloDbClient = floDb(),
  options: {
    /** Globalny wyłącznik — wstrzykiwany tylko w testach. */
    readGlobalKill?: () => Promise<boolean>;
    logger?: Pick<JobLogger, 'error'>;
    cap?: DailyCap;
  } = {},
): Promise<FloSweepResult> {
  const periodKey = now.toISOString().slice(0, 7);

  // Audyt chodzi raz w miesiącu, ale trafia w ten sam poranek co reguły
  // codzienne — więc liczy się do tego samego dziennego limitu (K1.4).
  const cap = options.cap ?? unlimitedCap();

  return runSweep(
    KIND,
    tenantIds,
    async (tenantId) => {
      const created = await auditTenant(
        tenantId,
        periodKey,
        now,
        db,
        cap,
        options.readGlobalKill,
      );
      // Audyt niczego nie zamyka sam: przegląd papierów kończy człowiek,
      // a karta wygasa normalną drogą.
      return { asked: created ? 1 : 0 };
    },
    options.logger,
  );
}

/** Audyt jednego konta. `true`, gdy powstała nowa karta. */
async function auditTenant(
  tenantId: string,
  periodKey: string,
  now: Date,
  db: FloDbClient,
  cap: DailyCap,
  readGlobalKill?: () => Promise<boolean>,
): Promise<boolean> {
  const verdict = await isKindEnabledForTenant(KIND, tenantId, db, readGlobalKill);
  if (!shouldCompute(verdict)) return false;
  if (await isMuted(tenantId, KIND, now, db)) return false;

  const supabase: SupabaseClient<Database> = createAdminClient();

  const [invoices, contractors, expenses] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, internal_number, issue_date, ksef_status, origin')
      .eq('tenant_id', tenantId)
      .eq('direction', 'issued')
      // Najnowsze, a nie przypadkowe pięćset: ciągłość numeracji liczona na
      // wyrywkowym podzbiorze zgłaszałaby luki, których nie ma.
      .order('issue_date', { ascending: false })
      .limit(DOCUMENT_LIMIT),
    supabase
      .from('contractors')
      .select('id, name, nip')
      .eq('tenant_id', tenantId)
      .limit(DOCUMENT_LIMIT),
    supabase
      .from('expenses')
      .select('id, seller_name, issue_date, source, source_file_path, ksef_invoice_id')
      .eq('tenant_id', tenantId)
      .order('issue_date', { ascending: false })
      .limit(DOCUMENT_LIMIT),
  ]);

  if (invoices.error) throw new Error(`faktury: ${invoices.error.message}`);
  if (contractors.error) throw new Error(`kontrahenci: ${contractors.error.message}`);
  if (expenses.error) throw new Error(`koszty: ${expenses.error.message}`);

  const rows = invoices.data;
  if (rows.length === 0) return false;

  // Numeracja jest „nasza" tylko dla faktur wystawionych w aplikacji.
  // Wszystko inne (import historii z KSeF, import z pliku) ma cudzą numerację
  // i cudze anulowania — ta sama granica co w komentarzu migracji 00065.
  const own = rows.filter((r) => r.origin === 'app');

  // Pierwsza faktura wystawiona U NAS wyznacza granicę „zastane / bieżące".
  const firstOwn =
    own.length > 0 ? own.map((r) => r.issue_date).sort()[0]! : null;

  const withUpo = await readInvoicesWithUpo(
    supabase,
    rows.map((r) => r.id),
  );

  const issues = findAuditIssues({
    firstOwnInvoiceDate: firstOwn,
    invoices: rows.map((r) => ({
      id: r.id,
      number: r.internal_number,
      ownNumbering: r.origin === 'app',
      issueDate: r.issue_date,
      status: String(r.ksef_status),
      hasUpo: withUpo.has(r.id),
    })),
    contractors: contractors.data.map((c) => ({
      id: c.id,
      name: c.name,
      nip: c.nip || null,
    })),
    expenses: expenses.data.map((e) => ({
      id: e.id,
      label: e.seller_name || 'Koszt',
      // Koszt z KSeF MA dokument — e-fakturę w rejestrze — nawet bez
      // skanu. Bez tego każdy koszt ze skrzynki KSeF wyglądałby na
      // „koszt bez dokumentu", a to byłby pierwszy fałszywy zarzut,
      // jaki klient zobaczy od agenta.
      hasDocument:
        Boolean(e.source_file_path) ||
        e.ksef_invoice_id !== null ||
        e.source === 'ksef_inbox',
      issueDate: e.issue_date,
    })),
  });

  const proposal = buildAuditProposal({ tenantId, issues, periodKey, now });
  if (!proposal) return false;

  // Limit sprawdzamy dopiero TUTAJ, gdy wiadomo, że karta naprawdę by
  // powstała. Wcześniej licznik zatrzymanych kart rósłby przy kontach, które
  // i tak nie miały nic do zgłoszenia.
  if (!cap.canAsk(tenantId)) return false;

  const created = await createProposal(proposal, db, readGlobalKill);
  if (created.status === 'created') cap.spend(tenantId);
  return created.status === 'created';
}

async function readInvoicesWithUpo(
  supabase: SupabaseClient<Database>,
  invoiceIds: readonly string[],
): Promise<Set<string>> {
  const withUpo = new Set<string>();

  for (let i = 0; i < invoiceIds.length; i += UPO_CHUNK) {
    const { data, error } = await supabase
      .from('upo_receipts')
      .select('invoice_id')
      .in('invoice_id', invoiceIds.slice(i, i + UPO_CHUNK));

    if (error) throw new Error(`poświadczenia UPO: ${error.message}`);
    for (const row of data) withUpo.add(row.invoice_id);
  }

  return withUpo;
}
