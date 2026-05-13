// Cron job: re-trigger UPO download dla faktur akceptowanych w KSeF, dla których
// UPO nie pojawiło się w ciągu 24h (Faza 23 sekcja 3).
//
// Typowy scenariusz: KSeF zaakceptował fakturę (`ksef_status='accepted'`),
// emitowaliśmy `invoice/upo.requested`, ale `downloadUpoJob` padł 5× z 5xx
// po stronie MF (system raportów obciążony) i status `upo_receipts` utknął
// na `pending` lub `failed`. UPO to dokument prawny — bez niego klient nie
// ma dowodu w razie kontroli skarbowej, więc nie odpuszczamy.
//
// Trigger: co godzinę o pełnej minucie (synchronicznie z `refresh-materialized-views`,
// żeby operator widział obie aktywności w jednym oknie monitoringu).
//
// Rate limit: max 100 retry per uruchomienie, żeby cron nie zatkał kolejki
// Inngest gdy zaległości urosną do tysięcy (np. po długiej awarii MF).

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';

const STALE_HOURS = 24;
const MAX_RETRIES_PER_RUN = 100;

interface StaleUpoRow {
  id: string;
  invoice_id: string;
  tenant_id: string;
  ksef_number: string;
  download_attempts: number;
  invoices: {
    seller_nip: string | null;
    tenants: { nip: string } | { nip: string }[] | null;
  } | null;
}

export const upoRetryStaleJob = inngest.createFunction(
  {
    id: 'upo-retry-stale',
    name: 'KSeF: retry UPO download (>24h pending/failed)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 5 * * * *')],
  },
  async ({ step, logger }) => {
    const cutoffIso = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

    const stale = await step.run('find-stale-upo', async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('upo_receipts')
        // JOIN invoices→tenants po NIP (klucz `concurrency` w downloadUpoJob).
        // Sentinel `null` w `seller_nip` jest fallbackiem dla starych wierszy.
        .select(
          'id, invoice_id, tenant_id, ksef_number, download_attempts, invoices(seller_nip, tenants(nip))',
        )
        .in('status', ['pending', 'failed'])
        .lt('created_at', cutoffIso)
        .order('created_at', { ascending: true })
        .limit(MAX_RETRIES_PER_RUN);

      if (error) {
        throw new Error(`upo-retry-stale lookup failed: ${error.message}`);
      }
      // Cast: PostgREST zwraca JOINy jako wybór tabeli, jako array. TypeScript
      // nie potrafi tego zwęzić bez generowanych typów — bezpieczny narrowing
      // przez explicit interface (Faza 23 wymóg: bez `any`).
      return (data ?? []) as unknown as StaleUpoRow[];
    });

    if (stale.length === 0) {
      return { processed: 0, cutoffIso };
    }

    logger.info('UPO retry: znaleziono zaległości', {
      count: stale.length,
      cutoffIso,
    });

    // Re-emit eventy `invoice/upo.requested` przez batched sendEvent. Inngest
    // dedupuje po `event-key` (zob. event-schema), więc równoczesne uruchomienia
    // dla tej samej faktury nie podwajają się.
    const events = stale.flatMap((row) => {
      const tenants = row.invoices?.tenants;
      const tenantNipRow = Array.isArray(tenants) ? tenants[0] : tenants;
      const nip = tenantNipRow?.nip ?? row.invoices?.seller_nip;
      if (!nip) {
        // Brak NIP-u uniemożliwia poprawny dispatch — pomiń, ale zgłoś do Sentry.
        Sentry.captureMessage('UPO retry skipped — brak NIP-u dla invoice', {
          level: 'warning',
          extra: { invoiceId: row.invoice_id, upoReceiptId: row.id },
        });
        return [];
      }
      return [
        {
          name: 'invoice/upo.requested' as const,
          data: {
            invoiceId: row.invoice_id,
            tenantId: row.tenant_id,
            nip,
            ksefNumber: row.ksef_number,
          },
        },
      ];
    });

    if (events.length > 0) {
      await step.sendEvent('re-request-upo', events);
    }

    Sentry.addBreadcrumb({
      category: 'ksef.upo',
      level: 'info',
      message: 'UPO retry batch dispatched',
      data: { stale: stale.length, dispatched: events.length },
    });

    return {
      processed: stale.length,
      dispatched: events.length,
      cutoffIso,
    };
  },
);
