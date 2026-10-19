import { OutgoingInvoiceCurrencyNotSupportedError } from '@/lib/exports/currency-guard';
import { KsefExpenseCurrencyNotSupportedError } from '@/lib/expenses/ksef-currency-review';

/**
 * Treść wyjątku na karcie z danymi (Pulpit, kafle listy faktur; §2.4 pkt 15).
 * Granica błędu nie przekazuje tekstu, a Next.js w produkcji ukrywa treść
 * wyjątków serwerowych, więc karta bierze komunikat sama — i tu musi go
 * przefiltrować, bo klient nie powinien widzieć angielskiego tekstu PostgREST-a
 * ani nazw zmiennych środowiskowych.
 */

export const CARD_GENERIC_ERROR = 'Nie udało się wczytać karty. Odśwież stronę za chwilę.';

/** Polskie komunikaty strażników §2.4 i odczytów — te klient może przeczytać. */
const CUSTOMER_MESSAGE_PREFIXES = ['Nie można ', 'Przyjęte faktury ', 'Koszty ze skrzynki KSeF '];

/**
 * Treść wyjątku dla klienta. Strażniki walut i środowiska mówią po polsku, co
 * klient ma zrobić — te pokazujemy. `readCompletePages` i odczyty dopisują po
 * dwukropku tekst PostgREST-a (po angielsku, techniczny), więc z nich zostaje
 * polska część przed dwukropkiem. Wszystko inne (konfiguracja serwera, błąd
 * programu) to ogólny komunikat.
 */
export function cardErrorMessage(error: unknown): string {
  if (error instanceof OutgoingInvoiceCurrencyNotSupportedError || error instanceof KsefExpenseCurrencyNotSupportedError) {
    return error.message;
  }
  const message = error instanceof Error ? error.message : '';
  if (CUSTOMER_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return message.split(': ')[0]!;
  }
  return CARD_GENERIC_ERROR;
}

/**
 * Jak `cardErrorMessage`, ale gdy klient dostaje ogólny komunikat, pełny
 * wyjątek idzie do logu (`scope` i tytuł karty mówią, skąd).
 */
export function describeCardError(scope: string, title: string, error: unknown): string {
  const message = cardErrorMessage(error);
  if (message === CARD_GENERIC_ERROR) console.error(`[${scope}] karta „${title}”:`, error);
  return message;
}
