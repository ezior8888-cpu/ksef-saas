import { cron } from 'inngest';

import {
  inboxInvoiceReceived,
  inboxPollTenant,
  inngest,
} from '../client';
import { getTenantKsefCredentials } from '@/lib/supabase/admin-queries';
import { queryReceivedInvoices } from '@/lib/ksef/inbox';
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

export const inboxPollingJob = inngest.createFunction(
  {
    id: 'inbox-polling-cron',
    name: 'Polling skrzynki KSeF - cron',
    triggers: [cron('TZ=Europe/Warsaw */15 * * * *')],
  },
  async ({ step, logger }) => {
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
  },
);

// ═══════════════════════════════════════════════════════════════
// PER-TENANT: polling + diff + insert
// ═══════════════════════════════════════════════════════════════

export const inboxPollTenantJob = inngest.createFunction(
  {
    id: 'inbox-poll-tenant',
    name: 'Polling skrzynki dla tenanta',
    retries: 2,
    // Max 10 tenantów pollowanych jednocześnie - szanuje limit sesji KSeF
    // (rate-limiter w kliencie działa per-NIP, ten limit to drugi poziom).
    concurrency: { limit: 10 },
    triggers: [inboxPollTenant],
  },
  async ({ event, step, logger }) => {
    const { tenantId, nip } = event.data;

    // Okno czasowe: ostatnie 48h. Cron chodzi co 15min, więc teoretycznie
    // wystarczyłby bufor ~2h, ale 48h daje nam samonaprawę przy outage
    // (cron padł na noc → nie gubimy faktur). Duplikaty odsiewa `filter-existing`,
    // więc nakładające się okna nie powodują dubli w DB.
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 48 * 60 * 60 * 1000);

    const newInvoices = await step.run('query-ksef', async () => {
      const credentials = await getTenantKsefCredentials(tenantId);
      return queryReceivedInvoices(credentials, dateFrom, dateTo, KSEF_ENV);
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

    await step.run('save-received-invoices', async () => {
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

      const { error } = await supabase.from('invoices').insert(rows);
      if (error) {
        throw new Error(
          `Failed to insert incoming invoices: ${error.message}`,
        );
      }
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
  },
);
