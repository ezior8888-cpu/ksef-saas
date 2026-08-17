/**
 * Adapter kontekstu Inngest → JobContext (okres przejściowy Etapu 7).
 *
 * Ciała jobów żyją jako eksportowane runnery `run*(…, ctx)` w dotychczasowych
 * plikach lib/inngest/jobs/* — JEDNO źródło prawdy logiki. Wrapper Inngest
 * woła runner przez ten adapter; worker pg-boss woła go z natywnym
 * JobContext (registry).
 *
 * `run`/`sleep`/`sendEvent` mają w obu światach zgodne sygnatury, więc
 * delegujemy wprost. Wyjątkiem jest `scheduleAfter` (odstępy liczone
 * w dniach — sekwencja e-maili): pg-boss realizuje je przez `startAfter`,
 * a Inngest przez durable `sleep` + `sendEvent`. Tłumaczenie jest tutaj,
 * dzięki czemu runner ma jedną linię kodu dla obu backendów.
 */

import type { JobLogger } from './logger';
import type { JobContext } from './registry';
import type { JobEvent, JobStep } from './step-shim';

/** Minimalny kontrakt, jaki daje nam kontekst Inngest (strukturalnie). */
interface InngestStepLike {
  run: (name: string, fn: () => unknown) => Promise<unknown>;
  sleep: (name: string, duration: string | number) => Promise<unknown>;
  sendEvent: (name: string, events: unknown) => Promise<unknown>;
}

export function toJobContext(args: {
  step: unknown;
  logger: unknown;
  attempt: number;
}): JobContext {
  const inngestStep = args.step as InngestStepLike;

  const step: JobStep = {
    run: <T,>(name: string, fn: () => Promise<T> | T) =>
      inngestStep.run(name, fn) as Promise<T>,

    sleep: async (name, duration) => {
      await inngestStep.sleep(name, duration);
    },

    sendEvent: async (name, events) => {
      await inngestStep.sendEvent(name, events);
    },

    // Na Inngest: durable sleep silnika + wysyłka. Zachowuje dotychczasowe
    // zachowanie produkcji 1:1 (te joby dziś tak właśnie działają).
    scheduleAfter: async (
      name: string,
      delay: string | number,
      events: JobEvent | JobEvent[],
    ) => {
      await inngestStep.sleep(`${name}-wait`, delay);
      await inngestStep.sendEvent(name, events);
    },
  };

  return {
    step,
    logger: args.logger as JobLogger,
    attempt: args.attempt,
  };
}
