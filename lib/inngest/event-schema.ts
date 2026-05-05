/**
 * Wrapper na `inngest.eventType` z runtime-walidacją Zod.
 *
 * Inngest v4 wypycha kontrakty eventów przez `staticSchema<T>()` —
 * jest to czyste typowanie kompilacyjne, bez sprawdzenia kształtu w runtime.
 * W praktyce: zły payload (literówka pola, źle zserializowany Buffer, replay
 * starego eventu po refaktorze schematu) leci do handlera i wybucha
 * dopiero w środku transakcji KSeF — czasem po częściowym uploadzie XML.
 *
 * `zodEvent` zachowuje 100% API `eventType` (statyczne typy, `.create()`,
 * trigger w `createFunction`) i dorzuca `.parse(data)` / `.safeParse(data)`,
 * które handler woła na samym wejściu jako bramkę:
 *
 *   async ({ event }) => {
 *     const data = invoiceSubmitRequested.parse(event.data);
 *     // ...od tej pory typ jest pewny + zwalidowany w runtime
 *   }
 *
 * Zła paczka kończy się natychmiast jako `ZodError` — `submitInvoiceJob`
 * łapie to w try/catch i robi NonRetriableError, dzięki czemu Inngest nie
 * traci 4 prób na bezsensowne retry.
 */

import { eventType, staticSchema } from 'inngest';
import { z } from 'zod';

/**
 * `staticSchema<T>()` z Inngestu wymaga `T extends Record<string, unknown>`,
 * a `z.infer<S>` dla `z.object({...})` produkuje typ strukturalny bez
 * deklarowanej sygnatury indexu — TS nie podstawi go automatycznie pod
 * `Record<string, unknown>`. Intersection w fazie typów dokleja sygnaturę
 * (runtime: bez efektu — staticSchema to passthrough), więc Inngest dostaje
 * akceptowalny TS bound, a użytkownik nadal widzi konkretny kształt
 * `z.infer<S>` przy odczycie `event.data` po `parse()`.
 */
export function zodEvent<S extends z.ZodTypeAny>(name: string, schema: S) {
  type Data = z.infer<S>;

  const ev = eventType(name, {
    schema: staticSchema<Data & Record<string, unknown>>(),
  });

  return Object.assign(ev, {
    /**
     * Twardy parse — rzuca `ZodError` jeśli payload nie pasuje.
     * Używaj na wejściu handlera, gdy chcesz natychmiastowy fail-fast.
     */
    parse(data: unknown): Data {
      return schema.parse(data);
    },
    /**
     * Bezpieczny parse — zwraca union `{ success: true, data } | { success: false, error }`.
     * Używaj, gdy chcesz świadomie obsłużyć błąd (np. inny status w DB).
     */
    safeParse(data: unknown) {
      return schema.safeParse(data);
    },
  });
}
