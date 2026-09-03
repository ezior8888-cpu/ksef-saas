import { FloWrappedDeck } from '@/components/flo/wrapped/wrapped-deck';
import { buildWrapped } from '@/lib/flo/wrapped';
import { getPageContext } from '@/lib/supabase/page-context';

import { readWrappedInput } from './data';

/**
 * FaktFlow Wrapped — podsumowanie roku (krok 37 toru B).
 *
 * Trasa `/flo` jest przekierowaniem na dashboard, ale jej DZIECI działają
 * normalnie — a to miejsce jest właściwe: podsumowanie należy do agenta,
 * nie do listy faktur.
 *
 * Budujemy DWIE wersje: z zasłoniętymi nazwami (domyślna) i z prawdziwymi.
 * Przełącznik po stronie przeglądarki wybiera jedną z nich, zamiast prosić
 * serwer o przeliczenie — dzięki temu zmiana jest natychmiastowa, a klient
 * widzi w podglądzie dokładnie to, co zapisze.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Twój rok w liczbach' };

export default async function FloWrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ rok?: string }>;
}) {
  const { supabase, tenantId } = await getPageContext();
  const params = await searchParams;

  const requested = Number.parseInt(params.rok ?? '', 10);
  const year = Number.isFinite(requested)
    ? requested
    : new Date().getFullYear();

  const input = await readWrappedInput(supabase, tenantId, year);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-col py-4">
      <FloWrappedDeck
        masked={buildWrapped(input)}
        revealed={buildWrapped({ ...input, revealNames: true })}
      />
    </div>
  );
}
