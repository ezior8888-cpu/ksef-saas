// AKTYWNE w produkcji (S14, rewizja 03.10.2026): importowane dla skutku
// ubocznego przez `lib/jobs/handlers/flo-tick.ts` i `app/actions/flo.ts` —
// rejestr wykonawców propozycji. Dawny znacznik NIEAKTYWNE był fałszywy:
// strażnik `tests/unit/flo-nieaktywne.test.ts` nie widział importów bez `from`.

/**
 * Funkcje agenta FLO — jedno miejsce, które zapełnia rejestr wykonawców.
 *
 * Import tego pliku ma skutek uboczny: każdy moduł funkcji rejestruje swój
 * handler. Dlatego importują go worker (żeby wykonanie z kolejki działało)
 * i akcje serwerowe (żeby działało kliknięcie w aplikacji). Bez tego rejestr
 * jest pusty, a agent odpowiada „tego jeszcze nie umiem wykonać” na wszystko.
 */

import './expense-review';
import './expense-rules';
import './payment-chase-handler';
import './payment-confirm';

export {};
