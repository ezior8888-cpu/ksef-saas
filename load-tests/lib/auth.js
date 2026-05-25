import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, TEST_USER, TURNSTILE_BYPASS } from '../config.js';

// Logowanie przez `/api/dev/load-test-session` (Supabase SSR cookies).
// Aplikacja NIE używa NextAuth — stary flow `/api/auth/callback/credentials`
// zawsze zwracał 404.
//
// Wymaga na serwerze: LOAD_TEST_MODE=true (nigdy na produkcji).
// Po POST sesji — GET /dashboard z redirectami, żeby middleware ustawił
// cookie `ksef.active_org` (multi-org bootstrap).

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (TURNSTILE_BYPASS) {
    headers['x-turnstile-bypass'] = TURNSTILE_BYPASS;
  }
  return headers;
}

export function login() {
  const res = http.post(
    `${BASE_URL}/api/dev/load-test-session`,
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
    { headers: authHeaders(), tags: { name: 'auth_login' }, redirects: 0 },
  );

  const loginOk = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: body ok': (r) => {
      if (!r.body) return false;
      try {
        const data = r.json();
        return data && data.ok === true;
      } catch {
        return false;
      }
    },
  });

  if (!loginOk) {
    if (res.status === 404) {
      console.error(
        '[auth] 404 — włącz LOAD_TEST_MODE=true w .env.local i zrestartuj pnpm dev',
      );
    }
    return false;
  }

  // Middleware: bootstrap aktywnej organizacji (cookie ksef.active_org).
  const bootstrap = http.get(`${BASE_URL}/dashboard`, {
    tags: { name: 'auth_bootstrap' },
    redirects: 5,
  });

  return check(bootstrap, {
    'auth bootstrap: status 200': (r) => r.status === 200,
  });
}

export function assertCredentials() {
  if (!TEST_USER.password) {
    throw new Error(
      'Brak LOAD_TEST_PASSWORD. Uruchom k6 z -e LOAD_TEST_PASSWORD=... ' +
        '(konto musi istnieć w Supabase z aktywnym membership, bez włączonego 2FA).',
    );
  }
}
