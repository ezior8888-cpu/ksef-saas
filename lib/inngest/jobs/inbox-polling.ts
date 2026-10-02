import { cron } from 'inngest';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';

import {
  inboxInvoiceReceived,
  inboxInvoiceReceivedAutoCategorize,
  inboxPollTenant,
  inngest,
} from '../client';
import { getTenantKsefCredentials } from '@/lib/supabase/admin-queries';
import { queryReceivedInvoices } from '@/lib/ksef/inbox';
import { createProposal } from '@/lib/flo/proposals';
import {
  buildInboxSummaryProposal,
  classifyInboxDocuments,
} from '@/lib/flo/functions/expense-inbox';
import { readInboxHwm, saveInboxHwm } from '@/lib/flo/functions/inbox-cursor';
import { sendPushToTenant } from '@/lib/push/sender';
import { createAdminClient } from '@/lib/supabase/server';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import type { InvoiceMetadata, KsefEnvironment } from '@/types/ksef';

/**
 * Polling skrzynki KSeF - dwa joby:
 *
 *   1. `inboxPollingJob` (cron co 15 min) - wybiera aktywnych tenantów i robi
 *      fan-out eventów `inbox/poll.tenant`. Nie pollinguje sam, żeby uniknąć
 *      jednego monolitycznego joba >60min.
 *   2. `inboxPollTenantJob` (event handler) - per-tenant polling, filtr
 *      istniejących faktur, insert nowych jako direction='incoming'.
 *
 * Idempotencja:
 *   - KSeF zwraca tę samą fakturę przy kolejnych pollach jeśli w zakresie dat
 *   - `filter-existing` ogranicza odczyt do tenant + incoming + środowisko.
 *   - 00120 rozstrzyga wyścig w bazie po (tenant, environment, KSeF number).
 *     Po konflikcie odczytujemy istniejący dokument i ponawiamy atomowy batch
 *     bez potwierdzonych duplikatów. Wymaga wdrożenia 00120 przed tym kodem.
 *
 * UWAGA schema: KSeF inbox daje tylko METADANE - pełnego XML tu nie pobieramy.
 * Zapisujemy dane do `fa3_data JSONB` z `_source: 'inbox-metadata'` żeby
 * przyszły job (`fetch-inbox-xml`) wiedział które wiersze trzeba uzupełnić
 * pełnym Invoice po parsowaniu XML.
 */


/** Numer KSeF ma ~35 znaków — 100 w `in.(…)` to ~3,6 KB adresu. */
export const KSEF_NUMBERS_PER_QUERY = 100;

/** Pierwszy przebieg firmy: tyle wstecz (wcześniejszą historię bierze import z KSeF). */
export const INBOX_INITIAL_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/** API przyjmuje do 100 dni na zapytanie — zostawiamy zapas. */
export const INBOX_MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Okno zapytania skrzynki (AUD-18): od HWM ostatniego pełnego przebiegu,
 * więc przerwa dowolnej długości jest nadrabiana; bez HWM — 48 h wstecz.
 * Zaległość ponad 90 dni nadrabiają kolejne przebiegi. `null` = nie ma
 * czego pytać (HWM nie starszy niż „teraz”).
 */
export function inboxQueryWindow(
  hwm: string | null,
  now: Date,
): { from: string; to: string } | null {
  const from = hwm ? new Date(hwm) : new Date(now.getTime() - INBOX_INITIAL_LOOKBACK_MS);
  if (Number.isNaN(from.getTime()) || from.getTime() >= now.getTime()) return null;
  const to = new Date(Math.min(now.getTime(), from.getTime() + INBOX_MAX_WINDOW_MS));
  return { from: from.toISOString(), to: to.toISOString() };
}

type InboxClient = Awaited<ReturnType<typeof createAdminClient>>;

function assertSameKsefDocument(
  row: { fa3_data: unknown; seller_nip: string | null; issue_date: string; gross_total: number | string | null },
  invoice: InvoiceMetadata,
): void {
  const data = row.fa3_data;
  const hash = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).invoiceHash
    : null;
  const hashMismatch = typeof hash === 'string' && hash.length > 0 &&
    typeof invoice.invoiceHash === 'string' && invoice.invoiceHash.length > 0 &&
    hash !== invoice.invoiceHash;
  const amountMismatch = row.gross_total !== null && row.gross_total !== undefined &&
    Math.round(Number(row.gross_total) * 100) !== Math.round(invoice.grossAmount * 100);
  if (hashMismatch || amountMismatch ||
      (row.seller_nip && row.seller_nip !== invoice.seller.nip) ||
      (row.issue_date && row.issue_date !== invoice.issueDate)) {
    throw new Error('Konflikt tożsamości faktury KSeF: istniejący dokument ma inne dane');
  }
}

async function findExistingInboxNumbers(
  supabase: InboxClient,
  tenantId: string,
  env: KsefEnvironment,
  invoices: InvoiceMetadata[],
): Promise<Set<string>> {
  const byNumber = new Map(invoices.map((invoice) => [invoice.ksefNumber, invoice]));
  const numbers = [...byNumber.keys()];
  const existingSet = new Set<string>();

  for (let i = 0; i < numbers.length; i += KSEF_NUMBERS_PER_QUERY) {
    const { data: existing, error } = await supabase
      .from('invoices')
      .select('ksef_number, ksef_environment, fa3_data, seller_nip, issue_date, gross_total')
      .eq('tenant_id', tenantId)
      .eq('direction', 'incoming')
      .in('ksef_number', numbers.slice(i, i + KSEF_NUMBERS_PER_QUERY));

    if (error) throw new Error(`Nie można sprawdzić, które faktury już są w bazie: ${error.message}`);
    for (const row of existing ?? []) {
      const invoice = byNumber.get(row.ksef_number as string);
      if (!invoice) continue;
      if (row.ksef_environment == null) {
        throw new Error('Historyczna faktura KSeF bez środowiska wymaga ręcznego uzgodnienia');
      }
      if (row.ksef_environment !== env) continue;
      assertSameKsefDocument(row, invoice);
      existingSet.add(invoice.ksefNumber);
    }
  }
  return existingSet;
}

// ═══════════════════════════════════════════════════════════════
// CRON: wybór aktywnych tenantów + fan-out
// ═══════════════════════════════════════════════════════════════

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runInboxPolling({ step, logger }: JobContext) {
    const env = requireConfiguredKsefEnvironment();
    // Polling wymaga certyfikatu oraz znacznika zweryfikowanego NIP-u.
    const tenants = await step.run('list-active-tenants', async () => {
      const supabase = await createAdminClient();
      const { data, error } = await supabase
        .from('tenants')
        .select('id, nip')
        .not('ksef_credentials_encrypted', 'is', null)
        .not('ksef_verified_at', 'is', null)
        .eq('ksef_verified_environment', env);

      if (error) throw new Error(`Failed to list tenants: ${error.message}`);
      return data ?? [];
    });

    logger.info(`Polling dla ${tenants.length} tenantów`);

    if (tenants.length === 0) {
      return { polled: 0 };
    }

    // Fan-out - Inngest dystrybuuje eventy równolegle z `concurrency.limit`
    // w per-tenant jobie poniżej.
    // `groupId` = NIP: bez niego limit „jeden przebieg na NIP” w pg-boss nie
    // działa, a dwa równoległe przebiegi tej samej firmy dublują powiadomienia
    // (AUD-91).
    const events = tenants.map((tenant) => ({
      ...inboxPollTenant.create({
        tenantId: tenant.id,
        nip: tenant.nip,
        environment: env,
      }),
      groupId: tenant.nip,
    }));

    await step.sendEvent('fan-out-polling', events);

    return { polled: tenants.length };
}

export const inboxPollingJob = inngest.createFunction(
  {
    id: 'inbox-polling-cron',
    name: 'Polling skrzynki KSeF - cron',
    triggers: [cron('TZ=Europe/Warsaw */15 * * * *')],
  },
  async ({ step, logger, attempt }) =>
    runInboxPolling(toJobContext({ step, logger, attempt })),
);

/**
 * Początek następnego okna po pełnym przebiegu (F-039). Dokumentacja MF
 * (pobieranie przyrostowe): kolejne okno zaczyna się w „momencie zakończenia”
 * poprzedniego, czyli w `dateRange.to`, gdy było podane. `permanentStorageHwmDate`
 * jest globalny i przy nadrabianiu zaległości bywa późniejszy niż `to` —
 * start od niego przeskakiwał faktury z przedziału (to, HWM]. Wynik nigdy nie
 * cofa się przed początek okna i nie wychodzi poza jego koniec.
 */
export function nextInboxHwm(hwm: string, window: { from: string; to: string }): string {
  const hwmMs = Date.parse(hwm);
  if (!(hwmMs > Date.parse(window.from))) return window.from;
  if (hwmMs > Date.parse(window.to)) return window.to;
  return hwm;
}

// ═══════════════════════════════════════════════════════════════
// PER-TENANT: polling + diff + insert
// ═══════════════════════════════════════════════════════════════

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runInboxPollTenant(data: Parameters<typeof inboxPollTenant.create>[0], { step, logger }: JobContext) {
    const { tenantId, nip } = data;
    const env = requireConfiguredKsefEnvironment();
    if (data.environment !== env) {
      throw new Error('KSeF inbox event environment does not match configured environment');
    }

    const window = await step.run('inbox-window', async () =>
      inboxQueryWindow(await readInboxHwm(tenantId), new Date()),
    );
    if (!window) {
      logger.info('Skrzynka: brak okna do pobrania (HWM nie starszy niż teraz)', { tenantId });
      return { fetched: 0, newlyAdded: 0 };
    }

    const { invoices: newInvoices, hwm } = await step.run('query-ksef', async () => {
      const credentials = await getTenantKsefCredentials(tenantId);
      // Faza 23 sekcja 3: audit log każdej query do KSeF /invoices/query/metadata.
      return queryReceivedInvoices(
        credentials,
        new Date(window.from),
        new Date(window.to),
        env,
        { tenantId },
      );
    });

    // HWM przesuwamy dopiero po zapisie faktur — na każdej ścieżce, także bez
    // nowych faktur. Błąd wcześniej = HWM stoi, kolejny przebieg zapyta o to
    // samo okno, a duble odsieje `filter-existing`.
    const finish = async (fetched: number, newlyAdded: number) => {
      if (!hwm) {
        logger.warn('KSeF nie podał HWM skrzynki — okno zostaje na miejscu', { tenantId });
        return { fetched, newlyAdded };
      }
      const nextHwm = nextInboxHwm(hwm, window);
      await step.run('advance-hwm', () =>
        saveInboxHwm(tenantId, { windowFrom: window.from, hwm: nextHwm, fetched, saved: newlyAdded }),
      );
      return { fetched, newlyAdded };
    };

    if (newInvoices.length === 0) {
      logger.info('Brak faktur w oknie czasu', { tenantId, nip });
      return finish(0, 0);
    }

    const freshInvoices = await step.run('filter-existing', async () => {
      const supabase = await createAdminClient();

      // Okno od HWM (AUD-18): przebieg po nieudanym poprzednim widzi te same
      // faktury ponownie. Zapytanie oszczędza INSERT-y; ostateczną ochroną przed
      // wyścigiem jest indeks tożsamości faktury przychodzącej (00120, #64) —
      // błąd odczytu lub nieustalone historyczne środowisko zatrzymuje job.
      // Paczki chronią przed zbyt długim URL PostgREST.
      const unique = [...new Map(newInvoices.map((inv) => [inv.ksefNumber, inv])).values()];
      const existingSet = await findExistingInboxNumbers(supabase, tenantId, env, unique);
      return unique.filter((inv) => !existingSet.has(inv.ksefNumber));
    });

    if (freshInvoices.length === 0) {
      logger.info('Wszystkie faktury już w DB', {
        tenantId,
        fetched: newInvoices.length,
      });
      return finish(newInvoices.length, 0);
    }

    const insertedInvoices = await step.run('save-received-invoices', async () => {
      const supabase = await createAdminClient();

      // Schemat `invoices` (00001):
      //   - direction CHECK IN ('outgoing', 'incoming') - NIE ma 'received'
      //   - kolumna `invoice_type` (nie `type`)
      //   - kolumna `ksef_accepted_at` (nie `ksef_timestamp`)
      //   - brak kolumn `seller_data`/`buyer_data`/`payment_data` - wszystko
      //     idzie do `fa3_data JSONB NOT NULL`
      //   - `fa3_data` jest NOT NULL - wstawiamy stub z metadanymi + markerem
      //     `_source: 'inbox-metadata'` dla przyszłego enricher jobu
      // Mapowanie KSeF 2.0 response → kolumny `invoices`:
      //   - `inv.acquisitionDate` to ISO z timezone, nadaje się wprost do TIMESTAMPTZ
      //   - `inv.issueDate` to `DATE` (YYYY-MM-DD) - bez timezone
      //   - `seller` ma zawsze NIP (polski wystawca), `buyer` może być VatUe/Other
      //   - `netAmount`/`vatAmount` dostajemy gotowe w metadata, bez pobierania XML
      const rows = freshInvoices.map((inv) => ({
        tenant_id: tenantId,
        direction: 'incoming' as const,
        origin: 'ksef_inbox' as const,
        internal_number: inv.invoiceNumber,
        ksef_number: inv.ksefNumber,
        ksef_status: 'accepted',
        ksef_environment: env,
        ksef_accepted_at: inv.acquisitionDate,
        invoice_type: 'VAT',
        issue_date: inv.issueDate,
        seller_nip: inv.seller.nip,
        buyer_nip:
          inv.buyer.identifier.type === 'Nip'
            ? inv.buyer.identifier.value
            : null,
        currency: inv.currency,
        gross_total: inv.grossAmount,
        net_total: inv.netAmount,
        vat_total: inv.vatAmount,
        fa3_data: {
          _source: 'inbox-metadata',
          _pendingFullFetch: true,
          ksefNumber: inv.ksefNumber,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          invoicingDate: inv.invoicingDate,
          acquisitionDate: inv.acquisitionDate,
          permanentStorageDate: inv.permanentStorageDate,
          invoicingMode: inv.invoicingMode,
          invoiceType: inv.invoiceType,
          seller: inv.seller,
          buyer: inv.buyer,
          grossAmount: inv.grossAmount,
          netAmount: inv.netAmount,
          vatAmount: inv.vatAmount,
          currency: inv.currency,
          invoiceHash: inv.invoiceHash,
          formCode: inv.formCode,
          isSelfInvoicing: inv.isSelfInvoicing,
          hasAttachment: inv.hasAttachment,
        },
      }));

      let pending = freshInvoices;
      for (let attempt = 0; attempt <= freshInvoices.length; attempt++) {
        const pendingNumbers = new Set(pending.map((inv) => inv.ksefNumber));
        const pendingRows = rows.filter((row) => pendingNumbers.has(row.ksef_number));
        const { data: inserted, error } = await supabase
          .from('invoices')
          .insert(pendingRows)
          .select('id, ksef_number');

        if (!error) {
          if (!inserted || inserted.length !== pendingRows.length) {
            throw new Error('Niepełna odpowiedź po zapisie faktur przychodzących');
          }
          return inserted;
        }
        if (error.code !== '23505') {
          throw new Error(`Failed to insert incoming invoices: ${error.message}`);
        }

        // Cały batch INSERT jest atomowy. Po 23505 nowy odczyt rozstrzyga,
        // które dokumenty wygrał równoległy job. Nie robimy częściowych
        // zapisów per-row: awaria w połowie zgubiłaby ich fan-out na retry.
        const existing = await findExistingInboxNumbers(supabase, tenantId, env, pending);
        if (existing.size === 0) {
          throw new Error('Konflikt UNIQUE poza tożsamością przychodzącej faktury KSeF');
        }
        pending = pending.filter((inv) => !existing.has(inv.ksefNumber));
        if (pending.length === 0) return [];
      }
      throw new Error('Nie udało się rozstrzygnąć równoległych zapisów faktur KSeF');
    });

    const insertedNumbers = new Set(insertedInvoices.map((row) => row.ksef_number as string));
    const newlyAddedInvoices = freshInvoices.filter((inv) => insertedNumbers.has(inv.ksefNumber));

    // Jedna zbiorcza karta na cały przebieg. Pięć faktur w nocy to pięć
    // powiadomień o siódmej rano — czyli hałas, przez który ludzie wyłączają
    // powiadomienia i przestają widzieć również te ważne.
    if (insertedInvoices.length > 0) {
      await step.run('flo-inbox-card', async () => {
        const supabase = await createAdminClient();

        // Sprzedawcy, których klient już u siebie widział. Nieznany
        // sprzedawca powyżej progu nie trafia sam do księgi — to jest sito
        // na fakturę wystawioną przez pomyłkę na cudzy NIP.
        //
        // „Widział” = PRZED tym przebiegiem. Ten krok idzie po zapisie, więc
        // bez wykluczenia właśnie wstawionych faktur każdy sprzedawca z paczki
        // wyglądał na znanego i sito nie działało nigdy (recenzja ChatGPT nr 2).
        // Pytamy tylko o sprzedawców z paczki — dawne `limit(500)` z całej
        // historii gubiło znanych u większych firm. Błąd = nikt nieznany:
        // karta zapyta o więcej, zamiast przepuścić coś po cichu.
        const justInserted = new Set(insertedInvoices.map((row) => row.id as string));
        const batchSellers = [
          ...new Set(
            newlyAddedInvoices
              .map((inv) => inv.seller?.nip)
              .filter((nip): nip is string => Boolean(nip)),
          ),
        ];
        const known = new Set<string>();
        for (let i = 0; i < batchSellers.length; i += KSEF_NUMBERS_PER_QUERY) {
          const { data: seen, error: seenErr } = await supabase
            .from('invoices')
            .select('id, seller_nip')
            .eq('tenant_id', tenantId)
            .eq('direction', 'incoming')
            .in('seller_nip', batchSellers.slice(i, i + KSEF_NUMBERS_PER_QUERY))
            .limit(1000);
          if (seenErr) break;
          for (const row of seen ?? []) {
            const nip = (row as { seller_nip: string | null }).seller_nip;
            if (nip && !justInserted.has(row.id as string)) known.add(nip);
          }
        }

        const byKsefNumber = new Map(
          insertedInvoices.map((row) => [row.ksef_number as string, row.id as string]),
        );

        const documents = newlyAddedInvoices
          .filter((inv) => byKsefNumber.has(inv.ksefNumber))
          .map((inv) => ({
            id: byKsefNumber.get(inv.ksefNumber)!,
            sellerName: inv.seller?.name ?? null,
            sellerNip: inv.seller?.nip ?? null,
            grossAmount: Number(inv.grossAmount ?? 0),
            issueDate: inv.issueDate,
          }));

        const proposal = buildInboxSummaryProposal({
          tenantId,
          documents: classifyInboxDocuments(documents, known),
          periodKey: new Date().toISOString().slice(0, 10),
        });

        if (proposal) await createProposal(proposal);
      });

      await step.sendEvent(
        'fan-out-auto-categorize-inbox',
        insertedInvoices.map((row) =>
          inboxInvoiceReceivedAutoCategorize.create({
            invoiceId: row.id,
            tenantId,
            environment: env,
          }),
        ),
      );
    }

    await step.run('push-inbox-new', async () => {
      const n = newlyAddedInvoices.length;
      if (n === 0) return { skipped: true as const };

      const first = newlyAddedInvoices[0];
      const body =
        n === 1
          ? `${first.invoiceNumber} · ${first.seller.name}`
          : `${n} faktur, m.in. ${first.invoiceNumber}`;

      return sendPushToTenant(tenantId, 'inbox_new', {
        title:
          n === 1
            ? 'Nowa faktura w skrzynce KSeF'
            : `${n} nowych faktur w skrzynce`,
        body,
        url: '/inbox',
        tag: `inbox-new-${tenantId}`,
      });
    });

    // Fan-out do listenerów (np. notify-user w Fazie 6 UI dla real-time toast).
    const invoiceEvents = newlyAddedInvoices.map((inv) =>
      inboxInvoiceReceived.create({
        tenantId,
        ksefNumber: inv.ksefNumber,
        sellerNip: inv.seller.nip,
        sellerName: inv.seller.name,
        grossAmount: inv.grossAmount,
        currency: inv.currency,
        acquisitionTimestamp: inv.acquisitionDate,
      }),
    );
    if (invoiceEvents.length > 0) {
      await step.sendEvent('fan-out-new-invoices', invoiceEvents);
    }

    logger.info(
      `Dodano ${newlyAddedInvoices.length} nowych faktur przychodzących`,
      { tenantId, fetched: newInvoices.length },
    );

    return finish(newInvoices.length, newlyAddedInvoices.length);
}

export const inboxPollTenantJob = inngest.createFunction(
  {
    id: 'inbox-poll-tenant',
    name: 'Polling skrzynki dla tenanta',
    retries: 2,
    // Per-NIP concurrency: globalna kolejka Inngest po `event.data.nip` zapewnia,
    // że jeden tenant nigdy nie wystawia >3 równoległych pollów do KSeF
    // niezależnie od liczby instancji Vercela (in-memory `ksefRateLimiter` z
    // `lib/ksef/rate-limiter.ts` jest per-process, więc na multi-instance
    // hostingu nie wystarcza).
    // Jeden przebieg na NIP: stan skrzynki (HWM) jest per firma (AUD-91).
    concurrency: { key: 'event.data.nip', limit: 1 },
    // Faza 23 sekcja 3: throttle per-NIP. Inbox polling cron leci co 15min,
    // czyli 4 razy / godzinę / tenant — limit 8/h zostawia bufor na manual
    // refresh z UI (przycisk "Odśwież" w `/inbox`) bez zalewania MF.
    throttle: { key: 'event.data.nip', limit: 8, period: '1h' },
    triggers: [inboxPollTenant],
  },
  async ({ event, step, logger, attempt }) =>
    runInboxPollTenant(event.data as Parameters<typeof inboxPollTenant.create>[0], toJobContext({ step, logger, attempt })),
);
