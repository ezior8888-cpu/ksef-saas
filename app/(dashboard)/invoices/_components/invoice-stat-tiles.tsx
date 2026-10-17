import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { RiMoneyDollarCircleLine, RiPagesLine, RiUserLine, RiWalletLine } from '@remixicon/react';

import StatsCards from '@/components/dashboard/stats-cards';
import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getReceivables, RECEIVABLES_NOTE } from '@/lib/dashboard/receivables';
import { formatPlInt, formatPlMoney } from '@/lib/format/pl';
import { plural } from '@/lib/i18n/plural';
import { countContractors, countInvoicesThisMonth, PAID_EMPTY_STATE, PAID_NOTE, paidThisMonth } from '@/lib/invoices/list-stats';
import type { PageContext } from '@/lib/supabase/page-context';

/**
 * Kafle listy faktur (Finora: `stats-cards`). KAŻDY to osobny asynchroniczny
 * Server Component w <Suspense> + `SectionErrorBoundary` (§2.4 pkt 15):
 * wyjątek strażnika (waluta, środowisko) zabiera jedną kartę, nie tabelę.
 *
 * Komunikat błędu bierzemy z samego wyjątku w tile'u (try/catch), bo granica
 * błędu nie przekazuje tekstu, a Next.js w produkcji ukrywa treść wyjątków
 * serwerowych. Granica zostaje siatką bezpieczeństwa na błąd renderu.
 */

export interface TileProps {
  supabase: PageContext['supabase'];
  tenantId: string;
  now?: Date;
}

const money = (n: number) => `${formatPlMoney(n)} zł`;

/** Karta błędu jednego kafla: tekst wyjątku + wyjście do przepływów. */
export function TileError({ label, message }: { label: string; message: string }) {
  return (
    <Card className="shadow-none" role="status">
      <CardContent className="space-y-1">
        <p className="text-foreground text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{message}</p>
        <Link href="/przeplywy" className="text-primary text-xs underline-offset-4 hover:underline">
          Sprawdź w Przepływach
        </Link>
      </CardContent>
    </Card>
  );
}

function TileSkeleton() {
  return (
    <Card className="shadow-none" aria-busy="true">
      <CardContent className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="size-10" />
      </CardContent>
    </Card>
  );
}

async function loadTile(
  label: string,
  load: () => Promise<{ value: string; note?: ReactNode; icon: typeof RiUserLine }>,
): Promise<ReactNode> {
  try {
    const { value, note, icon } = await load();
    return <StatsCards stats={[{ label, value, note, icon }]} iconPosition="right" />;
  } catch (error) {
    return <TileError label={label} message={error instanceof Error ? error.message : 'Nie udało się wczytać kafla.'} />;
  }
}

export async function ContractorsTile({ supabase, tenantId }: TileProps) {
  return loadTile('Kontrahenci', async () => ({
    value: formatPlInt(await countContractors(supabase, tenantId)),
    icon: RiUserLine,
  }));
}

export async function InvoicesThisMonthTile({ supabase, tenantId, now }: TileProps) {
  return loadTile('Faktury w tym miesiącu', async () => {
    const { accepted, drafts } = await countInvoicesThisMonth(supabase, tenantId, now);
    return {
      value: formatPlInt(accepted),
      note: drafts > 0 ? `+ ${drafts} ${plural(drafts, ['szkic', 'szkice', 'szkiców'])} poza KSeF` : undefined,
      icon: RiPagesLine,
    };
  });
}

export async function PaidThisMonthTile({ supabase, tenantId, now }: TileProps) {
  return loadTile('Opłacone w tym miesiącu', async () => {
    const paid = await paidThisMonth(supabase, tenantId, now);
    return paid === null
      ? { value: '—', note: PAID_EMPTY_STATE, icon: RiWalletLine }
      : { value: money(paid), note: PAID_NOTE, icon: RiWalletLine };
  });
}

export async function ReceivablesTile({ supabase, tenantId, now }: TileProps) {
  return loadTile('Do zapłaty', async () => {
    const receivables = await getReceivables(supabase, tenantId, now);
    const skipped = receivables.foreignCurrencyCount;
    return {
      value: money(receivables.total),
      note: (
        <>
          {RECEIVABLES_NOTE}
          {skipped > 0 ? (
            <>
              <br />
              Pominięto {skipped} {plural(skipped, ['fakturę', 'faktury', 'faktur'])} w walucie obcej
            </>
          ) : null}
        </>
      ),
      icon: RiMoneyDollarCircleLine,
    };
  });
}

function TileSlot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <SectionErrorBoundary
      fallback={<TileError label={label} message="Nie udało się wyświetlić kafla." />}
    >
      <Suspense fallback={<TileSkeleton />}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}

/** Rząd czterech kafli: Kontrahenci · Faktury w tym miesiącu · Opłacone · Do zapłaty. */
export function InvoiceStatTiles(props: TileProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <TileSlot label="Kontrahenci">
        <ContractorsTile {...props} />
      </TileSlot>
      <TileSlot label="Faktury w tym miesiącu">
        <InvoicesThisMonthTile {...props} />
      </TileSlot>
      <TileSlot label="Opłacone w tym miesiącu">
        <PaidThisMonthTile {...props} />
      </TileSlot>
      <TileSlot label="Do zapłaty">
        <ReceivablesTile {...props} />
      </TileSlot>
    </div>
  );
}
