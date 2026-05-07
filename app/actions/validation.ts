'use server';

import { formatInngestSendError } from '@/lib/inngest/error-message';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import {
  validateNipCached,
  type CachedValidationResult,
} from '@/lib/validation/cache';
import { checkBankAccountInWhitelist } from '@/lib/validation/whitelist-client';
import { extractCountryFromVatNumber } from '@/lib/validation/vies-client';

// ============================================================================
// Live validation (formularz faktury)
// ============================================================================

export async function validateNipLiveAction(
  vatNumber: string,
): Promise<
  | { success: true; result: CachedValidationResult }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const { countryCode, vatNumber: cleanVat } =
    extractCountryFromVatNumber(vatNumber);

  if (cleanVat.length < 4 || cleanVat.length > 20) {
    return {
      success: false,
      error: 'NIP musi mieć 4-20 znaków',
    };
  }

  try {
    const result = await validateNipCached(cleanVat, countryCode);
    return { success: true, result };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Błąd walidacji',
    };
  }
}

// ============================================================================
// Validate bank account (czy jest na białej liście)
// ============================================================================

export async function validateBankAccountAction(
  nip: string,
  bankAccount: string,
): Promise<
  | { success: true; isOnWhitelist: boolean; warning?: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const cleanAccount = bankAccount.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{0,2}\d{20,28}$/.test(cleanAccount)) {
    return {
      success: false,
      error: 'Niepoprawny format konta',
    };
  }

  try {
    const result = await checkBankAccountInWhitelist(nip, cleanAccount);
    return {
      success: true,
      isOnWhitelist: result.isOnWhitelist,
      warning: result.warning,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Błąd walidacji konta',
    };
  }
}

// ============================================================================
// Bulk validate wszystkich kontrahentów tenanta
// ============================================================================

export async function bulkValidateContractorsAction(
  options: { forceRefresh?: boolean } = {},
): Promise<
  | { success: true; jobId: string; total: number }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) {
    return { success: false, error: 'Brak aktywnej organizacji' };
  }

  const { data: contractors } = await supabase
    .from('contractors')
    .select('id, nip')
    .eq('tenant_id', tenantId)
    .not('nip', 'is', null);

  if (!contractors || contractors.length === 0) {
    return { success: false, error: 'Brak kontrahentów do walidacji' };
  }

  try {
    const { inngest, validationBulkContractorsRequested } = await import(
      '@/lib/inngest/client'
    );
    const sendResult = await inngest.send(
      validationBulkContractorsRequested.create({
        tenantId,
        contractorIds: contractors.map((c) => c.id),
        forceRefresh: options.forceRefresh ?? false,
        triggeredBy: user.id,
      }),
    );

    return {
      success: true,
      jobId: sendResult.ids[0] ?? '',
      total: contractors.length,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? formatInngestSendError(e) : 'Błąd kolejki',
    };
  }
}

// ============================================================================
// Pobranie statusu kontrahenta (z cache lub świeży)
// ============================================================================

export async function getContractorVatStatusAction(
  contractorId: string,
): Promise<
  | { success: true; status: CachedValidationResult }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) {
    return { success: false, error: 'Brak aktywnej organizacji' };
  }

  const { data: contractor } = await supabase
    .from('contractors')
    .select('id, nip, tenant_id')
    .eq('id', contractorId)
    .eq('tenant_id', tenantId)
    .single();

  if (!contractor) {
    return { success: false, error: 'Kontrahent nie znaleziony' };
  }

  if (contractor.tenant_id !== tenantId) {
    return { success: false, error: 'Kontrahent nie znaleziony' };
  }

  if (!contractor.nip) {
    return { success: false, error: 'Brak NIP-u kontrahenta' };
  }

  try {
    const { countryCode, vatNumber } = extractCountryFromVatNumber(
      contractor.nip,
    );
    const status = await validateNipCached(vatNumber, countryCode);

    const { error: upErr } = await supabase
      .from('contractors')
      .update({
        vat_status: status.vatStatus,
        last_validation_at: new Date().toISOString(),
        last_validation_source: status.source,
        bank_accounts_validated: status.bankAccounts,
        validation_warning: status.warning ?? null,
      })
      .eq('id', contractorId)
      .eq('tenant_id', tenantId);

    if (upErr) {
      return {
        success: false,
        error: upErr.message,
      };
    }

    return { success: true, status };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Błąd walidacji',
    };
  }
}
