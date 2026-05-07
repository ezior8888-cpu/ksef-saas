'use server';

import { X509Certificate } from 'node:crypto';

import { logAudit } from '@/lib/audit/log';
import { authenticateWithXades } from '@/lib/ksef/auth';
import { encryptCredentials } from '@/lib/ksef/credentials-crypto';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { bufferToByteaLiteral } from '@/lib/supabase/bytea';
import { revalidatePath } from 'next/cache';

/** Wynik wgrywania certyfikatu KSeF (claim NIP jest atomowy w DB). */
export type UploadCertificateResult =
  | {
      success: true;
      wasFirstClaim: boolean;
      message: string;
    }
  | {
      success: false;
      error: string;
      code?: 'NIP_ALREADY_CLAIMED';
    };

export async function uploadCertificateAction(data: {
  certPem: string;
  keyPem: string;
}): Promise<UploadCertificateResult> {
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

    // Atomowy claim NIP (partial unique index + claim_ksef_nip_ownership).
    // WAŻNE: wywołanie MUSI iść przez klienta z sesją użytkownika (JWT),
    // nie przez createAdminClient — w przeciwnym razie auth.uid() w RPC
    // jest NULL i claim się nie powiedzie.
    const { data: claimResult, error: claimErr } = await supabase.rpc(
      'claim_ksef_nip_ownership',
      { p_tenant_id: tenantId },
    );

    if (claimErr) {
      return {
        success: false,
        error: `Błąd bazy danych przy weryfikacji własności NIP: ${claimErr.message}`,
      };
    }

    if (claimResult === 'already_claimed_by_other') {
      return {
        success: false,
        code: 'NIP_ALREADY_CLAIMED',
        error:
          'Ten NIP jest już zweryfikowany przez inną organizację w FaktFlow. Jeśli uważasz, że to błąd, skontaktuj się z supportem: support@ksef-saas.pl',
      };
    }

    const wasFirstClaim = claimResult === 'claimed';

    const admin = createAdminClient();
    const { error: updErr } = await admin
      .from('tenants')
      .update({
        ksef_credentials_encrypted: bufferToByteaLiteral(encrypted),
        ksef_certificate_expiry: expiryDate?.toISOString() ?? null,
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

    if (claimResult === 'claimed') {
      await logAudit({
        action: 'tenant.ksef_nip_ownership_claimed',
        tenantId,
        userId: user.id,
        metadata: {
          nip,
          method: 'xades',
          environment: process.env.KSEF_ENV ?? 'test',
        },
      });
      await logAudit({
        action: 'tenant.ksef_verified',
        tenantId,
        userId: user.id,
        metadata: { method: 'xades', environment: process.env.KSEF_ENV ?? 'test' },
      });
    }

    revalidatePath('/settings/ksef');
    return {
      success: true,
      wasFirstClaim,
      message: wasFirstClaim
        ? 'Certyfikat zapisany. Twoja organizacja jest teraz zweryfikowanym właścicielem tego NIP-u w FaktFlow (claim KSeF).'
        : 'Certyfikat zaktualizowany.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Błąd',
    };
  }
}
