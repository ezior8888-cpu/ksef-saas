import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { TEST_PASSWORD } from './test-data';

/**
 * Admin client z service_role — BYPASS RLS. Używamy tylko w setup/teardown
 * testów E2E, nigdy w samych asercjach (te lecą przez prawdziwego usera z RLS).
 */
function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'E2E seed: brak NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w env',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SeededUser = {
  userId: string;
  email: string;
  password: string;
  tenantId: string;
  nip: string;
};

export type SeedOptions = {
  email: string;
  nip: string;
  companyName?: string;
  password?: string;
  role?: 'owner' | 'admin' | 'member';
};

/**
 * Tworzy w bazie kompletnego usera z aktywną organizacją:
 * 1. `auth.users` przez admin API (email_confirm=true — pomijamy weryfikację)
 * 2. `tenants` (organizacja)
 * 3. `memberships` (user ↔ tenant, status=active, role=owner)
 *
 * Idempotent: jeśli email istnieje, zwraca jego dane.
 */
export async function seedUserWithOrg(opts: SeedOptions): Promise<SeededUser> {
  const supabase = adminClient();
  const password = opts.password ?? TEST_PASSWORD;
  const role = opts.role ?? 'owner';

  let userId: string;
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === opts.email);

  if (found) {
    userId = found.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: opts.email,
      password,
      email_confirm: true,
      user_metadata: { e2e: true },
    });
    if (error || !data.user) {
      throw new Error(`E2E seed: createUser failed: ${error?.message}`);
    }
    userId = data.user.id;
  }

  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('nip', opts.nip)
    .maybeSingle();

  let tenantId: string;
  if (existingTenant) {
    tenantId = existingTenant.id;
  } else {
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .insert({
        name: opts.companyName ?? `E2E Org ${opts.nip}`,
        nip: opts.nip,
        is_active: true,
        retention_years: 10,
        created_by_user_id: userId,
      })
      .select('id')
      .single();
    if (tErr || !tenant) {
      throw new Error(`E2E seed: tenant insert failed: ${tErr?.message}`);
    }
    tenantId = tenant.id;
  }

  const { data: existingMembership } = await supabase
    .from('memberships')
    .select('id')
    .eq('organization_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingMembership) {
    const { error: mErr } = await supabase.from('memberships').insert({
      organization_id: tenantId,
      user_id: userId,
      role,
      status: 'active',
    });
    if (mErr) {
      throw new Error(`E2E seed: membership insert failed: ${mErr.message}`);
    }
  }

  return { userId, email: opts.email, password, tenantId, nip: opts.nip };
}

/**
 * Usuwa usera + wszystkie jego organizacje (CASCADE pociągnie faktury, koszty,
 * etc.). Bezpieczna do woływania bez sprawdzania czy user istnieje.
 */
export async function cleanupUser(email: string): Promise<void> {
  const supabase = adminClient();

  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users.find((u) => u.email === email);
  if (!user) return;

  const { data: memberships } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id);

  const orgIds = (memberships ?? []).map((m) => m.organization_id);

  for (const orgId of orgIds) {
    await supabase.from('tenants').delete().eq('id', orgId);
  }

  await supabase.auth.admin.deleteUser(user.id);
}

/**
 * Tworzy świeżego auth usera BEZ tenanta i membership — używamy do testów
 * onboardingu (`/onboarding`), żeby flow tworzenia pierwszej organizacji
 * zaczynał się z czystego stanu.
 */
export async function seedUserWithoutOrg(opts: {
  email: string;
  password?: string;
}): Promise<{ userId: string; email: string; password: string }> {
  const supabase = adminClient();
  const password = opts.password ?? TEST_PASSWORD;

  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === opts.email);
  if (found) {
    return { userId: found.id, email: opts.email, password };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: opts.email,
    password,
    email_confirm: true,
    user_metadata: { e2e: true },
  });
  if (error || !data.user) {
    throw new Error(`E2E seed: createUser failed: ${error?.message}`);
  }
  return { userId: data.user.id, email: opts.email, password };
}

/**
 * Magic-link-based session bootstrap. Zwraca access_token + refresh_token,
 * które można zapisać do storageState Playwrighta i pomijać klikanie login UI
 * przy każdym teście.
 */
export async function generateSessionTokens(
  userId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const supabase = adminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !userData.user.email) {
    throw new Error(`E2E seed: getUserById failed: ${userErr?.message ?? 'no email'}`);
  }

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    throw new Error(`E2E seed: generateLink failed: ${linkErr?.message}`);
  }

  const preAuth = createClient(url, anonKey);
  const { data: otpData, error: otpErr } = await preAuth.auth.verifyOtp({
    type: 'email',
    token_hash: linkData.properties.hashed_token,
  });
  if (otpErr || !otpData.session) {
    throw new Error(`E2E seed: verifyOtp failed: ${otpErr?.message}`);
  }

  return {
    accessToken: otpData.session.access_token,
    refreshToken: otpData.session.refresh_token,
  };
}
