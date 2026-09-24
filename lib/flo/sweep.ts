/**
 * Wspólny szkielet przebiegu reguły po kontach (plan FLO 2, K1.3).
 *
 * PO CO TO JEST. Każda reguła pulsu miała własną pętlę po kontach, własny
 * licznik i własny blok `catch` z Sentry — pięć kopii tych samych
 * dwudziestu linii. Kopia to nie tylko brzydota: izolacja awarii jednego
 * konta jest wymaganiem bezpieczeństwa, a wymaganie skopiowane pięć razy
 * jest spełnione dokładnie do momentu, w którym ktoś napisze szóstą regułę
 * i zapomni o `try`. Wtedy jedno konto z uszkodzonymi danymi zabiera karty
 * wszystkim pozostałym, i nikt tego nie zauważy do pierwszej awarii.
 *
 * JEDNO SŁOWNICTWO DLA WSZYSTKICH REGUŁ. Wcześniej audyt liczył `created`,
 * O-01 `guided` i `finished`, reszta `asked` i `closed` — trzy słowniki na
 * to samo. Teraz każda reguła mówi tak samo:
 *
 * - `asked`  — ile NOWYCH kart postawiła,
 * - `closed` — ile zamknęła, bo sprawa przestała być aktualna,
 * - `failed` — na ilu kontach padła (puls i tak poszedł dalej).
 *
 * Reguła, która niczego nie zamyka (P-03), zgłasza po prostu zero. To jest
 * informacja, a nie brak: „ta reguła nigdy nie sprząta po sobie sama".
 */

import * as Sentry from '@sentry/nextjs';

import type { JobLogger } from '@/lib/jobs/logger';
import type { FloProposalKind } from '@/types/flo';

/** Wynik przebiegu jednej reguły po WSZYSTKICH kontach. */
export interface FloSweepResult {
  /** Nowe karty postawione w tym przebiegu. */
  asked: number;
  /** Karty zamknięte, bo sprawa przestała być aktualna. */
  closed: number;
  /** Konta, na których reguła padła. Puls poszedł dalej. */
  failed: number;
}

/** Co reguła zrobiła na JEDNYM koncie. Brak pola znaczy zero. */
export interface FloTenantRun {
  /** 1, gdy powstała nowa karta. */
  asked?: number;
  /** Ile kart zamknięto, bo sprawa się rozwiązała. */
  closed?: number;
}

/** Przebieg, w którym nic się nie wydarzyło — reguła nawet nie startowała. */
export function emptySweep(): FloSweepResult {
  return { asked: 0, closed: 0, failed: 0 };
}

/**
 * Przejście po kontach z izolacją awarii — jedyne takie miejsce w pulsie.
 *
 * Konto, na którym reguła rzuci wyjątkiem, liczy się do `failed` i pętla
 * idzie dalej. Do Sentry i do logów workera trafia identyfikator konta
 * i rodzaju — bez treści faktur, bo to nie jest miejsce na dane klientów.
 */
export async function runSweep(
  kind: FloProposalKind,
  tenantIds: readonly string[],
  perTenant: (tenantId: string) => Promise<FloTenantRun>,
  logger?: Pick<JobLogger, 'error'>,
): Promise<FloSweepResult> {
  const result = emptySweep();

  for (const tenantId of tenantIds) {
    try {
      const run = await perTenant(tenantId);
      result.asked += run.asked ?? 0;
      result.closed += run.closed ?? 0;
    } catch (e) {
      result.failed++;
      Sentry.captureException(e, {
        tags: { job: 'flo-tick', kind, tenant_id: tenantId },
      });
      const message = e instanceof Error ? e.message : 'nieznany błąd';
      (logger ?? console).error(
        `[flo.tick] ${kind} padło na koncie ${tenantId}: ${message}`,
      );
    }
  }

  return result;
}
