/**
 * Skrypt testowy: autentykacja XAdES z certyfikatem KSeF.
 *
 * Uruchom:
 *   pnpm tsx scripts/test-ksef-auth.ts
 *
 * Konfiguracja przez ENV (lub edycja defaultów poniżej):
 *   KSEF_TEST_NIP       - NIP z certyfikatu (musi się zgadzać z subjectem cert!)
 *   KSEF_TEST_CERT      - ścieżka do certyfikatu PEM
 *   KSEF_TEST_KEY       - ścieżka do klucza prywatnego PEM
 *   DEBUG_KSEF=1        - wypisze podpisany XML
 */

import { inspect } from 'node:util';
import { loadCredentialsFromFiles, authenticateWithXades } from '../lib/ksef/auth';

async function main() {
  const TEST_NIP = process.env.KSEF_TEST_NIP ?? '1234567890';
  const CERT_PATH = process.env.KSEF_TEST_CERT ?? '.ksef-test-certs/ksef-cert.pem';
  const KEY_PATH = process.env.KSEF_TEST_KEY ?? '.ksef-test-certs/ksef-key.pem';

  console.log('=== KSeF Test: Autentykacja XAdES ===\n');
  console.log(`Środowisko: ${process.env.KSEF_ENV ?? 'test'}`);
  console.log(`NIP:        ${TEST_NIP}`);
  console.log(`Cert:       ${CERT_PATH}`);
  console.log(`Key:        ${KEY_PATH}\n`);

  const credentials = loadCredentialsFromFiles(TEST_NIP, CERT_PATH, KEY_PATH);

  console.log('→ Rozpoczynam auth flow (challenge → sign → submit → poll → redeem)...');

  try {
    const session = await authenticateWithXades(credentials);

    console.log('\n✓ SUKCES!\n');
    console.log('Access token:', session.accessToken.slice(0, 40) + '...');
    console.log('Ważny do:', new Date(session.accessTokenExpiresAt).toISOString());
    console.log('Refresh token ważny do:', new Date(session.refreshTokenExpiresAt).toISOString());
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
