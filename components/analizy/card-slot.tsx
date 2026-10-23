import { Fragment, Suspense, type ReactNode } from 'react';

import { PulpitCardError } from '@/components/dashboard/pulpit/card-states';
import { PULPIT_GENERIC_ERROR, pulpitErrorMessage } from '@/components/dashboard/pulpit/pulpit-grid';
import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { TrybDanych } from '@/lib/demo/tryb-danych';
import type { PageContext } from '@/lib/supabase/page-context';
import { cn } from '@/lib/utils';

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
  /** Tryb danych strony (`kontekstDanych`) — puste stany zależne od weryfikacji KSeF. */
  tryb: TrybDanych;
  /** `ksef_verified_at` firmy w bieżącym środowisku (podpis „KSeF od DD.MM”, Z9); `null` w przykładzie. */
  verifiedAt?: string | null;
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

/**
 * Kształt szkieletu = kształt karty Finory, którą zastępuje (poprawka Bartosza
 * 21.10.2026: Analizy 1:1 z Finory, „nie zmieniaj rozmiarów” — także w czasie
 * ładowania, żeby strona nie skakała, gdy karty dochodzą po kolei):
 * `stats` — Monthly Stats, `bar` — Spend Trend, `pie` — Category Breakdown,
 * `list` — listy z kółkiem ikony do 6 wierszy (ranking z „Pozostałe”, stałe
 * koszty / stali klienci), `feed` — ta sama lista z 5 wierszami (Recent
 * Expenses: `recentCosts` / `recentSales` mają w lib `limit = 5`, jak Finora;
 * 6 wierszy szkieletu dawało na telefonie skok o wiersz + odstęp), `rows` —
 * trzy wiersze `bg-muted` (Spending Streaks, Income vs Expense), `heatmap` —
 * Daily Spend.
 */
export type AnalizySkeletonVariant = 'stats' | 'bar' | 'pie' | 'list' | 'feed' | 'rows' | 'heatmap';

/** Liczba wierszy szkieletu listy = najwięcej pozycji, które pokaże karta. */
const LIST_SKELETON_ROWS = { list: 6, feed: 5 } as const;

/**
 * Linia szkieletu o wysokości linii tekstu, który zastąpi: `h-lh` (1lh)
 * w klasie tekstu z karty daje dokładnie tę wysokość wiersza, a pasek
 * szkieletu siedzi w nim pośrodku.
 */
function SkeletonLine({ textClassName, barClassName }: { textClassName?: string; barClassName: string }) {
  return (
    <div className={cn('flex h-lh items-center', textClassName)}>
      <Skeleton className={barClassName} />
    </div>
  );
}

/** Kafel Monthly Stats: kwadrat ikony, wartość `text-2xl`, etykieta `text-sm` (jak `stats-cards.tsx`). */
function StatTileSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
      <Skeleton className="size-10 shrink-0" />
      <div className="min-w-0">
        <SkeletonLine textClassName="text-2xl" barClassName="h-8 w-24" />
        <SkeletonLine textClassName="text-sm" barClassName="h-4 w-20" />
      </div>
    </div>
  );
}

/**
 * Szkielet karty `/analizy/*` w pudełkach prawdziwej karty Finory. Nie ruszamy
 * `PulpitCardSkeleton` (wspólny z Pulpitem) — tu wymiary są Finory.
 */
function AnalizyCardSkeleton({ variant, className }: { variant: AnalizySkeletonVariant; className?: string }) {
  if (variant === 'stats') {
    // Ta sama siatka co `components/dashboard/stats-cards.tsx`: dwie pary kafli
    // z separatorami, więc 1440 → 1 rząd, 1024 → 2×2, telefon → kolumna.
    return (
      <Card className={cn('shadow-none', className)} aria-busy="true">
        <CardContent>
          <div className="flex gap-5 max-xl:flex-col">
            {[0, 1].map((group) => (
              <Fragment key={group}>
                {group > 0 ? (
                  <>
                    <Separator className="xl:hidden" />
                    <Separator orientation="vertical" className="hidden xl:block" />
                  </>
                ) : null}
                <div className="flex flex-1 gap-5 max-sm:flex-col">
                  <StatTileSkeleton />
                  <Separator className="sm:hidden" />
                  <Separator orientation="vertical" className="hidden sm:block" />
                  <StatTileSkeleton />
                </div>
              </Fragment>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} aria-busy="true">
      {/* `CardTitle` / `CardDescription` dają wysokości linii tytułu i podpisu. */}
      <CardHeader>
        <CardTitle className="flex h-lh items-center">
          <Skeleton className="h-4 w-32" />
        </CardTitle>
        <CardDescription className="flex h-lh items-center">
          <Skeleton className="h-3 w-48" />
        </CardDescription>
      </CardHeader>
      {variant === 'bar' ? (
        <CardContent>
          <Skeleton className="aspect-video max-h-70 w-full" />
        </CardContent>
      ) : null}
      {variant === 'pie' ? (
        <CardContent>
          {/* Bez `w-full`: `max-h-70` przenosi się przez proporcję na szerokość (koło 249 px w SM). */}
          <Skeleton className="mx-auto aspect-square max-h-70 rounded-full" />
        </CardContent>
      ) : null}
      {variant === 'list' || variant === 'feed' ? (
        <CardContent className="space-y-4">
          {Array.from({ length: LIST_SKELETON_ROWS[variant] }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </CardContent>
      ) : null}
      {variant === 'rows' ? (
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-muted flex items-center gap-3 p-3">
              {/* Na tle `bg-muted` szkielet `bg-muted` byłby niewidoczny. */}
              <Skeleton className="bg-foreground/10 size-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <SkeletonLine textClassName="text-sm" barClassName="bg-foreground/10 h-4 w-28" />
                <SkeletonLine textClassName="text-sm" barClassName="bg-foreground/10 h-4 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      ) : null}
      {variant === 'heatmap' ? (
        <CardContent>
          {/* 7 pól `size-3.75` + 6 odstępów `gap-3.5` + `pb-1` przewijanego kontenera. */}
          <Skeleton className="h-48.25 w-full" />
        </CardContent>
      ) : null}
    </Card>
  );
}

export function AnalizySlot({
  title,
  className,
  variant,
  children,
}: {
  title: string;
  className?: string;
  variant: AnalizySkeletonVariant;
  children: ReactNode;
}) {
  return (
    <SectionErrorBoundary
      fallback={<PulpitCardError title={title} message="Nie udało się wyświetlić karty." className={className} />}
    >
      <Suspense fallback={<AnalizyCardSkeleton variant={variant} className={className} />}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}
