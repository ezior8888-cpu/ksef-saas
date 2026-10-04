import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-001 / F-042 (audyt bloku 1): szkic faktury był ślepą uliczką — nie dało
 * się go wysłać do KSeF ani usunąć, a jego numer zostawał zajęty. Szkic
 * zapisywał się też bez walidacji serwerowej.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  invoices: [] as Row[],
  tenants: [] as Row[],
}));
const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  audit: vi.fn(),
  auth: vi.fn(),
}));

/** Minimalny klient: select/update/delete z filtrami `eq` na tabeli w pamięci. */
function fakeSupabase() {
  return {
    from(table: 'invoices' | 'tenants') {
      const filters: Array<[string, unknown]> = [];
      let op: 'select' | 'update' | 'delete' = 'select';
      let patch: Row = {};
      const matches = (r: Row) => filters.every(([k, v]) => r[k] === v);
      const run = () => {
        const rows = db[table];
        if (op === 'update') {
          const hit = rows.filter(matches);
          hit.forEach((r) => Object.assign(r, patch));
          return { data: hit.map((r) => ({ ...r })), error: null };
        }
        if (op === 'delete') {
          const hit = rows.filter(matches);
          db[table] = rows.filter((r) => !matches(r));
          return { data: hit.map((r) => ({ ...r })), error: null };
        }
        return { data: rows.filter(matches).map((r) => ({ ...r })), error: null };
      };
      const q = {
        select: () => q,
        update: (p: Row) => { op = 'update'; patch = p; return q; },
        delete: () => { op = 'delete'; return q; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        maybeSingle: async () => {
          const { data } = run();
          return { data: data[0] ?? null, error: null };
        },
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(ok, fail),
      };
      return q;
    },
  };
}

vi.mock('@/lib/supabase/auth-context', () => {
  class ActionAuthError extends Error {}
  return { ActionAuthError, requireUserAndActiveOrg: mocks.auth };
});
vi.mock('@/lib/invoices/ksef-submit-enqueue', () => ({ enqueueKsefSubmitAfterDraft: mocks.enqueue }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { deleteDraftInvoiceAction, sendDraftInvoiceAction } from '@/components/invoices/draft-actions';
import { finalizeInvoice } from '@/lib/xml/invoice-calculator';

const TENANT = 'ten-1';
const TODAY = '2026-10-02';

function snapshot(o: { issueDate?: string; bankAccount?: string } = {}) {
  return finalizeInvoice({
    internalNumber: 'FV 5/10/2026',
    type: 'VAT',
    issueDate: o.issueDate ?? TODAY,
    saleDate: o.issueDate ?? TODAY,
    seller: { nip: '5260001246', name: 'Moja Firma', address: { countryCode: 'PL', addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' } },
    buyer: { nip: '5252241585', name: 'Klient', address: { countryCode: 'PL', addressLine1: 'ul. B 2', addressLine2: '00-002 Warszawa' } },
    lines: [{ ordinal: 1, name: 'Usługa', unit: 'szt', quantity: 1, unitPriceNet: 100, vatRate: '23' }],
    payment: { currency: 'PLN', dueDate: '2026-10-16', method: 'transfer', bankAccount: o.bankAccount ?? 'PL61109010140000071219812874' },
  });
}

function draft(o: Row = {}): Row {
  return {
    id: 'inv-1',
    tenant_id: TENANT,
    ksef_status: 'draft',
    direction: 'outgoing',
    invoice_kind: 'regular',
    invoice_type: 'VAT',
    internal_number: 'FV 5/10/2026',
    fa3_data: snapshot(),
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
  db.invoices = [draft()];
  db.tenants = [{ id: TENANT, nip: '5260001246' }];
  mocks.auth.mockResolvedValue({ supabase: fakeSupabase(), user: { id: 'user-1' }, tenantId: TENANT, role: 'owner' });
  mocks.enqueue.mockResolvedValue({ ok: true, mode: 'online_queued' });
});

describe('wysyłka szkicu do KSeF (F-001)', () => {
  it('poprawny szkic trafia do kolejki z danymi ze snapshotu i NIP-em firmy', async () => {
    const r = await sendDraftInvoiceAction('inv-1');
    expect(r).toEqual({ success: true, offline: false });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT,
      invoiceId: 'inv-1',
      nip: '5260001246',
      auditKind: 'regular',
      invoice: expect.objectContaining({ internalNumber: 'FV 5/10/2026' }),
    });
    // Status przestawia RPC `enqueue_ksef_send` w transakcji ze zleceniem
    // (tu zamockowane) — akcja nie pisze `ksef_status` z sesji klienta (PR 3, W2).
    expect(db.invoices[0]!.ksef_status).toBe('draft');
  });

  it('drugie kliknięcie: odmowę daje RPC (warunek draft), nie zapis z sesji', async () => {
    mocks.enqueue
      .mockResolvedValueOnce({ ok: true, mode: 'online_queued' })
      .mockResolvedValueOnce({ ok: false, error: 'Ta faktura jest już wysyłana albo nie jest szkicem.' });
    await sendDraftInvoiceAction('inv-1');
    const drugi = await sendDraftInvoiceAction('inv-1');
    expect(drugi).toEqual({ success: false, error: 'Ta faktura jest już wysyłana albo nie jest szkicem.' });
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(db.invoices[0]!.ksef_status).toBe('draft');
  });

  it('gdy kolejka odmówi (np. brak certyfikatu), faktura wraca do szkicu', async () => {
    mocks.enqueue.mockResolvedValue({ ok: false, error: 'Najpierw wgraj certyfikat KSeF' });
    const r = await sendDraftInvoiceAction('inv-1');
    expect(r).toEqual({ success: false, error: 'Najpierw wgraj certyfikat KSeF' });
    expect(db.invoices[0]!.ksef_status).toBe('draft');
  });

  it('szkic z błędem walidacji nie trafia do kolejki', async () => {
    db.invoices = [draft({ fa3_data: snapshot({ bankAccount: 'PL00 1234' }) })];
    const r = await sendDraftInvoiceAction('inv-1');
    expect(r.success).toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(db.invoices[0]!.ksef_status).toBe('draft');
  });

  it('szkic z datą wystawienia inną niż dziś trzeba wystawić od nowa', async () => {
    db.invoices = [draft({ fa3_data: snapshot({ issueDate: '2026-10-01' }) })];
    const r = await sendDraftInvoiceAction('inv-1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('2026-10-01');
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['faktura już wysłana', { ksef_status: 'accepted' }],
    ['korekta', { invoice_kind: 'correction', invoice_type: 'KOR' }],
    ['faktura kosztowa', { direction: 'incoming' }],
  ])('%s — odmowa bez kolejki', async (_label, o) => {
    db.invoices = [draft(o)];
    const r = await sendDraftInvoiceAction('inv-1');
    expect(r.success).toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('szkic innej organizacji — odmowa', async () => {
    db.invoices = [draft({ tenant_id: 'ten-2' })];
    const r = await sendDraftInvoiceAction('inv-1');
    expect(r.success).toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});

describe('usunięcie szkicu (F-001)', () => {
  it('usuwa szkic i zapisuje audyt', async () => {
    const r = await deleteDraftInvoiceAction('inv-1');
    expect(r).toEqual({ success: true });
    expect(db.invoices).toHaveLength(0);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.draft_deleted', entityId: 'inv-1' }));
  });

  it.each([['accepted'], ['queued'], ['rejected']])('faktura w stanie %s zostaje', async (status) => {
    db.invoices = [draft({ ksef_status: status })];
    const r = await deleteDraftInvoiceAction('inv-1');
    expect(r.success).toBe(false);
    expect(db.invoices).toHaveLength(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('szkic innej organizacji zostaje', async () => {
    db.invoices = [draft({ tenant_id: 'ten-2' })];
    const r = await deleteDraftInvoiceAction('inv-1');
    expect(r.success).toBe(false);
    expect(db.invoices).toHaveLength(1);
  });
});
