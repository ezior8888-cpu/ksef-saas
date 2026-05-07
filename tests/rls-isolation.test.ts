import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Test izolacji RLS w modelu multi-org (memberships).
 *
 * Sprawdzamy:
 *   - User z aktywną org A nie widzi danych org B (nawet po podaniu cudzej
 *     wartości w nagłówku `x-active-org` — `get_current_tenant_id()` ją
 *     zwaliduje przez `is_member_of()`).
 *   - Revoked membership traci dostęp do danych org natychmiast.
 *   - Duplikat NIP-u w 2 orgs — userzy widzą tylko swoje.
 *   - Sfałszowany nagłówek `x-active-org` z UUID innej org NIE daje dostępu.
 *
 * Setup / teardown — service_role (bypass RLS).
 * Asercje — anon JWT po `signInWithPassword` + nagłówek `x-active-org`,
 * tak jak robi to runtime aplikacji.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRole);

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
// Trzecia org z tym samym NIP-em co A — sprawdzamy izolację po duplikacie.
const TENANT_DUP_ID = '33333333-3333-3333-3333-333333333333';

const NIP_A = '9460000012';
const NIP_B = '9470000019';

const INVOICE_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-111111111111';
const INVOICE_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-222222222222';
const INVOICE_DUP_ID = 'cccccccc-cccc-cccc-cccc-333333333333';

const EMAIL_A = 'rls-isolation-a@ksef-saas.test';
const EMAIL_B = 'rls-isolation-b@ksef-saas.test';
const EMAIL_DUP = 'rls-isolation-dup@ksef-saas.test';
const PASS = 'RlsTestPass2026Aa!';

let userAId = '';
let userBId = '';
let userDupId = '';
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let clientDup: SupabaseClient;

function createFreshAnonClient(activeOrgId: string | null = null) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: activeOrgId
      ? { headers: { 'x-active-org': activeOrgId } }
      : undefined,
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

async function signInClient(
  email: string,
  password: string,
  activeOrgId: string,
): Promise<SupabaseClient> {
  const c = createFreshAnonClient(activeOrgId);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe('RLS isolation in multi-org model', () => {
  beforeAll(async () => {
    if (!anonKey) {
      throw new Error('Brak NEXT_PUBLIC_SUPABASE_ANON_KEY — potrzebne do logowania w teście RLS.');
    }

    userAId = await findOrCreateAuthUser(EMAIL_A, PASS);
    userBId = await findOrCreateAuthUser(EMAIL_B, PASS);
    userDupId = await findOrCreateAuthUser(EMAIL_DUP, PASS);

    // Czyszczenie — kolejność ważna (FK).
    await admin
      .from('invoices')
      .delete()
      .in('id', [INVOICE_A_ID, INVOICE_B_ID, INVOICE_DUP_ID]);
    await admin
      .from('memberships')
      .delete()
      .in('organization_id', [TENANT_A_ID, TENANT_B_ID, TENANT_DUP_ID]);
    await admin
      .from('tenants')
      .delete()
      .in('id', [TENANT_A_ID, TENANT_B_ID, TENANT_DUP_ID]);

    // 3 organizacje: A i B z różnymi NIP-ami; DUP z tym samym NIP-em co A
    // (multi-org dopuszcza ten sam NIP — kolizja jest informacją w UI, nie
    // ograniczeniem schematu).
    const { error: tErr } = await admin.from('tenants').upsert(
      [
        { id: TENANT_A_ID, nip: NIP_A, name: 'Firma Alfa RLS' },
        { id: TENANT_B_ID, nip: NIP_B, name: 'Firma Beta RLS' },
        { id: TENANT_DUP_ID, nip: NIP_A, name: 'Firma Alfa-Duplikat RLS' },
      ],
      { onConflict: 'id' },
    );
    if (tErr) throw tErr;

    // Backfill profili (handle_new_user trigger może być włączony lub nie).
    await admin
      .from('users')
      .upsert(
        [
          { id: userAId, name: 'Tester A' },
          { id: userBId, name: 'Tester B' },
          { id: userDupId, name: 'Tester DUP' },
        ],
        { onConflict: 'id' },
      );

    const { error: mErr } = await admin.from('memberships').insert([
      {
        organization_id: TENANT_A_ID,
        user_id: userAId,
        role: 'owner',
        status: 'active',
      },
      {
        organization_id: TENANT_B_ID,
        user_id: userBId,
        role: 'owner',
        status: 'active',
      },
      {
        organization_id: TENANT_DUP_ID,
        user_id: userDupId,
        role: 'owner',
        status: 'active',
      },
    ]);
    if (mErr) throw mErr;

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
        {
          id: INVOICE_DUP_ID,
          tenant_id: TENANT_DUP_ID,
          direction: 'outgoing',
          internal_number: 'DUP/001',
          invoice_type: 'VAT',
          issue_date: '2026-04-01',
          seller_nip: NIP_A,
          buyer_nip: NIP_B,
          gross_total: 500,
          net_total: 406.50,
          vat_total: 93.50,
          ksef_status: 'draft',
          fa3_data: minimalFa3,
          seller_data: { nip: NIP_A },
          buyer_data: { nip: NIP_B },
        },
      ],
      { onConflict: 'id' },
    );
    if (invErr) throw invErr;

    clientA = await signInClient(EMAIL_A, PASS, TENANT_A_ID);
    clientB = await signInClient(EMAIL_B, PASS, TENANT_B_ID);
    clientDup = await signInClient(EMAIL_DUP, PASS, TENANT_DUP_ID);
  });

  afterAll(async () => {
    await admin
      .from('invoices')
      .delete()
      .in('id', [INVOICE_A_ID, INVOICE_B_ID, INVOICE_DUP_ID]);
    await admin
      .from('memberships')
      .delete()
      .in('organization_id', [TENANT_A_ID, TENANT_B_ID, TENANT_DUP_ID]);
    await admin
      .from('tenants')
      .delete()
      .in('id', [TENANT_A_ID, TENANT_B_ID, TENANT_DUP_ID]);

    const userIds = [userAId, userBId, userDupId].filter(Boolean);
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id).catch(() => null);
    }
  });

  it('User A widzi TYLKO faktury swojej org A', async () => {
    const { data, error } = await clientA
      .from('invoices')
      .select('internal_number')
      .eq('direction', 'outgoing');
    if (error) throw error;
    const numbers = (data ?? []).map((r) => r.internal_number).sort();
    expect(numbers).toEqual(['A/001']);
  });

  it('User B widzi TYLKO fakturę org B', async () => {
    const { data, error } = await clientB
      .from('invoices')
      .select('internal_number');
    if (error) throw error;
    expect(data ?? []).toHaveLength(1);
    expect(data![0].internal_number).toBe('B/001');
  });

  it('Sfałszowany x-active-org wskazujący cudzą org NIE daje dostępu', async () => {
    // Klient zalogowany jako A, ale podaje header z org B w którym nie jest
    // członkiem. `get_current_tenant_id()` zwróci NULL → 0 wyników.
    const sneaky = await signInClient(EMAIL_A, PASS, TENANT_B_ID);
    const { data, error } = await sneaky.from('invoices').select('id');
    if (error) throw error;
    expect(data ?? []).toHaveLength(0);
  });

  it('User A NIE widzi org-duplikatu mimo identycznego NIP-u', async () => {
    // DUP ma ten sam NIP co A, ale to inna org (TENANT_DUP_ID). User A nie
    // jest jej członkiem → nie widzi jej faktur.
    const { data, error } = await clientA
      .from('tenants')
      .select('id, name')
      .eq('nip', NIP_A);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(TENANT_A_ID);
    expect(ids).not.toContain(TENANT_DUP_ID);
  });

  it('User A NIE może UPDATE faktury org B', async () => {
    const { data, error } = await clientA
      .from('invoices')
      .update({ notes: 'hacked' })
      .eq('id', INVOICE_B_ID)
      .select('id');
    if (error) throw error;
    expect(data ?? []).toHaveLength(0);
  });

  it('Revoked membership traci dostęp natychmiast', async () => {
    // Suspend membershipu A — powinien stracić dostęp do faktur org A.
    const { error: revErr } = await admin
      .from('memberships')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('organization_id', TENANT_A_ID)
      .eq('user_id', userAId);
    if (revErr) throw revErr;

    try {
      // Użyjemy świeżego klienta — wcześniejsze cache JWT może być nieaktualne.
      const stale = await signInClient(EMAIL_A, PASS, TENANT_A_ID);
      const { data, error } = await stale.from('invoices').select('id');
      if (error) throw error;
      expect(data ?? []).toHaveLength(0);
    } finally {
      // Przywróć membership, by inne testy się nie sypały.
      await admin
        .from('memberships')
        .update({ status: 'active', revoked_at: null })
        .eq('organization_id', TENANT_A_ID)
        .eq('user_id', userAId);
    }
  });

  it('Akceptacja zaproszenia obcym kontem mailowym jest blokowana', async () => {
    // Owner B wysyła zaproszenie na adres EMAIL_DUP.
    // User A próbuje je zaakceptować (zalogowany jako A) — RPC powinno
    // odrzucić z `invitation_email_mismatch`.
    const { createHash, randomBytes } = await import('crypto');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { error: insErr } = await admin
      .from('organization_invitations')
      .insert({
        organization_id: TENANT_B_ID,
        email: EMAIL_DUP.toLowerCase(),
        role: 'member',
        token_hash: tokenHash,
        invited_by: userBId,
      });
    if (insErr) throw insErr;

    try {
      const { error } = await clientA.rpc('accept_organization_invitation', {
        p_token_hash: tokenHash,
      });
      expect(error).toBeTruthy();
      expect(String(error?.message)).toContain('invitation_email_mismatch');
    } finally {
      await admin
        .from('organization_invitations')
        .delete()
        .eq('token_hash', tokenHash);
    }
  });
});
