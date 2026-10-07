import { beforeEach, expect, it, vi } from 'vitest';

/**
 * Granica rodzaju dokumentu przy „Wyślij ponownie” (PR 3b cyklu życia):
 * korekta, zaliczka i faktura końcowa nie mają w wierszu danych specjalnych
 * zdarzenia wysyłki — ponowienie idzie przez powrót do szkicu i wystawienie
 * od nowa. Zwykła faktura `failed` jest ponawiana przez `requeue_ksef_send`.
 */

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
  enqueue: vi.fn(),
  logAudit: vi.fn(),
  row: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase/auth-context', () => ({
  ActionAuthError: class ActionAuthError extends Error {},
  requireUserAndActiveOrg: mocks.requireAuth,
  requireOrgRole: mocks.requireAuth,
}));
vi.mock('@/lib/invoices/ksef-submit-enqueue', () => ({ enqueueKsefSubmitAfterDraft: mocks.enqueue }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/storage/r2', () => ({ downloadInvoiceXml: vi.fn() }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('@/lib/pdf/invoice-data', () => ({ loadInvoiceForPdf: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceEmail: vi.fn() }));

import { resendInvoiceAction } from '@/components/invoices/actions-detail';
import { KSEF_SEND_MESSAGES } from '@/lib/invoices/ksef-send-policy';
import { finalizeInvoice } from '@/lib/xml/invoice-calculator';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';

const snapshot = finalizeInvoice({
  internalNumber: 'FV 2/10/2026',
  type: 'VAT',
  issueDate: '2026-10-01',
  saleDate: '2026-10-01',
  seller: { nip: '5260001246', name: 'Firma', address: { countryCode: 'PL', addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' } },
  buyer: { nip: '5252241585', name: 'Klient', address: { countryCode: 'PL', addressLine1: 'ul. B 2', addressLine2: '00-002 Warszawa' } },
  lines: [{ ordinal: 1, name: 'Usługa', unit: 'szt', quantity: 1, unitPriceNet: 100, vatRate: '23' }],
  payment: { currency: 'PLN', dueDate: '2026-10-15', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enqueue.mockResolvedValue({ ok: true, mode: 'online_queued' });
  const query = {
    select: (columns: string) => { mocks.select(columns); return query; },
    eq: (key: string, value: unknown) => { mocks.eq(key, value); return query; },
    maybeSingle: async () => ({ data: mocks.row, error: null }),
    update: (patch: unknown) => { mocks.update(patch); return query; },
  };
  mocks.from.mockReturnValue(query);
  mocks.requireAuth.mockResolvedValue({
    supabase: { from: mocks.from },
    user: { id: 'fixture-user' },
    tenantId,
    role: 'owner',
  });
});

it.each([
  ['correction', 'failed', KSEF_SEND_MESSAGES.special],
  ['advance', 'failed', KSEF_SEND_MESSAGES.special],
  ['final', 'failed', KSEF_SEND_MESSAGES.special],
  ['correction', 'rejected', KSEF_SEND_MESSAGES.rejected],
])('blocks %s/%s resend before any job or status update', async (kind, status, message) => {
  mocks.row = { ksef_status: status, direction: 'outgoing', invoice_kind: kind, invoice_type: 'KOR', last_error_code: 'INFRA', issue_date: '2026-10-01', fa3_data: snapshot, special_data: null };

  const result = await resendInvoiceAction(invoiceId);

  expect(result).toEqual({ success: false, error: message });
  expect(mocks.eq).toHaveBeenCalledWith('id', invoiceId);
  expect(mocks.eq).toHaveBeenCalledWith('tenant_id', tenantId);
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
});

it('regular/failed is requeued through the lifecycle RPC, never by a session status update', async () => {
  mocks.row = { ksef_status: 'failed', direction: 'outgoing', invoice_kind: 'regular', invoice_type: 'VAT', last_error_code: 'INFRA', issue_date: '2026-10-01', fa3_data: snapshot, special_data: null };

  expect(await resendInvoiceAction(invoiceId)).toEqual({ success: true });
  expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ mode: { kind: 'requeue', actorUserId: 'fixture-user' } }));
  expect(mocks.update).not.toHaveBeenCalled();
});
