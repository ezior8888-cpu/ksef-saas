'use server';

import { logAudit } from '@/lib/audit/log';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { lookupCompanyByNip } from '@/lib/gus/client';
import { validateNipChecksum } from '@/lib/xml/invoice-calculator';

// ═══════════════════════════════════════════════════════════════
// Typy wyników (discriminated unions - wygodne w `if (result.success)`)
// ═══════════════════════════════════════════════════════════════

export interface OnboardingCompanyData {
  nip: string;
  name: string;
  postalCode: string;
  city: string;
  street: string;
  buildingNumber: string;
  localNumber?: string;
}

export type LookupNipResult =
  | { success: true; data: OnboardingCompanyData }
  | { success: false; error: string };

export type CompleteOnboardingResult =
  | { success: true }
  | { success: false; error: string };

// ═══════════════════════════════════════════════════════════════
// Action 1: wyszukaj firmę po NIP (GUS)
// ═══════════════════════════════════════════════════════════════

export async function lookupNipAction(nip: string): Promise<LookupNipResult> {
  if (!/^\d{10}$/.test(nip)) {
    return { success: false, error: 'NIP musi zawierać 10 cyfr.' };
  }
  if (!validateNipChecksum(nip)) {
    return { success: false, error: 'Nieprawidłowa suma kontrolna NIP.' };
  }

  const result = await lookupCompanyByNip(nip);

  if (result.kind === 'not-found') {
    return {
      success: false,
      error: 'Nie znaleziono firmy w bazie GUS. Sprawdź numer NIP.',
    };
  }

  if (result.kind === 'error') {
    // Sandbox GUS bywa niestabilny - komunikat mówi userowi, że to nie
    // jego wina (vs "nie znaleziono" co sugeruje zły NIP).
    return {
      success: false,
      error:
        'GUS chwilowo niedostępny (sandbox). Spróbuj ponownie za chwilę — to nie problem z Twoim NIP-em.',
    };
  }

  return {
    success: true,
    data: {
      nip: result.data.nip,
      name: result.data.name,
      postalCode: result.data.postalCode,
      city: result.data.city,
      street: result.data.street,
      buildingNumber: result.data.buildingNumber,
      localNumber: result.data.localNumber,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Action 2: utwórz/przypisz tenant i zakończ onboarding
// ═══════════════════════════════════════════════════════════════

export async function completeOnboardingAction(
  company: OnboardingCompanyData
): Promise<CompleteOnboardingResult> {
  // 1) Weryfikacja sesji zwykłym klientem (user-context, RLS aktywne).
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return { success: false, error: 'Nie jesteś zalogowany.' };
  }

  // 2) INSERT tenant + UPDATE users przez admin client.
  //    Dlaczego admin? RLS 00002 nie ma polityki INSERT dla `tenants`,
  //    a dodawanie polityki "każdy authenticated może wstawić tenant"
  //    wymagałoby dodatkowych ograniczeń (np. "tylko gdy user ma
  //    tenant_id = NULL"). Server Action to ścieżka kontrolowana -
  //    weryfikujemy auth.getUser() wyżej, więc bypass RLS jest bezpieczny.
  const admin = createAdminClient();

  // Idempotencja: jeśli tenant z tym NIP-em już istnieje, przypisujemy
  // usera jako zwykłego członka (owner został wcześniej). Chroni przed
  // podwójnym kontem firmy, jeśli np. dwóch pracowników utworzy konta.
  const { data: existingTenant, error: selectErr } = await admin
    .from('tenants')
    .select('id')
    .eq('nip', company.nip)
    .maybeSingle();

  if (selectErr) {
    return { success: false, error: `Błąd odczytu tenant: ${selectErr.message}` };
  }

  if (existingTenant) {
    const { error: attachErr } = await admin
      .from('users')
      .update({ tenant_id: existingTenant.id, role: 'member' })
      .eq('id', user.id);

    if (attachErr) {
      return {
        success: false,
        error: `Błąd przypisania do istniejącej firmy: ${attachErr.message}`,
      };
    }
    await logAudit({
      action: 'tenant.updated',
      tenantId: existingTenant.id,
      userId: user.id,
      metadata: { source: 'onboarding_join_existing', nip: company.nip },
    });
    return { success: true };
  }

  // Nowy tenant - budujemy snapshot adresu w formacie zgodnym ze schemą FA(3).
  const addressLine1 = `${company.street} ${company.buildingNumber}${
    company.localNumber ? '/' + company.localNumber : ''
  }`.trim();
  const addressLine2 = `${company.postalCode} ${company.city}`;

  const { data: newTenant, error: tenantError } = await admin
    .from('tenants')
    .insert({
      nip: company.nip,
      name: company.name,
      // UWAGA: w schemacie 00001 kolumna nazywa się `address_json` (nie `address`).
      address_json: {
        countryCode: 'PL',
        addressLine1,
        addressLine2,
      },
      is_active: true,
    })
    .select('id')
    .single();

  if (tenantError || !newTenant) {
    return {
      success: false,
      error: `Błąd tworzenia firmy: ${tenantError?.message ?? 'unknown'}`,
    };
  }

  const { error: userError } = await admin
    .from('users')
    .update({ tenant_id: newTenant.id, role: 'owner' })
    .eq('id', user.id);

  if (userError) {
    return {
      success: false,
      error: `Błąd przypisania użytkownika: ${userError.message}`,
    };
  }

  await logAudit({
    action: 'tenant.created',
    tenantId: newTenant.id,
    userId: user.id,
    metadata: { nip: company.nip, name: company.name },
  });

  return { success: true };
}
