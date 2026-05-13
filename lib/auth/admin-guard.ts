/**
 * Admin authorization guard (Faza 24).
 *
 * Decyzja: zamiast roli w bazie (jak `memberships.role='admin'`) używamy
 * env-var-based allowlist. Dlaczego:
 *   1. Admin = operator SaaS (Ty + kolega), nie rola w organizacji klienta.
 *      Rola w `memberships` ma inny scope (admin org klienta vs admin platformy).
 *   2. Env var allowlist nie wymaga DB roundtripa — middleware/SSR check
 *      odpada w ms.
 *   3. Lista jest mała (1-3 osoby przez najbliższe lata), nie ma sensu
 *      tabela CRUD.
 *
 * Zmiana listy = re-deploy Vercel (zmiana env var). Bezpieczne: gdy ktoś
 * przejmie konto programisty i doda się do listy, audit log zwróci `git
 * blame` na zmianę env vars w deployu.
 *
 * Format env var (`ADMIN_EMAILS`):
 *   'bartek@example.com,kolega@example.com'  (comma-separated, trim+lowercase)
 *
 * Brak env var = brak adminów = `/admin/*` całkowicie zablokowane (safer
 * default niż "puste = wszyscy adminami").
 */

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/** Comma-separated lista, znormalizowana (trim, lowercase, unikalne). */
function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes('@')),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.trim().toLowerCase());
}

export interface AdminContext {
  userId: string;
  email: string;
}

/**
 * Server-side guard dla `/admin/*` stron. Rzuca `redirect()` (NEXT_REDIRECT)
 * gdy user nie jest adminem — niezalogowany leci na `/login`, zalogowany ale
 * nie-admin na `/dashboard`.
 *
 * Zwraca `AdminContext` po pomyślnej autoryzacji — możesz tego użyć jako
 * `author_user_id` przy zapisach audytu.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?error=admin_required');
  }

  const email = user.email;
  if (!email || !isAdminEmail(email)) {
    // Nie zdradzamy że `/admin/*` istnieje — non-admin idzie do dashboardu.
    redirect('/dashboard');
  }

  return { userId: user.id, email };
}

/**
 * Non-throwing wariant — do użycia w komponentach które chcą tylko
 * sprawdzić "czy mam pokazać link 'Admin' w navbar" bez forsowania redirectu.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !isAdminEmail(user.email)) {
    return null;
  }
  return { userId: user.id, email: user.email };
}
