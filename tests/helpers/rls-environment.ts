export interface RlsTestEnvironment {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/** Bez fallbacku na konfigurację aplikacji i bez odczytu plików .env. */
export function getRlsTestEnvironment(
  env: Record<string, string | undefined> = process.env,
): RlsTestEnvironment {
  const keys = [
    'RLS_TEST_SUPABASE_URL',
    'RLS_TEST_SUPABASE_ANON_KEY',
    'RLS_TEST_SUPABASE_SERVICE_ROLE_KEY',
  ] as const;
  const missing = keys.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      'Testy RLS wymagają osobnej bazy testowej i jawnych zmiennych: ' + missing.join(', '),
    );
  }

  const url = env.RLS_TEST_SUPABASE_URL!.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('RLS_TEST_SUPABASE_URL musi być poprawnym adresem HTTP(S) osobnej bazy testowej.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)
    || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('RLS_TEST_SUPABASE_URL musi być adresem HTTP(S) bez danych logowania, query i fragmentu.');
  }

  return {
    url,
    anonKey: env.RLS_TEST_SUPABASE_ANON_KEY!.trim(),
    serviceRoleKey: env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY!.trim(),
  };
}
