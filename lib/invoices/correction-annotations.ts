import type { SupabaseClient } from '@supabase/supabase-js';

import type { CorrectionInvoiceData } from '@/types/invoice-types';

type Annotations = NonNullable<CorrectionInvoiceData['annotations']>;

/**
 * Adnotacje P_16 (metoda kasowa) i P_18A (MPP) z `fa3_data` faktury
 * pierwotnej — korekta je przejmuje (AUD-23). Tylko 1 albo 2; cokolwiek
 * innego (brak, stary zapis) = 2, jak dotąd.
 */
export function parentAnnotationsForCorrection(fa3Data: unknown): Required<Annotations> {
  const raw =
    fa3Data && typeof fa3Data === 'object'
      ? ((fa3Data as { annotations?: unknown }).annotations as Record<string, unknown> | undefined)
      : undefined;
  return {
    cashMethod: raw?.cashMethod === 1 ? 1 : 2,
    splitPayment: raw?.splitPayment === 1 ? 1 : 2,
  };
}

/** Odczyt adnotacji faktury pierwotnej tej samej firmy. Błąd odczytu rzuca. */
export async function loadParentAnnotations(
  supabase: SupabaseClient,
  tenantId: string,
  parentInvoiceId: string,
): Promise<Required<Annotations>> {
  const { data, error } = await supabase
    .from('invoices')
    .select('fa3_data')
    .eq('id', parentInvoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Nie można odczytać faktury korygowanej: ${error.message}`);
  return parentAnnotationsForCorrection((data as { fa3_data?: unknown } | null)?.fa3_data);
}
