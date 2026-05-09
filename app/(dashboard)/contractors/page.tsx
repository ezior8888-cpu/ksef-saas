import Link from 'next/link';

import { BulkValidateButton } from '@/components/validation/bulk-validate-button';
import { VatStatusBadge } from '@/components/validation/vat-status-badge';
import { ContractorReminderToggle } from '@/components/reminders/contractor-reminder-toggle';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

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
    <div className="space-y-8 pb-10 text-[var(--ff-on-surface)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
            Kontrahenci
          </h1>
          <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
            Zapisani automatycznie z faktur. Dane pobierane z bazy GUS REGON
          </p>
        </div>

        <BulkValidateButton />
      </div>

      {!hasContractors ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] px-8 py-16 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)]">
            <span className="material-symbols-outlined text-[32px] text-[var(--ff-primary)]">
              groups
            </span>
          </div>
          <h3 className="mb-2 text-xl font-bold tracking-tight">
            Brak kontrahentów
          </h3>
          <p className="mx-auto max-w-md text-[15px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Kontrahenci zostaną dodani automatycznie przy wystawianiu pierwszej
            faktury
          </p>
          <Link
            href="/invoices/new"
            className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--ff-primary)] underline-offset-2 transition-colors hover:underline"
          >
            Wystaw fakturę
            <span className="material-symbols-outlined text-[18px] leading-none">
              arrow_forward
            </span>
          </Link>
        </div>
      ) : (
        <div className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <h2 className="text-xl font-bold tracking-tight">Lista kontrahentów</h2>
            <p className="mt-1 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
              {contractors.length} pozycji (max. 200) • sortowanie wg ostatniego
              użycia
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]">
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    NIP
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Nazwa firmy
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Adres
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Email
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Status VAT
                  </th>
                  <th className="px-6 py-3.5 text-center text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Przypomnienia
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Ostatnio użyty
                  </th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((contractor) => (
                  <tr
                    key={contractor.id}
                    className="border-b border-white/6 transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]"
                  >
                    <td className="px-6 py-4 font-mono text-[13px] sm:px-8">
                      {contractor.nip}
                    </td>
                    <td className="px-6 py-4 font-semibold text-[var(--ff-on-surface)] sm:px-8">
                      {contractor.name}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_65%,transparent)] sm:px-8">
                      {contractor.address?.addressLine1 ?? '-'}
                      {contractor.address?.addressLine2 && (
                        <>
                          <br />
                          {contractor.address.addressLine2}
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_65%,transparent)] sm:px-8">
                      {contractor.email ?? '-'}
                    </td>
                    <td className="px-6 py-4 sm:px-8">
                      <VatStatusBadge
                        status={contractor.vat_status ?? 'unknown'}
                        warning={contractor.validation_warning}
                      />
                    </td>
                    <td className="px-6 py-4 text-center sm:px-8">
                      <ContractorReminderToggle
                        contractorId={contractor.id}
                        excluded={contractor.reminder_excluded ?? false}
                      />
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_65%,transparent)] sm:px-8">
                      {contractor.last_used_at
                        ? new Date(contractor.last_used_at).toLocaleDateString(
                            'pl-PL',
                          )
                        : 'Jeszcze nie użyty'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
