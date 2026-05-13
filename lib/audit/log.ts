import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';

async function readRequestClientHints(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const hdrs = await headers();
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      hdrs.get('x-real-ip') ??
      null;
    const userAgent = hdrs.get('user-agent') ?? null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Kanoniczne akcje audytu. Rozszerzaj listę w miarę dodawania features.
 * Nie używaj surowych stringów poza tym unionem.
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.signup'
  | 'auth.password_reset_requested'
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.user_role_changed'
  | 'tenant.ksef_verified'
  | 'tenant.ksef_nip_ownership_claimed'
  | 'invoice.draft_created'
  | 'invoice.draft_updated'
  | 'invoice.draft_deleted'
  | 'invoice.submit_requested'
  | 'invoice.submit_redirected_offline'
  | 'invoice.submit_succeeded'
  | 'invoice.submit_failed'
  | 'invoice.upo_downloaded'
  | 'invoice.xml_downloaded'
  | 'invoice.resubmit_requested'
  | 'ksef.credentials_uploaded'
  | 'ksef.credentials_removed'
  | 'ksef.environment_changed'
  // Faza 23 sekcja 3 — audyt każdej interakcji z KSeF API.
  | 'ksef.session.open'
  | 'ksef.session.close'
  | 'ksef.invoice.send'
  | 'ksef.invoice.poll'
  | 'ksef.upo.download'
  | 'ksef.inbox.poll'
  | 'ksef.auth.token'
  // Faza 24 — admin panel actions.
  | 'admin.user.suspended'
  | 'admin.user.unsuspended'
  | 'admin.user.force_logout'
  | 'admin.user.password_reset_triggered'
  | 'admin.user.deleted'
  | 'admin.note.created'
  | 'admin.note.archived'
  | 'admin.flag.toggled'
  // Faza 25 — Stripe billing lifecycle.
  | 'billing.customer.created'
  | 'billing.checkout.session_created'
  | 'billing.subscription.created'
  | 'billing.subscription.updated'
  | 'billing.subscription.canceled'
  | 'billing.payment.succeeded'
  | 'billing.payment.failed'
  | 'billing.refund.issued'
  | 'billing.trial.will_end'
  | 'billing.vat_invoice.queued'
  | 'accountant.token_created'
  | 'accountant.token_revoked'
  | 'accountant.access_used'
  | 'accountant.portal_export'
  | 'retention.deletion_requested'
  | 'retention.deletion_executed'
  | 'invitation.created'
  | 'invitation.revoked'
  | 'invitation.accepted'
  | 'join_request.created'
  | 'join_request.approved'
  | 'join_request.denied'
  | 'membership.revoked'
  | 'membership.role_changed';

export interface AuditLogEntry {
  action: AuditAction;
  tenantId: string | null;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Zapisuje wpis do audit_logs. Wywołuj z Server Actions po ważnych operacjach.
 *
 * Nie rzuca — przy błędzie audytu główna operacja ma się i tak udać.
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const { ip, userAgent } = await readRequestClientHints();

    const supabase = createAdminClient();
    const { error } = await supabase.from('audit_logs').insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
      ip_address: ip,
      user_agent: userAgent,
    });

    if (error) {
      console.error('[audit] Failed to log:', error.message, entry);
    }
  } catch (error) {
    console.error('[audit] Unexpected error:', error);
  }
}
