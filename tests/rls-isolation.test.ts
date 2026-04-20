import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Test izolacji RLS — jeden tenant nie widzi danych drugiego.
 *
 * Setup / teardown: service_role (bypass RLS).
 * Asercje: prawdziwy JWT przez anon + signInWithPassword (PostgREST owija RPC
 * w SECURITY DEFINER — wtedy SET ROLE wewnątrz funkcji SQL zawsze się sypie).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRole);

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

/** NIP-y z poprawną sumą kontrolną, zarezerwowane tylko pod ten test. */
const NIP_A = '9460000012';
const NIP_B = '9470000019';

const INVOICE_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-111111111111';
const INVOICE_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-222222222222';

const EMAIL_A = 'rls-isolation-a@ksef-saas.test';
const EMAIL_B = 'rls-isolation-b@ksef-saas.test';
const PASS_A = 'RlsTestPass2026Aa!';
const PASS_B = 'RlsTestPass2026Bb!';

let userAId = '';
let userBId = '';
let clientA: SupabaseClient;
let clientB: SupabaseClient;

function createFreshAnonClient() {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function findOrCreateAuthUser(email: string, password: string): Promise<string> {
  const { data: page, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;
  const hit = page.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (hit) return hit.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error(`createUser returned no user for ${email}`);
  return data.user.id;
}

describe('RLS isolation between tenants', () => {
  beforeAll(async () => {
    if (!anonKey) {
      throw new Error('Brak NEXT_PUBLIC_SUPABASE_ANON_KEY — potrzebne do logowania w teście RLS.');
    }

    userAId = await findOrCreateAuthUser(EMAIL_A, PASS_A);
    userBId = await findOrCreateAuthUser(EMAIL_B, PASS_B);

    await admin.from('invoices').delete().in('id', [INVOICE_A_ID, INVOICE_B_ID]);
    await admin.from('users').delete().in('id', [userAId, userBId]);
    await admin.from('tenants').delete().in('id', [TENANT_A_ID, TENANT_B_ID]);

    const { error: tErr } = await admin.from('tenants').upsert(
      [
        { id: TENANT_A_ID, nip: NIP_A, name: 'Firma Alfa RLS' },
        { id: TENANT_B_ID, nip: NIP_B, name: 'Firma Beta RLS' },
      ],
      { onConflict: 'id' }
    );
    if (tErr) throw tErr;

    const { error: uErr } = await admin.from('users').upsert(
      [
        { id: userAId, tenant_id: TENANT_A_ID, role: 'owner' },
        { id: userBId, tenant_id: TENANT_B_ID, role: 'owner' },
      ],
      { onConflict: 'id' }
    );
    if (uErr) throw uErr;

    const minimalFa3 = { internalNumber: 'TEST', type: 'VAT' };

    const { error: invErr } = await admin.from('invoices').upsert(
      [
        {
          id: INVOICE_A_ID,
          tenant_id: TENANT_A_ID,
          direction: 'outgoing',
          internal_number: 'A/001',
          invoice_type: 'VAT',
          issue_date: '2026-04-01',
          seller_nip: NIP_A,
          buyer_nip: NIP_B,
          gross_total: 1000,
          net_total: 812.77,
          vat_total: 187.23,
          ksef_status: 'draft',
          fa3_data: minimalFa3,
          seller_data: { nip: NIP_A },
          buyer_data: { nip: NIP_B },
        },
        {
          id: INVOICE_B_ID,
          tenant_id: TENANT_B_ID,
          direction: 'outgoing',
          internal_number: 'B/001',
          invoice_type: 'VAT',
          issue_date: '2026-04-01',
          seller_nip: NIP_B,
          buyer_nip: NIP_A,
          gross_total: 2000,
          net_total: 1626.02,
          vat_total: 373.98,
          ksef_status: 'draft',
          fa3_data: minimalFa3,
          seller_data: { nip: NIP_B },
          buyer_data: { nip: NIP_A },
        },
      ],
      { onConflict: 'id' }
    );
    if (invErr) throw invErr;

    clientA = createFreshAnonClient();
    const { error: aSignErr } = await clientA.auth.signInWithPassword({
      email: EMAIL_A,
      password: PASS_A,
    });
    if (aSignErr) throw aSignErr;

    clientB = createFreshAnonClient();
    const { error: bSignErr } = await clientB.auth.signInWithPassword({
      email: EMAIL_B,
      password: PASS_B,
    });
    if (bSignErr) throw bSignErr;
  });

  afterAll(async () => {
    await admin.from('invoices').delete().in('id', [INVOICE_A_ID, INVOICE_B_ID]);
    const userIds = [userAId, userBId].filter(Boolean);
    if (userIds.length) {
      await admin.from('users').delete().in('id', userIds);
    }
    await admin.from('tenants').delete().in('id', [TENANT_A_ID, TENANT_B_ID]);

    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('User A widzi TYLKO fakturę tenanta A', async () => {
    const { count, error } = await clientA
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outgoing');
    if (error) throw error;
    expect(count).toBe(1);
  });

  it('User B widzi TYLKO fakturę tenanta B', async () => {
    const { data, error } = await clientB.from('invoices').select('internal_number');
    if (error) throw error;
    expect(data ?? []).toHaveLength(1);
    expect(data![0].internal_number).toBe('B/001');
  });

  it('User A NIE może UPDATE faktury tenanta B', async () => {
    const { data, error } = await clientA
      .from('invoices')
      .update({ notes: 'hacked' })
      .eq('id', INVOICE_B_ID)
      .select('id');
    if (error) throw error;
    expect(data ?? []).toHaveLength(0);
  });

  it('User A NIE może DELETE user tenanta B', async () => {
    const { data, error } = await clientA.from('users').delete().eq('id', userBId).select('id');
    if (error) throw error;
    expect(data ?? []).toHaveLength(0);

    const { data: stillExists, error: selErr } = await admin
      .from('users')
      .select('id')
      .eq('id', userBId)
      .single();
    if (selErr) throw selErr;
    expect(stillExists?.id).toBe(userBId);
  });
});
