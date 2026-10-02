import { describe, expect, it, vi } from 'vitest';

import { emailsForUserIds, scanAuthUsers } from '@/lib/auth/auth-users';

/**
 * AUD-125: `auth.admin.listUsers` oddaje jedną stronę (domyślnie 50,
 * najwyżej 1000). Webhook poczty szukał adresu w pierwszych 200 kontach,
 * zespół firmy — w pierwszych 1000. Od kilkuset klientów część osób
 * „nie istniała”: bez e-maila w zespole, bez wypisu po odbiciu.
 */

function admin(total: number) {
  const users = Array.from({ length: total }, (_, i) => ({ id: `u-${i}`, email: `osoba${i}@example.test` }));
  const listUsers = vi.fn(async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number }) => ({
    data: { users: users.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }));
  const getUserById = vi.fn(async (id: string) => {
    const user = users.find((u) => u.id === id);
    return { data: { user: user ?? null }, error: user ? null : { message: 'not found' } };
  });
  return { client: { auth: { admin: { listUsers, getUserById } } }, listUsers, getUserById };
}

describe('wszystkie strony użytkowników', () => {
  it('skan dochodzi do ostatniej strony', async () => {
    const { client, listUsers } = admin(2500);
    const seen: string[] = [];

    await scanAuthUsers(client as never, (u) => { seen.push(u.id); });

    expect(seen).toHaveLength(2500);
    expect(listUsers).toHaveBeenCalledTimes(3);
  });

  it('skan kończy się po znalezieniu', async () => {
    const { client, listUsers } = admin(2500);
    let found: string | null = null;

    await scanAuthUsers(client as never, (u) => {
      if (u.email === 'osoba1500@example.test') { found = u.id; return true; }
      return false;
    });

    expect(found).toBe('u-1500');
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it('błąd strony przerywa skan — „nie wiem” to nie „nie ma”', async () => {
    const { client, listUsers } = admin(10);
    listUsers.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } } as never);

    await expect(scanAuthUsers(client as never, () => false)).rejects.toThrow();
  });

  it('e-maile członków zespołu po identyfikatorach — niezależnie od liczby kont', async () => {
    const { client, listUsers } = admin(5000);

    const emails = await emailsForUserIds(client as never, ['u-10', 'u-4999']);

    expect(emails).toEqual(new Map([['u-10', 'osoba10@example.test'], ['u-4999', 'osoba4999@example.test']]));
    expect(listUsers).not.toHaveBeenCalled();
  });
});
