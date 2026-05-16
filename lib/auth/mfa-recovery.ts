import { createAdminClient } from '@/lib/supabase/server';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from './backup-codes';

/**
 * Operacje DB dla recovery codes. Używamy admin client (service_role) bo
 * INSERT/UPDATE/DELETE są REVOKED dla `authenticated` na poziomie migracji
 * 00050 — chronimy przed manipulacją bezpośrednią z klienta.
 *
 * Wywołuj WYŁĄCZNIE z Server Actions po uprzedniej `auth.getUser()`
 * verification.
 */

interface RecoveryCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  code_salt: string;
  used_at: string | null;
}

interface MfaRecoveryTable {
  from: (n: 'mfa_recovery_codes') => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        is: (
          k: string,
          v: null,
        ) => Promise<{
          data: RecoveryCodeRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert: (rows: Array<Omit<RecoveryCodeRow, 'id' | 'used_at'>>) => Promise<{
      error: { message: string } | null;
    }>;
    update: (patch: { used_at: string }) => {
      eq: (k: string, v: string) => Promise<{
        error: { message: string } | null;
      }>;
    };
    delete: () => {
      eq: (
        k: string,
        v: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * Generuje 8 nowych recovery codes dla usera, zastępując poprzednie
 * (jeśli istniały). Zwraca PLAINTEXT kody do jednorazowego pokazania
 * userowi — po opuszczeniu strony nie da się ich odzyskać.
 */
export async function generateAndStoreRecoveryCodes(
  userId: string,
): Promise<string[]> {
  const admin = createAdminClient() as unknown as MfaRecoveryTable;

  // Hard delete poprzednich (zachowując historyczny audit log poza tabelą).
  const del = await admin.from('mfa_recovery_codes').delete().eq('user_id', userId);
  if (del.error) {
    throw new Error(`recovery_codes_delete_failed: ${del.error.message}`);
  }

  const codes = generateRecoveryCodes();
  const rows = codes.map((code) => {
    const hashed = hashRecoveryCode(code);
    return {
      user_id: userId,
      code_hash: hashed.hash,
      code_salt: hashed.salt,
    };
  });

  const ins = await admin.from('mfa_recovery_codes').insert(rows);
  if (ins.error) {
    throw new Error(`recovery_codes_insert_failed: ${ins.error.message}`);
  }

  return codes;
}

/**
 * Sprawdza, czy podany code jest jednym z nieużytych kodów usera.
 * Po sukcesie markuje used_at — code może być użyty tylko raz.
 *
 * Zwraca true jeśli code poprawny, false w przeciwnym wypadku.
 */
export async function consumeRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const admin = createAdminClient() as unknown as MfaRecoveryTable;

  const { data, error } = await admin
    .from('mfa_recovery_codes')
    .select('id, user_id, code_hash, code_salt, used_at')
    .eq('user_id', userId)
    .is('used_at', null);

  if (error || !data) return false;

  for (const row of data) {
    if (verifyRecoveryCode(code, row.code_hash, row.code_salt)) {
      const upd = await admin
        .from('mfa_recovery_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', row.id);
      if (upd.error) return false;
      return true;
    }
  }

  return false;
}

/**
 * Liczba pozostałych (nieużytych) kodów. Do UI: "Zostało Ci 5 kodów ratunkowych".
 */
export async function countRemainingRecoveryCodes(
  userId: string,
): Promise<number> {
  const admin = createAdminClient() as unknown as MfaRecoveryTable;
  const { data } = await admin
    .from('mfa_recovery_codes')
    .select('id')
    .eq('user_id', userId)
    .is('used_at', null);
  return data?.length ?? 0;
}

/**
 * Twardo usuwa wszystkie kody (unenroll 2FA).
 */
export async function deleteAllRecoveryCodes(userId: string): Promise<void> {
  const admin = createAdminClient() as unknown as MfaRecoveryTable;
  await admin.from('mfa_recovery_codes').delete().eq('user_id', userId);
}
