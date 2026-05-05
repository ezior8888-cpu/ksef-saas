import { notFound } from 'next/navigation';
import { Eye, Download } from 'lucide-react';

import { AccountantExportButtons } from '@/components/exports/accountant-export-buttons';
import { loadAccountantPortal } from '@/lib/accountant/load-accountant-portal';
import { AccountantInvoiceList } from '@/components/accountant/invoice-list';

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
    <div className="min-h-screen bg-mesh-surface p-4 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header card */}
        <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/62 dark:bg-[rgba(15,10,30,0.62)] backdrop-blur-[40px] shadow-[0_16px_48px_0_rgba(31,38,135,0.12)] p-8 lg:p-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Faktury udostępnione przez
              </p>
              <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight">
                {tenant?.name}
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                NIP: {tenant?.nip}
              </p>
            </div>
            <div className="text-right space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/5 border border-white/55 dark:border-white/14 text-xs font-medium">
                {access.access_level === 'download' ? (
                  <>
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Z pobieraniem</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Tylko podgląd</span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Dostęp dla:{' '}
                <span className="font-medium text-foreground">{access.accountant_name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Wygasa: {new Date(access.expires_at).toLocaleDateString('pl-PL')}
              </p>
            </div>
          </div>
        </div>

        {access.access_level === 'download' ? (
          <section className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-6">
            <h2 className="text-lg font-display font-semibold mb-4 tracking-tighter-text">
              Pobierz dane księgowe
            </h2>
            <AccountantExportButtons
              tenantId={access.tenant_id}
              accessToken={rawToken}
            />
          </section>
        ) : null}

        <AccountantInvoiceList
          invoices={invoices ?? []}
          canDownload={access.access_level === 'download'}
          token={rawToken}
        />

        <div className="text-center pt-4 pb-2">
          <p className="text-xs text-muted-foreground">Powered by KSeF SaaS</p>
        </div>
      </div>
    </div>
  );
}
