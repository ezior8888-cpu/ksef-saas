import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRlsTestEnvironment } from './helpers/rls-environment';

/**
 * Uprawnienia funkcji i ról organizacji na prawdziwej bazie (migracje
 * 00103, 00104). Jak rls-isolation: tylko na osobnej bazie testowej
 * (`RLS_TEST_*`), w CI — job „RLS isolation (lokalny Supabase)”.
 *
 *   AUD-30/64 — anon i zalogowany nie wołają funkcji serwisowych,
 *   AUD-29    — admin nie nadaje roli owner i nie usuwa właściciela.
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

const ORG = '44444444-4444-4444-4444-444444444444';
const OWNER_EMAIL = 'rls-perm-owner@ksef-saas.test';
const ADMIN_EMAIL = 'rls-perm-admin@ksef-saas.test';
const ALT_EMAIL = 'rls-perm-alt@ksef-saas.test';
const PASS = 'RlsPermPass2026Aa!';

let ownerId = '';
let adminId = '';
let altId = '';
let ownerMembershipId = '';

function anonClient(activeOrg?: string) {
  return createClient(environment!.url, environment!.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: activeOrg ? { headers: { 'x-active-org': activeOrg } } : undefined,
  });
}

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
  const c = anonClient(ORG);
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  return c;
}

describe.skipIf(!hasDatabase)('uprawnienia funkcji i ról (00103, 00104)', () => {
  beforeAll(async () => {
    ownerId = await userId(OWNER_EMAIL);
    adminId = await userId(ADMIN_EMAIL);
    altId = await userId(ALT_EMAIL);

    await admin.from('organization_join_requests').delete().eq('organization_id', ORG);
    await admin.from('memberships').delete().eq('organization_id', ORG);
    await admin.from('tenants').delete().eq('id', ORG);
    const { error: tErr } = await admin.from('tenants').insert({ id: ORG, nip: '9480000014', name: 'Firma Uprawnienia RLS' });
    if (tErr) throw tErr;
    await admin.from('users').upsert(
      [{ id: ownerId, name: 'Owner' }, { id: adminId, name: 'Admin' }, { id: altId, name: 'Alt' }],
      { onConflict: 'id' },
    );
    const { data: mem, error: mErr } = await admin.from('memberships').insert([
      { organization_id: ORG, user_id: ownerId, role: 'owner', status: 'active' },
      { organization_id: ORG, user_id: adminId, role: 'admin', status: 'active' },
    ]).select('id, user_id');
    if (mErr) throw mErr;
    ownerMembershipId = mem!.find((m) => m.user_id === ownerId)!.id;
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    await admin.from('organization_join_requests').delete().eq('organization_id', ORG);
    await admin.from('memberships').delete().eq('organization_id', ORG);
    await admin.from('tenants').delete().eq('id', ORG);
  });

  it.each([
    ['cleanup_old_audit_logs', { p_retention_months: 12 }],
    ['auth_email_registered', { p_email: OWNER_EMAIL }],
    ['refresh_dashboard_materialized_views', {}],
  ])('anon nie wywoła %s', async (fn, args) => {
    const { error } = await anonClient().rpc(fn, args);
    expect(error?.code).toBe('42501');
  });

  it.each([
    ['approve_join_request', { p_request_id: '66666666-6666-4666-8666-666666666666', p_role: 'member' }],
    ['revoke_membership', { p_membership_id: '66666666-6666-4666-8666-666666666666' }],
  ])('anon nie wywoła %s (00106)', async (fn, args) => {
    const { error } = await anonClient().rpc(fn, args);
    expect(error?.code).toBe('42501');
  });

  it('zalogowany członek nie wywoła increment_push_failed_count', async () => {
    const c = await signedIn(ADMIN_EMAIL);
    const { error } = await c.rpc('increment_push_failed_count', { sub_id: '55555555-5555-4555-8555-555555555555' });
    expect(error?.code).toBe('42501');
  });

  it('admin nie zatwierdzi prośby z rolą owner, z rolą member — tak', async () => {
    const { data: req, error } = await admin.from('organization_join_requests')
      .insert({ organization_id: ORG, requested_by_user_id: altId, status: 'pending' })
      .select('id').single();
    if (error) throw error;
    const c = await signedIn(ADMIN_EMAIL);

    const asOwner = await c.rpc('approve_join_request', { p_request_id: req.id, p_role: 'owner' });
    expect(asOwner.error?.message).toContain('insufficient_role');

    const asMember = await c.rpc('approve_join_request', { p_request_id: req.id, p_role: 'member' });
    expect(asMember.error).toBeNull();
  });

  it('członek firmy nie czyta zaszyfrowanych danych KSeF, flagę obecności — tak (00111/00112, AUD-103)', async () => {
    const c = await signedIn(ADMIN_EMAIL);
    const blob = await c.from('tenants').select('ksef_credentials_encrypted').eq('id', ORG);
    expect(blob.error?.code).toBe('42501');

    const flag = await c.from('tenants').select('name, has_ksef_credentials').eq('id', ORG).single();
    expect(flag.error).toBeNull();
    expect(flag.data).toMatchObject({ name: 'Firma Uprawnienia RLS', has_ksef_credentials: false });
  });

  it('admin nie usunie właściciela', async () => {
    const c = await signedIn(ADMIN_EMAIL);
    const { error } = await c.rpc('revoke_membership', { p_membership_id: ownerMembershipId });
    expect(error?.message).toContain('insufficient_role');

    const { data } = await admin.from('memberships').select('status').eq('id', ownerMembershipId).single();
    expect(data?.status).toBe('active');
  });
});
