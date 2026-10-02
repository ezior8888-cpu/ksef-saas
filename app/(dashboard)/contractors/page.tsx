import { ResponsiveTable, ResponsiveTableCard } from '@/components/dashboard/responsive-table';
import Link from 'next/link';

import { BulkValidateButton } from '@/components/validation/bulk-validate-button';
import { VatStatusBadge } from '@/components/validation/vat-status-badge';
import { ContractorReminderToggle } from '@/components/reminders/contractor-reminder-toggle';
import { ContractorRowActions } from '@/components/contractors/contractor-row-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { contractorSearchFilter } from '@/lib/contractors/edit';
import { sanitizeSearch } from '@/lib/invoices/list-query';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, tenantId } = await getPageContext();
  const sp = (await searchParams) ?? {};
  const q = sanitizeSearch(Array.isArray(sp.q) ? sp.q[0] ?? '' : sp.q ?? '');

  // Wyszukiwanie po nazwie i NIP w bazie, nie na załadowanej stronie (F-011).
  let query = supabase
    .from('contractors')
    .select(
      'id, nip, name, address, email, vat_status, last_validation_at, validation_warning, last_used_at, reminder_excluded, reminder_exclusion_reason'
    )
    .eq('tenant_id', tenantId);
  const search = contractorSearchFilter(q);
  if (search) query = query.or(search);
  const { data: contractors } = await query
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(200);

  const hasContractors = contractors && contractors.length > 0;

  return (
    <div className="space-y-8 pb-10 text-[var(--ff-on-surface)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
            Kontrahenci
          </h1>
          <p className="text-sm text-[var(--ff-text-muted)]">
            Zapisani automatycznie z faktur. Dane pobierane z bazy GUS REGON
          </p>
        </div>

        <BulkValidateButton />
      </div>

      <form method="get" action="/contractors" className="ff-glass-pane flex flex-wrap items-end gap-3 rounded-[var(--ff-radius-lg)] p-4">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] font-semibold text-[var(--ff-text-muted)]">
          Szukaj
          <Input name="q" defaultValue={q} placeholder="Nazwa albo NIP" />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="glass-primary">Szukaj</Button>
          {q && (
            <Button asChild variant="outline">
              <Link href="/contractors">Wyczyść</Link>
            </Button>
          )}
        </div>
      </form>

      {!hasContractors && q ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] px-8 py-12 text-center text-sm text-[var(--ff-text-muted)]">
          Brak kontrahentów dla „{q}”.
        </div>
      ) : !hasContractors ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] px-8 py-16 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)]">
            <span className="material-symbols-outlined text-[32px] text-[var(--ff-primary)]">
              groups
            </span>
          </div>
          <h3 className="mb-2 text-xl font-bold tracking-tight">
            Brak kontrahentów
          </h3>
          <p className="mx-auto max-w-md text-sm text-[var(--ff-text-muted)]">
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
        <ResponsiveTable
          title="Lista kontrahentów"
          subtitle={`${contractors.length} pozycji (max. 200) • sortowanie wg ostatniego użycia`}
          table={
            <table className="w-full min-w-[880px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--ff-border)]">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    NIP
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Nazwa firmy
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Adres
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Email
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Status VAT
                  </th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Przypomnienia
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Ostatnio użyty
                  </th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((contractor) => (
                  <tr
                    key={contractor.id}
                    className="border-b border-[var(--ff-row-divider)] transition-colors last:border-0 hover:bg-[var(--ff-row-hover)]"
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
                    <td className="px-6 py-4 sm:px-8">
                      <ContractorRowActions contractor={contractor} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          cards={contractors.map((contractor) => (
            <ResponsiveTableCard
              key={contractor.id}
              title={contractor.name}
              subtitle={`NIP ${contractor.nip}`}
              meta={
                <>
                  <VatStatusBadge
                    status={contractor.vat_status ?? 'unknown'}
                    warning={contractor.validation_warning}
                  />
                  <span>
                    {contractor.last_used_at
                      ? `Ostatnio: ${new Date(contractor.last_used_at).toLocaleDateString('pl-PL')}`
                      : 'Jeszcze nie użyty'}
                  </span>
                </>
              }
              actions={
                <>
                  <ContractorReminderToggle
                    contractorId={contractor.id}
                    excluded={contractor.reminder_excluded ?? false}
                  />
                  <ContractorRowActions contractor={contractor} />
                </>
              }
            />
          ))}
        />
      )}
    </div>
  );
}
