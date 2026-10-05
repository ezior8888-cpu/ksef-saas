/**
 * Czy JPK_FA za okres w ogóle powstanie — sprawdzane PRZED utworzeniem
 * eksportów paczki Co-Pilot. Jeden nieudany format wywraca całą paczkę
 * dla księgowej (`co-pilot-monthly.ts`), więc zamiast pliku, który odmówi,
 * paczka dostaje uniwersalny CSV (jak przy braku urzędu, #67).
 *
 * JPK_FA odmawia, gdy (`jpk-fa-generator.ts`):
 * - w okresie jest faktura korygująca (kwoty korekty w bazie — C-01),
 * - w okresie jest dokument z importu, którego JPK nie wykaże (W9): pozycja
 *   ze stawką spoza FaktFlow albo zaimportowana korekta / zaliczka / ROZ,
 * - GUS nie zna adresu firmy z województwem, powiatem i gminą.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { MissingIssuerAddressError, readIssuerRegisteredAddress } from '@/lib/exports/issuer-address';
import { amountsOf, JpkFaCorrectionNotSupportedError, type JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { VAT_RATES } from '@/lib/xml/fa3-p12';

const PAGE = 1000;
const LINE_CHUNK = 200;

interface PeriodInvoice {
  id: string;
  internal_number: string | null;
  ksef_number: string | null;
  invoice_kind: string | null;
  invoice_type: string | null;
}

/**
 * W9: pierwszy dokument okresu, którego JPK nie wykaże — powód tą samą
 * odmową co generator (`amountsOf`), więc paczka i plik mówią to samo.
 * Te same faktury co eksport: sprzedaż przyjęta w KSeF, w tym środowisku.
 */
async function unsupportedDocumentReason(
  client: SupabaseClient,
  params: { tenantId: string; periodStart: string; periodEnd: string },
): Promise<string | null> {
  const environment = requireConfiguredKsefEnvironment();
  const invoices: PeriodInvoice[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('invoices')
      .select('id, internal_number, ksef_number, invoice_kind, invoice_type')
      .eq('tenant_id', params.tenantId)
      .eq('direction', 'outgoing')
      .eq('ksef_status', 'accepted')
      .eq('ksef_environment', environment)
      .gte('issue_date', params.periodStart)
      .lte('issue_date', params.periodEnd)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Nie można sprawdzić faktur okresu: ${error.message}`);
    const page = (data ?? []) as PeriodInvoice[];
    invoices.push(...page);
    if (page.length < PAGE) break;
  }

  const asJpk = (inv: PeriodInvoice, vatRate: string | null): JpkInvoice => {
    const type = (inv.invoice_type ?? '').toUpperCase();
    return {
      invoiceNumber: inv.internal_number ?? inv.ksef_number ?? '',
      ksefNumber: inv.ksef_number ?? undefined,
      invoiceType: 'regular',
      importedDocumentType: inv.invoice_kind === 'regular' && (type === 'KOR' || type === 'ZAL' || type === 'ROZ') ? type : undefined,
      issueDate: params.periodStart,
      buyerName: '',
      netTotal: 0,
      vatTotal: 0,
      grossTotal: 0,
      lines: vatRate === null ? [] : [{ position: 1, name: '', unit: '', quantity: 1, unitPriceNet: 0, netAmount: 0, vatRate }],
    };
  };
  const refusal = (inv: JpkInvoice): string | null => {
    try {
      amountsOf(inv);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : null;
    }
  };

  for (const inv of invoices) {
    const reason = refusal(asJpk(inv, null));
    if (reason) return reason;
  }
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  const allowed = `(${VAT_RATES.map((r) => `"${r}"`).join(',')})`;
  for (let i = 0; i < invoices.length; i += LINE_CHUNK) {
    const ids = invoices.slice(i, i + LINE_CHUNK).map((inv) => inv.id);
    const { data, error } = await client
      .from('invoice_line_items')
      .select('invoice_id, vat_rate')
      .in('invoice_id', ids)
      .not('vat_rate', 'in', allowed)
      .limit(1);
    if (error) throw new Error(`Nie można sprawdzić stawek pozycji okresu: ${error.message}`);
    const line = (data ?? [])[0] as { invoice_id: string; vat_rate: string | null } | undefined;
    const inv = line ? byId.get(line.invoice_id) : undefined;
    if (inv && line) {
      const reason = refusal(asJpk(inv, String(line.vat_rate ?? '')));
      if (reason) return reason;
    }
  }
  return null;
}

/** Powód, dla którego JPK_FA nie powstanie, albo `null`. */
export async function jpkFaBlocker(
  client: SupabaseClient,
  params: {
    tenantId: string;
    periodStart: string;
    periodEnd: string;
    /** Ustawienie paczki — bez korekt eksport ich nie czyta, więc nie blokują. */
    includeCorrections: boolean;
  },
): Promise<string | null> {
  if (params.includeCorrections) {
    const { count, error } = await client
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', params.tenantId)
      .eq('direction', 'outgoing')
      .eq('ksef_status', 'accepted')
      .eq('invoice_kind', 'correction')
      .gte('issue_date', params.periodStart)
      .lte('issue_date', params.periodEnd);
    if (error) throw new Error(`Nie można sprawdzić korekt okresu: ${error.message}`);
    if ((count ?? 0) > 0) return new JpkFaCorrectionNotSupportedError().message;
  }

  const unsupported = await unsupportedDocumentReason(client, params);
  if (unsupported) return unsupported;

  const { data: tenant, error: tenantError } = await client
    .from('tenants')
    .select('nip')
    .eq('id', params.tenantId)
    .maybeSingle();
  if (tenantError) throw new Error(`Nie można odczytać NIP-u firmy: ${tenantError.message}`);
  const nip = (tenant as { nip?: string | null } | null)?.nip?.trim();
  if (!nip) return new MissingIssuerAddressError().message;

  try {
    const address = await readIssuerRegisteredAddress(nip);
    return address ? null : new MissingIssuerAddressError().message;
  } catch {
    // GUS chwilowo nie odpowiada — paczka i tak ma pójść, z CSV zamiast JPK_FA.
    return new MissingIssuerAddressError().message;
  }
}
