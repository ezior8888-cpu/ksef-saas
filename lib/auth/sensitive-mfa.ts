import 'server-only';

import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';
import { getGlobalFlagForExecution } from '@/lib/feature-flags/global-flags';
import { createAdminClient, createClient } from '@/lib/supabase/server';

/**
 * Drugi krok (AAL2) przy operacjach wrażliwych właściciela i admina (AUD-65):
 * wysyłka do KSeF, wgranie certyfikatu, płatności. Decyzje B10/B13 — tylko
 * owner/admin (pozostałe role opcjonalnie) i za flagą globalną
 * `requireMfaForSensitive`, domyślnie WYŁĄCZONĄ: włączenie bez zapowiedzi
 * odcięłoby od wysyłki każdego właściciela bez MFA.
 *
 * Błąd odczytu flagi nie blokuje — to dodatkowa warstwa, nie wyłącznik.
 */

export type SensitiveOperation = 'ksef_submit' | 'certificate' | 'billing';

export class SensitiveMfaRequiredError extends Error {
  constructor(readonly operation: SensitiveOperation) {
    super(
      'Ta operacja wymaga weryfikacji dwuetapowej. Włącz ją w Ustawieniach → Bezpieczeństwo i zaloguj się ponownie.',
    );
    this.name = 'SensitiveMfaRequiredError';
  }
}

const GUARDED_ROLES = new Set(['owner', 'admin']);

export async function assertSensitiveMfa(
  ctx: { tenantId: string; userId: string },
  operation: SensitiveOperation,
): Promise<void> {
  let required: boolean;
  try {
    required = await getGlobalFlagForExecution('requireMfaForSensitive');
  } catch {
    return;
  }
  if (!required) return;

  const { data: membership } = await createAdminClient()
    .from('memberships')
    .select('role')
    .eq('user_id', ctx.userId)
    .eq('organization_id', ctx.tenantId)
    .eq('status', 'active')
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (!role || !GUARDED_ROLES.has(role)) return;

  const state = await getVerifiedMfaState(await createClient()).catch(() => null);
  if (state?.status !== 'verified') throw new SensitiveMfaRequiredError(operation);
}
