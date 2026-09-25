/**
 * Operator-only, read-only Stripe refund/dispute gap audit.
 *
 * pnpm exec tsx scripts/security/audit-stripe-financial-gaps.ts \
 *   --mode test --from 2026-09-01 --to 2026-09-25
 *
 * Requires explicit complete UTC days, matching Stripe key and a database
 * with migration 00080. Never run this from CI with live credentials.
 */
import { createClient } from '@supabase/supabase-js';

import { getStripe } from '../../lib/stripe/client';
import {
  AuditFailure, assertStripeKeyMode, auditStripeFinancialGaps,
  FINANCIAL_EVENT_TYPES, parseAuditWindow,
  type AuditSources, type CaseRow, type DatabasePage, type ReceiptRow,
} from '../../lib/stripe/financial-gap-audit';

type DbError = { code?: string } | null;
const FINANCIAL_TYPES: string[] = [...FINANCIAL_EVENT_TYPES];

function dbFailure(error: DbError): never {
  // PostgreSQL undefined_table and PostgREST schema-cache miss.
  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    throw new AuditFailure('schema_unavailable');
  }
  throw new AuditFailure('database_unavailable');
}

async function main(): Promise<void> {
  const window = parseAuditWindow(process.argv.slice(2));
  assertStripeKeyMode(process.env.STRIPE_SECRET_KEY, window.mode);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !roleKey) throw new AuditFailure('invalid_input');

  const stripe = getStripe();
  const db = createClient(url, roleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sources: AuditSources = {
    async probeSchema() {
      // Do this before any Stripe request: an absent 00080 must never look clean.
      const result = await db.from('stripe_financial_cases')
        .select('stripe_object_id', { head: true }).limit(1);
      if (result.error) dbFailure(result.error);
    },
    async listStripe(kind, request) {
      const params = {
        created: { gte: request.fromEpoch, lt: request.toEpoch },
        limit: request.limit,
        ...(request.startingAfter ? { starting_after: request.startingAfter } : {}),
      };
      const page = kind === 'refund'
        ? await stripe.refunds.list(params)
        : await stripe.disputes.list(params);
      return {
        data: page.data.map((item) => ({ id: item.id, created: item.created })),
        hasMore: page.has_more,
      };
    },
    async listCases(ids, offset, limit): Promise<DatabasePage<CaseRow>> {
      const result = await db.from('stripe_financial_cases')
        .select('stripe_object_id,kind', { count: 'exact' })
        .in('stripe_object_id', ids)
        .order('stripe_object_id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (result.error) dbFailure(result.error);
      if (result.data === null || result.count === null) dbFailure(null);
      return { data: result.data as unknown as CaseRow[], count: result.count };
    },
    async listReceipts(group, cutoffIso, offset, limit): Promise<DatabasePage<ReceiptRow>> {
      let query = db.from('stripe_webhook_events')
        .select('id,type,processing_status,received_at', { count: 'exact' })
        .in('type', FINANCIAL_TYPES);
      if (group === 'failed') {
        query = query.eq('processing_status', 'failed');
      } else {
        query = query.in('processing_status', ['processing', 'retryable'])
          .lt('received_at', cutoffIso);
      }
      const result = await query.order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (result.error) dbFailure(result.error);
      if (result.data === null || result.count === null) dbFailure(null);
      return { data: result.data as unknown as ReceiptRow[], count: result.count };
    },
  };
  const report = await auditStripeFinancialGaps(window, sources);
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exitCode = report.status === 'attention' ? 1 : 0;
}

main().catch((error: unknown) => {
  // Do not print provider messages, request bodies, keys, or payloads.
  const reason = error instanceof AuditFailure ? error.code : 'source_inconsistent';
  process.stdout.write(JSON.stringify({ status: 'incomplete', reason }) + '\n');
  process.exitCode = 2;
});
