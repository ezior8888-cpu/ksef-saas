import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Konta z GoTrue (`auth.admin.listUsers`) — WSZYSTKIE strony. Jedno
 * wywołanie oddaje najwyżej 1000 kont; do 02.10 trzy miejsca czytały tylko
 * pierwszą stronę i od kilkuset klientów część osób „nie istniała” (AUD-125).
 */

const PAGE_SIZE = 1000;
/** Bezpiecznik przed pętlą przy błędnej odpowiedzi — 200 000 kont. */
const MAX_PAGES = 200;

type AuthAdmin = Pick<SupabaseClient['auth']['admin'], 'listUsers' | 'getUserById'>;
type AdminClient = { auth: { admin: AuthAdmin } };

/**
 * Przegląda konta strona po stronie. `visit` zwraca `true`, gdy wystarczy.
 * Błąd strony rzuca: „nie wiem” to nie „nie ma takiego konta”.
 */
export async function scanAuthUsers(
  admin: AdminClient,
  visit: (user: User) => boolean | void,
): Promise<void> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error || !data) throw new Error('auth_users_page_unavailable');
    for (const user of data.users) {
      if (visit(user)) return;
    }
    if (data.users.length < PAGE_SIZE) return;
  }
  throw new Error('auth_users_scan_limit');
}

/**
 * E-maile wskazanych kont — po identyfikatorze, bez skanu całej bazy
 * (zespół firmy to kilka osób, kont mogą być tysiące).
 */
export async function emailsForUserIds(
  admin: AdminClient,
  userIds: Iterable<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user) out.set(id, data.user.email ?? '');
    }),
  );
  return out;
}
