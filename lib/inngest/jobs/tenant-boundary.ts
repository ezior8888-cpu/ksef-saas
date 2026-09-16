import { NonRetriableError } from 'inngest';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const jobIdentity = z.object({ id: z.string().uuid(), tenantId: z.string().uuid() });

export function assertJobIdentity(id: unknown, tenantId: unknown): void {
  if (!jobIdentity.safeParse({ id, tenantId }).success) {
    throw new NonRetriableError('Niepoprawna tożsamość zadania');
  }
}

export class InvoiceTenantMismatchError extends NonRetriableError {
  constructor() { super('Faktura nie należy do organizacji zadania'); }
}

/** A trusted transport does not make two independent IDs refer to the same tenant. */
export async function requireInvoiceTenant(invoiceId: string, tenantId: string): Promise<void> {
  assertJobIdentity(invoiceId, tenantId);
  const { data, error } = await createAdminClient().from('invoices')
    .select('id, tenant_id').eq('id', invoiceId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw new Error('Nie można sprawdzić organizacji faktury');
  if (!data || data.id !== invoiceId || data.tenant_id !== tenantId) {
    throw new InvoiceTenantMismatchError();
  }
}

export async function requireImportJobTenant(
  importJobId: string, tenantId: string, source?: string, filePath?: string,
): Promise<void> {
  assertJobIdentity(importJobId, tenantId);
  const { data, error } = await createAdminClient().from('import_jobs')
    .select('id, tenant_id, source, source_file_path')
    .eq('id', importJobId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw new Error('Nie można sprawdzić organizacji importu');
  if (!data || data.id !== importJobId || data.tenant_id !== tenantId ||
      (source !== undefined && data.source !== source) ||
      (filePath !== undefined && data.source_file_path !== filePath)) {
    throw new NonRetriableError('Import nie należy do organizacji lub źródła zadania');
  }
}

export async function requireTenantMember(userId: string, tenantId: string): Promise<void> {
  assertJobIdentity(userId, tenantId);
  const { data, error } = await createAdminClient().from('memberships')
    .select('user_id').eq('user_id', userId).eq('organization_id', tenantId)
    .eq('status', 'active').maybeSingle();
  if (error) throw new Error('Nie można sprawdzić odbiorcy zadania');
  if (!data || data.user_id !== userId) {
    throw new NonRetriableError('Odbiorca nie należy do organizacji zadania');
  }
}
