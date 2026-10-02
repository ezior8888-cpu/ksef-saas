import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-104: nowa rozmowa wsparcia brała `tenant_id` prosto z cookie aktywnej
 * firmy — cookie ustawia klient, więc rozmowa mogła trafić do cudzej firmy.
 * Teraz firma z cookie tylko wtedy, gdy użytkownik jest jej aktywnym członkiem.
 */

const mocks = vi.hoisted(() => ({ createConversation: vi.fn(), member: false }));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/alerts/slack', () => ({ sendSlackAlert: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/support/knowledge-base', () => ({ filterValidCitations: () => [] }));
vi.mock('@/lib/support/chat', () => ({
  parseMeta: () => ({ citations: [], escalate: false }),
  streamSupportReply: async function* () { yield 'ok'; },
}));
vi.mock('@/lib/support/conversations', () => ({
  appendMessage: vi.fn(),
  createConversation: mocks.createConversation,
  getMessages: vi.fn(async () => []),
  getOwnedConversation: vi.fn(),
  updateConversation: vi.fn(),
}));
vi.mock('@/lib/supabase/active-org', () => ({ getActiveOrgIdFromCookies: async () => '22222222-2222-4222-8222-222222222222' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } } }) },
    from: () => {
      const q = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: mocks.member ? { organization_id: '22222222-2222-4222-8222-222222222222' } : null, error: null }),
      };
      return q;
    },
  }),
}));

import { POST } from '@/app/api/support/chat/route';

function req() {
  return new Request('https://app.example.test/api/support/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Jak wystawić korektę?' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createConversation.mockResolvedValue('conv-1');
});

describe('rozmowa wsparcia a firma z cookie', () => {
  it('bez członkostwa w firmie z cookie — rozmowa bez firmy', async () => {
    mocks.member = false;
    const res = await POST(req());
    await res.text();
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }));
  });

  it('aktywny członek — rozmowa przypięta do firmy', async () => {
    mocks.member = true;
    const res = await POST(req());
    await res.text();
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '22222222-2222-4222-8222-222222222222' }));
  });
});
