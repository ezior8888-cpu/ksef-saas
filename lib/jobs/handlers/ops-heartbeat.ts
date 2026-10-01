/**
 * Rejestracja heartbeatu workera (krok 3 planu automatyzacji, `lib/jobs/heartbeat.ts`).
 *
 * Osobny plik, bo — jak puls FLO — job jest pg-bossowy od początku i nie ma
 * odpowiednika w Inngest. Bez retry: kolejny tick przyjdzie za minutę, a
 * ponawianie starego pinga tylko zafałszowałoby obraz dla strażnika.
 */

import { runOpsHeartbeat } from '../heartbeat';
import { registerJob } from '../registry';

registerJob<Record<string, never>>({
  queue: 'cron.ops-heartbeat',
  maxRetries: 0,
  handler: () => runOpsHeartbeat(),
});
