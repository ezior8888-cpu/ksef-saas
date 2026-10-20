import { Suspense, type ReactNode } from 'react';

import { PulpitCardError, PulpitCardSkeleton } from '@/components/dashboard/pulpit/card-states';
import { PULPIT_GENERIC_ERROR, pulpitErrorMessage } from '@/components/dashboard/pulpit/pulpit-grid';
import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import type { PageContext } from '@/lib/supabase/page-context';

/**
 * Oprawa kart `/analizy/*` (plan Finora §2.4 pkt 15, wzór: siatka Pulpitu).
 * Każda karta to osobny asynchroniczny Server Component w `<Suspense>`
 * i `SectionErrorBoundary`: strażnik, który rzuci (faktura w EUR, przyjęta
 * faktura bez środowiska, niepełna strona), zabiera JEDNĄ kartę z treścią
 * wyjątku (`pulpitErrorMessage` — bez angielskiego ogona PostgREST-a),
 * a reszta strony działa. Strona nie woła na swoim poziomie żadnej funkcji
 * z §2.4.
 */

export interface AnalizyCardProps {
  supabase: PageContext['supabase'];
  tenantId: string;
  /** Chwila żądania jako ISO — jeden „teraz” dla wszystkich kart. */
  nowIso: string;
  /** Wybrany miesiąc RRRR-MM (już sprawdzony przez `resolveAnalyticsMonth`). */
  month: string;
}

/** Dane karty albo karta błędu z treścią wyjątku dla klienta. */
export async function loadAnalizyCard(
  title: string,
  className: string | undefined,
  render: () => Promise<ReactNode>,
): Promise<ReactNode> {
  try {
    return await render();
  } catch (error) {
    const message = pulpitErrorMessage(error);
    if (message === PULPIT_GENERIC_ERROR) console.error(`[analizy] karta „${title}”:`, error);
    return <PulpitCardError title={title} message={message} className={className} />;
  }
}

export function AnalizySlot({
  title,
  className,
  variant,
  children,
}: {
  title: string;
  className?: string;
  variant: 'tile' | 'chart' | 'list';
  children: ReactNode;
}) {
  return (
    <SectionErrorBoundary
      fallback={<PulpitCardError title={title} message="Nie udało się wyświetlić karty." className={className} />}
    >
      <Suspense fallback={<PulpitCardSkeleton variant={variant} className={className} />}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}
