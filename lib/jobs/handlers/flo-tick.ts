/**
 * Rejestracja pulsu agenta FLO w workerze pg-boss (krok 13 planu).
 *
 * Osobny plik zamiast dopisania do paczek A-D: paczki odwzorowują podział
 * z okresu przejściowego na Inngest i mają swoje parytety retry. Agent jest
 * nowy i pg-bossowy od początku, więc ma własne miejsce — bez udawania,
 * że kiedyś był gdzie indziej.
 *
 * Bez retry: puls jest idempotentny i chodzi codziennie. Nieudany przebieg
 * lepiej powtórzyć jutro niż trzy razy pod rząd tej samej nocy — propozycje
 * i tak powstaną, a podwójne alerty do operatora tylko zaszumią obraz.
 */

import { runFloTick } from '@/lib/flo/tick';

import { registerJob, type JobContext } from '../registry';

registerJob<Record<string, never>>({
  queue: 'cron.flo-tick',
  maxRetries: 0,
  handler: (_data, ctx: JobContext) => runFloTick(ctx),
});
