/**
 * Zaliczki rozliczone fakturą ROZ — ile z jej wartości KPiR już policzył.
 *
 * Reguła przychodu: `lib/categorization/kpir-revenue.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { roundToCents } from '@/lib/xml/invoice-calculator';

/** Tyle identyfikatorów na jedno `.in()` — długość adresu zapytania PostgREST. */
const LOOKUP_CHUNK = 100;

export interface SettlementSource {
  id: string;
  invoice_kind?: string | null;
  advance_invoice_ids?: string[] | null;
}

export interface SettledAdvanceTotals {
  net: number;
  vat: number;
  gross: number;
}

/**
 * Suma netto zaliczek rozliczonych każdą fakturą ROZ z listy. Klucz: id ROZ.
 *
 * Liczą się tylko zaliczki, które KPiR bierze jako przychód — wystawione,
 * tej firmy, przyjęte przez KSeF. Zaliczka odrzucona albo robocza w KPiR
 * nie jest, więc nie ma czego odejmować; cudzy identyfikator w tablicy
 * (dane zapisywalne) też nic nie odejmie.
 *
 * Błąd odczytu rzuca: „nie wiem, ile było zaliczek” to nie „zero zaliczek” —
 * inaczej KPiR po cichu wróciłby do dubla.
 */
export async function fetchSettledAdvancesNet(
  client: SupabaseClient,
  tenantId: string,
  invoices: ReadonlyArray<SettlementSource>,
): Promise<Map<string, number>> {
  const totals = await fetchSettledAdvancesTotals(client, tenantId, invoices);
  return new Map([...totals].map(([id, t]) => [id, t.net]));
}

/**
 * Netto, VAT i brutto zaliczek rozliczonych każdą fakturą ROZ z listy —
 * te same zaliczki co `fetchSettledAdvancesNet`. Pulpit odejmuje je od ROZ,
 * bo VAT zaliczki był należny w jej miesiącu (AUD-26).
 */
export async function fetchSettledAdvancesTotals(
  client: SupabaseClient,
  tenantId: string,
  invoices: ReadonlyArray<SettlementSource>,
): Promise<Map<string, SettledAdvanceTotals>> {
  const finals = invoices.filter(
    (inv) => inv.invoice_kind === 'final' && (inv.advance_invoice_ids?.length ?? 0) > 0,
  );
  const result = new Map<string, SettledAdvanceTotals>();
  if (finals.length === 0) return result;

  const ids = [...new Set(finals.flatMap((inv) => inv.advance_invoice_ids ?? []))];
  const byId = new Map<string, SettledAdvanceTotals>();
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
    const { data, error } = await client
      .from('invoices')
      .select('id, net_total, vat_total, gross_total')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .eq('invoice_kind', 'advance')
      .eq('ksef_status', 'accepted')
      .in('id', ids.slice(i, i + LOOKUP_CHUNK));
    if (error) throw new Error(`Nie można odczytać zaliczek rozliczonych fakturą końcową: ${error.message}`);
    for (const row of (data ?? []) as Array<{
      id: string;
      net_total: number | string | null;
      vat_total: number | string | null;
      gross_total: number | string | null;
    }>) {
      byId.set(row.id, {
        net: Number(row.net_total ?? 0),
        vat: Number(row.vat_total ?? 0),
        gross: Number(row.gross_total ?? 0),
      });
    }
  }

  for (const inv of finals) {
    const sum = { net: 0, vat: 0, gross: 0 };
    for (const id of new Set(inv.advance_invoice_ids ?? [])) {
      const adv = byId.get(id);
      if (!adv) continue;
      sum.net += adv.net;
      sum.vat += adv.vat;
      sum.gross += adv.gross;
    }
    result.set(inv.id, {
      net: roundToCents(sum.net),
      vat: roundToCents(sum.vat),
      gross: roundToCents(sum.gross),
    });
  }
  return result;
}

/**
 * Zaliczki już wskazane w innej fakturze ROZ tej firmy (AUD-67). Klucz: id
 * zaliczki, wartość: numer tej ROZ. Liczy się każda ROZ poza odrzuconą przez
 * KSeF — także szkic, bo wysłany rozliczyłby zaliczkę drugi raz, i `failed`,
 * bo mógł dotrzeć do KSeF. Tę samą regułę trzyma w bazie wyzwalacz z 00125;
 * tu jest po to, żeby formularz dostał czytelny komunikat przed zapisem.
 *
 * Błąd odczytu rzuca — „nie wiem” to nie „wolna”.
 */
export async function findAdvancesAlreadySettled(
  client: SupabaseClient,
  tenantId: string,
  advanceIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(advanceIds)];
  const settled = new Map<string, string>();
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await client
      .from('invoices')
      .select('id, internal_number, advance_invoice_ids')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .eq('invoice_kind', 'final')
      // Kolumna dopuszcza NULL (00001); `neq` zgubiłby taki wiersz.
      .or('ksef_status.is.null,ksef_status.neq.rejected')
      .overlaps('advance_invoice_ids', chunk);
    if (error) throw new Error(`Nie można sprawdzić, czy zaliczki są już rozliczone: ${error.message}`);
    for (const row of (data ?? []) as Array<{
      id: string;
      internal_number: string | null;
      advance_invoice_ids: string[] | null;
    }>) {
      for (const id of row.advance_invoice_ids ?? []) {
        if (chunk.includes(id) && !settled.has(id)) {
          settled.set(id, row.internal_number ?? row.id.slice(0, 8));
        }
      }
    }
  }
  return settled;
}
