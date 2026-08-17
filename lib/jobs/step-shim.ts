/**
 * Shim `step` dla portowanych jobów — zachowuje STRUKTURĘ kodu z Inngest
 * (step.run / step.sleep / step.sendEvent), żeby ciała jobów przenosiły się
 * niemal bez diffa i audytowana logika została nietknięta.
 *
 * RÓŻNICA vs Inngest: brak memoizacji stepów przy retry. Bezpieczne, bo
 * retry wykonuje CAŁY handler, a idempotencję gwarantują istniejące warstwy
 * domenowe (guard ksef_status, R2 IfNoneMatch, unikalność P_2 w MF,
 * billing_notifications, upserty) — potwierdzone audytem 18 lip 2026.
 */

import { parseDurationMs } from './duration';
import { sendJobEvents, type JobEvent, type SendJobOptions } from './enqueue';

export type { JobEvent, SendJobOptions };
import type { JobLogger } from './logger';

/**
 * Twardy limit snu W PROCESIE. Dłuższe czekanie (sekwencja e-mail: dni!)
 * MUSI iść przez `sendEvent(..., {startAfterMs})` — proces workera nie może
 * wisieć dniami (restart = utrata snu, brak durability).
 */
const MAX_INPROCESS_SLEEP_MS = 120_000;

export interface JobStep {
  run<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
  sleep(name: string, duration: string | number): Promise<void>;
  sendEvent(
    name: string,
    events: JobEvent | JobEvent[],
    options?: SendJobOptions,
  ): Promise<void>;
  /**
   * „Wyślij event ZA X czasu" — jedyny poprawny sposób na odstępy liczone
   * w godzinach/dniach (sekwencja e-maili onboardingowych).
   *
   * Każdy backend realizuje to swoim durable mechanizmem:
   *   - pg-boss: job z `startAfter` (czeka w tabeli, przeżywa restart workera),
   *   - Inngest: `step.sleep` + `step.sendEvent` (durable sleep silnika).
   * Dzięki temu ta sama linia kodu zachowuje się identycznie na obu.
   */
  scheduleAfter(
    name: string,
    delay: string | number,
    events: JobEvent | JobEvent[],
  ): Promise<void>;
}

export function createJobStep(log: JobLogger): JobStep {
  return {
    async run<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
      try {
        const result = await fn();
        log.debug(`step ok: ${name}`);
        return result;
      } catch (err) {
        log.error(`step FAIL: ${name}`, err);
        throw err;
      }
    },

    async sleep(name: string, duration: string | number): Promise<void> {
      const ms = parseDurationMs(duration);
      if (ms > MAX_INPROCESS_SLEEP_MS) {
        throw new Error(
          `step.sleep('${name}', ${JSON.stringify(duration)}) przekracza limit ` +
            `${MAX_INPROCESS_SLEEP_MS / 1000}s snu w procesie — użyj ` +
            `sendEvent z {startAfterMs} (wzorzec sekwencji e-mail, plan Etapu 7).`,
        );
      }
      log.debug(`step sleep: ${name} (${ms}ms)`);
      await new Promise((resolve) => setTimeout(resolve, ms));
    },

    async sendEvent(
      name: string,
      events: JobEvent | JobEvent[],
      options?: SendJobOptions,
    ): Promise<void> {
      const list = Array.isArray(events) ? events : [events];
      await sendJobEvents(list, options);
      log.debug(`step sendEvent: ${name} (${list.length})`);
    },

    async scheduleAfter(
      name: string,
      delay: string | number,
      events: JobEvent | JobEvent[],
    ): Promise<void> {
      const ms = parseDurationMs(delay);
      const list = Array.isArray(events) ? events : [events];
      await sendJobEvents(list, { startAfterMs: ms });
      log.debug(`step scheduleAfter: ${name} (+${ms}ms, ${list.length})`);
    },
  };
}
