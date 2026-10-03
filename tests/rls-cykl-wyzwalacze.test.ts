import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRlsTestEnvironment } from './helpers/rls-environment';

/**
 * Cykl życia faktury, PR 4a (00132) — wyzwalacze 00119/00122 po zacieśnieniu,
 * na prawdziwej bazie i prawdziwej roli klienta (`authenticated`):
 *
 *   - klient NIE zmienia `ksef_status` nigdy, także `draft → queued`
 *     (do 00132 wolno było — W2: status bez zlecenia),
 *   - po `reset_ksef_send` szkic jest edytowalny (diagnostyka nie zamraża),
 *   - `failed` z samą diagnostyką nadal zamraża treść (stan, nie pola),
 *   - klient nie usuwa dokumentu w drodze ani z historią dostawy,
 *   - klient nie pisze diagnostyki,
 *   - serwis (service_role) nadal przechodzi stany.
 */

const hasDatabase = Boolean(
  process.env.RLS_TEST_SUPABASE_URL?.trim() &&
    process.env.RLS_TEST_SUPABASE_ANON_KEY?.trim() &&
    process.env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY?.trim(),
);
const environment = hasDatabase ? getRlsTestEnvironment() : null;
const admin: SupabaseClient = environment
  ? createClient(environment.url, environment.serviceRoleKey)
  : (null as unknown as SupabaseClient);

const ORG = '77777777-7777-4777-8777-777777777777';
const OWNER_EMAIL = 'rls-wyzwalacze-owner@ksef-saas.test';
const PASS = 'RlsWyzwalaczePass2026Aa!';

let ownerId = '';
let owner: SupabaseClient;
let counter = 0;

async function userId(email: string): Promise<string> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser');
  return data.user.id;
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const c = createClient(environment!.url, environment!.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-active-org': ORG } },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  return c;
}

/** Faktura wychodząca firmy ORG w zadanym stanie (wstawiana serwisem); zwraca id. */
async function invoice(patch: Record<string, unknown>): Promise<string> {
  counter += 1;
  const id = `7777aaaa-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  const number = `WYZ/${counter}`;
  const { error } = await admin.from('invoices').insert({
    id, tenant_id: ORG, direction: 'outgoing', internal_number: number, invoice_type: 'VAT',
    issue_date: '2026-10-01', seller_nip: '9480000014', buyer_nip: '1234567890',
    gross_total: 123, net_total: 100, vat_total: 23, ksef_status: 'draft',
    fa3_data: { internalNumber: number, type: 'VAT' }, seller_data: { nip: '9480000014' }, buyer_data: { nip: '1234567890' },
    ...patch,
  });
  if (error) throw new Error(`insert invoices: ${error.message}`);
  return id;
}

async function status(id: string): Promise<string | null> {
  const { data, error } = await admin.from('invoices').select('ksef_status, notes').eq('id', id).single();
  if (error) throw error;
  return data.ksef_status;
}

async function cleanup() {
  await admin.from('ksef_submissions').delete().eq('tenant_id', ORG);
  await admin.from('invoices').update({
    ksef_status: 'draft', ksef_send_owner: null, submitted_to_ksef_at: null, last_attempt_at: null,
    ksef_number: null, ksef_accepted_at: null, xml_storage_path: null,
  }).eq('tenant_id', ORG).neq('ksef_status', 'accepted');
  await admin.from('invoices').delete().eq('tenant_id', ORG);
  await admin.from('audit_logs').delete().eq('tenant_id', ORG);
}

describe.skipIf(!hasDatabase)('wyzwalacze cyklu życia po 00132 — rola klienta', () => {
  beforeAll(async () => {
    ownerId = await userId(OWNER_EMAIL);
    await cleanup();
    await admin.from('memberships').delete().eq('organization_id', ORG);
    await admin.from('tenants').delete().eq('id', ORG);
    const { error: tErr } = await admin.from('tenants').insert({ id: ORG, nip: '9480000014', name: 'Firma Wyzwalacze' });
    if (tErr) throw tErr;
    await admin.from('users').upsert([{ id: ownerId, name: 'Owner Wyzwalacze' }], { onConflict: 'id' });
    const { error: mErr } = await admin.from('memberships').insert([
      { organization_id: ORG, user_id: ownerId, role: 'owner', status: 'active' },
    ]);
    if (mErr) throw mErr;
    owner = await signedIn(OWNER_EMAIL);
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    await cleanup();
    await admin.from('memberships').delete().eq('organization_id', ORG);
    await admin.from('tenants').delete().eq('id', ORG);
  });

  it('W2: klient nie przestawi draft → queued (ani w żaden inny stan)', async () => {
    const id = await invoice({});
    const queued = await owner.from('invoices').update({ ksef_status: 'queued' }).eq('id', id).select('id');
    expect(queued.error?.code).toBe('42501');
    expect(await status(id)).toBe('draft');

    const failed = await owner.from('invoices').update({ ksef_status: 'failed' }).eq('id', id).select('id');
    expect(failed.error?.code).toBe('42501');
  });

  it('po reset_ksef_send szkic jest edytowalny mimo wcześniejszej diagnostyki', async () => {
    const id = await invoice({
      ksef_status: 'failed', last_error_code: 'INFRA', last_error: 'TypeError: fetch failed',
      last_attempt_at: '2026-10-01T10:00:00Z', submission_attempts: 3,
    });
    const reset = await admin.rpc('reset_ksef_send', { p_invoice_id: id, p_tenant_id: ORG, p_actor_user_id: ownerId });
    expect(reset.error).toBeNull();

    const edit = await owner.from('invoices').update({ notes: 'poprawione po błędzie' }).eq('id', id).select('notes');
    expect(edit.error).toBeNull();
    expect(edit.data?.[0]?.notes).toBe('poprawione po błędzie');
  });

  it('failed z samą diagnostyką: treść nadal zamrożona dla klienta (stan, nie pola)', async () => {
    const id = await invoice({ ksef_status: 'failed', last_error_code: 'INFRA' });
    const edit = await owner.from('invoices').update({ notes: 'x' }).eq('id', id).select('id');
    expect(edit.error?.code).toBe('42501');
  });

  it('klient nie pisze diagnostyki wysyłki', async () => {
    const id = await invoice({});
    const edit = await owner.from('invoices').update({ last_error: 'podrobione' }).eq('id', id).select('id');
    expect(edit.error?.code).toBe('42501');
  });

  it('klient nie usunie dokumentu w drodze ani z historią dostawy; szkic bez historii tak', async () => {
    const queued = await invoice({ ksef_status: 'queued' });
    const sent = await invoice({ ksef_status: 'failed', submitted_to_ksef_at: '2026-10-01T10:00:00Z' });
    const plain = await invoice({});

    expect((await owner.from('invoices').delete().eq('id', queued).select('id')).error?.code).toBe('42501');
    expect((await owner.from('invoices').delete().eq('id', sent).select('id')).error?.code).toBe('42501');
    const ok = await owner.from('invoices').delete().eq('id', plain).select('id');
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
  });

  it('serwis nadal przechodzi stany (worker, RPC)', async () => {
    const id = await invoice({});
    const enqueue = await admin.rpc('enqueue_ksef_send', { p_invoice_id: id, p_tenant_id: ORG, p_attempt_id: 'proba-00132' });
    expect(enqueue.error).toBeNull();
    expect(await status(id)).toBe('queued');
    const failed = await admin.from('invoices')
      .update({ ksef_status: 'failed', last_error_code: 'INFRA', last_error: 'x', ksef_send_owner: null })
      .eq('id', id).select('id');
    expect(failed.error).toBeNull();
    expect(await status(id)).toBe('failed');
  });
});
