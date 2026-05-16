# OWASP Top 10 (2021) — Mapping FaktFlow

Mapowanie kontroli bezpieczeństwa wprowadzonych w Fazach 1-28 vs OWASP Top 10
(2021). Aktualizowane na koniec Fazy 28 (Security Audit & Hardening).

---

## A01:2021 — Broken Access Control

| Kontrola | Implementacja |
|---|---|
| Row-level security | Wszystkie tabele z `tenant_id` mają RLS (Faza 1, migracje 00001-00049) |
| Membership check | `get_current_tenant_id()` + `is_member_of()` w policies |
| Admin guard | `lib/auth/admin-guard.ts` + `ADMIN_EMAILS` allowlist (Faza 24) |
| Force logout | Admin action `admin.user.force_logout` (Faza 24) |
| Path-level public allowlist | `lib/supabase/middleware.ts → AUTH_PUBLIC_PREFIXES` (eksplicytna whitelist) |
| Safe redirect | `lib/auth/safe-redirect.ts` — blok open-redirect (Faza 28 Krok 6) |
| Multi-org context | `ksef.active_org` cookie httpOnly, RLS sprawdza member (Faza 27) |

**Status:** ✅ Pełne pokrycie.

---

## A02:2021 — Cryptographic Failures

| Kontrola | Implementacja |
|---|---|
| KSeF credentials encryption | AES-256-GCM, `KSEF_CREDENTIALS_ENCRYPTION_KEY`, per-row IV ([lib/ksef/credentials-crypto.ts](../../lib/ksef/credentials-crypto.ts)) |
| KSeF token encryption | RSA-OAEP SHA-256 ([lib/ksef/encryption.ts](../../lib/ksef/encryption.ts)) |
| Password storage | Supabase Auth (bcrypt) |
| Recovery codes hash | scrypt N=2^14, 16-byte salt per row ([lib/auth/backup-codes.ts](../../lib/auth/backup-codes.ts)) |
| Unsubscribe tokens | HMAC-SHA256 z `EMAIL_UNSUBSCRIBE_SECRET` |
| Cancel tokens GDPR | `randomBytes(32)` hex, unique index, regex walidacja |
| Webhook signatures | Stripe + Resend + Inngest (HMAC w każdym) |
| TLS | Vercel auto-managed, HSTS preload (Faza 28 — already in next.config.ts) |
| Key rotation | Runbook [docs/runbooks/key-rotation.md](../runbooks/key-rotation.md) (Faza 28 Krok 8) |

**Pozostałe ryzyko:** RPC `protobufjs` 7 high w `@opentelemetry/*` (transitive
via `inngest`). Czekamy na inngest update. Brak ekspozycji — nie używamy
Prometheus exporter.

**Status:** ✅ Pełne pokrycie production code, ⚠️ 3 transitive vulns akceptowane.

---

## A03:2021 — Injection

| Kontrola | Implementacja |
|---|---|
| SQL injection | Supabase PostgREST (zawsze parametryzowane). Custom RPC z `SECURITY DEFINER` + `SET search_path = public, pg_temp` |
| XSS | React auto-escaping (Server Components default). Brak `dangerouslySetInnerHTML` poza emaili (rendered server-side przez `@react-email/render` — bezpieczne) |
| XML injection | FA(3) XML walidacja `libxmljs2` PRZED submit do KSeF |
| Command injection | Brak `child_process.exec()` z user input |
| CSP | Report-Only w `next.config.ts` (przełączamy na enforced w Fazie 42 zgodnie z Q3 planowania) |

**Status:** ✅ Pełne pokrycie.

---

## A04:2021 — Insecure Design

| Kontrola | Implementacja |
|---|---|
| Rate limiting | Auth routes (login/register/reset/2FA) + KSeF API (Faza 28 Krok 2) |
| Bot protection | Cloudflare Turnstile na login/register/forgot-password (Faza 28 Krok 4) |
| 2FA | Supabase MFA TOTP + 8 recovery codes per user (Faza 28 Krok 6) |
| Session inactivity | 1h timeout + 60s warning modal (Faza 28 Krok 5) |
| Re-auth na sensitive | Zmiana hasła, unenroll 2FA, regenerate codes, GDPR delete |
| Anti-enumeration | forgot-password zawsze ten sam success message |
| Password strength | min 12 + complexity + HIBP breach check (Faza 28 Krok 3) |
| GDPR cooling-off | 14 dni delay z email cancel link (Faza 28 Krok 7) |
| Audit logs immutable | RLS REVOKE + trigger PREVENT UPDATE/DELETE (Faza 28 Krok 8) |

**Status:** ✅ Wszystkie wymagane kontrole.

---

## A05:2021 — Security Misconfiguration

| Kontrola | Implementacja |
|---|---|
| Security headers | HSTS prod, X-Frame-Options DENY, X-Content-Type-Options, Permissions-Policy, Referrer-Policy ([next.config.ts](../../next.config.ts)) |
| CSP | Report-Only (przełączenie na enforced w Fazie 42) |
| Stack traces hidden | Sentry capture, `console.error` nie leci do response body |
| Default credentials | Brak defaultów w env vars; `isResendConfigured()` etc. wykrywa placeholders |
| Disabled directory listing | Vercel default |
| Unused features off | `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| Dev override flags | `RESEND_DEV_TO_OVERRIDE` jawnie udokumentowany w `lib/email/send.ts` |

**Status:** ✅ Production headers OK, ⏳ CSP enforcement zaplanowany na Fazę 42.

---

## A06:2021 — Vulnerable and Outdated Components

| Kontrola | Implementacja |
|---|---|
| Dependency audit | `pnpm audit` w Fazie 28 Krok 1 — z 43 vulns ➜ 3 (overrides) |
| Renovate bot | Configured (`renovate.json` w repo) |
| Direct deps current | Next 16.2.6, Supabase SSR 0.10, Stripe 22.1, Sentry 10.53, Inngest 4.4 |

**Pozostałe 3 high:** `@opentelemetry/auto-instrumentations-node`, `sdk-node`,
`exporter-prometheus` (Prometheus exporter — niewystawiony publicznie).
Wymaga update inngest upstream. Akceptowane jako known issue, monitoring co
miesiąc czy inngest wydał.

**Status:** ✅ 93% redukcja vulns, dokumentowana known issue.

---

## A07:2021 — Identification and Authentication Failures

| Kontrola | Implementacja |
|---|---|
| Strong passwords | min 12, complexity, HIBP check (Faza 28 Krok 3) |
| 2FA | TOTP + 8 backup codes (Faza 28 Krok 6) |
| Brute force protection | Rate limit 5/15min/(IP+email) (Faza 28 Krok 2) |
| Credential stuffing | Per-(IP+email) bucket, Turnstile pre-check |
| Session timeout | 1h inactivity (Faza 28 Krok 5) |
| Account lockout | Brak (rate limit wystarcza dla MVP) |
| Secure session | httpOnly, Secure (prod), SameSite=Lax (Supabase defaults) |
| Password recovery | Magic link z 14d cooling-off, anti-enumeration |

**Status:** ✅ Pełne pokrycie.

---

## A08:2021 — Software and Data Integrity Failures

| Kontrola | Implementacja |
|---|---|
| Lockfile committed | `pnpm-lock.yaml` w repo |
| Subresource integrity | Vercel CDN dla własnego JS; Turnstile + Sentry to zaufane domeny |
| Webhook signatures | Stripe + Resend + Inngest (HMAC verify) |
| Audit log integrity | Append-only RLS + trigger (Faza 28 Krok 8) |
| Code signing | Brak (Vercel attestation by default) |
| Insecure deserialization | JSON.parse z try/catch wokół user input (zod walidacja zawsze przed użyciem) |

**Status:** ✅ Pełne pokrycie.

---

## A09:2021 — Security Logging and Monitoring Failures

| Kontrola | Implementacja |
|---|---|
| Audit logs | `audit_logs` table, append-only (Faza 8 + 28 trigger) |
| Auth events logged | login/logout/signup/password_reset/password_changed/mfa_* (Faza 28 Kroki 5-7) |
| GDPR events logged | export_requested/deletion_requested/canceled/executed (Faza 28 Krok 7) |
| Sentry capture | Server + Client + Edge configs, PII scrubbing (Faza 27) |
| Slack alerts | 3 channels: urgent/bugs/metrics (Faza 27) |
| Daily summary email | 06:00 PL cron (Faza 27) |
| Better Uptime / status page | `/api/status/components` (Faza 27) |
| Retention | 12 mc dla audit_logs (Inngest cleanup) — RODO/legal exempt |

**Status:** ✅ Pełne pokrycie.

---

## A10:2021 — Server-Side Request Forgery (SSRF)

| Kontrola | Implementacja |
|---|---|
| Outbound fetch whitelist | Aplikacja woła tylko: Supabase, Stripe, Resend, Cloudflare Turnstile, HIBP, KSeF (TEST/PROD), GUS, VIES, Inngest, Sentry — wszystko hardcoded URLs |
| User-provided URLs | NIE wykonujemy fetch z user-supplied URLs (poza KSeF webhook URL który jest własną domeną) |
| Internal services | Brak metadata.aws/google.internal calls — Vercel runtime nie ma SSRF surface |
| R2 presigned URLs | Server-side generuje, klient tylko PUT/GET (nie SSRF) |

**Status:** ✅ Pełne pokrycie.

---

## Podsumowanie

| Kategoria | Status |
|---|---|
| A01 Access Control | ✅ |
| A02 Crypto Failures | ✅ (3 transitive vulns akceptowane) |
| A03 Injection | ✅ |
| A04 Insecure Design | ✅ |
| A05 Misconfiguration | ✅ (CSP enforce w Fazie 42) |
| A06 Vulnerable Components | ✅ (93% redukcja) |
| A07 Auth Failures | ✅ |
| A08 Data Integrity | ✅ |
| A09 Logging | ✅ |
| A10 SSRF | ✅ |

**Wniosek po Fazie 28:** wszystkie 10 kategorii pokryte. Pozostałe ryzyka są
known/akceptowane lub zaplanowane do innych faz (CSP enforcement).
