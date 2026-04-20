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
  | 'invoice.draft_created'
  | 'invoice.draft_updated'
  | 'invoice.draft_deleted'
  | 'invoice.submit_requested'
  | 'invoice.submit_succeeded'
  | 'invoice.submit_failed'
  | 'invoice.xml_downloaded'
  | 'invoice.resubmit_requested'
  | 'ksef.credentials_uploaded'
  | 'ksef.credentials_removed'
  | 'ksef.environment_changed'
  | 'accountant.token_created'
  | 'accountant.token_revoked'
  | 'accountant.access_used'
  | 'retention.deletion_requested'
  | 'retention.deletion_executed';

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
