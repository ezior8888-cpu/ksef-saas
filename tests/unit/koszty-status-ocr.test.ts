import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; args: unknown[] }>,
  createClient: vi.fn(),
  response: {
    data: null as Record<string, unknown> | null,
    error: null as { code: string; message: string; details?: string; hint?: string } | null,
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/auth-context', () => ({ requireUserAndActiveOrg: vi.fn() }));
vi.mock('@/lib/storage/expenses', () => ({
  uploadExpensePhoto: vi.fn(),
  deleteExpensePhoto: vi.fn(),
  detectExpensePhotoType: vi.fn(),
}));
// Klient z sesji użytkownika (RLS) — zapisujemy łańcuch zapytania.
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));

import { getOcrJobStatusAction } from '@/app/actions/expenses';

/**
 * E16: akcja odpytywana przez przycisk „Dodaj wydatek” brała z `maybeSingle()`
 * tylko `data`. Chwilowy błąd bazy wyglądał jak brak zadania, UI pokazywał
 * porażkę i klient wgrywał zdjęcie drugi raz → drugi wydatek. Teraz akcja
 * odróżnia brak zadania (`retryable: false`) od błędu odczytu
 * (`retryable: true`), a treść błędu bazy nie wychodzi do przeglądarki.
 */

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const DB_MESSAGE = 'connection to server at "10.0.0.5" failed: tenant 1234567890';

function chain() {
  const q: Record<string, unknown> = {};
  const record = (fn: string) => (...args: unknown[]) => {
    mocks.calls.push({ fn, args });
    return q;
  };
  Object.assign(q, {
    select: record('select'),
    eq: record('eq'),
    maybeSingle: async () => {
      mocks.calls.push({ fn: 'maybeSingle', args: [] });
      return mocks.response;
    },
  });
  return q;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.calls = [];
  mocks.response = { data: null, error: null };
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(async () => ({
    from: (table: string) => {
      mocks.calls.push({ fn: 'from', args: [table] });
      return chain();
    },
  }));
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('getOcrJobStatusAction — trzy wyniki (E16)', () => {
  it('zadanie jest → success z wierszem, zapytanie klientem sesji po id', async () => {
    const job = {
      id: JOB_ID,
      status: 'pending',
      error_message: null,
      expense_id: null,
      extracted_data: null,
    };
    mocks.response = { data: job, error: null };

    const out = await getOcrJobStatusAction(JOB_ID);

    expect(out).toEqual({ success: true, job });
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.calls).toEqual([
      { fn: 'from', args: ['ocr_jobs'] },
      { fn: 'select', args: ['id, status, error_message, expense_id, extracted_data'] },
      { fn: 'eq', args: ['id', JOB_ID] },
      { fn: 'maybeSingle', args: [] },
    ]);
  });

  it('brak wiersza (albo RLS go nie pokazuje) → retryable: false, „Job nie istnieje”', async () => {
    mocks.response = { data: null, error: null };

    const out = await getOcrJobStatusAction(JOB_ID);

    expect(out).toEqual({ success: false, retryable: false, error: 'Job nie istnieje' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('błąd odczytu → retryable: true, bez treści błędu bazy (w odpowiedzi i w logu)', async () => {
    mocks.response = { data: null, error: { code: '08006', message: DB_MESSAGE } };

    const out = await getOcrJobStatusAction(JOB_ID);

    expect(out).toEqual({
      success: false,
      retryable: true,
      error: 'Nie mogę teraz sprawdzić stanu odczytu',
    });
    expect(JSON.stringify(out)).not.toContain('10.0.0.5');
    expect(JSON.stringify(out)).not.toContain('08006');

    // Log serwera: sam kod błędu, bez komunikatu (adresy, dane najemcy).
    expect(consoleError).toHaveBeenCalledOnce();
    const logged = JSON.stringify(consoleError.mock.calls[0]);
    expect(logged).toContain('08006');
    expect(logged).not.toContain('10.0.0.5');
    expect(logged).not.toContain('1234567890');
  });

  it('szczegóły i podpowiedź PostgREST-a też nie wychodzą — ani do klienta, ani do logu', async () => {
    mocks.response = {
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for table ocr_jobs',
        details: 'Key (tenant_id)=(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa) is not present',
        hint: 'Wiersz należy do Jan Kowalski, NIP 1234567890',
      },
    };

    const out = await getOcrJobStatusAction(JOB_ID);

    expect(out).toMatchObject({ success: false, retryable: true });
    const sent = JSON.stringify(out);
    const logged = JSON.stringify(consoleError.mock.calls);
    for (const secret of ['aaaaaaaa-aaaa', 'Kowalski', '1234567890', 'permission denied']) {
      expect(sent).not.toContain(secret);
      expect(logged).not.toContain(secret);
    }
    expect(logged).toContain('42501');
  });

  it('błąd ma pierwszeństwo przed danymi — nie zgadujemy stanu z połowicznej odpowiedzi', async () => {
    mocks.response = {
      data: { id: JOB_ID, status: 'completed', expense_id: 'exp-1' },
      error: { code: 'PGRST301', message: DB_MESSAGE },
    };

    const out = await getOcrJobStatusAction(JOB_ID);

    expect(out).toMatchObject({ success: false, retryable: true });
  });

  it.each([
    ['pusty napis', ''],
    ['nie-UUID', 'job-1'],
    ['UUID z doklejonym filtrem', `${JOB_ID},id.neq.0`],
    ['UUID bez myślników', JOB_ID.replaceAll('-', '')],
  ])('%s → retryable: false bez zapytania do bazy', async (_opis, id) => {
    const out = await getOcrJobStatusAction(id);

    expect(out).toEqual({ success: false, retryable: false, error: 'Job nie istnieje' });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.calls).toEqual([]);
  });

  it('argument spoza typu (wywołanie akcji z przeglądarki) → retryable: false bez zapytania', async () => {
    const out = await getOcrJobStatusAction({ id: JOB_ID } as unknown as string);

    expect(out).toEqual({ success: false, retryable: false, error: 'Job nie istnieje' });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
