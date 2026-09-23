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

import { cron, NonRetriableError } from 'inngest';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import * as Sentry from '@sentry/nextjs';

import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertJobIdentity } from './tenant-boundary';
import { assertUpoReceipt, matchesUpoInvoice, requireAcceptedUpoInvoice, UpoIdentityMismatchError, UPO_IDENTITY_MISMATCH } from './upo-identity';

const STALE_HOURS = 24;
const MAX_RETRIES_PER_RUN = 100;

interface StaleUpoRow {
  id: string;
  invoice_id: string;
  tenant_id: string;
  ksef_number: string;
  status: 'pending' | 'failed';
  download_attempts: number;
  invoices: {
    id: string;
    tenant_id: string;
    ksef_number: string | null;
    ksef_status: string | null;
  } | null;
}

const RETRY_COLUMNS = 'id, invoice_id, tenant_id, ksef_number, status, download_attempts, invoices(id, tenant_id, ksef_number, ksef_status)' as const;

/** Shared runner for Inngest and pg-boss; no authorization is trusted from step caches. */
export async function runUpoRetryStale({ step, logger }: JobContext) {
  const cutoffIso = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();
  const stale = await step.run('find-stale-upo', async () => {
    const { data, error } = await createAdminClient().from('upo_receipts')
      .select(RETRY_COLUMNS).in('status', ['pending', 'failed'])
      .or('last_error.is.null,last_error.neq.' + UPO_IDENTITY_MISMATCH)
      .lt('created_at', cutoffIso).order('created_at', { ascending: true })
      .limit(MAX_RETRIES_PER_RUN);
    if (error) throw new Error('Nie można sprawdzić zaległych UPO');
    return (data ?? []) as unknown as StaleUpoRow[];
  });
  if (!stale.length) return { processed: 0, cutoffIso };
  logger.info('UPO retry: znaleziono zaległości', { count: stale.length, cutoffIso });

  const events: Array<{ name: 'invoice/upo.requested'; data: {
    invoiceId: string; tenantId: string; ksefNumber: string; nip: string;
  } }> = [];
  let quarantined = 0;
  for (const candidate of stale) {
    const identity = { invoiceId: candidate.invoice_id, tenantId: candidate.tenant_id, ksefNumber: candidate.ksef_number };
    // UUID columns cannot contain malformed IDs, but old/cached results are untrusted.
    // A malformed reference CAN be stored in the text column: quarantine it below
    // only after reading the same receipt freshly, without aborting the batch.
    try {
      assertJobIdentity(candidate.id, candidate.tenant_id);
      assertJobIdentity(candidate.invoice_id, candidate.tenant_id);
      if (typeof candidate.ksef_number !== 'string') continue;
    } catch (error) {
      if (!(error instanceof NonRetriableError)) throw error;
      Sentry.captureMessage('UPO retry skipped — malformed candidate identity', { level: 'warning' });
      continue;
    }
    // A cached candidate can have been repaired, removed, completed or quarantined.
    const { data, error } = await createAdminClient().from('upo_receipts')
      .select(RETRY_COLUMNS).eq('id', candidate.id).eq('tenant_id', identity.tenantId)
      .eq('invoice_id', identity.invoiceId).eq('ksef_number', identity.ksefNumber)
      .in('status', ['pending', 'failed'])
      .or('last_error.is.null,last_error.neq.' + UPO_IDENTITY_MISMATCH).maybeSingle();
    if (error) throw new Error('Nie można ponownie sprawdzić zaległego UPO');
    if (!data) continue;
    const row = data as unknown as StaleUpoRow;
    assertUpoReceipt(row, identity, candidate.id);
    const joinedMatches = matchesUpoInvoice(row.invoices, identity);
    let invoice;
    try {
      // Separate fresh lookup also distinguishes a confirmed mismatch from a DB outage.
      invoice = await requireAcceptedUpoInvoice(identity);
    } catch (error) {
      if (!(error instanceof UpoIdentityMismatchError)) throw error;
      const { data: changed, error: updateError } = await createAdminClient().from('upo_receipts')
        .update({ status: 'failed', last_error: UPO_IDENTITY_MISMATCH })
        .eq('id', row.id).eq('tenant_id', row.tenant_id).eq('invoice_id', row.invoice_id)
        .eq('ksef_number', row.ksef_number).eq('status', row.status)
        .select('id');
      if (updateError) throw new Error('Nie można odseparować niespójnego UPO');
      quarantined += changed?.length ?? 0;
      Sentry.captureMessage('UPO retry skipped — inconsistent invoice relation', { level: 'warning' });
      continue;
    }
    if (!joinedMatches) {
      // Relation changed between the joined read and the independent lookup.
      // Leave it for the next fresh run instead of dispatching mixed snapshots.
      continue;
    }
    const tenant = Array.isArray(invoice.tenants) ? invoice.tenants[0] : invoice.tenants;
    const nip = tenant?.nip ?? invoice.seller_nip;
    if (!nip) {
      Sentry.captureMessage('UPO retry skipped — brak NIP-u dla invoice', { level: 'warning' });
      continue;
    }
    events.push({ name: 'invoice/upo.requested', data: { ...identity, nip } });
  }
  if (events.length) await step.sendEvent('re-request-upo', events);
  Sentry.addBreadcrumb({ category: 'ksef.upo', level: 'info', message: 'UPO retry batch dispatched',
    data: { stale: stale.length, dispatched: events.length, quarantined } });
  return { processed: stale.length, dispatched: events.length, quarantined, cutoffIso };
}

export const upoRetryStaleJob = inngest.createFunction(
  {
    id: 'upo-retry-stale',
    name: 'KSeF: retry UPO download (>24h pending/failed)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 5 * * * *')],
  },
  async ({ step, logger, attempt }) =>
    runUpoRetryStale(toJobContext({ step, logger, attempt })),
);
