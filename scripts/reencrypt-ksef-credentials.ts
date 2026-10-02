/**
 * Przeszyfrowanie danych dostępowych KSeF do formatu v2 (AUD-52).
 *
 * Kiedy: po wdrożeniu kodu v2, a przy rotacji sekretu — po ustawieniu
 * nowego `KSEF_CREDENTIALS_ENCRYPTION_KEY` i starego w
 * `KSEF_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS`. Czyta każdy zapis (v1 albo v2,
 * bieżący albo poprzedni klucz), zapisuje v2 bieżącym kluczem z AAD firmy.
 * Po udanym przebiegu `_PREVIOUS` można usunąć.
 *
 * Domyślnie TYLKO podgląd. Zapis: `pnpm tsx scripts/reencrypt-ksef-credentials.ts --apply`.
 * Wymaga klucza service_role (jak pozostałe skrypty w `scripts/`).
 */

import { config } from 'dotenv';

import { decryptCredentials, encryptCredentials, isCredentialsV2 } from '../lib/ksef/credentials-crypto';

import { bufferToByteaLiteral, createScriptAdminClient } from './_supabase';

config({ path: '.env.local' });

function parseBytea(raw: unknown): Buffer {
  if (typeof raw !== 'string') throw new Error('nieoczekiwany typ BYTEA');
  return raw.startsWith('\\x') ? Buffer.from(raw.slice(2), 'hex') : Buffer.from(raw, 'base64');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const supabase = createScriptAdminClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('id, ksef_credentials_encrypted')
    .not('ksef_credentials_encrypted', 'is', null);
  if (error) throw new Error(error.message);

  let rewritten = 0;
  let alreadyV2 = 0;
  let failed = 0;
  for (const row of (data ?? []) as Array<{ id: string; ksef_credentials_encrypted: unknown }>) {
    try {
      const blob = parseBytea(row.ksef_credentials_encrypted);
      const creds = decryptCredentials(blob, row.id);
      if (isCredentialsV2(blob) && !process.argv.includes('--force')) {
        alreadyV2++;
        continue;
      }
      if (apply) {
        const { error: upErr } = await supabase
          .from('tenants')
          .update({ ksef_credentials_encrypted: bufferToByteaLiteral(encryptCredentials(creds, row.id)) })
          .eq('id', row.id);
        if (upErr) throw new Error(upErr.message);
      }
      rewritten++;
    } catch (e) {
      failed++;
      // Bez treści danych — tylko identyfikator firmy i rodzaj błędu.
      console.error(`firma ${row.id}: ${e instanceof Error ? e.message : 'błąd'}`);
    }
  }
  console.log(
    `${apply ? 'Przeszyfrowano' : 'Do przeszyfrowania (podgląd)'}: ${rewritten}, już v2: ${alreadyV2}, błędy: ${failed}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
