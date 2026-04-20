'use server';

import { X509Certificate } from 'node:crypto';

import { logAudit } from '@/lib/audit/log';
import { authenticateWithXades } from '@/lib/ksef/auth';
import { encryptCredentials } from '@/lib/ksef/credentials-crypto';
import { createAdminClient, createClient } from '@/lib/supabase/server';
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

    const { data: userData } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!userData?.tenant_id) return { success: false, error: 'Brak tenanta' };

    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('nip')
      .eq('id', userData.tenant_id)
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
    const { error: updErr } = await admin
      .from('tenants')
      .update({
        ksef_credentials_encrypted: bufferToByteaLiteral(encrypted),
        ksef_certificate_expiry: expiryDate?.toISOString() ?? null,
      })
      .eq('id', userData.tenant_id);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    await logAudit({
      action: 'ksef.credentials_uploaded',
      tenantId: userData.tenant_id,
      userId: user.id,
      metadata: {
        certificateExpiry: expiryDate?.toISOString(),
        environment: process.env.KSEF_ENV ?? 'test',
      },
    });

    revalidatePath('/settings/ksef');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Błąd',
    };
  }
}
