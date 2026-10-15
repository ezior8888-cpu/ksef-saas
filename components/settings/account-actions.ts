'use server';

import { SUPPORT_EMAIL } from '@/lib/site';
import { requireOwner } from '@/lib/supabase/auth-context';

export type RequestAccountDeletionResult = { success: false; error: string };

const DELETION_BY_SUPPORT_MESSAGE =
  'Usunięcia firmy nie zlecisz na razie z aplikacji — nic nie zostało usunięte, ' +
  'a firma i abonament działają bez zmian. ' +
  `Napisz na ${SUPPORT_EMAIL} z adresu właściciela i podaj NIP firmy. ` +
  'Swoje konto użytkownika usuniesz w Ustawienia → Konto i firma, w sekcji „Twoje dane (RODO)”.';

/**
 * Usunięcie firmy (organizacji) — samoobsługa wstrzymana 15.10.2026.
 *
 * Do 15.10 akcja ustawiała `tenants.deleted_at`, `hard_delete_at` (+30 dni)
 * i `is_active = false`, po czym wylogowywała właściciela. Tych kolumn nie
 * sprawdza logowanie, RLS (`is_member_of`, `get_current_tenant_id`) ani żaden
 * job, a subskrypcji Stripe nikt nie anulował: firma działała dalej dla
 * wszystkich członków, abonament się pobierał, dane nie znikały nigdy —
 * wbrew komunikatom („trwale usunięte po 30 dniach”).
 *
 * Do czasu prawdziwego usuwania firmy akcja niczego nie zapisuje i kieruje
 * właściciela do pomocy technicznej. Ścieżka operatora:
 * `docs/support/escalation-matrix.md` („Usunięcie firmy”).
 * Test: `tests/unit/usuwanie-firmy-wstrzymane.test.tsx`.
 */
export async function requestAccountDeletionAction(): Promise<RequestAccountDeletionResult> {
  try {
    await requireOwner();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Tylko właściciel konta może zlecić usunięcie firmy.',
    };
  }

  return { success: false, error: DELETION_BY_SUPPORT_MESSAGE };
}
