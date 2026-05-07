'use server';

import { createHash, randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { logAudit } from '@/lib/audit/log';
import { sendEmail } from '@/lib/email/send';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE, isUuid } from '@/lib/supabase/active-org';
import {
  ActionAuthError,
  requireOrgRole,
  type UserRole,
} from '@/lib/supabase/auth-context';

// ═══════════════════════════════════════════════════════════════
// Typy
// ═══════════════════════════════════════════════════════════════

export type ActionOk<T = unknown> =
  T extends object ? { success: true } & T : { success: true };
export type ActionFail = { success: false; error: string };

export interface OrganizationCompanyInput {
  nip: string;
  name: string;
  postalCode: string;
  city: string;
  street: string;
  buildingNumber: string;
  localNumber?: string;
}

// ═══════════════════════════════════════════════════════════════
// Set active organization
// ═══════════════════════════════════════════════════════════════

export async function setActiveOrganizationAction(
  orgId: string,
): Promise<ActionOk | ActionFail> {
  if (!isUuid(orgId)) {
    return { success: false, error: 'Nieprawidłowy identyfikator organizacji' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Niezalogowany' };

  const { data: membership } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) {
    return { success: false, error: 'Brak dostępu do tej organizacji' };
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: ACTIVE_ORG_COOKIE,
    value: orgId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  // last_active_tenant_id — tylko helper do redirectu po loginie.
  await supabase
    .from('users')
    .update({ last_active_tenant_id: orgId })
    .eq('id', user.id);

  revalidatePath('/');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// Create organization (onboarding: stwórz nową firmę)
// ═══════════════════════════════════════════════════════════════

export async function createOrganizationAction(
  company: OrganizationCompanyInput,
): Promise<
  | (ActionOk<{ organizationId: string; nipDuplicate: boolean; ksefVerifiedDuplicate: boolean }>)
  | ActionFail
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Niezalogowany' };
  }

  if (!/^\d{10}$/.test(company.nip)) {
    return { success: false, error: 'NIP musi zawierać 10 cyfr' };
  }
  if (!company.name?.trim()) {
    return { success: false, error: 'Nazwa firmy wymagana' };
  }

  // Wykrycie duplikatu NIP — tylko jako informacja zwrotna do UI
  // (banner). Nie blokujemy — tylko KSeF authority może dać silniejszy claim.
  const admin = createAdminClient();
  const { data: nipMatches } = await admin
    .from('tenants')
    .select('id, ksef_verified_at')
    .eq('nip', company.nip)
    .limit(5);

  const duplicates = nipMatches ?? [];
  const nipDuplicate = duplicates.length > 0;
  const ksefVerifiedDuplicate = duplicates.some(
    (t) => t.ksef_verified_at !== null,
  );

  const addressLine1 = `${company.street} ${company.buildingNumber}${
    company.localNumber ? '/' + company.localNumber : ''
  }`.trim();
  const addressLine2 = `${company.postalCode} ${company.city}`;
  const addressJson = {
    countryCode: 'PL',
    addressLine1,
    addressLine2,
  };

  // RPC `create_organization_with_owner` jest SECURITY DEFINER —
  // weryfikuje auth.uid() wewnątrz, więc nie potrzebujemy admin clienta.
  const { data: orgId, error } = await supabase.rpc(
    'create_organization_with_owner',
    {
      p_name: company.name,
      p_nip: company.nip,
      p_address_json: addressJson,
    },
  );

  if (error || !orgId) {
    return {
      success: false,
      error: `Błąd tworzenia firmy: ${error?.message ?? 'unknown'}`,
    };
  }

  await logAudit({
    action: 'tenant.created',
    tenantId: orgId,
    userId: user.id,
    metadata: {
      nip: company.nip,
      name: company.name,
      nip_duplicate: nipDuplicate,
      ksef_verified_duplicate: ksefVerifiedDuplicate,
    },
  });

  // Ustaw aktywną org natychmiast (kolejne strony używają cookie).
  const cookieStore = await cookies();
  cookieStore.set({
    name: ACTIVE_ORG_COOKIE,
    value: orgId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return {
    success: true,
    organizationId: orgId,
    nipDuplicate,
    ksefVerifiedDuplicate,
  };
}

// ═══════════════════════════════════════════════════════════════
// Invitations
// ═══════════════════════════════════════════════════════════════

function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function inviteMemberAction(params: {
  email: string;
  role: 'admin' | 'member' | 'accountant';
}): Promise<ActionOk<{ invitationId: string }> | ActionFail> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }
  const { supabase, tenantId, user } = ctx;

  const email = params.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { success: false, error: 'Nieprawidłowy email' };
  }
  if (!['admin', 'member', 'accountant'].includes(params.role)) {
    return { success: false, error: 'Nieprawidłowa rola' };
  }

  // Czy ten email już jest aktywnym członkiem?
  // Membership wskazuje na user_id; email żyje w auth.users — zmatchujemy
  // poprzez auth.admin.listUsers() (jedyne źródło prawdy o emailu).
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('memberships')
    .select('user_id')
    .eq('organization_id', tenantId)
    .eq('status', 'active');

  if (existing && existing.length > 0) {
    const userIds = existing.map((m) => m.user_id);
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
    const matched = authUsers?.users?.find(
      (u) => userIds.includes(u.id) && (u.email ?? '').toLowerCase() === email,
    );
    if (matched) {
      return { success: false, error: 'Ten użytkownik jest już członkiem' };
    }
  }

  const { token, tokenHash } = generateInviteToken();

  // Anuluj poprzednie aktywne zaproszenie dla tego samego emaila (idempotency).
  await admin
    .from('organization_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', tenantId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null);

  const { data: inv, error } = await supabase
    .from('organization_invitations')
    .insert({
      organization_id: tenantId,
      email,
      role: params.role,
      token_hash: tokenHash,
      invited_by: user.id,
    })
    .select('id')
    .single();

  if (error || !inv) {
    return {
      success: false,
      error: `Błąd zapisu zaproszenia: ${error?.message ?? 'unknown'}`,
    };
  }

  // Pobierz nazwę org dla treści maila.
  const { data: org } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'http://localhost:3000';
  const inviteUrl = `${baseUrl}/invite/${token}`;
  const orgName = org?.name ?? 'organizacja';

  try {
    await sendEmail({
      to: email,
      subject: `Zaproszenie do ${orgName} w FaktFlow`,
      html: `
        <p>Cześć,</p>
        <p>Zostałeś/aś zaproszony/a do organizacji <strong>${orgName}</strong> w FaktFlow w roli <strong>${params.role}</strong>.</p>
        <p><a href="${inviteUrl}">Kliknij aby zaakceptować zaproszenie</a></p>
        <p>Link wygasa za 7 dni.</p>
        <p style="color:#888;font-size:12px">Jeśli nie spodziewałeś/aś się tego maila, zignoruj go.</p>
      `,
    });
  } catch {
    // Mail nie poszedł — invitation zostaje, można retry lub skopiować link
    // ręcznie z UI. Nie failujemy całej akcji.
  }

  await logAudit({
    action: 'invitation.created',
    tenantId,
    userId: user.id,
    metadata: { email, role: params.role, invitation_id: inv.id },
  });

  return { success: true, invitationId: inv.id };
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionOk | ActionFail> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }
  const { supabase, tenantId, user } = ctx;

  const { error } = await supabase
    .from('organization_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('organization_id', tenantId)
    .is('accepted_at', null);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'invitation.revoked',
    tenantId,
    userId: user.id,
    metadata: { invitation_id: invitationId },
  });

  revalidatePath('/settings/team');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// Accept invitation (z poziomu zalogowanego usera, plaintext token z URL)
// ═══════════════════════════════════════════════════════════════

export async function acceptInvitationAction(
  token: string,
): Promise<ActionOk<{ organizationId: string }> | ActionFail> {
  if (typeof token !== 'string' || token.length < 16) {
    return { success: false, error: 'Nieprawidłowy token' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Niezalogowany' };

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const { data: orgId, error } = await supabase.rpc(
    'accept_organization_invitation',
    { p_token_hash: tokenHash },
  );

  if (error || !orgId) {
    const msg = error?.message ?? 'unknown';
    const friendly = mapInvitationError(msg);
    return { success: false, error: friendly };
  }

  await logAudit({
    action: 'invitation.accepted',
    tenantId: orgId,
    userId: user.id,
  });

  // Aktywuj organizację natychmiast.
  const cookieStore = await cookies();
  cookieStore.set({
    name: ACTIVE_ORG_COOKIE,
    value: orgId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath('/');
  return { success: true, organizationId: orgId };
}

function mapInvitationError(raw: string): string {
  if (raw.includes('invitation_email_mismatch')) {
    return 'Zaproszenie zostało wysłane na inny adres email — zaloguj się na właściwe konto';
  }
  if (raw.includes('invitation_expired')) return 'Zaproszenie wygasło';
  if (raw.includes('invitation_already_accepted')) {
    return 'Zaproszenie zostało już użyte';
  }
  if (raw.includes('invitation_revoked')) {
    return 'Zaproszenie zostało anulowane';
  }
  if (raw.includes('invitation_not_found')) {
    return 'Zaproszenie nie istnieje';
  }
  if (raw.includes('user_no_email')) {
    return 'Twoje konto nie ma adresu email';
  }
  return `Błąd akceptacji: ${raw}`;
}

// ═══════════════════════════════════════════════════════════════
// Join requests
// ═══════════════════════════════════════════════════════════════

export async function requestJoinAction(params: {
  organizationId: string;
  message?: string;
}): Promise<ActionOk<{ requestId: string }> | ActionFail> {
  if (!isUuid(params.organizationId)) {
    return { success: false, error: 'Nieprawidłowa organizacja' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Niezalogowany' };

  // Czy user już jest członkiem? Wtedy nie wysyłamy requestu.
  const { data: existing } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.id)
    .eq('organization_id', params.organizationId)
    .maybeSingle();

  if (existing?.status === 'active') {
    return { success: false, error: 'Jesteś już członkiem tej organizacji' };
  }

  const { data: req, error } = await supabase
    .from('organization_join_requests')
    .insert({
      organization_id: params.organizationId,
      requested_by_user_id: user.id,
      message: params.message?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !req) {
    if (error?.code === '23505') {
      return { success: false, error: 'Prośba już oczekuje na decyzję' };
    }
    return { success: false, error: error?.message ?? 'Błąd zapisu' };
  }

  await logAudit({
    action: 'join_request.created',
    tenantId: params.organizationId,
    userId: user.id,
    metadata: { request_id: req.id },
  });

  return { success: true, requestId: req.id };
}

export async function approveJoinRequestAction(
  requestId: string,
  role: 'admin' | 'member' | 'accountant' = 'member',
): Promise<ActionOk | ActionFail> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }
  const { supabase, tenantId, user } = ctx;

  const { error } = await supabase.rpc('approve_join_request', {
    p_request_id: requestId,
    p_role: role,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'join_request.approved',
    tenantId,
    userId: user.id,
    metadata: { request_id: requestId, role },
  });

  revalidatePath('/settings/team');
  return { success: true };
}

export async function denyJoinRequestAction(
  requestId: string,
): Promise<ActionOk | ActionFail> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }
  const { supabase, tenantId, user } = ctx;

  const { error } = await supabase.rpc('deny_join_request', {
    p_request_id: requestId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'join_request.denied',
    tenantId,
    userId: user.id,
    metadata: { request_id: requestId },
  });

  revalidatePath('/settings/team');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// Membership management (revoke / change role)
// ═══════════════════════════════════════════════════════════════

export async function revokeMembershipAction(
  membershipId: string,
): Promise<ActionOk | ActionFail> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Niezalogowany' };

  const { error } = await supabase.rpc('revoke_membership', {
    p_membership_id: membershipId,
  });

  if (error) {
    if (error.message.includes('cannot_remove_last_owner')) {
      return { success: false, error: 'Nie można usunąć ostatniego właściciela' };
    }
    if (error.message.includes('insufficient_role')) {
      return { success: false, error: 'Brak uprawnień' };
    }
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'membership.revoked',
    tenantId: null,
    userId: user.id,
    metadata: { membership_id: membershipId },
  });

  revalidatePath('/settings/team');
  return { success: true };
}

export async function changeMembershipRoleAction(params: {
  membershipId: string;
  newRole: 'owner' | 'admin' | 'member' | 'accountant';
}): Promise<ActionOk | ActionFail> {
  let ctx;
  try {
    ctx = await requireOrgRole('owner');
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }
  const { supabase, tenantId, user } = ctx;

  const { error } = await supabase.rpc('change_membership_role', {
    p_membership_id: params.membershipId,
    p_new_role: params.newRole,
  });

  if (error) {
    if (error.message.includes('cannot_demote_last_owner')) {
      return {
        success: false,
        error: 'Nie można zdegradować ostatniego właściciela',
      };
    }
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'membership.role_changed',
    tenantId,
    userId: user.id,
    metadata: { membership_id: params.membershipId, new_role: params.newRole },
  });

  revalidatePath('/settings/team');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// Helpery odczytu — używane w server components
// ═══════════════════════════════════════════════════════════════

/** Zwraca listę organizacji do których user należy (active memberships). */
export async function listMyOrganizations(): Promise<
  Array<{
    organizationId: string;
    name: string;
    nip: string;
    role: UserRole;
    isActive: boolean;
  }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const cookieStore = await cookies();
  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;

  const { data } = await supabase
    .from('memberships')
    .select(
      'organization_id, role, status, tenants:organization_id(name, nip)',
    )
    .eq('user_id', user.id)
    .eq('status', 'active');

  type Row = {
    organization_id: string;
    role: string;
    status: string;
    tenants: { name: string; nip: string } | { name: string; nip: string }[] | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      organizationId: row.organization_id,
      name: t?.name ?? '(bez nazwy)',
      nip: t?.nip ?? '',
      role: row.role as UserRole,
      isActive: row.organization_id === activeOrg,
    };
  });
}

