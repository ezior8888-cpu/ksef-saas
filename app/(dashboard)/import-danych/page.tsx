import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

export default async function ImportDanychPage() {
  const { supabase, tenantId } = await getPageContext();

  if (!tenantId) {
    return (
      <div className="space-y-8 pb-6 text-[var(--ff-on-surface)]">
        <div>
          <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
            Import danych
          </h1>
          <p className="mt-2 text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
            Magiczny import historii z KSeF — ten sam krok co w ustawieniach KSeF.
          </p>
        </div>
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] p-6 text-center text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_58%,transparent)]">
          Import uruchomisz po założeniu organizacji i konfiguracji certyfikatu KSeF.
        </div>
      </div>
    );
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, nip, ksef_credentials_encrypted')
    .eq('id', tenantId)
    .single();

  const hasCredentials = !!tenant?.ksef_credentials_encrypted;

  return (
    <div className="space-y-8 pb-6 text-[var(--ff-on-surface)]">
      <div>
        <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
          Import danych
        </h1>
        <p className="mt-2 text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
          Magiczny import historii z KSeF — ten sam krok co w ustawieniach KSeF.
        </p>
      </div>

      <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)] sm:mx-0">
            <Sparkles className="h-6 w-6 text-[var(--ff-primary)]" />
          </div>
          <div className="flex-1 space-y-4 text-center sm:text-left">
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                Magiczny Import historii
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[color-mix(in_srgb,var(--ff-on-surface-variant)_58%,transparent)]">
                Pobierz faktury z KSeF w wybranym zakresie i uzupełnij kartotekę
                kontrahentów oraz produktów bez ręcznego przepisywania.
              </p>
            </div>
            {hasCredentials ? (
              <Button asChild variant="glass-primary" size="lg" className="w-full sm:w-auto">
                <Link
                  href={`/onboarding/magic-import?tenantId=${encodeURIComponent(tenantId)}`}
                >
                  <Sparkles className="mr-2 h-4 w-4 shrink-0" />
                  Rozpocznij Magiczny Import
                </Link>
              </Button>
            ) : (
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 p-4 text-left text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_75%,transparent)]">
                Aby uruchomić import, najpierw wgraj certyfikat KSeF w{' '}
                <Link
                  href="/settings/ksef"
                  className="font-semibold text-[var(--ff-primary)] underline underline-offset-2"
                >
                  ustawieniach KSeF
                </Link>
                .
              </div>
            )}
          </div>
        </div>
      </div>

      {tenant?.nip ? (
        <p className="text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
          Aktywna organizacja: <span className="font-medium">{tenant.name}</span>{' '}
          · NIP <span className="font-mono">{tenant.nip}</span>
        </p>
      ) : null}
    </div>
  );
}
