# ADR-0003: Self-invoicing przez własny pipeline KSeF

- **Status:** Accepted
- **Data:** 2026-03-12
- **Faza:** 25

## Kontekst

Po każdej udanej płatności Stripe od klienta MUSIMY wystawić mu fakturę VAT
(wymóg prawny PL). Mamy dwie ścieżki:
1. Zewnętrzna usługa fakturująca (Fakturownia API itp.) — koszt + zależność.
2. Wystawić fakturę **przez własny pipeline KSeF** (Faza 23) — meta-rekursja:
   nasza apka fakturuje swojego klienta przez infrastrukturę, którą sprzedaje.

## Decyzja

**Wystawiamy faktury VAT przez własny pipeline KSeF.** Po webhooku
`invoice.payment_succeeded` Inngest emituje event `invoice/submit.requested`
identyczny jak zwykła faktura. Sprzedawcą jest tenant operatora
(`FAKTFLOW_OPERATOR_TENANT_ID` env var = nasza JDG/spółka).

## Konsekwencje

### Pozytywne

- **Zero zewnętrznej zależności** — nie płacimy Fakturowni za każdą emisję.
- **Dogfooding** — sami używamy własnego produktu, więc każdy bug ścieżki
  KSeF natychmiast nas boli.
- Klient widzi swoją FV w `/invoices` jak każdą inną — spójne UX.
- Jeden pipeline = jedne logi, monitoring, retry, audit.

### Negatywne / koszty

- Operator (my) MUSI mieć skonfigurowane realne credentials KSeF produkcyjne
  PRZED wystawieniem pierwszej faktury klientowi.
- Wymaga osobnego tenanta-operatora w bazie (env `FAKTFLOW_OPERATOR_TENANT_ID`).
- Jeśli pipeline KSeF padnie, padnie też nasze fakturowanie — ale to i tak
  blocker dla biznesu klienta, więc priorytet 0 alert.
- W tle ten sam Inngest concurrency/throttle co user invoices (Faza 23) —
  trzeba pamiętać że operator też ma swój limit 100/60-per-min.

### Wymaga

- Env: `FAKTFLOW_OPERATOR_TENANT_ID`, `FAKTFLOW_OPERATOR_BANK_ACCOUNT`.
- Realne credentials KSeF na koncie operatora.
- Tenant operatora seedowany w bazie pre-launch.

## Rozważane alternatywy

- **Fakturownia API** — koszt per faktura + ryzyko vendor lock-in + brak
  dogfoodingu. Odrzucone.
- **Ręczne fakturowanie z panelu** — nie skaluje. Odrzucone.
- **Tylko paragony fiskalne** — niezgodne z prawem (B2B wymaga FV).

## Linki

- [docs/architecture/billing-flow.md](../architecture/billing-flow.md)
- `lib/inngest/jobs/self-invoice-payment.ts`
- ADR-0004 (retry KSeF — dotyczy też self-invoice)
