import Link from 'next/link';
import { Users, ArrowRight } from 'lucide-react';

import { BulkValidateButton } from '@/components/validation/bulk-validate-button';
import { VatStatusBadge } from '@/components/validation/vat-status-badge';
import { ContractorReminderToggle } from '@/components/reminders/contractor-reminder-toggle';
import { getPageContext } from '@/lib/supabase/page-context';

export default async function ContractorsPage() {
  const { supabase, tenantId } = await getPageContext();

  const { data: contractors } = await supabase
    .from('contractors')
    .select(
      'id, nip, name, address, email, vat_status, last_validation_at, validation_warning, last_used_at, reminder_excluded, reminder_exclusion_reason'
    )
    .eq('tenant_id', tenantId)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(200);

  const hasContractors = contractors && contractors.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
            Kontrahenci
          </h1>
          <p className="mt-2 text-muted-foreground">
            Zapisani automatycznie z faktur. Dane pobierane z bazy GUS REGON
          </p>
        </div>

        <BulkValidateButton />
      </div>

      {!hasContractors ? (
        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass py-16 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5 mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold text-lg tracking-tighter-text mb-1">
            Brak kontrahentów
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
            Kontrahenci zostaną dodani automatycznie przy wystawianiu pierwszej faktury
          </p>
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors"
          >
            Wystaw fakturę
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-foreground/3 border-b border-glass-border">
              <tr className="text-left">
                <th className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  NIP
                </th>
                <th className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Nazwa firmy
                </th>
                <th className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Adres
                </th>
                <th className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Status VAT
                </th>
                <th className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">
                  Przypomnienia
                </th>
                <th className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Ostatnio użyty
                </th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((contractor) => (
                <tr
                  key={contractor.id}
                  className="border-b border-glass-border/50 last:border-0 hover:bg-foreground/2 transition-colors duration-150"
                >
                  <td className="px-6 py-4 font-mono text-xs">
                    {contractor.nip}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {contractor.name}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {contractor.address?.addressLine1 ?? '-'}
                    {contractor.address?.addressLine2 && (
                      <>
                        <br />
                        {contractor.address.addressLine2}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {contractor.email ?? '-'}
                  </td>
                  <td className="px-6 py-4">
                    <VatStatusBadge
                      status={contractor.vat_status ?? 'unknown'}
                      warning={contractor.validation_warning}
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <ContractorReminderToggle
                      contractorId={contractor.id}
                      excluded={contractor.reminder_excluded ?? false}
                    />
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {contractor.last_used_at
                      ? new Date(contractor.last_used_at).toLocaleDateString('pl-PL')
                      : 'Jeszcze nie użyty'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
