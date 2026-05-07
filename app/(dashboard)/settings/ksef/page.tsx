import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Lock, Sparkles } from 'lucide-react';

import { CertificateUpload } from '@/components/settings/certificate-upload';
import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

export default async function KsefSettingsPage() {
  const { supabase, tenantId } = await getPageContext();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, nip, ksef_credentials_encrypted, ksef_certificate_expiry')
    .eq('id', tenantId)
    .single();

  const hasCredentials = !!tenant?.ksef_credentials_encrypted;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Ustawienia KSeF
        </h1>
        <p className="mt-2 text-muted-foreground">
          Skonfiguruj certyfikat do podpisywania faktur
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-6">
        {hasCredentials ? (
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Skonfigurowano połączenie</p>
              <p className="text-sm text-muted-foreground">
                NIP: <span className="font-mono">{tenant?.nip}</span>
              </p>
              {tenant?.ksef_certificate_expiry && (
                <p className="text-xs text-muted-foreground mt-1">
                  Certyfikat ważny do:{' '}
                  {new Date(tenant.ksef_certificate_expiry).toLocaleDateString('pl-PL')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Brak certyfikatu</p>
              <p className="text-sm text-muted-foreground">
                Wgraj certyfikat aby móc wysyłać faktury do KSeF
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Upload card */}
      <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-6 lg:p-8 space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Wgrywanie certyfikatu
          </h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Potrzebujesz certyfikatu KSeF typu 1 (uwierzytelnianie) — pobierz go
            z Modułu Certyfikatów w Aplikacji Podatnika KSeF.
          </p>
        </div>
        <div className="rounded-2xl bg-blue-500/5 border border-blue-500/20 p-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground leading-relaxed">
            Certyfikat i klucz prywatny są szyfrowane AES-256-GCM i przechowywane
            wyłącznie we Frankfurcie (RODO).
          </p>
        </div>
        <CertificateUpload />
      </div>

      <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-6 lg:p-8 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-purple-500/15 to-blue-500/15 flex items-center justify-center shrink-0 mx-auto sm:mx-0">
            <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 space-y-4 text-center sm:text-left">
            <div>
              <h2 className="text-lg font-display font-semibold tracking-tighter-text">
                Magiczny Import historii
              </h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Pobierz faktury z KSeF w wybranym zakresie i uzupełnij kartotekę kontrahentów oraz
                produktów bez ręcznego przepisywania.
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
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 backdrop-blur-glass-sm p-4 text-sm text-muted-foreground text-left">
                Aby uruchomić import, najpierw wgraj certyfikat powyżej — KSeF wymaga
                uwierzytelnienia przy pobieraniu historii.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
