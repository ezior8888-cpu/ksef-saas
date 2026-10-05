import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRlsTestEnvironment } from './helpers/rls-environment';
import { assertSubmitReferences } from '@/lib/ksef/submit-reference-boundary';
import type { Invoice } from '@/types/invoice';
import type { CorrectionInvoiceData } from '@/types/invoice-types';

/**
 * A4b PR1 (00137) na prawdziwej bazie: `invoices.special_data` — dane
 * zdarzenia wysyłki dokumentu specjalnego zapisane przy INSERT.
 *
 *   - CHECK `invoices_special_data_shape` wiąże kształt z rodzajem dokumentu
 *     i jest dwuwartościowy: brakujący klucz to odmowa, nie „NULL = przepuść”,
 *   - zapis jednorazowy (`guard_invoice_special_data`): zapisanej kopii nie
 *     zmienia nikt — klient, serwis ani właściciel bazy; do wiersza sprzed
 *     00137 (NULL) dane może dopisać tylko serwer (wyjście operatora),
 *   - przejścia 00131 (ponowienie, powrót do szkicu) zostawiają kopię,
 *   - wiersze bez kolumny (stary kod) przechodzą bez zmian.
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

const ORG = '99999999-9999-4999-8999-999999999999';
const OWNER_EMAIL = 'rls-dane-specjalne-owner@ksef-saas.test';
const PASS = 'RlsDaneSpecjalnePass2026Aa!';
const ATTEMPT = 'proba-00137';
const WRITE_ONCE = 'written once';
const SERVER_ONLY = 'only by the server';

let ownerId = '';
let owner: SupabaseClient;
let counter = 0;

function nextId(): string {
  counter += 1;
  return `9999aaaa-0000-4000-8000-${String(counter).padStart(12, '0')}`;
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
  const c = createClient(environment!.url, environment!.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-active-org': ORG } },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  return c;
}

type DbError = { code?: string; message: string } | null;

const correctionData = (n: number) => ({
  invoiceType: 'correction', internalNumber: `KOR/${n}`, correctionType: 'before_after', typKorekty: '1',
  paymentMethod: 'compensation', linesAfter: [{ name: 'Usługa', quantity: 8, unitPriceNet: 100, vatRate: '23', pkwiuCode: '62.01.11.0' }],
});
const finalData = (n: number) => ({ invoiceType: 'final', internalNumber: `ROZ/${n}`, advanceInvoiceIds: [`adv-${n}`] });
const settlementRows = [{ invoice_id: 'zal-1', advance_amount: 123, vat_rate: '23' }];

/** Faktura pierwotna przyjęta w KSeF — każda korekta dostaje własną (00135: jedna w toku). */
async function acceptedParent(): Promise<string> {
  const id = nextId();
  const { error } = await admin.from('invoices').insert({
    id, tenant_id: ORG, direction: 'outgoing', internal_number: `FV/${counter}`, invoice_type: 'VAT',
    invoice_kind: 'regular', issue_date: '2026-10-01', seller_nip: '9480000014', buyer_nip: '1234567890',
    gross_total: 1230, net_total: 1000, vat_total: 230, ksef_status: 'accepted', ksef_environment: 'test',
    ksef_number: `9480000014-20261001-${String(counter).padStart(12, '0')}-00`, xml_storage_path: 'x.xml',
    fa3_data: { internalNumber: `FV/${counter}`, type: 'VAT' }, seller_data: { nip: '9480000014' }, buyer_data: { nip: '1234567890' },
  });
  if (error) throw new Error(`insert parent: ${error.message}`);
  return id;
}

async function insertCorrection(
  specialData: unknown,
  patch: Record<string, unknown> = {},
  client: SupabaseClient = admin,
): Promise<{ id: string; error: DbError }> {
  const parent = await acceptedParent();
  const id = nextId();
  const { error } = await client.from('invoices').insert({
    id, tenant_id: ORG, direction: 'outgoing', internal_number: `KOR/${counter}`, invoice_type: 'KOR',
    invoice_kind: 'correction', parent_invoice_id: parent, correction_reason: 'test', correction_type: 'before_after',
    issue_date: '2026-10-02', seller_nip: '9480000014', buyer_nip: '1234567890',
    gross_total: -123, net_total: -100, vat_total: -23, ksef_status: 'draft',
    fa3_data: { internalNumber: `KOR/${counter}`, type: 'KOR' }, seller_data: { nip: '9480000014' }, buyer_data: { nip: '1234567890' },
    ...(specialData === undefined ? {} : { special_data: specialData }),
    ...patch,
  });
  return { id, error: error ? { code: error.code, message: error.message } : null };
}

async function insertOther(
  kind: 'regular' | 'advance' | 'final',
  specialData: unknown,
): Promise<{ id: string; error: DbError }> {
  const id = nextId();
  const type = kind === 'regular' ? 'VAT' : kind === 'advance' ? 'ZAL' : 'ROZ';
  const { error } = await admin.from('invoices').insert({
    id, tenant_id: ORG, direction: 'outgoing', internal_number: `${type}/${counter}`, invoice_type: type,
    invoice_kind: kind, issue_date: '2026-10-02', seller_nip: '9480000014', buyer_nip: '1234567890',
    gross_total: 123, net_total: 100, vat_total: 23, ksef_status: 'draft',
    // 00012: ZAL z kwotą, ROZ z co najmniej jedną zaliczką; 00125: każda ROZ z innymi zaliczkami.
    ...(kind === 'advance' ? { advance_amount: 123 } : {}),
    ...(kind === 'final' ? { advance_invoice_ids: [nextId()] } : {}),
    fa3_data: { internalNumber: `${type}/${counter}`, type }, seller_data: { nip: '9480000014' }, buyer_data: { nip: '1234567890' },
    ...(specialData === undefined ? {} : { special_data: specialData }),
  });
  return { id, error: error ? { code: error.code, message: error.message } : null };
}

async function stored(id: string): Promise<{ special_data: unknown; ksef_status: string; xml_generated_at: string | null }> {
  const { data, error } = await admin.from('invoices')
    .select('special_data, ksef_status, xml_generated_at').eq('id', id).single();
  if (error) throw error;
  return data as { special_data: unknown; ksef_status: string; xml_generated_at: string | null };
}

async function cleanup() {
  await admin.from('ksef_submissions').delete().eq('tenant_id', ORG);
  // Statusy do szkicu (00119/00122 pozwalają wtedy na DELETE); special_data
  // nie jest w SET, więc wyzwalacz 00137 się nie odpala.
  await admin.from('invoices').update({
    ksef_status: 'draft', ksef_send_owner: null, submitted_to_ksef_at: null, last_attempt_at: null,
    ksef_number: null, ksef_accepted_at: null, xml_storage_path: null, ksef_environment: null,
  }).eq('tenant_id', ORG).neq('ksef_status', 'accepted');
  await admin.from('invoices').delete().eq('tenant_id', ORG).eq('invoice_kind', 'correction');
  await admin.from('invoices').delete().eq('tenant_id', ORG);
  await admin.from('audit_logs').delete().eq('tenant_id', ORG);
}

describe.skipIf(!hasDatabase)('A4b (00137): special_data — kształt, zapis jednorazowy, przejścia', () => {
  beforeAll(async () => {
    ownerId = await userId(OWNER_EMAIL);
    await cleanup();
    await admin.from('memberships').delete().eq('organization_id', ORG);
    await admin.from('tenants').delete().eq('id', ORG);
    const { error: tErr } = await admin.from('tenants').insert({ id: ORG, nip: '9480000014', name: 'Firma Dane Specjalne' });
    if (tErr) throw tErr;
    await admin.from('users').upsert([{ id: ownerId, name: 'Owner Dane Specjalne' }], { onConflict: 'id' });
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

  describe('CHECK invoices_special_data_shape', () => {
    it('pełne kształty przechodzą: korekta {correctionData}, ROZ {finalData, finalAdvanceSettlementRows}', async () => {
      const kor = await insertCorrection({ correctionData: correctionData(1) });
      expect(kor.error).toBeNull();
      expect((await stored(kor.id)).special_data).toEqual({ correctionData: correctionData(1) });

      const roz = await insertOther('final', { finalData: finalData(1), finalAdvanceSettlementRows: settlementRows });
      expect(roz.error).toBeNull();
    });

    it('stary kod (INSERT bez kolumny) — NULL na każdym rodzaju dokumentu', async () => {
      expect((await insertCorrection(undefined)).error).toBeNull();
      for (const kind of ['regular', 'advance', 'final'] as const) {
        const row = await insertOther(kind, undefined);
        expect(row.error, kind).toBeNull();
        expect((await stored(row.id)).special_data).toBeNull();
      }
    });

    // Każdy z tych kształtów jest NULL-em w logice trójwartościowej przy
    // naiwnym `jsonb_typeof(x->'klucz') = 'object'` — CHECK musi odmówić.
    it.each([
      ['pusty obiekt', {}],
      ['dane ROZ na korekcie', { finalData: { invoiceType: 'final' } }],
      ['dodatkowy klucz', { correctionData: { invoiceType: 'correction' }, x: 1 }],
      ['correctionData = null', { correctionData: null }],
      ['correctionData tablicą', { correctionData: [] }],
      ['skalar zamiast obiektu', 5],
      ['tablica zamiast obiektu', [{ correctionData: {} }]],
    ])('korekta: %s → 23514', async (_name, value) => {
      const kor = await insertCorrection(value);
      expect(kor.error?.code).toBe('23514');
      expect(kor.error?.message).toContain('invoices_special_data_shape');
    });

    it.each([
      ['pusty obiekt', {}],
      ['samo finalData', { finalData: { invoiceType: 'final' } }],
      ['same wiersze zaliczek', { finalAdvanceSettlementRows: settlementRows }],
      ['pusta lista zaliczek', { finalData: { invoiceType: 'final' }, finalAdvanceSettlementRows: [] }],
      ['wiersze nie tablicą', { finalData: { invoiceType: 'final' }, finalAdvanceSettlementRows: { a: 1 } }],
      ['dodatkowy klucz', { finalData: { invoiceType: 'final' }, finalAdvanceSettlementRows: settlementRows, x: 1 }],
      ['dane korekty na ROZ', { correctionData: { invoiceType: 'correction' } }],
    ])('ROZ: %s → 23514', async (_name, value) => {
      const roz = await insertOther('final', value);
      expect(roz.error?.code).toBe('23514');
      expect(roz.error?.message).toContain('invoices_special_data_shape');
    });

    it.each(['regular', 'advance'] as const)('%s z danymi specjalnymi → 23514 (ZAL ma kopertę w fa3_data)', async (kind) => {
      const row = await insertOther(kind, { correctionData: { invoiceType: 'correction' } });
      expect(row.error?.code).toBe('23514');
      expect(row.error?.message).toContain('invoices_special_data_shape');
    });

    it('klient (rola authenticated): zapis przy INSERT szkicu działa, zły kształt odbija tak samo', async () => {
      const ok = await insertCorrection({ correctionData: correctionData(2) }, {}, owner);
      expect(ok.error).toBeNull();
      expect((await stored(ok.id)).special_data).toEqual({ correctionData: correctionData(2) });

      const bad = await insertCorrection({}, {}, owner);
      expect(bad.error?.code).toBe('23514');
    });
  });

  describe('zapis jednorazowy (guard_invoice_special_data)', () => {
    it('klient nie zmienia ani nie kasuje zapisanej kopii — nawet na własnym szkicu', async () => {
      const kor = await insertCorrection({ correctionData: correctionData(3) });
      expect(kor.error).toBeNull();

      const changed = await owner.from('invoices')
        .update({ special_data: { correctionData: { ...correctionData(3), typKorekty: '2' } } })
        .eq('id', kor.id).select('id');
      expect(changed.error?.code).toBe('42501');
      expect(changed.error?.message).toContain(WRITE_ONCE);

      const cleared = await owner.from('invoices').update({ special_data: null }).eq('id', kor.id).select('id');
      expect(cleared.error?.code).toBe('42501');
      expect(cleared.error?.message).toContain(WRITE_ONCE);

      expect((await stored(kor.id)).special_data).toEqual({ correctionData: correctionData(3) });
    });

    it('edycja innych pól szkicu przechodzi; kopia zostaje', async () => {
      const kor = await insertCorrection({ correctionData: correctionData(4) });
      const edit = await owner.from('invoices').update({ notes: 'uwaga do szkicu' }).eq('id', kor.id).select('notes');
      expect(edit.error).toBeNull();
      expect(edit.data?.[0]?.notes).toBe('uwaga do szkicu');
      expect((await stored(kor.id)).special_data).toEqual({ correctionData: correctionData(4) });
    });

    it.each(['queued', 'failed'])('serwis też nie zmienia kopii (stan %s)', async (status) => {
      const kor = await insertCorrection({ correctionData: correctionData(5) }, { ksef_status: status });
      expect(kor.error).toBeNull();
      const changed = await admin.from('invoices')
        .update({ special_data: { correctionData: { ...correctionData(5), linesAfter: [] } } })
        .eq('id', kor.id).select('id');
      expect(changed.error?.code).toBe('42501');
      expect(changed.error?.message).toContain(WRITE_ONCE);
      expect((await stored(kor.id)).special_data).toEqual({ correctionData: correctionData(5) });
    });

    it('wiersz sprzed 00137 (NULL): klient nie dopisze danych; serwer dopisze raz (wyjście operatora), potem kopia jest zamrożona', async () => {
      const legacy = await insertCorrection(undefined, { ksef_status: 'failed', last_error_code: 'KSEF_UNAVAILABLE' });
      expect(legacy.error).toBeNull();

      const byClient = await owner.from('invoices')
        .update({ special_data: { correctionData: correctionData(6) } })
        .eq('id', legacy.id).select('id');
      expect(byClient.error?.code).toBe('42501');
      expect(byClient.error?.message).toContain(SERVER_ONLY);
      expect((await stored(legacy.id)).special_data).toBeNull();

      const byServer = await admin.from('invoices')
        .update({ special_data: { correctionData: correctionData(6) } })
        .eq('id', legacy.id).select('id');
      expect(byServer.error).toBeNull();
      expect((await stored(legacy.id)).special_data).toEqual({ correctionData: correctionData(6) });

      const again = await admin.from('invoices')
        .update({ special_data: { correctionData: { ...correctionData(6), typKorekty: '3' } } })
        .eq('id', legacy.id).select('id');
      expect(again.error?.code).toBe('42501');
      expect(again.error?.message).toContain(WRITE_ONCE);
    });

    it('dopisanie przez serwer też przechodzi przez CHECK kształtu', async () => {
      const legacy = await insertCorrection(undefined);
      const bad = await admin.from('invoices').update({ special_data: {} }).eq('id', legacy.id).select('id');
      expect(bad.error?.code).toBe('23514');
      expect((await stored(legacy.id)).special_data).toBeNull();
    });
  });

  describe('przejścia 00131 zostawiają kopię', () => {
    it('requeue_ksef_send (failed → queued) zachowuje special_data i xml_generated_at', async () => {
      const kor = await insertCorrection({ correctionData: correctionData(7) }, {
        ksef_status: 'failed', last_error_code: 'KSEF_UNAVAILABLE', xml_generated_at: '2026-10-02T10:00:00+00:00',
      });
      expect(kor.error).toBeNull();
      const requeue = await admin.rpc('requeue_ksef_send', {
        p_invoice_id: kor.id, p_tenant_id: ORG, p_attempt_id: ATTEMPT, p_actor_user_id: ownerId,
      });
      expect(requeue.error).toBeNull();
      const after = await stored(kor.id);
      expect(after.ksef_status).toBe('queued');
      expect(after.special_data).toEqual({ correctionData: correctionData(7) });
      expect(new Date(after.xml_generated_at ?? 0).toISOString()).toBe('2026-10-02T10:00:00.000Z');
    });

    it('reset_ksef_send (failed → draft) zachowuje special_data, czyści xml_generated_at', async () => {
      const kor = await insertCorrection({ correctionData: correctionData(8) }, {
        ksef_status: 'failed', last_error_code: 'KSEF_UNAVAILABLE', xml_generated_at: '2026-10-02T10:00:00+00:00',
      });
      const reset = await admin.rpc('reset_ksef_send', { p_invoice_id: kor.id, p_tenant_id: ORG, p_actor_user_id: ownerId });
      expect(reset.error).toBeNull();
      const after = await stored(kor.id);
      expect(after.ksef_status).toBe('draft');
      expect(after.special_data).toEqual({ correctionData: correctionData(8) });
      expect(after.xml_generated_at).toBeNull();
    });
  });

  describe('granica wysyłki na prawdziwym wierszu (PostgREST, jsonb)', () => {
    /** Korekta z rodzicem przyjętym w KSeF TEST; zwraca dane do zdarzenia. */
    async function correctionForBoundary(specialData: 'stored' | 'legacy') {
      const parentId = await acceptedParent();
      const { data: parentRow, error: parentError } = await admin.from('invoices')
        .select('internal_number, issue_date, ksef_number').eq('id', parentId).single();
      if (parentError) throw parentError;
      const id = nextId();
      const number = `KOR/${counter}`;
      const correction = {
        invoiceType: 'correction', internalNumber: number, parentInvoiceId: parentId,
        parentInvoiceNumber: parentRow.internal_number, parentInvoiceIssueDate: parentRow.issue_date,
        parentKsefNumber: parentRow.ksef_number, seller: { nip: '9480000014' },
        buyer: { type: 'b2b', idType: 'nip', nip: '1234567890', name: 'Nabywca' },
        correctionType: 'before_after', typKorekty: '1', paymentMethod: 'compensation',
        // Ułamki i zagnieżdżenia — przejście przez jsonb nie może zmienić werdyktu.
        linesAfter: [{ name: 'Usługa', quantity: 8, unitPriceNet: 100.1, vatRate: '23', pkwiuCode: '62.01.11.0' }],
        amounts: { netDelta: -200.2, vatDelta: -46.05 },
      } as unknown as CorrectionInvoiceData;
      const document = { internalNumber: number, type: 'KOR' } as Invoice;
      const { error } = await admin.from('invoices').insert({
        id, tenant_id: ORG, direction: 'outgoing', internal_number: number, invoice_type: 'KOR',
        invoice_kind: 'correction', parent_invoice_id: parentId, correction_reason: 'test', correction_type: 'before_after',
        issue_date: '2026-10-02', seller_nip: '9480000014', buyer_nip: '1234567890',
        gross_total: -246.25, net_total: -200.2, vat_total: -46.05, ksef_status: 'queued',
        fa3_data: document, seller_data: { nip: '9480000014' }, buyer_data: { nip: '1234567890' },
        ...(specialData === 'stored' ? { special_data: { correctionData: correction } } : {}),
      });
      if (error) throw new Error(`insert correction: ${error.message}`);
      const input = (correctionData: CorrectionInvoiceData) => ({
        supabase: admin, tenantId: ORG, invoiceId: id, invoice: document,
        environment: 'test' as const, correctionData,
      });
      return { correction, input };
    }

    it('kopia równa zdarzeniu → przepuszcza (także zdarzenie z polami undefined); inna treść → odmowa', async () => {
      const { correction, input } = await correctionForBoundary('stored');
      await expect(assertSubmitReferences(input(JSON.parse(JSON.stringify(correction)))))
        .resolves.toBe('correction');
      // Pole `undefined` znika w pg-boss tak samo jak w jsonb — nie jest różnicą.
      await expect(assertSubmitReferences(input({ ...correction, notes: undefined } as CorrectionInvoiceData)))
        .resolves.toBe('correction');
      await expect(assertSubmitReferences(input({ ...correction, typKorekty: '2' } as CorrectionInvoiceData)))
        .rejects.toThrow('manual reconciliation');
      const lines = [{ ...(correction as unknown as { linesAfter: Array<Record<string, unknown>> }).linesAfter[0], quantity: 9 }];
      await expect(assertSubmitReferences(input({ ...correction, linesAfter: lines } as unknown as CorrectionInvoiceData)))
        .rejects.toThrow('manual reconciliation');
    });

    it('korekta sprzed 00137 (bez kopii) → jak dotąd, bez odmowy', async () => {
      const { correction, input } = await correctionForBoundary('legacy');
      await expect(assertSubmitReferences(input({ ...correction, typKorekty: '2' } as CorrectionInvoiceData)))
        .resolves.toBe('correction');
    });
  });

  it('PostgREST zna kolumnę w treści zapisu (nie PGRST204) — sonda z opisu wdrożenia', async () => {
    const probe = await admin.from('invoices')
      .update({ special_data: null })
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');
    expect(probe.error).toBeNull();
    expect(probe.data).toEqual([]);
  });
});
