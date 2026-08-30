import { redirect } from 'next/navigation';

/**
 * `/flo` → `/dashboard`.
 *
 * Decyzja właściciela produktu z 30.08.2026: agent nie ma osobnego ekranu,
 * tylko MIESZKA w dashboardzie — tak jak na sierpniowej makiecie. Trasa
 * zostaje jako przekierowanie, a nie znika, bo prowadzi do niej osiem miejsc
 * w kodzie, których zerwanie byłoby cichą awarią:
 *
 *   - powiadomienia push (`actionUrls`: `/flo#<id>`, `/flo?undo=<id>`),
 *   - ścieżka paragonu z telefonu (`app/share-target/route.ts` → `/flo?paragon=`),
 *   - `revalidatePath('/flo')` w akcjach serwerowych,
 *   - stare zakładki klientów alfy.
 *
 * PARAMETRY ZAPYTANIA MUSZĄ PRZEŻYĆ. `?undo=` uruchamia cofnięcie, a
 * `?paragon=` pokazuje pasek przetwarzania zdjęcia — przekierowanie, które
 * je gubi, zamienia działającą ścieżkę w pustą stronę bez śladu błędu.
 * Kotwica (`#<id>`) przeżywa po stronie przeglądarki i nie trzeba jej przenosić.
 */
export default async function FloRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [klucz, wartosc] of Object.entries(params)) {
    if (typeof wartosc === 'string') query.set(klucz, wartosc);
    else if (Array.isArray(wartosc)) {
      for (const v of wartosc) query.append(klucz, v);
    }
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  redirect(`/dashboard${suffix}`);
}
