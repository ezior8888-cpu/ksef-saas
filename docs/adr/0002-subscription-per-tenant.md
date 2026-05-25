# ADR-0002: Subscription per-tenant, nie per-user

- **Status:** Accepted
- **Data:** 2026-03-10
- **Faza:** 25

## Kontekst

Stripe może modelować billing per-user (każdy user = osobny customer) lub
per-tenant (cała firma = jeden customer). Target: mikroprzedsiębiorcy (JDG +
1-3 księgowych w firmie). JDG = jednoosobowa, ale często z księgową
zewnętrzną mającą dostęp do faktur.

## Decyzja

**Subscription jest per-tenant.** `tenants.stripe_customer_id` trzyma
referencję. Cała firma płaci jeden plan; wszyscy użytkownicy w obrębie
`memberships` mają taki sam dostęp.

Trial 30 dni (`subscription_data.trial_period_days: 30` w Checkout). Plany:
miesięczny / roczny.

## Konsekwencje

### Pozytywne

- Naturalne dla księgowej z dostępem do firmy klienta — nie tworzy własnej
  subskrypcji.
- Prostsze enforcing limitów planu (sprawdzamy `tenant.plan`, nie agregację
  per-user).
- Self-invoicing (ADR-0003) działa naturalnie — faktura na firmę, nie usera.

### Negatywne / koszty

- Brak modelu "premium user w darmowej firmie" — całość albo nic.
- Migration na plan per-user (gdyby przyszło) wymaga refaktoringu billingu.

### Wymaga

- UI billingu (`/settings/billing`) dostępne tylko dla roli `owner` / `admin`.
- Webhook handler (`app/api/stripe/webhook/route.ts`) mapuje `customer_id` →
  `tenant_id` przez `tenants.stripe_customer_id`.

## Rozważane alternatywy

- **Per-user** — komplikuje przypadek księgowej (musiałaby kupić plan dla
  każdej firmy klienta). Odrzucone.
- **Hybrid (seat-based)** — feature do post-launch enterprise tier, nie MVP.

## Linki

- [docs/architecture/billing-flow.md](../architecture/billing-flow.md)
- Migracja `00047_billing_stripe.sql`
- `lib/inngest/jobs/self-invoice-payment.ts`
