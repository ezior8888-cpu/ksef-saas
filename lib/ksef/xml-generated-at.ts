import { createAdminClient } from '@/lib/supabase/admin';

/** Kod PostgREST/Postgres „nie ma takiej kolumny” — przed wgraniem 00107. */
const UNDEFINED_COLUMN = '42703';

/**
 * `DataWytworzeniaFa` faktury: przy pierwszym generowaniu zapisana w
 * `invoices.xml_generated_at`, przy ponowieniach odczytana stamtąd — ten sam
 * XML przy każdej próbie (AUD-46). Zapis warunkowy (`IS NULL`), więc dwie
 * równoległe próby dostaną tę samą chwilę.
 *
 * Bez kolumny (kod przed migracją 00107) albo przy błędzie bazy — chwila
 * bieżąca, jak dotąd: wysyłka nie może stanąć przez znacznik czasu.
 */
export async function claimXmlGeneratedAt(
  tenantId: string,
  invoiceId: string,
  now: Date = new Date(),
): Promise<Date> {
  try {
    const admin = createAdminClient();
    await admin
      .from('invoices')
      .update({ xml_generated_at: now.toISOString() } as never)
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .is('xml_generated_at' as never, null)
      .select('id')
      .maybeSingle();
    const { data, error } = await admin
      .from('invoices')
      .select('xml_generated_at' as never)
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code !== UNDEFINED_COLUMN) {
        console.warn('[ksef] xml_generated_at niedostępne — chwila bieżąca');
      }
      return now;
    }
    const stored = (data as { xml_generated_at?: string | null } | null)?.xml_generated_at;
    const parsed = stored ? new Date(stored) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;
  } catch {
    return now;
  }
}
