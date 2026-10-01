/**
 * Heartbeat workera dla zewnętrznego strażnika (Uptime Kuma push albo
 * Healthchecks.io).
 *
 * Dlaczego z wnętrza crona, a nie z endpointu `/health` workera: statyczne
 * „200” potwierdza tylko, że proces żyje. Ping wysłany z joba potwierdza
 * naraz trzy rzeczy — harmonogram pg-boss tworzy zadania, pętla workera je
 * odbiera, a baza odpowiada przez tę samą drogę (PostgREST), której używają
 * joby. Strażnik alarmuje, gdy ping NIE przyjdzie, więc awaria workera,
 * harmonogramu albo bazy nie musi umieć sama się zgłosić.
 *
 * Konfiguracja: `OPS_HEARTBEAT_URL` — pełny adres pinga (zawiera sekretny
 * token, więc nigdy go nie logujemy). Bez zmiennej heartbeat jest wyłączony.
 */

import { createAdminClient } from '@/lib/supabase/admin';

const TIMEOUT_MS = 5000;

export type HeartbeatResult =
  | { sent: true }
  | { sent: false; reason: 'not-configured' | 'invalid-url' | 'db-unavailable' | 'ping-failed' };

function getHeartbeatUrl(): string | null | 'invalid' {
  const raw = process.env.OPS_HEARTBEAT_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // http dopuszczamy dla Uptime Kuma w sieci prywatnej Hetznera.
    return url.protocol === 'https:' || url.protocol === 'http:' ? raw : 'invalid';
  } catch {
    return 'invalid';
  }
}

export async function runOpsHeartbeat(): Promise<HeartbeatResult> {
  const url = getHeartbeatUrl();
  if (url === null) return { sent: false, reason: 'not-configured' };
  if (url === 'invalid') return { sent: false, reason: 'invalid-url' };

  // Niedziałająca baza = brak pinga = alarm u strażnika. Celowo nie wysyłamy
  // „down”, bo różne usługi rozumieją go inaczej; brak sygnału rozumieją wszystkie.
  const { error } = await createAdminClient()
    .from('tenants')
    .select('id', { head: true, count: 'exact' })
    .limit(1);
  if (error) return { sent: false, reason: 'db-unavailable' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    await response.body?.cancel().catch(() => undefined);
    return response.ok ? { sent: true } : { sent: false, reason: 'ping-failed' };
  } catch {
    return { sent: false, reason: 'ping-failed' };
  } finally {
    clearTimeout(timeout);
  }
}
