# ADR-0005: 2FA przez Supabase MFA native (nie custom otplib)

- **Status:** Accepted
- **Data:** 2026-04-08
- **Faza:** 28

## Kontekst

Faza 28 (Security Audit) wymaga 2FA dla wszystkich userów. Dwie ścieżki:
1. **Custom implementacja** — `otplib` + własne tabele `user_totp_secrets`,
   challenge w middleware, recovery codes scrypt.
2. **Supabase MFA native** — built-in flow w `@supabase/ssr`: factors,
   challenges, AAL (Authenticator Assurance Levels). Recovery codes dorabiamy
   bo Supabase ich nie ma w darmowym tier.

## Decyzja

**Supabase MFA native** dla TOTP. 8 backup codes (scrypt-hashed)
implementujemy sami w tabeli `mfa_recovery_codes` (Faza 28, migracja 00050).
AAL enforcement w middleware: sensitive routes wymagają `aal2`.

## Konsekwencje

### Pozytywne

- Mniej kodu — Supabase robi TOTP secret storage, QR generation, challenge
  flow, rate limiting prób.
- AAL natywnie zintegrowane z JWT — `getUser()` zwraca poziom.
- Supabase team utrzymuje implementację — patche bezpieczeństwa idą same.
- Spójność z `getUser()` / `signInWithPassword` z reszty appki.

### Negatywne / koszty

- Recovery codes nie są wbudowane — musieliśmy zrobić własne (`mfa_recovery_codes`).
- Migracja z Supabase Auth byłaby trudniejsza (lock-in).
- Custom UI flow nie jest możliwy — przyjmujemy Supabase'owy reset/enroll flow.

### Wymaga

- Tabela `mfa_recovery_codes` + RPC do generowania/walidacji.
- Middleware wymusza `aal2` na `/settings/security`, `/admin/*`, `/settings/billing`.
- UI w `/settings/security` używa `supabase.auth.mfa.*` API.

## Rozważane alternatywy

- **otplib + własna implementacja** — więcej kodu, większa powierzchnia
  audytu, samodzielne mitigowanie timing attacks i rate limitów. Odrzucone.
- **Auth0 / Clerk** — duplikowanie z Supabase Auth, koszt licencji. Odrzucone.
- **Tylko SMS 2FA** — niezgodne z NIST guidelines (SMS slabszy niż TOTP).
  Odrzucone.

## Linki

- Migracja `00050_mfa_recovery_codes.sql`
- `app/(dashboard)/settings/security/`
- `lib/auth/reauth.ts`, `lib/auth/inactivity-logout.ts`
