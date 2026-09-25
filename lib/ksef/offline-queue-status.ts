/**
 * Statusy kolejki Offline24 — jedno miejsce dla wszystkich, którzy o nie pytają.
 *
 * PO CO TO JEST. Do 25.09.2026 cztery miejsca pytały kolejkę o status
 * `'pending'`: karta awarii KSeF dla klienta, licznik i najbliższy termin
 * w panelu admina oraz alarm „kolejka Offline24 rośnie" dla operatorów.
 * Tego statusu w enumie `offline_queue_status_enum` NIE MA (`'pending'`
 * należy do UPO). Postgres odrzucał zapytanie, każde z tych miejsc połykało
 * błąd i pokazywało „zero". Przy awarii KSeF faktury gromadziły się w kolejce
 * w ciszy: klient bez karty, panel z zerem, alarm milczący — aż do
 * przekroczenia terminu ustawowego.
 *
 * TypeScript tego nie złapał, bo `createAdminClient()` z
 * `lib/supabase/server.ts` jest nieotypowany. Ta stała jest otypowana wprost
 * enumem z bazy, więc literówka tutaj nie przejdzie kompilacji — a test
 * `ksef-offline-queue-status.test.ts` sprawdza każde zapytanie o tę kolejkę
 * z enumem z migracji.
 */

import type { Database } from '@/types/database';

export type OfflineQueueStatus =
  Database['public']['Enums']['offline_queue_status_enum'];

/**
 * Wpisy, które jeszcze NIE dotarły do KSeF: czekające na wysyłkę i w trakcie
 * wysyłki. `sending` wchodzi celowo — wpis, który utknął w wysyłce (padnięty
 * worker), to dokładnie ten przypadek, który operator ma zobaczyć, a klient
 * ma dalej termin ustawowy na karku.
 */
export const OFFLINE_QUEUE_OPEN_STATUSES: readonly OfflineQueueStatus[] = [
  'queued',
  'sending',
];
