import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { CertificateUpload } from '@/components/settings/certificate-upload';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function KsefSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (!userData?.tenant_id) redirect('/onboarding');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, nip, ksef_credentials_encrypted, ksef_certificate_expiry')
    .eq('id', userData.tenant_id)
    .single();

  const hasCredentials = !!tenant?.ksef_credentials_encrypted;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Ustawienia KSeF</h1>

      <Card className="p-6 mb-6">
        <h2 className="font-semibold mb-2">Status połączenia</h2>
        {hasCredentials ? (
          <div className="flex items-center gap-2 text-green-700">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span>Skonfigurowano certyfikat dla NIP {tenant?.nip}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-700">
            <div className="w-2 h-2 bg-amber-500 rounded-full" />
            <span>Brak certyfikatu — nie możesz wysyłać faktur do KSeF</span>
          </div>
        )}

        {tenant?.ksef_certificate_expiry && (
          <p className="text-xs text-gray-500 mt-2">
            Certyfikat ważny do:{' '}
            {new Date(tenant.ksef_certificate_expiry).toLocaleDateString(
              'pl-PL'
            )}
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">Wgrywanie certyfikatu KSeF</h2>
        <div className="prose prose-sm text-gray-600 mb-4">
          <p>Potrzebujesz:</p>
          <ul>
            <li>
              Certyfikatu KSeF typu 1 (uwierzytelnianie) — pobierz z Modułu
              Certyfikatów w Aplikacji Podatnika KSeF
            </li>
            <li>Klucza prywatnego (plik .pem lub .key)</li>
          </ul>
          <p className="text-xs">
            Certyfikat i klucz zostaną zaszyfrowane AES-256-GCM i zapisane
            wyłącznie w naszej bazie we Frankfurcie. Nigdy nie opuszczają
            infrastruktury RODO-compliant.
          </p>
        </div>

        <CertificateUpload />
      </Card>
    </div>
  );
}
