import { notFound } from 'next/navigation';

import { loadAccountantPortal } from '@/lib/accountant/load-accountant-portal';

export const dynamic = 'force-dynamic';

export default async function AccountantPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenParam } = await params;
  const rawToken = decodeURIComponent(tokenParam);
  const data = await loadAccountantPortal(rawToken);
  if (!data) notFound();

  const { access, tenant, invoices } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Portal księgowy
        </p>
        <h1 className="text-2xl font-bold mt-1">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          NIP {tenant.nip} · zaproszenie dla {access.accountant_name} (
          {access.accountant_email})
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Poziom:{' '}
          {access.access_level === 'download'
            ? 'podgląd + pobieranie'
            : 'tylko podgląd'}
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">Faktury</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak faktur w bazie.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b text-left">
                <tr>
                  <th className="px-3 py-2">Numer</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Brutto</th>
                  <th className="px-3 py-2">Status KSeF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {inv.internal_number ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(inv.issue_date).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="px-3 py-2">
                      {inv.gross_total != null
                        ? Number(inv.gross_total).toFixed(2)
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {inv.ksef_status ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        To tylko podgląd danych klienta. Nie logujesz się na konto firmy w
        aplikacji.
      </p>
    </div>
  );
}
