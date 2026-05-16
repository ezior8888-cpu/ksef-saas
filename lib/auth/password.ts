import { z } from 'zod';
import { checkPasswordBreach } from './breach-check';

/**
 * NIST 800-63B mówi min 8 znaków, ale my podkręcamy do 12 — hasło to
 * jedyny vector przed 2FA, a 2FA jest opcjonalne (Krok 6).
 *
 * Wymagamy kompleksowości (lower/upper/digit/special) ponieważ:
 *   1. Defense-in-depth gdyby wyciekł hash bazy (offline dictionary attack).
 *   2. Wykluczamy najczęstsze hasła jak `password1234`, `qwertyuiop12` —
 *      checkpoint przed kosztownym HIBP API call.
 *   3. Naszej userbase (mikrofirmy + księgowi) realistic minimum.
 */
export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Hasło musi mieć minimum ${PASSWORD_MIN_LENGTH} znaków.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    message: `Hasło nie może być dłuższe niż ${PASSWORD_MAX_LENGTH} znaków.`,
  })
  .refine((v) => /[a-z]/.test(v), {
    message: 'Hasło musi zawierać małą literę.',
  })
  .refine((v) => /[A-Z]/.test(v), {
    message: 'Hasło musi zawierać dużą literę.',
  })
  .refine((v) => /[0-9]/.test(v), {
    message: 'Hasło musi zawierać cyfrę.',
  })
  .refine((v) => /[^A-Za-z0-9]/.test(v), {
    message: 'Hasło musi zawierać znak specjalny (np. !@#$%^&*).',
  });

export type PasswordCheckResult =
  | { valid: true }
  | { valid: false; error: string; reason: 'weak' | 'breached' };

/**
 * Walidacja synchroniczna — zasady kompleksowości. Bez HIBP (sieciowy call).
 * Używaj gdy chcesz szybkiego feedbacku w UI lub w testach.
 */
export function validatePasswordStrength(
  password: string,
): PasswordCheckResult {
  const result = passwordSchema.safeParse(password);
  if (result.success) return { valid: true };
  return {
    valid: false,
    reason: 'weak',
    error: result.error.issues[0]?.message ?? 'Hasło nie spełnia wymagań.',
  };
}

/**
 * Pełna walidacja: kompleksowość + HIBP breach check (k-anonymity).
 * Wywołuj w Server Action przed zapisem hasła do Supabase.
 *
 * HIBP fail-open — jeśli serwis padnie, nie blokujemy registracji.
 */
export async function validatePassword(
  password: string,
): Promise<PasswordCheckResult> {
  const strength = validatePasswordStrength(password);
  if (!strength.valid) return strength;

  const breach = await checkPasswordBreach(password);
  if (breach.breached) {
    return {
      valid: false,
      reason: 'breached',
      error:
        'To hasło pojawiło się w znanych wyciekach danych. Wybierz inne — np. losowy ciąg lub passphrase z 4-5 słów.',
    };
  }

  return { valid: true };
}
