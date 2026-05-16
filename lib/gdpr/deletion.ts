import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * 14 dni cooling-off — ustalone w Q2 planowania Fazy 28. User dostaje email
 * z linkiem cancel, ma czas na zmianę decyzji.
 */
export const GDPR_COOLING_OFF_DAYS = 14;

interface GdprRequestRow {
  id: string;
  user_id: string | null;
  user_email: string;
  requested_at: string;
  scheduled_for: string;
  status: 'pending' | 'canceled' | 'executed' | 'failed';
  cancel_token: string;
  executed_at: string | null;
  failure_reason: string | null;
  cancel_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface GdprTable {
  from: (n: 'gdpr_deletion_requests') => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        maybeSingle: () => Promise<{
          data: GdprRequestRow | null;
          error: { message: string } | null;
        }>;
        order: (
          k: string,
          opts?: { ascending: boolean },
        ) => Promise<{
          data: GdprRequestRow[] | null;
          error: { message: string } | null;
        }>;
      };
      lte: (
        k: string,
        v: string,
      ) => Promise<{
        data: GdprRequestRow[] | null;
        error: { message: string } | null;
      }>;
    };
    insert: (rows: Array<Partial<GdprRequestRow>>) => {
      select: (c: string) => {
        maybeSingle: () => Promise<{
          data: GdprRequestRow | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (patch: Partial<GdprRequestRow>) => {
      eq: (
        k: string,
        v: string,
      ) => Promise<{
        data: GdprRequestRow | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export interface CreateGdprRequestInput {
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreatedGdprRequest {
  id: string;
  scheduledFor: Date;
  cancelToken: string;
}

/**
 * Tworzy GDPR deletion request. Sprawdza, czy user nie ma już pending
 * requestu — jeśli tak, zwraca istniejący (idempotency).
 */
export async function createGdprRequest(
  input: CreateGdprRequestInput,
): Promise<CreatedGdprRequest> {
  const admin = createAdminClient() as unknown as GdprTable;

  // Idempotency: jeśli istnieje pending request dla usera, zwróć go zamiast
  // tworzyć duplikat (user kliknął dwa razy / refresh).
  const existing = await admin
    .from('gdpr_deletion_requests')
    .select('id, scheduled_for, cancel_token, status')
    .eq('user_id', input.userId)
    .order('requested_at', { ascending: false });

  const pending = existing.data?.find((r) => r.status === 'pending');
  if (pending) {
    return {
      id: pending.id,
      scheduledFor: new Date(pending.scheduled_for),
      cancelToken: pending.cancel_token,
    };
  }

  const cancelToken = randomBytes(32).toString('hex');
  const scheduledFor = new Date(
    Date.now() + GDPR_COOLING_OFF_DAYS * 24 * 60 * 60 * 1000,
  );

  const ins = await admin
    .from('gdpr_deletion_requests')
    .insert([
      {
        user_id: input.userId,
        user_email: input.userEmail,
        scheduled_for: scheduledFor.toISOString(),
        cancel_token: cancelToken,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
      },
    ])
    .select('id, scheduled_for, cancel_token')
    .maybeSingle();

  if (ins.error || !ins.data) {
    throw new Error(`gdpr_request_insert_failed: ${ins.error?.message}`);
  }

  return {
    id: ins.data.id,
    scheduledFor: new Date(ins.data.scheduled_for),
    cancelToken: ins.data.cancel_token,
  };
}

export async function cancelGdprRequest(
  cancelToken: string,
  reason: string | null,
): Promise<{ ok: boolean; userEmail?: string }> {
  const admin = createAdminClient() as unknown as GdprTable;

  const find = await admin
    .from('gdpr_deletion_requests')
    .select('id, user_email, status, cancel_token')
    .eq('cancel_token', cancelToken)
    .maybeSingle();

  if (find.error || !find.data) return { ok: false };
  if (find.data.status !== 'pending') return { ok: false };

  const upd = await admin
    .from('gdpr_deletion_requests')
    .update({ status: 'canceled', cancel_reason: reason ?? null })
    .eq('id', find.data.id);

  if (upd.error) return { ok: false };
  return { ok: true, userEmail: find.data.user_email };
}

/**
 * Wykonuje delete dla wszystkich pending requestów z `scheduled_for <= now()`.
 * Wywoływane przez Inngest cron co godzinę.
 */
export async function findDueGdprRequests(): Promise<GdprRequestRow[]> {
  const admin = createAdminClient() as unknown as GdprTable;
  const now = new Date().toISOString();
  const res = await admin
    .from('gdpr_deletion_requests')
    .select('id, user_id, user_email, scheduled_for, status, cancel_token')
    .lte('scheduled_for', now);

  return (res.data ?? []).filter((r) => r.status === 'pending');
}

/**
 * Hard delete dla pojedynczego pending requestu.
 *
 * Kolejność:
 *   1. Anonimizacja audit_logs (user_id NULL, ip_address NULL).
 *   2. Delete memberships (CASCADE z auth.users, ale robimy jawnie).
 *   3. supabase.auth.admin.deleteUser() — kaskadowo zruje public.users,
 *      mfa_recovery_codes, push_subscriptions, email_preferences.
 *   4. UPDATE status='executed' lub 'failed' z reason.
 */
export async function executeGdprRequest(requestId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const admin = createAdminClient();

  // 1. Załaduj request
  const findRes = await (admin as unknown as GdprTable)
    .from('gdpr_deletion_requests')
    .select('id, user_id, user_email, status')
    .eq('id', requestId)
    .maybeSingle();

  if (findRes.error || !findRes.data) {
    return { ok: false, error: 'request_not_found' };
  }
  if (findRes.data.status !== 'pending') {
    return { ok: false, error: 'not_pending' };
  }
  const userId = findRes.data.user_id;
  if (!userId) {
    return { ok: false, error: 'user_id_missing' };
  }

  try {
    // 2. Anonimizuj audit_logs przez RPC z opt-in dla append-only trigger
    //    (migracja 00052). Bez tego trigger zablokowałby UPDATE.
    const anonRpc = await (
      admin.rpc as unknown as (
        fn: 'anonymize_user_audit_logs',
        args: { p_user_id: string },
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )('anonymize_user_audit_logs', { p_user_id: userId });
    if (anonRpc.error) {
      throw new Error(`audit_anonymize_failed: ${anonRpc.error.message}`);
    }

    // 3. Hard-delete usera w Supabase Auth → kaskaduje do public.users
    //    przez FK w pozostałych tabelach (memberships, mfa_recovery_codes,
    //    push_subscriptions, email_preferences mają ON DELETE CASCADE).
    const { error: authDelErr } = await admin.auth.admin.deleteUser(userId);
    if (authDelErr) {
      throw new Error(`auth_delete_failed: ${authDelErr.message}`);
    }

    // 4. Mark executed (user_id już NULL bo ON DELETE SET NULL).
    await (admin as unknown as GdprTable)
      .from('gdpr_deletion_requests')
      .update({
        status: 'executed',
        executed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    await (admin as unknown as GdprTable)
      .from('gdpr_deletion_requests')
      .update({ status: 'failed', failure_reason: msg })
      .eq('id', requestId);
    return { ok: false, error: msg };
  }
}
