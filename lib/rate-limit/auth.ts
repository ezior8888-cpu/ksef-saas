import { checkRateLimit, type RateLimitResult } from './index';

/**
 * Limity dobrane konserwatywnie z myślą o legalnym ruchu mikrofirm.
 *
 * Login: 5/15min/(IP+email). Per-(IP+email) zamiast samego IP — chroni
 * przed credential stuffing (atakujący próbuje listę haseł na jeden email),
 * ale nie blokuje całego biura za jednym NAT-em po jednym ludziku.
 *
 * Register: 3/15min/IP. Per-IP, bo register tworzy nowe konta — per-email
 * nie ma sensu (każdy register ma inny email). Spam signup mitigation,
 * komplementarny do Turnstile (Krok 4).
 *
 * Password reset: 5/h/email. Anti-email-bombing — ktoś nie może zalać
 * twojej skrzynki linkami resetowymi. Per-email, bo IP może być różne
 * (np. zapomniałem hasła i piszę z domu/biura/kawiarni).
 */
export async function checkLoginRateLimit(
  ip: string,
  email: string,
): Promise<RateLimitResult> {
  return checkRateLimit({
    bucket: 'login',
    identifier: `${ip}:${email}`,
    limit: 5,
    windowSeconds: 15 * 60,
  });
}

export async function checkRegisterRateLimit(
  ip: string,
): Promise<RateLimitResult> {
  return checkRateLimit({
    bucket: 'register',
    identifier: ip,
    limit: 3,
    windowSeconds: 15 * 60,
  });
}

export async function checkPasswordResetRateLimit(
  email: string,
): Promise<RateLimitResult> {
  return checkRateLimit({
    bucket: 'password_reset',
    identifier: email,
    limit: 5,
    windowSeconds: 60 * 60,
  });
}
