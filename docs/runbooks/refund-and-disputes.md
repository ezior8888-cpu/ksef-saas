# Refunds & Stripe Disputes Runbook (Faza 35)

Procedura zwrotów (refund) i obsługi dispute'ów (chargeback) z Stripe.
Pełna polityka biznesowa: [docs/support/refund-policy.md](../support/refund-policy.md).
Tutaj — mechanika operacyjna.

## TL;DR

- **Refund** = my zwracamy kasę dobrowolnie (np. niezadowolony klient).
- **Dispute / chargeback** = klient idzie do swojego banku i kwestionuje
  płatność. Bank zabiera nam pieniądze + opłatę manipulacyjną. Walczymy
  o evidence w Stripe Dashboard albo akceptujemy stratę.

## 1. Refund (zwrot dobrowolny)

### Kiedy zwracamy

Zgodnie z [refund-policy.md](../support/refund-policy.md):
- Trial — wszystko, zawsze (user nie zapłacił).
- < 14 dni od pierwszej płatności — refund 100% na prośbę.
- > 14 dni — refund pro-rata za niewykorzystany okres.
- W razie naszego błędu (downtime, zgubione faktury) — pełen + przeprosiny.

### Procedura

```
1. /admin/users → wyszukaj user-a po email
2. User detail → tab "Billing" → przycisk "Refund payment"
3. Wybierz płatność z listy `stripe_payments`
4. Kwota (default: pełna) + powód (wybór z dropdownu)
5. Submit → akcja `refundPaymentAction` (lib/billing/billing-action-errors.ts)
```

Backend:
- Wywołuje `stripe.refunds.create({ payment_intent, amount, reason })`.
- Stripe webhook `charge.refunded` przyjdzie → handler zapisze `stripe_refunds`.
- Inngest job emituje email `RefundIssued` (Resend, template z Fazy 26).

### Co jeśli admin panel nie działa

Awaryjnie — przez Stripe Dashboard:
1. https://dashboard.stripe.com/payments → znajdź charge po email.
2. "Refund payment" → wpisz kwotę + powód.
3. Stripe wyśle nasz webhook automatycznie — wszystko spinte.
4. **Powiadom user-a ręcznie emailem** (template RefundIssued — gotowy w
   `lib/email/templates/`).

### Refund self-invoice (faktura naszej firmy do klienta)

Refund odwraca płatność, ale **nie kasuje wystawionej faktury VAT**
(self-invoicing z [ADR-0003](../adr/0003-self-invoicing-przez-wlasny-ksef.md)).
Procedura:

1. Refund w Stripe (jak wyżej).
2. **Wystaw fakturę korygującą** (KSeF) — w `/admin/users/<userId>` → tab
   "Self-invoices" → "Issue correction". Powód: "Zwrot środków".
3. Korekta idzie do KSeF normalnym pipeline'm + leci email user-owi.

Bez kroku 2 — faktura VAT zostaje "ważna", a ksiega firmowa będzie się nie
zgadzać.

## 2. Stripe Dispute (chargeback)

### Co się dzieje

1. Klient idzie do swojego banku: "ta transakcja jest niezadowalająca / fraud".
2. Bank zgłasza chargeback do Stripe.
3. Stripe **od razu zabiera nam pieniądze** + nalicza opłatę manipulacyjną
   ($15 standard, $25 fraud).
4. Webhook `charge.dispute.created` przychodzi → my dostajemy alert
   Slack `#urgent` (Faza 27).
5. Mamy **7-10 dni** (zależnie od typu) na response z evidence.

### Procedura — 0-24h od alertu

1. **Sprawdź typ disputu** w Stripe Dashboard:
   - `fraudulent` — klient mówi że nie autoryzował (kradzież karty?).
   - `subscription_canceled` — twierdzi że anulował, my wciąż pobieraliśmy.
   - `product_unacceptable` — produkt nie spełnił oczekiwań.
   - `unrecognized` — nie pamięta nas (najczęściej legit ale leniwy).
   - `duplicate` — dwukrotne obciążenie (sprawdź czy faktycznie).
   - `credit_not_processed` — obiecaliśmy refund, nie wykonaliśmy.

2. **Zdecyduj: walczyć czy zaakceptować?**
   - Walcz, jeśli MAMY evidence (user aktywnie korzystał z konta, jest jego
     IP w `audit_logs`, faktury VAT na jego firmę wystawione i nie kwestionowane).
   - Zaakceptuj (`accept dispute` w Stripe), jeśli:
     - Klient ewidentnie nie używał konta po pierwszej płatności (< 1 d aktywności).
     - Trial period nie był wyraźnie zaznaczony i klient ma rację.
     - Koszt zebrania evidence > kwota disputu.

### Procedura — gathering evidence

W `/admin/users/<userId>` zbierz:
1. **Aktywność konta** — `audit_logs` ostatnie 30 d: loginy, wystawione
   faktury, użyte OCR. Eksport do PDF.
2. **Faktury VAT** wystawione naszej firmy do klienta — dowód że klient
   akceptował usługę.
3. **Email confirmations** — Welcome, Trial Ending T-3, Subscription Activated
   (z `email_bounces` jeśli nie zostały delivered).
4. **Czas korzystania** — z PostHog: sesje, pageviews.

Wgraj evidence do Stripe Dashboard → Dispute detail → Submit evidence.

### Procedura — gdy przegrasz dispute

1. `dispute.lost` webhook przychodzi.
2. **Zablokuj konto user-a** — `/admin/users/<userId>` → Suspend.
3. **Anuluj subskrypcję** — w Stripe Customer Portal (lub `/admin` action).
4. **Wystaw fakturę korygującą** w KSeF (jak przy refundzie).
5. Dodaj user-a do internal blocklist (notatka w `admin_user_notes`),
   żeby nie przyjąć ponownej rejestracji od tego samego email/firmy.

## 3. Metryki & alerty

- Dispute rate > 1% transakcji/mies. → red flag (Stripe może podnieść opłaty).
- Refund rate > 5% → audyt: jaki segment klientów się skarży?
- Daily Slack digest (Faza 27) pokazuje refunds + disputes w `#metrics`.

## Powiązany kod / dokumenty

- [docs/support/refund-policy.md](../support/refund-policy.md) — pełna polityka biznesowa
- [docs/architecture/billing-flow.md](../architecture/billing-flow.md) — flow billing
- [ADR-0003](../adr/0003-self-invoicing-przez-wlasny-ksef.md) — self-invoicing
- `app/admin/users/[userId]/billing-actions.ts` — akcje admin
- `app/api/stripe/webhook/route.ts` — handler `charge.refunded` / `dispute.*`
- Tabele: `stripe_payments`, `stripe_refunds`, `stripe_webhook_events`
