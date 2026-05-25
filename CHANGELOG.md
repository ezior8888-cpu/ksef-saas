# Changelog

Wszystkie istotne zmiany w projekcie. Pre-launch — wersjonujemy fazami
(masterplan), nie SemVer. Po launchu (luty 2027) przechodzimy na SemVer.

Format luźno na podstawie [Keep a Changelog](https://keepachangelog.com).
Każda faza linkuje do swojego state-of-the-art opisu w pamięci projektu
(`current_state.md`) i do ADR jeśli wprowadziła kluczową decyzję.

## [Unreleased] — Faza 35: Documentation & Internal Runbooks

**Data:** w trakcie · **Status:** doc-only, brak zmian runtime

### Added
- `docs/architecture/` — 5 diagramów Mermaid (system overview, KSeF flow,
  OCR flow, billing flow, multi-tenant + RLS).
- `docs/database-schema.md` — opis 49 tabel pogrupowanych w 10 domen + ENUM-y +
  polityka retencji.
- `docs/adr/` — 8 ADR (RLS, subscription per-tenant, self-invoicing,
  KSeF retry, 2FA Supabase native, GDPR 14d, backup free-tier, polling OCR).
- `docs/runbooks/` — `deploy-production.md`, `refund-and-disputes.md`,
  `unlock-account.md`, `sentry-error-codes.md`, `ksef-error-codes.md`.
- `docs/onboarding.md` — pierwsze 30 dni nowego dewa.
- `CHANGELOG.md` (ten plik).

## Faza 34 — Load Testing & Performance Validation

**Data:** 22 maja 2026

### Added
- **k6** w `load-tests/` — config, 4 scenariusze user-journey (dashboard,
  invoice, OCR, bulk), orkiestrator miksu 60/25/10/5, 3 stress-testy
  (DB, kolejka KSeF, OCR), smoke.
- Migracja `00055_phase34_performance_indexes.sql` — 2 indeksy na invoices
  (lista wychodzących + inbox).
- `vercel.json` — region `fra1`, pamięć 2 GB dla eksportów/GDPR, `maxDuration`
  dla Inngest/support.
- `docs/runbooks/scaling-triggers.md`, `docs/performance-budget.md`.
- `load-tests/lighthouse-budget.json` + skrypt `perf:lighthouse`.

### Changed
- `next.config.ts` — `outputFileTracingRoot` (warning lockfiles zniknął),
  `experimental.optimizePackageImports`, Sentry `bundleSizeOptimizations`.
- `package.json` — `browserslist` (Chrome/FF/Edge 110+, Safari 16+).

### Known
- **Shared First Load JS ≈ 310 KB gz** (~10 KB ponad budżet 300 KB). Ciężar
  to SDK Sentry (~146 KB) + PostHog (~60 KB). Tuning konfiguracji nie ruszył
  wagi. Decyzja: lazy-load PostHog (refaktor 7 plików) jako follow-up.
- **SSE vs polling: zostaje polling** ([ADR-0008](./docs/adr/0008-ocr-polling-nie-sse.md)).

## Faza 33 — Complete Phase 9 (PDF Generation + Exports)

Ukończona w sesji pośredniej — szczegóły nie zarejestrowane w pamięci.

## Faza 32 — Accessibility & UX Final Polish

Ukończona w sesji pośredniej — szczegóły nie zarejestrowane w pamięci.

## Faza 31 — Analytics & Product Intelligence

**Stack:** PostHog Cloud EU (`posthog-js` + `posthog-node`).

### Added
- Provider consent-gated (eager init, proxy `/ingest`).
- 51 typed eventów w `lib/analytics/events.ts` (6 kategorii).
- Client tracking (pageviews + `track()`), server tracking
  (signup/login/payment/subscription/invoice — `trackServer` z `flushAt:1`).
- Identify + group analytics (per-tenant).
- A/B testing (PostHog feature flags + `useExperiment` hook).
- Daily Slack digest cron (06:00 PL `#metrics`).
- Consent baner opt-in, session replay z maskowaniem.
- `docs/analytics/` — event-dictionary + funnels-cohorts.

### Dropped
- Plausible — PostHog robi wszystko.

## Faza 30 — AI Support System + Knowledge Base

**Decyzja:** własny AI chat (nie Crisp) — Anthropic SDK, dane w naszym Supabase.

### Added
- Migracja `00054_support_conversations.sql`.
- Knowledge base — 26 artykułów MDX w `content/help/` + routing `/pomoc`.
- AI chat widget (floating, streaming, Haiku model, KB w system prompt z
  prompt caching).
- `/api/support/chat`, eskalacja (AI uncertain + user-initiated) → Slack `#bugs`.
- Auto-kategoryzacja, CSAT thumbs, contextual help per-strona.
- Admin `/support` sekcja konwersacji.
- `docs/support/` — tone, escalation, refund, scenarios.

### Deferred
- Loom video tutoriale — Fazy 41-43 (user nagra sam).

## Faza 29 — Backup, Recovery & DR

### Added
- Migracja `00053_backup_log.sql` + RPC `list_public_tables`.
- Daily DB snapshot do R2 (gzip + SHA-256), weekly verify cron, cleanup cron
  (30d / 8w retention).
- 3 Inngest crony (`dailyDbSnapshotJob`, `verifyBackupJob`, `cleanupOldBackupsJob`).
- `docs/runbooks/disaster-recovery.md`, `docs/runbooks/backup-restore.md`,
  `docs/security/rto-rpo.md` (RTO < 2 h, RPO ~24 h free tier).
- Admin `/system` BackupStatusCard.

### Decision
- **Free-tier first** ([ADR-0007](./docs/adr/0007-backup-free-tier-first.md)) —
  PITR + AWS Glacier odłożone jako Phase 2 po launch.

## Faza 28 — Security Audit & Hardening

### Added
- Migracje `00050`-`00052` (MFA recovery codes, GDPR deletion requests, audit logs immutable trigger).
- Dependency hardening (43 → 3 vulns przez bump + pnpm overrides).
- Rate limiting auth (Upstash sliding window: login/register/reset).
- Password min 12 + complexity + HIBP breach check.
- Cloudflare Turnstile bot protection (3 formy).
- Session inactivity timeout 1 h + reauth.
- **2FA TOTP** ([ADR-0005](./docs/adr/0005-2fa-supabase-mfa-native.md)) — Supabase MFA native + 8 recovery codes scrypt, AAL middleware.
- GDPR right-to-be-forgotten ([ADR-0006](./docs/adr/0006-gdpr-14d-cooling-off.md))
  — export JSON + delete z 14-dniowym cooling-off + Inngest cron.
- `audit_logs` immutable trigger, key rotation runbook, OWASP Top 10 mapping doc.

## Faza 27 — Monitoring + Alerting + Observability

### Added
- Sentry refinements (release tracking + custom fingerprints dla KSeF/Stripe grouping).
- `lib/observability/sentry-context.ts`.
- `lib/alerts/slack.ts` — 3 kanały (`#urgent`/`#bugs`/`#metrics`).
- `/api/status/components`.
- Business-metrics aggregator.
- Daily summary email cron (06:00 PL).
- Weekly business review (Pn 09:00 PL).
- Critical alerts monitor cron (co 5 min, 4 progi z deduplication).

## Faza 26 — Email Infrastructure & Deliverability

### Added
- Migracja `00049_email_infrastructure.sql` (email_preferences + email_bounces).
- HMAC-signed unsubscribe tokens, RFC 8058 one-click unsubscribe.
- Resend webhook handler (Svix sig verify + auto-deactivate hard bounces/complaints).
- Email category preferences UI w `/settings/notifications`.
- Transactional vs marketing domain split.
- Nowe templates: AccountDeletionConfirmation, MagicImportCompleted,
  TrialEnding, PaymentFailed, RefundIssued.

## Faza 25 — Stripe Integration + Billing

**Stack:** `stripe@22.1.1`.

### Added
- Migracja `00047_billing_stripe.sql` (subscriptions / payments / refunds /
  webhook_events).
- Checkout + Customer Portal.
- `/settings/billing` page.
- Webhook handler z idempotency + signature verify.
- **Self-invoicing przez KSeF** ([ADR-0003](./docs/adr/0003-self-invoicing-przez-wlasny-ksef.md))
  — po `payment_succeeded` Inngest emituje fakturę VAT przez pipeline Fazy 23.
- Trial countdown (14/7/3/1 dni), dunning emails.
- Admin refunds.

### Decision
- **Subscription per-tenant** ([ADR-0002](./docs/adr/0002-subscription-per-tenant.md)).

## Faza 24 — Admin Panel (Operations Center)

### Added
- `/admin/*` z `ADMIN_EMAILS` guard.
- 6 stron: dashboard / users / system / support / audit / flags.
- Akcje: suspend / force-logout / reset / delete GDPR / notes.
- KSeF health 24h chart, Inngest jobs status, DB stats.
- Refund button w user detail (rozszerzony w Fazie 25).

## Faza 23 — KSeF Queue Hardening + Resilience

### Added
- `lib/ksef/health-status.ts` (Redis-cached snapshot).
- KSeF health monitor cron (co 30 s).
- Submit-invoice z concurrency 100 + throttle 60/min per-tenant.
- Smart retry 30s → 2m → 5m → 15m → 1h, 4xx vs 5xx split
  ([ADR-0004](./docs/adr/0004-ksef-retry-i-offline24.md)).
- Offline24 fallback po wyczerpaniu retries.
- UPO retry po 24 h.
- Audit log każdej interakcji z KSeF.
- Mock KSeF + simulation testy.

## Faza 22 — Caching Layer (Redis + Edge)

### Added
- `@upstash/redis` + `@vercel/edge-config`.
- `lib/cache/*` (TTL strategy, lookup-aside, SWR).
- Integracja w VAT validation + dashboard.
- `lib/feature-flags/` (per-tenant + global Edge Config).
- Edge revalidate na marketing pages.

## Faza 21 — Database Optimization & Indexing

### Added
- Migracja `00044_phase21_performance.sql` — composite/partial indexes.
- Materialized views `mv_tenant_dashboard_summary` + `mv_tenant_monthly_stats`.
- Inngest cron refresh hourly + cleanup audit_logs monthly.
- Cursor pagination.

## Faza 20 — Test Infrastructure (Playwright + Manual QA)

### Added
- Playwright config, 5 spec files (~30 testów).
- Mocki Anthropic / GUS / Resend.
- CI/CD GitHub Actions.
- `docs/qa-checklist.md` + `docs/bug-triage.md`.

## Faza 19 — Marketing Assets + Onboarding Foundation

### Added
- Welcome modal po onboardingu.
- EmptyState / Skeleton / Tooltip.
- Scroll reveals na landing.
- GUS auto-fetch w wizardzie.

---

## Fazy 10-18 (do Fazy 19)

Pracowane z poprzednią rozmową — szczegóły w
`current_state.md` (memory). Skrót: schemat DB i RLS (Fazy 1-2), KSeF
client (Fazy 5-7), wystawianie faktur (Faza 9), OCR + KPiR (Faza 18).
