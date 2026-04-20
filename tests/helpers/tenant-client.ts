import { createClient } from '@supabase/supabase-js';

/**
 * Klient Supabase z kluczem **anon** i JWT zalogowanego użytkownika —
 * PostgREST wykonuje polityki RLS (w przeciwieństwie do samego service_role).
 *
 * Flow: `getUserById` → `generateLink` (magiclink) → `verifyOtp` z
 * `hashed_token` → `access_token` do nagłówka `Authorization`.
 */
export async function createUserScopedClient(userId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRole) {
    throw new Error('Missing Supabase env vars');
  }

  const admin = createClient(url, serviceRole);

  const { data: userData, error: userErr } =
    await admin.auth.admin.getUserById(userId);
  if (userErr) throw userErr;

  const email = userData.user.email;
  if (!email) {
    throw new Error(
      `User ${userId} has no email — cannot build magic link for RLS tests`,
    );
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr) throw linkErr;

  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error('generateLink did not return properties.hashed_token');
  }

  const preAuth = createClient(url, anonKey);
  const { data: otpData, error: otpErr } = await preAuth.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  });
  if (otpErr) throw otpErr;

  const accessToken = otpData.session?.access_token;
  if (!accessToken) {
    throw new Error('verifyOtp did not return session.access_token');
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
