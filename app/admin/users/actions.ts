'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/admin-guard';
import { logAuditSystem } from '@/lib/audit/log-system';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Server actions dla `/admin/users/[userId]` (Faza 24).
 *
 * Każda akcja:
 *   1. Wywołuje `requireAdmin()` na początku (defense-in-depth — strona
 *      sama też jest pre-guarded przez layout, ale akcja może być
 *      teoretycznie wywołana z innej strony).
 *   2. Robi operację przez `createAdminClient` (service_role).
 *   3. Zapisuje audyt do `audit_logs` z prefixem `admin.*`.
 *   4. `revalidatePath` żeby UI dostał świeże dane bez F5.
 *
 * Discriminated result zamiast rzucania — UI klient odbiera `success: false`
 * i pokazuje toast/banner.
 */

export type AdminActionResult =
  | { success: true; message?: string }
  | { success: false; error: string };

const NOT_FOUND_ERR = { success: false, error: 'User nie istnieje' } as const;

// ─── 1. Suspend / Unsuspend ─────────────────────────────────────────

export async function suspendUserAction(
  userId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (admin.userId === userId) {
    return { success: false, error: 'Nie możesz zawiesić własnego konta' };
  }

  const supabase = createAdminClient();
  // `ban_duration` w Supabase admin API: '24h' / '7d' / 'forever' / '0s' (unban).
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: '876000h', // 100 lat — de facto forever, bez końcowej daty Y10K
  });
  if (error) {
    return { success: false, error: error.message };
  }

  // Force-logout wszędzie — bez tego user może dalej używać aktywnej sesji
  // do końca jej TTL (1h dla session, 1y dla refresh token).
  await supabase.auth.admin.signOut(userId, 'global');

  await logAuditSystem({
    action: 'admin.user.suspended',
    tenantId: null,
    userId: admin.userId,
    entityType: 'user',
    entityId: userId,
    metadata: { adminEmail: admin.email, action: 'ban + global signout' },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');

  return { success: true, message: 'User zawieszony + wszystkie sesje usunięte' };
}

export async function unsuspendUserAction(
  userId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const supabase = createAdminClient();

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });
  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditSystem({
    action: 'admin.user.unsuspended',
    tenantId: null,
    userId: admin.userId,
    entityType: 'user',
    entityId: userId,
    metadata: { adminEmail: admin.email },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');

  return { success: true, message: 'User odblokowany' };
}

// ─── 2. Force logout ────────────────────────────────────────────────

export async function forceLogoutAction(
  userId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const supabase = createAdminClient();

  const { error } = await supabase.auth.admin.signOut(userId, 'global');
  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditSystem({
    action: 'admin.user.force_logout',
    tenantId: null,
    userId: admin.userId,
    entityType: 'user',
    entityId: userId,
    metadata: { adminEmail: admin.email },
  });

  revalidatePath(`/admin/users/${userId}`);
  return { success: true, message: 'Wszystkie sesje usunięte' };
}

// ─── 3. Password reset trigger ──────────────────────────────────────

export async function sendPasswordResetAction(
  userId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const supabase = createAdminClient();

  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(
    userId,
  );
  if (userErr || !userData.user.email) {
    return NOT_FOUND_ERR;
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback?next=/dashboard`;
  const { error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: userData.user.email,
    options: { redirectTo },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditSystem({
    action: 'admin.user.password_reset_triggered',
    tenantId: null,
    userId: admin.userId,
    entityType: 'user',
    entityId: userId,
    metadata: { adminEmail: admin.email, targetEmail: userData.user.email },
  });

  revalidatePath(`/admin/users/${userId}`);
  return {
    success: true,
    message: `Link reset wysłany na ${userData.user.email}`,
  };
}

// ─── 4. GDPR delete ─────────────────────────────────────────────────

export async function deleteUserGdprAction(
  userId: string,
  confirmation: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (admin.userId === userId) {
    return { success: false, error: 'Nie możesz usunąć własnego konta tym kanałem' };
  }
  if (confirmation !== 'DELETE') {
    return {
      success: false,
      error: 'Wymagane potwierdzenie — wpisz dokładnie DELETE',
    };
  }

  const supabase = createAdminClient();

  // Krok 1: ustaw soft-delete + hard_delete_at na tenantach, gdzie user jest
  // ownerem (10-lat retention vs RODO). Pełne czyszczenie zrobi Inngest job
  // `retention-delete` po upływie retention period.
  const { data: ownerMemberships } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('role', 'owner');

  const ownerOrgIds = (ownerMemberships ?? []).map((m) => m.organization_id);
  if (ownerOrgIds.length > 0) {
    const now = new Date();
    const hardDeleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dni
    await supabase
      .from('tenants')
      .update({
        deleted_at: now.toISOString(),
        hard_delete_at: hardDeleteAt.toISOString(),
        is_active: false,
      })
      .in('id', ownerOrgIds);
  }

  // Krok 2: usuń wszystkie membership usera (revoked).
  await supabase
    .from('memberships')
    .update({ revoked_at: new Date().toISOString(), status: 'revoked' })
    .eq('user_id', userId);

  // Krok 3: usuń konto z auth.users (cascada wpieprza notki, kontrahentów
  // gdzie user był created_by, etc.). Audyt zachowuje user_id w `audit_logs`
  // (snapshot ID po deletion).
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditSystem({
    action: 'admin.user.deleted',
    tenantId: null,
    userId: admin.userId,
    entityType: 'user',
    entityId: userId,
    metadata: {
      adminEmail: admin.email,
      ownedOrgsSoftDeleted: ownerOrgIds.length,
      gdprDeletion: true,
    },
  });

  revalidatePath('/admin/users');
  return {
    success: true,
    message: 'User usunięty, org-y w retencji 30 dni do hard delete',
  };
}

// ─── 5. Internal notes — CRUD ───────────────────────────────────────

export async function addUserNoteAction(
  userId: string,
  body: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 5000) {
    return { success: false, error: 'Notatka musi mieć 1-5000 znaków' };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('admin_user_notes').insert({
    user_id: userId,
    author_user_id: admin.userId,
    author_email: admin.email,
    body: trimmed,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditSystem({
    action: 'admin.note.created',
    tenantId: null,
    userId: admin.userId,
    entityType: 'user',
    entityId: userId,
    metadata: { adminEmail: admin.email, bodyPreview: trimmed.slice(0, 80) },
  });

  revalidatePath(`/admin/users/${userId}`);
  return { success: true };
}

export async function archiveUserNoteAction(
  noteId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const supabase = createAdminClient();

  const { data: note, error: selErr } = await supabase
    .from('admin_user_notes')
    .select('user_id')
    .eq('id', noteId)
    .single();

  if (selErr || !note) {
    return { success: false, error: 'Notatka nie istnieje' };
  }

  const { error } = await supabase
    .from('admin_user_notes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', noteId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditSystem({
    action: 'admin.note.archived',
    tenantId: null,
    userId: admin.userId,
    entityType: 'admin_user_notes',
    entityId: noteId,
    metadata: { adminEmail: admin.email, targetUserId: note.user_id },
  });

  revalidatePath(`/admin/users/${note.user_id}`);
  return { success: true };
}
