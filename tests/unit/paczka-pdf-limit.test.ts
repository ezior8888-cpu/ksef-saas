import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({ pdf: vi.fn(), tenant: 'ten-pdf-1' }));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/supabase/auth-context', () => ({
  resolveApiUserAndActiveOrg: async () => ({ ok: true, userId: 'u-1', tenantId: s.tenant, role: 'owner' }),
}));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: s.pdf }));
vi.mock('@/lib/exports/zip-packager', () => ({ packageZip: async () => Buffer.from('zip') }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q, eq: () => q, gte: () => q, lte: () => q,
      limit: async () => ({ data: [{ id: 'inv-1', internal_number: 'FV/1' }], error: null }),
    });
    return { from: () => q };
  },
}));

import { GET } from '@/app/api/invoices/batch-pdf/route';

/**
 * AUD-119: paczka do 100 PDF generowana w procesie aplikacji, bez limitu
 * żądań — kilka równoległych paczek wyczerpywało pamięć app-1, którą dzieli
 * z workerem. Teraz: limit paczek na firmę i limit paczek generowanych naraz.
 */

const req = () => new Request('https://app.example.test/api/invoices/batch-pdf?from=2026-09-01&to=2026-09-30');

beforeEach(() => {
  s.pdf.mockReset().mockResolvedValue({ success: true, pdf: Buffer.from('%PDF'), filename: 'FV-1.pdf' });
});

describe('paczka PDF — limity', () => {
  it('czwarta paczka firmy w 10 minut — 429', async () => {
    s.tenant = 'ten-pdf-limit';
    for (let i = 0; i < 3; i++) expect((await GET(req())).status).toBe(200);

    const res = await GET(req());

    expect(res.status).toBe(429);
  });

  it('za dużo paczek naraz w procesie — 429 zamiast kolejnej w pamięci', async () => {
    const releases: Array<() => void> = [];
    s.pdf.mockImplementation(() => new Promise((ok) => { releases.push(() => ok({ success: true, pdf: Buffer.from('%PDF'), filename: 'a.pdf' })); }));

    s.tenant = 'ten-a';
    const first = GET(req());
    s.tenant = 'ten-b';
    const second = GET(req());
    s.tenant = 'ten-c';
    const third = await GET(req());

    expect(third.status).toBe(429);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.forEach((r) => r());
    await Promise.allSettled([first, second]);
  });
});
