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
    await admin.from('ocr_jobs').delete().eq('tenant_id', ORG);
    await admin.from('expenses').delete().eq('tenant_id', ORG);
    await admin.from('accountant_access').delete().eq('tenant_id', ORG);
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

  it('usunięcie konta: autor wydatku, OCR i dostępu księgowej → NULL; sprawdzenie blokad tylko dla serwisu (00113, AUD-41)', async () => {
    const goneId = await userId('rls-perm-gdpr@ksef-saas.test');
    await admin.from('users').upsert({ id: goneId, name: 'Do usunięcia' }, { onConflict: 'id' });
    const exp = await admin.from('expenses').insert({
      tenant_id: ORG, created_by: goneId, source: 'manual', seller_name: 'Sprzedawca Testowy',
      issue_date: '2026-10-01', net_amount: 100, gross_amount: 123,
    }).select('id').single();
    expect(exp.error).toBeNull();
    const ocr = await admin.from('ocr_jobs').insert({
      tenant_id: ORG, created_by: goneId, source_file_path: 'pending', source_file_mime: 'image/jpeg',
    }).select('id').single();
    expect(ocr.error).toBeNull();
    const acc = await admin.from('accountant_access').insert({
      tenant_id: ORG, accountant_email: 'ksiegowa@ksef-saas.test', accountant_name: 'Księgowa Testowa',
      expires_at: '2099-01-01T00:00:00Z', token_hash: 'a'.repeat(64), created_by_user_id: goneId,
    }).select('id').single();
    expect(acc.error).toBeNull();

    const asAnon = await anonClient().rpc('gdpr_user_deletion_blockers', { p_user_id: goneId });
    expect(asAnon.error?.code).toBe('42501');
    const check = await admin.rpc('gdpr_user_deletion_blockers', { p_user_id: goneId });
    expect(check.error).toBeNull();
    expect(check.data).toEqual([]);

    const { error: delErr } = await admin.auth.admin.deleteUser(goneId);
    expect(delErr).toBeNull();
    const [e, o, a] = await Promise.all([
      admin.from('expenses').select('created_by').eq('id', exp.data!.id).single(),
      admin.from('ocr_jobs').select('created_by').eq('id', ocr.data!.id).single(),
      admin.from('accountant_access').select('created_by_user_id').eq('id', acc.data!.id).single(),
    ]);
    expect(e.data).toEqual({ created_by: null });
    expect(o.data).toEqual({ created_by: null });
    expect(a.data).toEqual({ created_by_user_id: null });
  });

  it('przejęcie wysyłki KSeF: wyłączność z dzierżawą, ten sam właściciel wraca, klient nie ustawi właściciela (00124, AUD-10)', async () => {
    const INVOICE = '77777777-7777-4777-8777-777777777777';
    await admin.from('invoices').delete().eq('id', INVOICE);
    const { error: insErr } = await admin.from('invoices').insert({
      id: INVOICE, tenant_id: ORG, direction: 'outgoing', internal_number: 'CLAIM/1', invoice_type: 'VAT',
      issue_date: '2026-10-01', seller_nip: '9480000014', buyer_nip: '1234567890',
      gross_total: 123, net_total: 100, vat_total: 23, ksef_status: 'queued',
      fa3_data: { internalNumber: 'CLAIM/1', type: 'VAT' }, seller_data: { nip: '9480000014' }, buyer_data: { nip: '1234567890' },
    });
    expect(insErr).toBeNull();
    const claim = (owner: string | null) => admin.rpc('claim_ksef_send', {
      p_invoice_id: INVOICE, p_tenant_id: ORG, p_owner: owner, p_lease_seconds: 900,
    });

    const first = await claim('proba-A');
    expect(first.error).toBeNull();
    expect(first.data).toEqual(expect.any(String));

    // Inna próba w trakcie dzierżawy przegrywa; ta sama wraca (ponowienie).
    const other = await claim('proba-B');
    expect(other.error).toBeNull();
    expect(other.data).toBeNull();
    const again = await claim('proba-A');
    expect(again.data).toEqual(expect.any(String));

    // Po wygaśnięciu dzierżawy wygrywa inna próba.
    await admin.from('invoices').update({ submitted_to_ksef_at: '2026-01-01T00:00:00Z' }).eq('id', INVOICE);
    const afterLease = await claim('proba-B');
    expect(afterLease.data).toEqual(expect.any(String));
    const row = await admin.from('invoices').select('ksef_status, ksef_send_owner').eq('id', INVOICE).single();
    expect(row.data).toEqual({ ksef_status: 'sending', ksef_send_owner: 'proba-B' });

    // Funkcja tylko dla serwisu; klient nie ustawi właściciela przejęcia.
    expect((await anonClient().rpc('claim_ksef_send', {
      p_invoice_id: INVOICE, p_tenant_id: ORG, p_owner: 'x', p_lease_seconds: 900,
    })).error?.code).toBe('42501');
    const c = await signedIn(ADMIN_EMAIL);
    const forged = await c.from('invoices').update({ ksef_send_owner: 'podrobiona' }).eq('id', INVOICE);
    expect(forged.error?.code).toBe('42501');

    // Sprzątanie: faktura „w wysyłce” jest chroniona przed usunięciem (00119) —
    // najpierw powrót do szkicu przez serwis.
    await admin.from('invoices').update({
      ksef_status: 'draft', submitted_to_ksef_at: null, last_attempt_at: null, ksef_send_owner: null,
    }).eq('id', INVOICE);
    await admin.from('invoices').delete().eq('id', INVOICE);
  });

  it('zaliczka rozliczona najwyżej jedną ROZ, odrzucona ROZ ją zwalnia (00125, AUD-67)', async () => {
    const ADV = '88888888-8888-4888-8888-888888888881';
    const ADV2 = '88888888-8888-4888-8888-888888888882';
    const ROZ1 = '88888888-8888-4888-8888-888888888891';
    const ROZ2 = '88888888-8888-4888-8888-888888888892';
    const ROZ3 = '88888888-8888-4888-8888-888888888893';
    const ids = [ROZ1, ROZ2, ROZ3];
    await admin.from('invoices').delete().in('id', ids);
    const roz = (id: string, n: string, advances: string[], status = 'draft') => ({
      id, tenant_id: ORG, direction: 'outgoing', internal_number: n, invoice_type: 'ROZ',
      invoice_kind: 'final', issue_date: '2026-10-02', seller_nip: '9480000014', buyer_nip: '1234567890',
      gross_total: 123, net_total: 100, vat_total: 23, ksef_status: status, advance_invoice_ids: advances,
      fa3_data: { internalNumber: n, type: 'ROZ' }, seller_data: { nip: '9480000014' }, buyer_data: { nip: '1234567890' },
    });

    // Odrzucona przez KSeF ROZ nie trzyma zaliczki.
    expect((await admin.from('invoices').insert(roz(ROZ1, 'ROZ-T/1', [ADV], 'rejected'))).error).toBeNull();
    expect((await admin.from('invoices').insert(roz(ROZ2, 'ROZ-T/2', [ADV]))).error).toBeNull();

    // Druga żywa ROZ z tą samą zaliczką — odmowa dla serwisu i dla klienta.
    expect((await admin.from('invoices').insert(roz(ROZ3, 'ROZ-T/3', [ADV2, ADV]))).error?.code).toBe('23505');
    const c = await signedIn(ADMIN_EMAIL);
    expect((await c.from('invoices').insert(roz(ROZ3, 'ROZ-T/3', [ADV]))).error?.code).toBe('23505');
    // Ta sama zaliczka dwa razy w jednej ROZ.
    expect((await c.from('invoices').insert(roz(ROZ3, 'ROZ-T/3', [ADV2, ADV2]))).error?.code).toBe('23505');
    // Inna zaliczka przechodzi; dopisanie zajętej w edycji szkicu — nie.
    expect((await c.from('invoices').insert(roz(ROZ3, 'ROZ-T/3', [ADV2]))).error).toBeNull();
    expect((await c.from('invoices').update({ advance_invoice_ids: [ADV2, ADV] }).eq('id', ROZ3)).error?.code)
      .toBe('23505');

    // Powrót odrzuconej ROZ do obiegu, gdy zaliczkę trzyma już inna — odmowa.
    expect((await admin.from('invoices').update({ ksef_status: 'draft' }).eq('id', ROZ1)).error?.code)
      .toBe('23505');

    await admin.from('invoices').delete().in('id', ids);
  });

  it('najwyżej jeden wydatek na zadanie OCR w firmie; inna firma i wydatki bez OCR przechodzą (00146, B4 z #192)', async () => {
    const OTHER = '44444444-4444-4444-4444-444444444445';
    const job = '4444aaaa-0000-4000-8000-000000000146';
    const expense = (tenantId: string, ocrJobId: string | null) => admin.from('expenses').insert({
      tenant_id: tenantId, created_by: ownerId, source: ocrJobId ? 'ocr_photo' : 'manual', seller_name: 'Sprzedawca Testowy',
      issue_date: '2026-10-01', net_amount: 100, gross_amount: 123, ocr_job_id: ocrJobId,
    }).select('id').single();
    await admin.from('expenses').delete().eq('tenant_id', OTHER);
    await admin.from('tenants').delete().eq('id', OTHER);
    const { error: tErr } = await admin.from('tenants').insert({ id: OTHER, nip: '1234567890', name: 'Inna firma B4' });
    expect(tErr).toBeNull();
    try {
      expect((await expense(ORG, job)).error).toBeNull();
      // Drugi przebieg tego samego zadania (pg-boss doręczył job drugi raz) — baza odmawia.
      const dup = await expense(ORG, job);
      expect(dup.error?.code).toBe('23505');
      expect(dup.error?.message).toContain('uq_expenses_tenant_ocr_job');
      // To samo zadanie w innej firmie i wydatki bez zadania OCR — bez zmian.
      expect((await expense(OTHER, job)).error).toBeNull();
      expect((await expense(ORG, null)).error).toBeNull();
      expect((await expense(ORG, null)).error).toBeNull();
    } finally {
      await admin.from('expenses').delete().eq('tenant_id', OTHER);
      await admin.from('tenants').delete().eq('id', OTHER);
    }
  });

  it('admin nie usunie właściciela', async () => {
    const c = await signedIn(ADMIN_EMAIL);
    const { error } = await c.rpc('revoke_membership', { p_membership_id: ownerMembershipId });
    expect(error?.message).toContain('insufficient_role');

    const { data } = await admin.from('memberships').select('status').eq('id', ownerMembershipId).single();
    expect(data?.status).toBe('active');
  });
});
