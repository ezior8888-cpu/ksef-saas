import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), capture: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture, captureMessage: vi.fn() }));
import { POST } from '@/app/api/email/resend-webhook/route';

const key = Buffer.from('local-fixture-key-no-external-service');
let receipts: Set<string>;
let failedWrite: boolean;
let failedAuth: boolean;
let writes: string[];

function request(type: 'email.bounced' | 'email.complained') {
  const body = JSON.stringify({ type, data: { to: ['fixture@example.test'], bounce: { type: 'hard' } } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const id = 'local-fixture-event';
  const sig = createHmac('sha256', key).update(id + '.' + timestamp + '.' + body).digest('base64');
  return new Request('https://app.example.test/api/email/resend-webhook', {
    method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + sig },
  });
}

beforeEach(() => {
  vi.resetAllMocks(); receipts = new Set(); failedWrite = true; failedAuth = false; writes = [];
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_' + key.toString('base64'));
  mocks.capture.mockReturnValue('fixture-correlation');
  mocks.admin.mockImplementation(() => ({
    auth: { admin: { listUsers: async () => ({ data: { users: [{ id: 'fixture-user', email: 'fixture@example.test' }] }, error: failedAuth ? { message: 'private-auth-diagnostic' } : null }) } },
    from: (table: string) => ({
      insert: async (row: { resend_event_id: string }) => {
        expect(table).toBe('email_bounces');
        if (receipts.has(row.resend_event_id)) return { error: { code: '23505' } };
        receipts.add(row.resend_event_id); return { error: null };
      },
      upsert: async (row: { user_id: string; category: string }) => {
        expect(table).toBe('email_preferences');
        expect(row.user_id).toBe('fixture-user');
        writes.push(row.category);
        return { error: failedWrite ? { message: 'private-database-diagnostic' } : null };
      },
    }),
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe.each(['email.bounced', 'email.complained'] as const)('%s retries', (type) => {
  it('retries an Auth lookup failure even after the receipt was saved', async () => {
    failedWrite = false; failedAuth = true;
    const first = await POST(request(type));
    expect(first.status).toBe(500);
    expect(receipts.size).toBe(1);
    expect(writes).toEqual([]);
    expect(await first.text()).not.toContain('private-auth-diagnostic');
    failedAuth = false;
    expect((await POST(request(type))).status).toBe(200);
    expect(writes).toContain('marketing');
    expect(writes).toContain('product_updates');
  });
  it('retries preferences after the receipt was stored but the opt-out write failed', async () => {
    const first = await POST(request(type));
    expect(first.status).toBe(500);
    expect(receipts.size).toBe(1);
    expect(await first.text()).not.toContain('private-database-diagnostic');
    const firstWrites = [...writes];
    expect(firstWrites).toContain('marketing');
    expect(firstWrites).toContain('product_updates');
    failedWrite = false; writes = [];
    const second = await POST(request(type));
    expect(second.status).toBe(200);
    expect(writes).toEqual(firstWrites);
    expect(receipts.size).toBe(1);
  });
});
