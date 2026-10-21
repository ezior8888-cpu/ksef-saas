import { getDashboardActiveOrgVerified } from '@/lib/dashboard-shell-data';
import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import type { PageContext } from '@/lib/supabase/page-context';

import { DEMO_TENANT, analizyDemoSupabase } from './analizy-przykladowe';

/**
 * Czy aktywna firma potwierdziła KSeF. Błąd odczytu → `true`: zostajemy przy
 * prawdziwych danych (dotychczasowe zachowanie), a nie pokazujemy przykładów.
 */
export async function czyZweryfikowana(): Promise<boolean> {
  try {
    return await getDashboardActiveOrgVerified();
  } catch {
    return true;
  }
}

/**
 * Poprawka Bartosza 21.10.2026: dopóki firma nie potwierdziła KSeF (certyfikat
 * lub token — `getDashboardActiveOrgVerified`), Analizy pokazują dane
 * przykładowe, żeby klient zobaczył wykresy i animacje w pełnej okazałości.
 * Atrapa jest tylko do odczytu i nie zawiera danych żadnej firmy; po
 * weryfikacji strona czyta prawdziwe dane jak dotąd.
 */
export async function analizyKontekst(
  ctx: Pick<PageContext, 'supabase' | 'tenantId'>,
  now: Date,
): Promise<Pick<PageContext, 'supabase' | 'tenantId'> & { demo: boolean }> {
  if (await czyZweryfikowana()) return { ...ctx, demo: false };
  return {
    supabase: analizyDemoSupabase(now, configuredKsefEnvironment() ?? 'production'),
    tenantId: DEMO_TENANT,
    demo: true,
  };
}
