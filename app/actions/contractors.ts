'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import {
  changedContractorFields,
  contractorEditSchema,
  type ContractorEditInput,
} from '@/lib/contractors/edit';
import { ActionAuthError, requireOrgRole } from '@/lib/supabase/auth-context';

export type ContractorActionResult = { success: true } | { success: false; error: string };

/** Księgowa ma wgląd; zmieniać bazę kontrahentów mogą pozostali członkowie. */
const EDITOR_ROLES = ['owner', 'admin', 'member'] as const;

/**
 * Poprawka danych kontrahenta (F-011). Zmienione pola trafiają do
 * `manual_fields` (00064), więc nocne odświeżanie z rejestrów ich nie cofnie.
 * Wystawione faktury mają własną kopię danych nabywcy — zmiana ich nie dotyka.
 * NIP nie podlega edycji (to klucz kontrahenta w firmie).
 */
export async function updateContractorAction(
  contractorId: string,
  input: ContractorEditInput,
): Promise<ContractorActionResult> {
  let ctx;
  try {
    ctx = await requireOrgRole([...EDITOR_ROLES]);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }

  const parsed = contractorEditSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane kontrahenta.' };
  }

  const { supabase, tenantId, user } = ctx;
  const { data: current, error: readError } = await supabase
    .from('contractors')
    .select('id, name, address, email, manual_fields')
    .eq('id', contractorId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (readError || !current) return { success: false, error: 'Nie znaleziono kontrahenta w tej organizacji.' };

  const before = {
    name: (current.name as string | null) ?? null,
    address: (current.address as { addressLine1?: string; addressLine2?: string; countryCode?: string } | null) ?? null,
    email: (current.email as string | null) ?? null,
  };
  const after = parsed.data;
  const changed = changedContractorFields(before, after);
  if (changed.length === 0) return { success: true };

  const manual = new Set<string>([...((current.manual_fields as string[] | null) ?? []), ...changed]);
  const { data: updated, error } = await supabase
    .from('contractors')
    .update({
      name: after.name,
      address: {
        countryCode: before.address?.countryCode ?? 'PL',
        addressLine1: after.addressLine1,
        addressLine2: after.addressLine2,
      },
      email: after.email || null,
      manual_fields: [...manual],
    })
    .eq('id', contractorId)
    .eq('tenant_id', tenantId)
    .select('id');
  if (error || !updated || updated.length === 0) {
    return { success: false, error: 'Nie udało się zapisać kontrahenta.' };
  }

  await logAudit({
    action: 'contractor.updated',
    tenantId,
    userId: user.id,
    entityType: 'contractor',
    entityId: contractorId,
    metadata: { fields: changed },
  });
  revalidatePath('/contractors');
  return { success: true };
}

/**
 * Usunięcie kontrahenta z bazy podpowiedzi (F-011). Faktury mają własną kopię
 * danych nabywcy, więc usunięcie ich nie zmienia.
 */
export async function deleteContractorAction(contractorId: string): Promise<ContractorActionResult> {
  let ctx;
  try {
    ctx = await requireOrgRole([...EDITOR_ROLES]);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }

  const { supabase, tenantId, user } = ctx;
  const { data: deleted, error } = await supabase
    .from('contractors')
    .delete()
    .eq('id', contractorId)
    .eq('tenant_id', tenantId)
    .select('id, nip');
  if (error) return { success: false, error: 'Nie udało się usunąć kontrahenta.' };
  if (!deleted || deleted.length === 0) {
    return { success: false, error: 'Nie znaleziono kontrahenta w tej organizacji.' };
  }

  await logAudit({
    action: 'contractor.deleted',
    tenantId,
    userId: user.id,
    entityType: 'contractor',
    entityId: contractorId,
    metadata: { nip: (deleted[0] as { nip?: string | null }).nip ?? null },
  });
  revalidatePath('/contractors');
  return { success: true };
}
