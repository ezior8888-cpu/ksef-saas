/**
 * Adapter kontekstu Inngest → JobContext (okres przejściowy Etapu 7).
 *
 * Ciała jobów żyją jako eksportowane runnery `run*(ctx)` w dotychczasowych
 * plikach lib/inngest/jobs/* — JEDNO źródło prawdy logiki. Wrapper Inngest
 * woła runner przez ten adapter; worker pg-boss woła go z natywnym
 * JobContext (registry). Zgodność strukturalna step/logger jest celowa:
 * `run/sleep/sendEvent` i `info/warn/error/debug` mają identyczne sygnatury.
 * Cast przez unknown — typy nominalne Inngest różnią się od naszych.
 */

import type { JobContext } from './registry';
import type { JobLogger } from './logger';
import type { JobStep } from './step-shim';

export function toJobContext(args: {
  step: unknown;
  logger: unknown;
  attempt: number;
}): JobContext {
  return {
    step: args.step as JobStep,
    logger: args.logger as JobLogger,
    attempt: args.attempt,
  };
}
