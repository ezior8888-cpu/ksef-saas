import { createAdminClient } from '@/lib/supabase/server';
import type { AuditLogEntry } from './log';

/**
 * Wersja logAudit dla kontekstów BEZ HTTP headers
 * (Inngest jobs, cron-y, migracje).
 *
 * Pomija IP; user_agent ustawiony na identyfikator jobu / systemu.
 */
export async function logAuditSystem(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('audit_logs').insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: {
        ...entry.metadata,
        source: 'system',
      },
      ip_address: null,
      user_agent: 'inngest-job',
    });

    if (error) {
      console.error('[audit/system] Failed to log:', error.message, entry);
    }
  } catch (error) {
    console.error('[audit/system] Unexpected error:', error);
  }
}
