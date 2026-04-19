/**
 * Skrypt testowy: autentykacja przez token KSeF.
 *
 * Wymaga w .env.local:
 *   KSEF_TEST_TOKEN=<token z ap-test.ksef.mf.gov.pl>
 *   KSEF_TEST_NIP=<NIP kontekstu, w którym wygenerowano token>
 *
 * Uruchom:
 *   pnpm tsx scripts/test-ksef-token.ts
 */

import { inspect } from 'node:util';
import { config } from 'dotenv';
import { authenticateWithToken } from '../lib/ksef/auth-token';

config({ path: '.env.local' });

async function main() {
  const token = process.env.KSEF_TEST_TOKEN;
  const nip = process.env.KSEF_TEST_NIP;

  if (!token) {
    console.error('✗ Brak KSEF_TEST_TOKEN w .env.local');
    process.exit(1);
  }
  if (!nip) {
    console.error('✗ Brak KSEF_TEST_NIP w .env.local');
    process.exit(1);
  }

  console.log('=== KSeF Test: Autentykacja przez TOKEN ===\n');
  console.log(`Środowisko: ${process.env.KSEF_ENV ?? 'test'}`);
  console.log(`NIP:        ${nip}`);
  console.log(`Token:      ${token.slice(0, 12)}... (${token.length} znaków)\n`);

  console.log('→ Flow: challenge → encrypt(token|ts) → /auth/ksef-token → poll → redeem');

  try {
    const session = await authenticateWithToken({ type: 'token', nip, token });

    console.log('\n✓ SUKCES!\n');
    console.log('Access token:        ', session.accessToken.slice(0, 40) + '...');
    console.log('Ważny do:            ', new Date(session.accessTokenExpiresAt).toISOString());
    console.log('Refresh token ważny: ', new Date(session.refreshTokenExpiresAt).toISOString());
  } catch (error) {
    console.error('\n✗ BŁĄD:');
    console.error(inspect(error, { depth: null, colors: true }));
    if (error instanceof Error && 'body' in error) {
      console.error('\nBody odpowiedzi (pełne):');
      console.error(inspect((error as { body?: unknown }).body, { depth: null, colors: true }));
    }
    process.exit(1);
  }
}

main();
