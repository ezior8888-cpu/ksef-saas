import { Badge } from '@/components/ui/badge';

/**
 * Plakietka „Dane przykładowe” (poprawka Bartosza 21.10.2026): przed
 * weryfikacją KSeF Analizy i KPiR pokazują dane przykładowe, a klient musi
 * wiedzieć, że to nie są jego liczby. Kolory jak plakietki ostrzeżeń
 * (kontrast AA w obu motywach).
 */
export function DemoBadge() {
  return (
    <Badge
      variant="secondary"
      className="h-6 bg-amber-500/15 px-2.5 font-normal text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"
      title="Twoje dane pojawią się tu po podłączeniu KSeF w ustawieniach."
    >
      Dane przykładowe
    </Badge>
  );
}
