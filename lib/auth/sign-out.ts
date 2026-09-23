import 'server-only';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export interface SignOutResult {
  userId: string | null;
  localSessionCleared: boolean;
  globalSignOutConfirmed: boolean;
}

/**
 * The server client uses supabase-js's default storage key, without a custom
 * cookie name/domain. Include its SSR chunks and PKCE verifier, never other
 * projects' sessions, application cookies or a merely similar prefix.
 */
function isCurrentAuthCookie(name: string, storageKey: string): boolean {
  return [storageKey, storageKey + '-code-verifier'].some((base) =>
    name === base || (name.startsWith(base + '.') && /^\d+$/.test(name.slice(base.length + 1))),
  );
}

/** Local logout must still complete when Auth refuses global revocation. */
export async function signOutCurrentSession(): Promise<SignOutResult> {
  const result: SignOutResult = {
    userId: null, localSessionCleared: false, globalSignOutConfirmed: false,
  };
  try {
    const supabase = await createClient();
    const session = await supabase.auth.getSession();
    const token = session.error ? null : session.data.session?.access_token;
    if (typeof token === 'string' && token) {
      // Bind the audit identity to this exact token; cookie user data is untrusted.
      const identity = await supabase.auth.getUser(token).catch(() => null);
      if (identity && !identity.error) result.userId = identity.data.user?.id ?? null;
      // auth.signOut hides 401/403/404. This method preserves the remote result
      // on the same anon client, with the user's JWT (never a user ID).
      const remote = await supabase.auth.admin.signOut(token, 'global').catch(() => null);
      result.globalSignOutConfirmed = !!remote && !remote.error;
    }
  } catch {
    // Local cleanup below is independent of Auth availability and SDK errors.
  }

  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) return result;
    const storageKey = 'sb-' + url.hostname.split('.')[0] + '-auth-token';
    const store = await cookies();
    for (const cookie of store.getAll()) {
      if (isCurrentAuthCookie(cookie.name, storageKey)) {
        store.set(cookie.name, '', { path: '/', maxAge: 0 });
      }
    }
    result.localSessionCleared = true;
  } catch {
    // A failed cookie write cannot be presented as a completed local logout.
  }
  return result;
}
