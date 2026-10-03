import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));

import { findOpenKsefSubmission, findOwnKsefSubmission } from '@/lib/ksef/submission-log';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVOICE = '11111111-1111-4111-8111-111111111111';
const SESSION = 'S-ORIGINAL';
const KSEF = '1234567890-20261001-0100A0B0C0D0-1A';
const HASH = 'a'.repeat(64);

type Submission = {
  tenant_id: string;
  invoice_id: string;
  status: string;
  session_reference_number: string | null;
  invoice_reference_number: string | null;
  request_payload_hash: string | null;
  response_ksef_number: string | null;
  attempted_at: string;
};
const SENT: Submission = {
  tenant_id: TENANT, invoice_id: INVOICE, status: 'sent',
  session_reference_number: SESSION, invoice_reference_number: 'I-ORIGINAL',
  request_payload_hash: HASH, response_ksef_number: null,
  attempted_at: '2026-10-01T10:00:00Z',
};
const EVIDENCE = { sessionReferenceNumber: SESSION, invoiceReferenceNumber: 'I-ORIGINAL', payloadHash: HASH };
let rows: Submission[];
let databaseError: { message: string } | null;
let selected: string[];
let queryFilters: Array<[string, unknown]>;
let queryLimit: number | undefined;

function database() {
  return {
    from() {
      const filters: Array<[keyof Submission, unknown]> = [];
      const nonnull: Array<keyof Submission> = [];
      let ordered = false;
      let limit = rows.length;
      const result = () => {
        if (databaseError) return { data: null, error: databaseError };
        let found = rows.filter((row) => filters.every(([key, value]) => row[key] === value) &&
          nonnull.every((key) => row[key] !== null));
        if (ordered) found = [...found].sort((a, b) => b.attempted_at.localeCompare(a.attempted_at));
        return { data: found.slice(0, limit), error: null };
      };
      const q = {
        select: (fields: string) => { selected.push(fields); return q; },
        eq: (key: keyof Submission, value: unknown) => { filters.push([key, value]); queryFilters.push([key, value]); return q; },
        not: (key: keyof Submission) => { nonnull.push(key); return q; },
        order: () => { ordered = true; return q; },
        limit: (n: number) => { limit = n; queryLimit = n; return q; },
        maybeSingle: async () => { const value = result(); return { ...value, data: value.data?.[0] ?? null }; },
        then: <T>(resolve: (value: ReturnType<typeof result>) => T) => Promise.resolve(result()).then(resolve),
      };
      return q;
    },
  };
}

beforeEach(() => {
  rows = [{ ...SENT }];
  databaseError = null;
  selected = [];
  queryFilters = [];
  queryLimit = undefined;
  mocks.admin.mockReturnValue(database());
});

describe('ksef_submissions: hash tej samej próby co numery referencyjne', () => {
  it('uzgodnienie zwraca hash z dokładnie ostatniego otwartego wpisu tej firmy i faktury', async () => {
    rows = [
      { ...SENT, request_payload_hash: 'b'.repeat(64), attempted_at: '2026-09-30T10:00:00Z' },
      { ...SENT, tenant_id: 'other', attempted_at: '2026-10-03T10:00:00Z' },
      { ...SENT, invoice_id: 'other', attempted_at: '2026-10-04T10:00:00Z' },
      { ...SENT },
    ];
    await expect(findOpenKsefSubmission(TENANT, INVOICE)).resolves.toEqual(EVIDENCE);
    expect(selected[0]).toContain('request_payload_hash');
    expect(queryFilters).toContainEqual(['tenant_id', TENANT]);
    expect(queryFilters).toContainEqual(['invoice_id', INVOICE]);
  });

  it('starszy wpis NULL hash zwraca referencje, ale nie tworzy skrótu', async () => {
    rows = [{ ...SENT, request_payload_hash: null }];
    await expect(findOpenKsefSubmission(TENANT, INVOICE)).resolves.toEqual({ ...EVIDENCE, payloadHash: null });
  });

  it('brak otwartej próby oznacza brak wyniku', async () => {
    rows = [{ ...SENT, status: 'accepted', response_ksef_number: KSEF }];
    await expect(findOpenKsefSubmission(TENANT, INVOICE)).resolves.toBeNull();
  });
});

describe('własny duplikat 440: dowód oryginalnej sesji', () => {
  const run = () => findOwnKsefSubmission(TENANT, INVOICE, SESSION, KSEF);

  it('bierze hash oryginalnej sesji, a nie nowej próby zakończonej 440', async () => {
    rows = [
      { ...SENT, status: 'accepted', response_ksef_number: KSEF },
      { ...SENT, session_reference_number: 'S-NEW', invoice_reference_number: 'I-NEW', request_payload_hash: 'b'.repeat(64) },
    ];
    await expect(run()).resolves.toEqual(EVIDENCE);
    expect(queryFilters).toEqual([
      ['tenant_id', TENANT], ['invoice_id', INVOICE], ['session_reference_number', SESSION],
    ]);
    expect(queryLimit).toBe(2);
  });

  it('sent bez zapisanego numeru KSeF można uzgodnić z oryginalną odpowiedzią 440', async () => {
    await expect(run()).resolves.toEqual(EVIDENCE);
  });

  it('oryginalna własna sesja z NULL hash jest znana, lecz bez dowodu XML', async () => {
    rows = [{ ...SENT, request_payload_hash: null }];
    await expect(run()).resolves.toEqual({ ...EVIDENCE, payloadHash: null });
  });

  it.each([
    ['inna firma', { tenant_id: 'other' }],
    ['inna faktura', { invoice_id: 'other' }],
    ['inna sesja', { session_reference_number: 'other' }],
    ['sprzeczny numer KSeF', { response_ksef_number: 'other' }],
    ['odrzucona próba', { status: 'rejected' }],
    ['próba będąca duplikatem', { status: 'duplicate' }],
    ['akceptacja bez numeru', { status: 'accepted', response_ksef_number: null }],
    ['brak referencji faktury', { invoice_reference_number: null }],
  ])('%s nie jest dowodem własnego duplikatu', async (_label, patch) => {
    rows = [{ ...SENT, ...patch }];
    await expect(run()).resolves.toBeNull();
  });

  it.each([
    ['inny hash', { request_payload_hash: 'b'.repeat(64) }],
    ['inna referencja', { invoice_reference_number: 'I-OTHER' }],
    ['ten sam dowód dwukrotnie', {}],
  ])('dwa wpisy oryginalnej sesji (%s) wymagają uzgodnienia', async (_label, patch) => {
    rows = [{ ...SENT }, { ...SENT, ...patch }];
    await expect(run()).resolves.toBeNull();
  });

  it('brak numeru albo sesji nie rozpoczyna odczytu', async () => {
    await expect(findOwnKsefSubmission(TENANT, INVOICE, '', KSEF)).resolves.toBeNull();
    await expect(findOwnKsefSubmission(TENANT, INVOICE, SESSION, '')).resolves.toBeNull();
    expect(selected).toEqual([]);
  });

  it('awaria bazy nie udaje braku własnej historii', async () => {
    databaseError = { message: 'db unavailable' };
    await expect(run()).rejects.toThrow('Nie można odczytać');
    await expect(findOpenKsefSubmission(TENANT, INVOICE)).rejects.toThrow('Nie można odczytać');
  });
});
