<wizard-report>
# PostHog post-wizard report

The wizard completed an initial PostHog pass; **Faza 31** loads **`array.js` from `eu-assets.i.posthog.com`** (same entry as the dashboard HTML snippet), then calls **`posthog.init`** with **`defaults: '2026-01-30'`**, **`api_host: '/ingest'`** (Next rewrites + `skipTrailingSlashRedirect`), and **`ui_host`** from env — see `lib/analytics/browser-posthog.ts`, `components/analytics/posthog-snippet-loader.tsx`, and `components/analytics/analytics-provider.tsx`. `/ingest` is allowed anonymously in `isPublicPath` so the SDK can load before login.

## Files created or modified

| File | Change |
|------|--------|
| `lib/analytics/posthog-node-client.ts` | Singleton `posthog-node` + `shutdown` (SIGTERM/SIGINT z `instrumentation.ts`) |
| `lib/posthog-server.ts` | Re-export (`getPostHogClient` → `getPostHogNodeClient`) |
| `components/analytics/analytics-identify.tsx` | Identify + `group('tenant', …)` na dashboardzie |
| `app/(dashboard)/layout.tsx` | `AnalyticsIdentify` z danymi sesji |
| `app/(auth)/login/actions.ts` | Added server-side `posthog.identify()` after successful email login |
| `components/invoices/actions.ts` | Added `invoice_draft_saved` and `invoice_submitted` events |
| `app/api/stripe/webhook/route.ts` | Added `subscription_created`, `payment_succeeded`, `payment_failed` events |
| `app/(dashboard)/settings/billing/_components/plan-cards.tsx` | Added `checkout_started` event |
| `components/settings/certificate-upload.tsx` | Added `ksef_certificate_uploaded` event |
| `components/invite/invite-accept-form.tsx` | Added `team_invitation_accepted` event |

## Events instrumented

| Event | Description | File |
|-------|-------------|------|
| `invoice_submitted` | User successfully submitted an invoice to KSeF (enqueued for sending) | `components/invoices/actions.ts` |
| `invoice_draft_saved` | User saved an invoice as a draft without submitting to KSeF | `components/invoices/actions.ts` |
| `checkout_started` | User clicked to start a subscription checkout (monthly or annual plan) | `app/(dashboard)/settings/billing/_components/plan-cards.tsx` |
| `subscription_created` | Stripe webhook: new subscription created for a tenant | `app/api/stripe/webhook/route.ts` |
| `payment_succeeded` | Stripe webhook: subscription payment succeeded | `app/api/stripe/webhook/route.ts` |
| `payment_failed` | Stripe webhook: subscription payment failed (churn risk signal) | `app/api/stripe/webhook/route.ts` |
| `ksef_certificate_uploaded` | User successfully uploaded and verified their KSeF certificate (key onboarding step) | `components/settings/certificate-upload.tsx` |
| `team_invitation_accepted` | User accepted a team invitation and joined an organization | `components/invite/invite-accept-form.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](https://eu.posthog.com/project/183804/dashboard/694985)
- [Invoice submissions over time](https://eu.posthog.com/project/183804/insights/gpjQRJla) — daily trend of invoice volume (core business metric)
- [Invoice workflow funnel](https://eu.posthog.com/project/183804/insights/ojuiEkTT) — conversion from draft saved → submitted to KSeF
- [Subscription funnel](https://eu.posthog.com/project/183804/insights/XiANiMfq) — conversion from checkout started → subscription created
- [Payment failures over time](https://eu.posthog.com/project/183804/insights/CScAWAqG) — weekly churn risk signal
- [KSeF onboarding completions](https://eu.posthog.com/project/183804/insights/AmUIfMhK) — weekly certificate upload rate (onboarding health)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
