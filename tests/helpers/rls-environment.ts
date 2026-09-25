export interface RlsTestEnvironment {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/**
 * Bez fallbacku na konfigurację aplikacji, odczytu plików .env i połączeń z bazą.
 * Dopuszcza tylko osobną lokalną bazę: tests/README-RLS.md opisuje granice guardu.
 */
export function getRlsTestEnvironment(
  env: Record<string, string | undefined> = process.env,
): RlsTestEnvironment {
  const keys = [
    'RLS_TEST_SUPABASE_URL',
    'RLS_TEST_SUPABASE_ANON_KEY',
    'RLS_TEST_SUPABASE_SERVICE_ROLE_KEY',
    'RLS_TEST_ALLOW_DESTRUCTIVE',
  ] as const;
  const missing = keys.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      'Testy RLS wymagają osobnej bazy testowej i jawnych zmiennych: ' + missing.join(', '),
    );
  }

  if (env.RLS_TEST_ALLOW_DESTRUCTIVE !== 'isolated-local-database') {
    throw new Error(
      'RLS_TEST_ALLOW_DESTRUCTIVE wymaga potwierdzenia isolated-local-database: testy tworzą i usuwają dane.',
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
    || parsed.username || parsed.password || parsed.search || parsed.hash
    || parsed.pathname !== '/') {
    throw new Error('RLS_TEST_SUPABASE_URL musi być adresem HTTP(S) bez danych logowania, ścieżki, query i fragmentu.');
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== '[::1]') {
    throw new Error(
      'RLS_TEST_SUPABASE_URL dopuszcza wyłącznie numeryczny loopback 127.0.0.1 lub [::1]. Zdalne bazy są zablokowane.',
    );
  }

  const applicationUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (applicationUrl) {
    let applicationTarget: URL;
    try {
      applicationTarget = new URL(applicationUrl);
    } catch {
      throw new Error('Nie można sprawdzić izolacji: NEXT_PUBLIC_SUPABASE_URL ma niepoprawny format.');
    }
    // Lokalna apka może używać localhost lub drugiej rodziny IP dla tego samego portu.
    const applicationIsLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(applicationTarget.hostname);
    if (applicationTarget.host === parsed.host
      || (applicationIsLoopback && applicationTarget.port === parsed.port)) {
      throw new Error('Cel RLS_TEST_SUPABASE_URL pokrywa się z bazą aplikacji. Wymagana jest osobna baza testowa.');
    }
  }

  const anonKey = env.RLS_TEST_SUPABASE_ANON_KEY!.trim();
  const serviceRoleKey = env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY!.trim();
  const applicationKeys = [
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  ];
  if (applicationKeys.includes(anonKey) || applicationKeys.includes(serviceRoleKey)) {
    throw new Error('Klucze RLS_TEST_SUPABASE_* pokrywają się z konfiguracją aplikacji. Wymagane są osobne klucze testowe.');
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
  };
}
