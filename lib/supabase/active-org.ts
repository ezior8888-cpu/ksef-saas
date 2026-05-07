/**
 * Centralna nazwa cookie i nagłówka dla aktywnej organizacji multi-org.
 *
 * Cookie ustawia `setActiveOrganizationAction` po zalogowaniu / wyborze
 * w org switcherze. Każdy server-side klient Supabase (server.ts, proxy.ts)
 * dokleja wartość jako nagłówek `x-active-org`, który PostgREST udostępnia
 * funkcji `public.get_current_tenant_id()` przez `request.headers`.
 *
 * Funkcja w bazie (00037) waliduje, że zalogowany user jest aktywnym
 * członkiem przekazanej org — przekazanie obcego id przez klienta nic nie
 * daje, bo helper zwróci NULL i wszystkie polityki RLS odmówią dostępu.
 */
import { cookies } from 'next/headers';

export const ACTIVE_ORG_COOKIE = 'ksef.active_org';
export const ACTIVE_ORG_HEADER = 'x-active-org';

/**
 * Odczyt aktywnej organizacji z cookies, z walidacją UUID.
 * Używaj w Server Components, w których nie chcesz pełnego
 * `requireUserAndActiveOrg()` (np. layout, który nie modyfikuje danych).
 */
export async function getActiveOrgIdFromCookies(): Promise<string | null> {
  const store = await cookies();
  const v = store.get(ACTIVE_ORG_COOKIE)?.value;
  return isUuid(v) ? v : null;
}

/**
 * Walidacja UUID v4-ish — 36 znaków + prawidłowe pozycje myślników.
 * Nie chcemy doklejać śmieci jako nagłówka HTTP.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
