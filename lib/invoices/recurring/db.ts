/**
 * Klient Supabase z typami tabeli `recurring_invoices` i dwóch nowych kolumn
 * `invoices` (migracja 00154).
 *
 * Typy bazy nie znają jeszcze tabeli z migracji 00154 — po wgraniu
 * wygenerować typy z produkcji (AGENTS.md, „Typy bazy”) i usunąć rzutowanie.
 * To JEDYNE miejsce z rzutowaniem dla faktur cyklicznych; `queries.ts`,
 * `issue.ts` i akcje biorą klienta przez `recurringDb`.
 *
 * Po co, skoro klienci z `lib/supabase/server.ts` są dziś nieotypowani
 * (wiersze `any`): żeby odczyty pozycji cyklicznych miały typy kolumn
 * z migracji, a literówka w nazwie kolumny była błędem kompilacji, nie
 * pustym wynikiem na produkcji. Typ to `Database` z `types/database.ts`
 * rozszerzony o 00154; po wygenerowaniu typów `RecurringDatabase` zastępuje
 * samo `Database`, a ten plik można skasować.
 *
 * Rzutowanie nie zmienia zachowania: to ten sam obiekt klienta (sesja z RLS
 * albo klucz serwisowy — taki, jaki przyszedł).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';
import type { RecurringFrequency } from '@/types/recurring-invoice';

type PublicSchema = Database['public'];
type InvoicesTable = PublicSchema['Tables']['invoices'];

// Aliasy `type`, nie `interface`: supabase-js wymaga od wierszy
// `Record<string, unknown>`, a interfejs nie ma niejawnej sygnatury indeksu.

/** Kolumny dodane do `invoices` w 00154. */
export type InvoiceRecurringColumns = {
  recurring_invoice_id: string | null;
  recurring_period: string | null;
};

type RecurringInvoicesTable = {
  Row: {
    id: string;
    tenant_id: string;
    template_invoice_id: string;
    name: string;
    frequency: RecurringFrequency;
    day_of_month: number;
    next_run_date: string;
    active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    tenant_id: string;
    template_invoice_id: string;
    name: string;
    frequency: RecurringFrequency;
    day_of_month: number;
    next_run_date: string;
    active?: boolean;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    tenant_id?: string;
    template_invoice_id?: string;
    name?: string;
    frequency?: RecurringFrequency;
    day_of_month?: number;
    next_run_date?: string;
    active?: boolean;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

/** Spłaszczenie przecięcia — kontrola nadmiarowych pól supabase-js nie radzi sobie z `A & B`. */
type Flat<T> = { [K in keyof T]: T[K] };

type RecurringTables = Omit<PublicSchema['Tables'], 'invoices'> & {
  invoices: {
    Row: Flat<InvoicesTable['Row'] & InvoiceRecurringColumns>;
    Insert: Flat<InvoicesTable['Insert'] & Partial<InvoiceRecurringColumns>>;
    Update: Flat<InvoicesTable['Update'] & Partial<InvoiceRecurringColumns>>;
    Relationships: InvoicesTable['Relationships'];
  };
  recurring_invoices: RecurringInvoicesTable;
};

/** `Database` rozszerzony o 00154 — do usunięcia razem z plikiem po wygenerowaniu typów. */
export type RecurringDatabase = Omit<Database, 'public'> & {
  public: Omit<PublicSchema, 'Tables'> & { Tables: RecurringTables };
};

export type RecurringClient = SupabaseClient<RecurringDatabase>;

/** Wiersz INSERT do `invoices` z kolumnami cyklicznymi (00154). */
export type InvoiceInsertWithRecurring = RecurringTables['invoices']['Insert'];

/**
 * Ten sam klient z typami 00154. Przyjmuje klienta otypowanego `Database`
 * (sesja, `createClient`) albo nieotypowanego (testy, klucz serwisowy).
 */
export function recurringDb(supabase: SupabaseClient<Database> | SupabaseClient): RecurringClient {
  // Typy bazy nie znają jeszcze tabeli z migracji 00154 — po wgraniu
  // wygenerować typy z produkcji i usunąć rzutowanie.
  return supabase as unknown as RecurringClient;
}
