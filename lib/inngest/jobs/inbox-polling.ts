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
  evaluateContinuity,
} from '@/lib/flo/functions/expense-inbox';
import {
  readInboxCursor,
  saveInboxCursor,
  clearInboxCursor,
} from '@/lib/flo/functions/inbox-cursor';
import { sendPushToTenant } from '@/lib/push/sender';
import { createAdminClient } from '@/lib/supabase/server';
import type { KsefEnvironment } from '@/types/ksef';

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
 *   - `filter-existing` step odrzuca te które już mamy w DB po (tenant_id, ksef_number)
 *   - Index `idx_inv_ksef_number` jest unique per (tenant_id, ksef_number)
 *
 * UWAGA schema: KSeF inbox daje tylko METADANE - pełnego XML tu nie pobieramy.
 * Zapisujemy dane do `fa3_data JSONB` z `_source: 'inbox-metadata'` żeby
 * przyszły job (`fetch-inbox-xml`) wiedział które wiersze trzeba uzupełnić
 * pełnym Invoice po parsowaniu XML.
 */

const KSEF_ENV: KsefEnvironment =
  (process.env.KSEF_ENV as KsefEnvironment) ?? 'test';

// ═══════════════════════════════════════════════════════════════
// CRON: wybór aktywnych tenantów + fan-out
// ═══════════════════════════════════════════════════════════════

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runInboxPolling({ step, logger }: JobContext) {
    // "Aktywny" = ma uzupełnione credentials. Schemat `tenants` z 00001 nie ma
    // kolumny `is_active` - używamy `ksef_credentials_encrypted IS NOT NULL`
    // jako sygnatury "tenant skończył onboarding KSeF".
    const tenants = await step.run('list-active-tenants', async () => {
      const supabase = await createAdminClient();
      const { data, error } = await supabase
        .from('tenants')
        .select('id, nip')
        .not('ksef_credentials_encrypted', 'is', null);

      if (error) throw new Error(`Failed to list tenants: ${error.message}`);
      return data ?? [];
    });

    logger.info(`Polling dla ${tenants.length} tenantów`);

    if (tenants.length === 0) {
      return { polled: 0 };
    }

    // Fan-out - Inngest dystrybuuje eventy równolegle z `concurrency.limit`
    // w per-tenant jobie poniżej.
    const events = tenants.map((tenant) =>
      inboxPollTenant.create({
        tenantId: tenant.id,
        nip: tenant.nip,
      }),
    );

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

// ═══════════════════════════════════════════════════════════════
// PER-TENANT: polling + diff + insert
// ═══════════════════════════════════════════════════════════════

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runInboxPollTenant(data: Parameters<typeof inboxPollTenant.create>[0], { step, logger }: JobContext) {
    const { tenantId, nip } = data;

    // Okno czasowe: ostatnie 48h. Cron chodzi co 15min, więc teoretycznie
    // wystarczyłby bufor ~2h, ale 48h daje nam samonaprawę przy outage
    // (cron padł na noc → nie gubimy faktur). Duplikaty odsiewa `filter-existing`,
    // więc nakładające się okna nie powodują dubli w DB.
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 48 * 60 * 60 * 1000);

    const newInvoices = await step.run('query-ksef', async () => {
      const credentials = await getTenantKsefCredentials(tenantId);

      // Kursor z poprzedniego, przerwanego przebiegu — ale tylko wtedy, gdy
      // dotyczy TEGO SAMEGO okna dat. Token z innego zapytania dałby wyniki
      // z innego zakresu i cichą lukę w danych.
      const cursor = await readInboxCursor(tenantId, dateFrom, dateTo);
      let announced = cursor.announcedCount;

      // Faza 23 sekcja 3: audit log każdej query do KSeF /invoices/query/metadata.
      const invoices = await queryReceivedInvoices(
        credentials,
        dateFrom,
        dateTo,
        KSEF_ENV,
        { tenantId },
        {
          resumeToken: cursor.continuationToken ?? undefined,
          onPage: async (page, token) => {
            announced += page.length;
            await saveInboxCursor(tenantId, {
              continuationToken: token,
              windowFrom: dateFrom,
              windowTo: dateTo,
              announcedCount: announced,
              savedCount: announced,
            });
          },
        },
      );

      return invoices;
    });

    // Kontrola ciągłości: token wyczerpany, więc pobieranie doszło do końca.
    // Rozjazd liczb oznacza zgubione dokumenty i jest JEDYNYM sygnałem,
    // jaki dostaniemy — nikt się o tym nie dowie z drugiej strony.
    await step.run('check-continuity', async () => {
      const cursor = await readInboxCursor(tenantId, dateFrom, dateTo);
      const verdict = evaluateContinuity(cursor);
      if (verdict.status === 'incomplete') {
        logger.error('Niekompletne pobranie skrzynki KSeF', {
          tenantId,
          missing: verdict.missing,
          message: verdict.message,
        });
      }
      if (verdict.status === 'complete') {
        await clearInboxCursor(tenantId);
      }
    });

    if (newInvoices.length === 0) {
      logger.info('Brak faktur w oknie czasu', { tenantId, nip });
      return { fetched: 0, newlyAdded: 0 };
    }

    const freshInvoices = await step.run('filter-existing', async () => {
      const supabase = await createAdminClient();
      const ksefNumbers = newInvoices.map((inv) => inv.ksefNumber);

      const { data: existing } = await supabase
        .from('invoices')
        .select('ksef_number')
        .eq('tenant_id', tenantId)
        .in('ksef_number', ksefNumbers);

      const existingSet = new Set(
        (existing ?? []).map((e) => e.ksef_number as string),
      );
      return newInvoices.filter((inv) => !existingSet.has(inv.ksefNumber));
    });

    if (freshInvoices.length === 0) {
      logger.info('Wszystkie faktury już w DB', {
        tenantId,
        fetched: newInvoices.length,
      });
      return { fetched: newInvoices.length, newlyAdded: 0 };
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
        internal_number: inv.invoiceNumber,
        ksef_number: inv.ksefNumber,
        ksef_status: 'accepted',
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

      const { data: inserted, error } = await supabase
        .from('invoices')
        .insert(rows)
        .select('id, ksef_number');

      if (error) {
        throw new Error(
          `Failed to insert incoming invoices: ${error.message}`,
        );
      }
      return inserted ?? [];
    });

    // Jedna zbiorcza karta na cały przebieg. Pięć faktur w nocy to pięć
    // powiadomień o siódmej rano — czyli hałas, przez który ludzie wyłączają
    // powiadomienia i przestają widzieć również te ważne.
    if (insertedInvoices.length > 0) {
      await step.run('flo-inbox-card', async () => {
        const supabase = await createAdminClient();

        // Sprzedawcy, których klient już u siebie widział. Nieznany
        // sprzedawca powyżej progu nie trafia sam do księgi — to jest sito
        // na fakturę wystawioną przez pomyłkę na cudzy NIP.
        const { data: seen } = await supabase
          .from('invoices')
          .select('seller_nip')
          .eq('tenant_id', tenantId)
          .eq('direction', 'incoming')
          .limit(500);

        const known = new Set(
          (seen ?? [])
            .map((row) => (row as { seller_nip: string | null }).seller_nip)
            .filter((nip): nip is string => Boolean(nip)),
        );

        const byKsefNumber = new Map(
          insertedInvoices.map((row) => [row.ksef_number as string, row.id as string]),
        );

        const documents = freshInvoices
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
          }),
        ),
      );
    }

    await step.run('push-inbox-new', async () => {
      const n = freshInvoices.length;
      if (n === 0) return { skipped: true as const };

      const first = freshInvoices[0];
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
    const invoiceEvents = freshInvoices.map((inv) =>
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
    await step.sendEvent('fan-out-new-invoices', invoiceEvents);

    logger.info(
      `Dodano ${freshInvoices.length} nowych faktur przychodzących`,
      { tenantId, fetched: newInvoices.length },
    );

    return {
      fetched: newInvoices.length,
      newlyAdded: freshInvoices.length,
    };
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
    concurrency: { key: 'event.data.nip', limit: 3 },
    // Faza 23 sekcja 3: throttle per-NIP. Inbox polling cron leci co 15min,
    // czyli 4 razy / godzinę / tenant — limit 8/h zostawia bufor na manual
    // refresh z UI (przycisk "Odśwież" w `/inbox`) bez zalewania MF.
    throttle: { key: 'event.data.nip', limit: 8, period: '1h' },
    triggers: [inboxPollTenant],
  },
  async ({ event, step, logger, attempt }) =>
    runInboxPollTenant(event.data as Parameters<typeof inboxPollTenant.create>[0], toJobContext({ step, logger, attempt })),
);
