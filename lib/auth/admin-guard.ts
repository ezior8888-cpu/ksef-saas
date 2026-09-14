import 'server-only';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';

/**
 * Platform operators are separate from tenant roles. ADMIN_EMAILS is an
 * operator-managed allowlist, not an audit trail. An empty list denies everyone.
 * Each read/write also requires a confirmed email and verified TOTP session.
 */
function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '').split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.includes('@')),
  );
}

/** Eligibility only; never use this predicate as an authorization guard. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && parseAdminEmails().has(email.trim().toLowerCase());
}

export interface AdminContext {
  userId: string;
  email: string;
}

/**
 * Await at the data/operation boundary, before constructing service_role.
 * First enrollment remains accessible outside /admin. A challenge redirects
 * to the panel, never automatically replays a privileged write.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const state = await getVerifiedMfaState(await createClient());
  if (state.status === 'unauthenticated') redirect('/login?error=admin_required');

  const { user } = state;
  const email = user.email;
  if (!email || !user.email_confirmed_at || !isAdminEmail(email)) {
    redirect('/dashboard');
  }
  if (state.status === 'enrollment_required') {
    redirect('/login/two-factor/setup');
  }
  if (state.status === 'challenge_required') {
    redirect('/login/two-factor?redirect=%2Fadmin');
  }

  return { userId: user.id, email };
}

/** UI hint; verification failures never grant a context. */
export async function getAdminContext(): Promise<AdminContext | null> {
  try {
    const state = await getVerifiedMfaState(await createClient());
    if (state.status !== 'verified') return null;
    const { user } = state;
    if (!user.email || !user.email_confirmed_at || !isAdminEmail(user.email)) return null;
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}
