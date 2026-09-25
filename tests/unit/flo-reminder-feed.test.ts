import { createClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mock.client }));
import { listOpen } from '@/lib/flo/proposals';

it('excludes internal reminder drafts in the same scoped query as the feed limit', async () => {
  const requests: URL[] = [];
  mock.client = createClient('https://database.example.invalid', 'synthetic-local-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url) => {
      requests.push(new URL(String(url)));
      return Response.json([]);
    } },
  });
  expect(await listOpen('tenant-a')).toEqual([]);
  expect(requests).toHaveLength(1);
  const query = requests[0]!.searchParams;
  expect(requests[0]!.pathname).toBe('/rest/v1/flo_proposals');
  expect(query.get('tenant_id')).toBe('eq.tenant-a');
  expect(query.get('topic_key')).toBe('not.like.reminder-preview:%');
  expect(query.get('status')).toBe('in.(open,approved)');
  expect(query.get('limit')).toBe('50');
});

it('the local race-test adapter preserves nested dispatch filters and excludes hidden drafts', async () => {
  const { createFakeDb } = await import('./flo-fake-db');
  const db = createFakeDb({
    flo_proposals: [{ id: 'draft', topic_key: 'reminder-preview:fixture' }, { id: 'visible', topic_key: 'payment.chase:fixture' }],
    flo_approvals: [{ id: 'authorized', snapshot: { reminderDispatch: { digest: 'expected' } } }, { id: 'retired', snapshot: {} }],
  });
  const approvals = await db.client.from('flo_approvals').select('*').eq('snapshot->reminderDispatch->>digest', 'expected');
  expect(approvals.data?.map((row) => row.id)).toEqual(['authorized']);
  const proposals = await db.client.from('flo_proposals').select('*').not('topic_key', 'like', 'reminder-preview:%');
  expect(proposals.data?.map((row) => row.id)).toEqual(['visible']);
});
