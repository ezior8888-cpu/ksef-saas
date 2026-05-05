/**
 * Centralny helper autoryzacji dla Server Actions.
 *
 * Zamiast powtarzać w każdej akcji 25 linii boilerplatu (`auth.getUser()`
 * → odrzucić jeśli null → SELECT users → odrzucić jeśli brak tenanta →
 * sprawdzić rolę), używamy `requireUserAndTenant()` / `requireOwner()`
 * jednocześnie:
 *   - centralizujemy reguły (jedno miejsce do zmiany w razie nowej roli),
 *   - eliminujemy bug-prone copy-paste (zapomniane `if (role !== 'owner')`),
 *   - zachowujemy klauzulę `.eq('tenant_id', ctx.tenantId)` jako defense-in-depth
 *     w każdym SELECT/UPDATE po ID — RLS jest pierwszą, ale nie jedyną linią obrony.
 *
 * Konwencja błędów: rzucamy `ActionAuthError`, akcja w `try/catch`
 * mapuje na `{ success: false, error: e.message }` dla zgodności
 * z istniejącym kontraktem zwrotnym.
 */

import { createClient } from './server';

export class ActionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionAuthError';
  }
}

export type UserRole = 'owner' | 'staff' | string;

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string | null };
  tenantId: string;
  role: UserRole;
}

/**
 * Wymaga zalogowanego usera z przypisanym tenantem.
 * Rzuca `ActionAuthError` w przypadku braku sesji lub tenanta.
 */
export async function requireUserAndTenant(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ActionAuthError('Niezalogowany');

  const { data: row } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (!row?.tenant_id) {
    throw new ActionAuthError('Brak tenanta');
  }

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    tenantId: row.tenant_id,
    role: (row.role ?? 'staff') as UserRole,
  };
}

/**
 * Wymaga zalogowanego owner-a tenanta. Niewłaściciel dostanie
 * `ActionAuthError('Tylko właściciel')`.
 */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireUserAndTenant();
  if (ctx.role !== 'owner') {
    throw new ActionAuthError('Tylko właściciel');
  }
  return ctx;
}

/**
 * Bezpieczny wrapper na akcje serwerowe — łapie `ActionAuthError`
 * i mapuje na typowy `{ success: false, error }`.
 *
 * Akcja może rzucić `ActionAuthError` przez `requireUserAndTenant`/`requireOwner`,
 * a kontrakt zwrotny pozostaje stabilny dla UI.
 */
export async function withActionAuth<T>(
  fn: () => Promise<{ success: true } & T>,
): Promise<({ success: true } & T) | { success: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionAuthError) {
      return { success: false, error: e.message };
    }
    throw e;
  }
}
