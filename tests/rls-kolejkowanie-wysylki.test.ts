import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRlsTestDatabaseUrl, getRlsTestEnvironment } from './helpers/rls-environment';

/**
 * Cykl życia faktury, PR 3 (W16/W2 z rewizji 03.10.2026) — na prawdziwej bazie,
 * prawdziwym pg-boss i prawdziwych wyzwalaczach:
 *
 *   - zmiana `draft → queued` (RPC `enqueue_ksef_send`, 00131) i zapis zlecenia
 *     są jedną transakcją: gdy zapis zlecenia pada, faktura zostaje szkicem
 *     (do 03.10.2026 zostawała w `queued` na zawsze — W2),
 *   - drugie kolejkowanie tej samej faktury odbija się od warunku `draft`
 *     w RPC (P0002) i nie tworzy drugiego zlecenia,
 *   - ponowna wysyłka (`requeue_ksef_send`) działa tylko dla kodów spoza
 *     klasy terminal i tylko z `failed` (z `rejected` w trybie uzgodnienia),
 *   - rola połączenia pg-boss (`DATABASE_URL`) ma prawo wykonać RPC.
 *
 * Wymaga `RLS_TEST_DATABASE_URL` (ta sama lokalna baza, połączenie Postgres).
 */

const hasDatabase = Boolean(
  process.env.RLS_TEST_SUPABASE_URL?.trim() &&
    process.env.RLS_TEST_SUPABASE_ANON_KEY?.trim() &&
    process.env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    process.env.RLS_TEST_DATABASE_URL?.trim(),
);
const environment = hasDatabase ? getRlsTestEnvironment() : null;
const databaseUrl = hasDatabase ? getRlsTestDatabaseUrl() : null;
const admin: SupabaseClient = environment
  ? createClient(environment.url, environment.serviceRoleKey)
  : (null as unknown as SupabaseClient);

const ORG = '66666666-6666-4666-8666-666666666666';
const OWNER_EMAIL = 'rls-kolejka-owner@ksef-saas.test';
const PASS = 'RlsKolejkaPass2026Aa!';
const QUEUE = 'invoice.submit.requested';

let ownerId = '';
let counter = 0;
let boss: import('pg-boss').PgBoss;
let sendJobEvent: typeof import('@/lib/jobs/enqueue').sendJobEvent;
let ksefSendTransactionStep: typeof import('@/lib/invoices/ksef-send-step').ksefSendTransactionStep;
let stopBoss: typeof import('@/lib/jobs/boss').stopBoss;

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

/** Faktura wychodząca firmy ORG w zadanym stanie; zwraca id. */
async function invoice(patch: Record<string, unknown>): Promise<string> {
  counter += 1;
  const id = `6666aaaa-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  const number = `KOL/${counter}`;
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

async function row(id: string) {
  const { data, error } = await admin
    .from('invoices')
    .select('ksef_status, ksef_send_owner, last_error_code')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function jobsFor(invoiceId: string) {
  const { rows } = await boss.getDb().executeSql(
    `SELECT id, state, singleton_key, data FROM pgboss.job WHERE name = $1 AND data->>'invoiceId' = $2 ORDER BY created_on`,
    [QUEUE, invoiceId],
  );
  return rows as Array<{ id: string; state: string; singleton_key: string | null; data: { sendAttemptId?: string } }>;
}

async function auditCount(invoiceId: string, action: string): Promise<number> {
  const { count, error } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ORG)
    .eq('entity_id', invoiceId)
    .eq('action', action);
  if (error) throw error;
  return count ?? 0;
}

function submitEvent(invoiceId: string, attemptId: string) {
  return {
    name: 'invoice/submit.requested',
    groupId: ORG,
    singletonKey: invoiceId,
    data: {
      tenantId: ORG,
      invoiceId,
      nip: '9480000014',
      environment: 'test',
      invoice: { internalNumber: 'KOL', type: 'VAT' },
      sendAttemptId: attemptId,
    },
  };
}

async function cleanup() {
  await boss?.getDb().executeSql(`DELETE FROM pgboss.job WHERE data->>'tenantId' = $1`, [ORG]);
  await admin.from('ksef_submissions').delete().eq('tenant_id', ORG);
  await admin.from('invoices').update({
    ksef_status: 'draft', ksef_send_owner: null, submitted_to_ksef_at: null, last_attempt_at: null,
  }).eq('tenant_id', ORG).neq('ksef_status', 'accepted');
  await admin.from('invoices').delete().eq('tenant_id', ORG);
  await admin.from('audit_logs').delete().eq('tenant_id', ORG);
}

describe.skipIf(!hasDatabase)('kolejkowanie wysyłki KSeF — RPC w transakcji ze zleceniem pg-boss (00131, PR 3)', () => {
  beforeAll(async () => {
    // Moduł kolejki czyta DATABASE_URL przy pierwszym użyciu — ta sama lokalna baza.
    process.env.DATABASE_URL = databaseUrl!;
    process.env.JOBS_BACKEND = 'pgboss';
    const bossModule = await import('@/lib/jobs/boss');
    stopBoss = bossModule.stopBoss;
    boss = await bossModule.startBoss();
    await boss.createQueue(QUEUE);
    ({ sendJobEvent } = await import('@/lib/jobs/enqueue'));
    ({ ksefSendTransactionStep } = await import('@/lib/invoices/ksef-send-step'));

    ownerId = await userId(OWNER_EMAIL);
    await cleanup();
    await admin.from('memberships').delete().eq('organization_id', ORG);
    await admin.from('tenants').delete().eq('id', ORG);
    const { error: tErr } = await admin.from('tenants').insert({ id: ORG, nip: '9480000014', name: 'Firma Kolejka' });
    if (tErr) throw tErr;
    await admin.from('users').upsert([{ id: ownerId, name: 'Owner Kolejka' }], { onConflict: 'id' });
    const { error: mErr } = await admin.from('memberships').insert([
      { organization_id: ORG, user_id: ownerId, role: 'owner', status: 'active' },
    ]);
    if (mErr) throw mErr;
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    await cleanup();
    await admin.from('memberships').delete().eq('organization_id', ORG);
    await admin.from('tenants').delete().eq('id', ORG);
    await stopBoss?.();
  });

  it('W2: gdy zapis zlecenia pada, przejście draft → queued jest wycofane', async () => {
    const id = await invoice({});
    // Zdarzenie zmapowane na kolejkę, której w tej bazie nie ma: pg-boss odmawia
    // zapisu zlecenia PO wykonaniu RPC — transakcja musi cofnąć zmianę statusu.
    const event = { ...submitEvent(id, 'proba-w2'), name: 'invoice/upo.requested' };

    await expect(
      sendJobEvent(event, { inTransaction: ksefSendTransactionStep({ kind: 'enqueue' }, { invoiceId: id, tenantId: ORG, attemptId: 'proba-w2' }) }),
    ).rejects.toThrow(/does not exist/);

    expect((await row(id)).ksef_status).toBe('draft');
    expect(await auditCount(id, 'invoice.send_enqueued')).toBe(0);
  });

  it('kolejkowanie: faktura queued, jedno zlecenie z singletonKey i sendAttemptId, audyt serwera', async () => {
    const id = await invoice({});

    const { ids } = await sendJobEvent(
      submitEvent(id, 'proba-ok'),
      { inTransaction: ksefSendTransactionStep({ kind: 'enqueue' }, { invoiceId: id, tenantId: ORG, attemptId: 'proba-ok' }) },
    );

    expect(ids).toHaveLength(1);
    expect(await row(id)).toMatchObject({ ksef_status: 'queued', ksef_send_owner: null });
    const jobs = await jobsFor(id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ state: 'created', singleton_key: id });
    expect(jobs[0]!.data.sendAttemptId).toBe('proba-ok');
    expect(await auditCount(id, 'invoice.send_enqueued')).toBe(1);
  });

  it('podwójne kliknięcie: drugie kolejkowanie dostaje P0002, zlecenie zostaje jedno', async () => {
    const id = await invoice({});
    const step = (attempt: string) => ksefSendTransactionStep({ kind: 'enqueue' }, { invoiceId: id, tenantId: ORG, attemptId: attempt });

    await sendJobEvent(submitEvent(id, 'proba-1'), { inTransaction: step('proba-1') });
    await expect(
      sendJobEvent(submitEvent(id, 'proba-2'), { inTransaction: step('proba-2') }),
    ).rejects.toMatchObject({ code: 'P0002' });

    expect((await row(id)).ksef_status).toBe('queued');
    expect(await jobsFor(id)).toHaveLength(1);
  });

  it('ponowna wysyłka: failed INFRA → queued ze zleceniem; błąd treści i rejected bez uzgodnienia odmawiają', async () => {
    const infra = await invoice({ ksef_status: 'failed', last_error_code: 'INFRA', ksef_send_owner: 'stara-proba' });
    const xsd = await invoice({ ksef_status: 'failed', last_error_code: 'XSD_INVALID' });
    const rejected = await invoice({ ksef_status: 'rejected', last_error_code: 'KSEF_REJECTED' });
    const requeue = (id: string, attempt: string, reconcileOnly = false) =>
      sendJobEvent(submitEvent(id, attempt), {
        inTransaction: ksefSendTransactionStep(
          { kind: 'requeue', actorUserId: ownerId, reconcileOnly },
          { invoiceId: id, tenantId: ORG, attemptId: attempt },
        ),
      });

    await requeue(infra, 'ponow-1');
    expect(await row(infra)).toMatchObject({ ksef_status: 'queued', ksef_send_owner: null, last_error_code: null });
    expect(await jobsFor(infra)).toHaveLength(1);
    expect(await auditCount(infra, 'invoice.send_requeued')).toBe(1);

    await expect(requeue(xsd, 'ponow-2')).rejects.toMatchObject({ code: 'P0001' });
    expect((await row(xsd)).ksef_status).toBe('failed');
    expect(await jobsFor(xsd)).toHaveLength(0);

    await expect(requeue(rejected, 'ponow-3')).rejects.toMatchObject({ code: 'P0001' });
    expect(await jobsFor(rejected)).toHaveLength(0);
    // Tryb „tylko uzgodnij” jest dla rejected dozwolony: job zaczyna od uzgodnienia po referencji.
    await requeue(rejected, 'ponow-4', true);
    expect((await row(rejected)).ksef_status).toBe('queued');
    expect(await jobsFor(rejected)).toHaveLength(1);
  });
});
