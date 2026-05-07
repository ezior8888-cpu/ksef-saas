'use server';

import { X509Certificate } from 'node:crypto';

import { logAudit } from '@/lib/audit/log';
import { authenticateWithXades } from '@/lib/ksef/auth';
import { encryptCredentials } from '@/lib/ksef/credentials-crypto';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { bufferToByteaLiteral } from '@/lib/supabase/bytea';
import { revalidatePath } from 'next/cache';

export async function uploadCertificateAction(data: {
  certPem: string;
  keyPem: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Brak sesji' };

    const tenantId = await getActiveOrgIdFromCookies();
    if (!tenantId) {
      return { success: false, error: 'Brak aktywnej organizacji' };
    }

    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('nip')
      .eq('id', tenantId)
      .single();

    const nip = tenantRow?.nip;
    if (!nip) return { success: false, error: 'Brak NIP' };

    const env =
      (process.env.KSEF_ENV as 'test' | 'demo' | 'production' | undefined) ??
      'test';

    try {
      await authenticateWithXades(
        {
          type: 'xades',
          nip,
          certificatePem: data.certPem,
          privateKeyPem: data.keyPem,
        },
        env
      );
    } catch (error) {
      return {
        success: false,
        error: `Certyfikat nie działa z KSeF: ${
          error instanceof Error ? error.message : 'nieznany błąd'
        }`,
      };
    }

    let expiryDate: Date | null = null;
    try {
      const cert = new X509Certificate(data.certPem);
      expiryDate = new Date(cert.validTo);
      if (Number.isNaN(expiryDate.getTime())) expiryDate = null;
    } catch {
      expiryDate = null;
    }

    const encrypted = encryptCredentials({
      type: 'xades',
      nip,
      certificatePem: data.certPem,
      privateKeyPem: data.keyPem,
    });

    const admin = createAdminClient();
    const { data: tenantBefore } = await admin
      .from('tenants')
      .select('ksef_verified_at')
      .eq('id', tenantId)
      .maybeSingle();

    const { error: updErr } = await admin
      .from('tenants')
      .update({
        ksef_credentials_encrypted: bufferToByteaLiteral(encrypted),
        ksef_certificate_expiry: expiryDate?.toISOString() ?? null,
        // Pierwsza udana autoryzacja w KSeF dla tej org = sygnał ownership.
        // Nie nadpisujemy istniejącej wartości — claim raz nadany trzymamy.
        ...(tenantBefore?.ksef_verified_at
          ? {}
          : {
              ksef_verified_at: new Date().toISOString(),
              ksef_authority_user_id: user.id,
            }),
      })
      .eq('id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    await logAudit({
      action: 'ksef.credentials_uploaded',
      tenantId,
      userId: user.id,
      metadata: {
        certificateExpiry: expiryDate?.toISOString(),
        environment: process.env.KSEF_ENV ?? 'test',
      },
    });

    if (!tenantBefore?.ksef_verified_at) {
      await logAudit({
        action: 'tenant.ksef_verified',
        tenantId,
        userId: user.id,
        metadata: { method: 'xades', environment: process.env.KSEF_ENV ?? 'test' },
      });
    }

    revalidatePath('/settings/ksef');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Błąd',
    };
  }
}
