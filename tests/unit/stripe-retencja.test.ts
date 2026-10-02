import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

const s = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: s.rpc }) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: vi.fn() } }));

import { runCleanupAuditLogs } from '@/lib/inngest/jobs/cleanup-audit-logs';

/**
 * AUD-79: ponowna dostawa webhooka Stripe porównywała cały payload — pola
 * koperty (`pending_webhooks`) zmieniają się między dostawami.
 * AUD-81 (B9): surowe zdarzenia Stripe 90 dni po przetworzeniu.
 */

const sql = readFileSync('supabase/migrations/00109_stripe_webhook_retention.sql', 'utf8');

describe('webhooki Stripe — porównanie i retencja', () => {
  it('ponowna dostawa: porównanie typu i `data`, nie całego payloadu', () => {
    expect(sql).toContain("v_event.payload->'data' IS DISTINCT FROM p_payload->'data'");
    expect(sql).not.toContain('v_event.payload IS DISTINCT FROM p_payload');
  });

  it('retencja: tylko przetworzone, po 90 dniach, zostaje id i typ', () => {
    expect(sql).toContain("processing_status IN ('processed', 'skipped')");
    expect(sql).toContain("jsonb_build_object('id', id, 'type', type, 'pruned', true)");
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.prune_stripe_webhook_payloads(integer) FROM PUBLIC, anon, authenticated;');
  });

  it('miesięczny job sprzątania woła retencję Stripe (90 dni)', async () => {
    s.rpc.mockReset().mockImplementation(async (fn: string) => ({
      data: fn === 'cleanup_old_audit_logs' ? { deleted_audit_logs: 0, cutoff: '', duration_ms: 1 } : 0,
      error: null,
    }));
    const ctx = { step: { run: async (_n: string, fn: () => unknown) => fn() } } as unknown as JobContext;

    await runCleanupAuditLogs(ctx);

    expect(s.rpc).toHaveBeenCalledWith('prune_stripe_webhook_payloads', { p_retention_days: 90 });
  });
});
