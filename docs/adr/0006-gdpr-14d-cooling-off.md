# ADR-0006: GDPR delete = 14-dniowy cooling-off

- **Status:** Accepted
- **Data:** 2026-04-15
- **Faza:** 28

## Kontekst

RODO Art. 17 wymaga right-to-be-forgotten. Naiwne podejście: user klika
"usuń konto" → DELETE natychmiast. Problemy:
1. Pomyłki / hijack — usunięcie nieodwracalne (faktury 10 lat retencji
   prawnej!).
2. Faktury VAT muszą zostać (prawo PL > GDPR w tej sprawie).
3. `audit_logs` muszą zostać do audytu (też prawo) — ale można zanonimizować.

## Decyzja

**14-dniowy cooling-off period** między żądaniem a wykonaniem usunięcia.

Flow:
1. User klika "usuń konto" w `/settings/account` → tworzy się
   `gdpr_deletion_requests` (status=pending, scheduled_for=now+14d).
2. Email potwierdzający z linkiem "Anuluj usunięcie" (`/gdpr/cancel`).
3. Cron `gdprProcessDeletionsJob` (co godzinę) wykonuje wymagalne:
   - **Anonimizuje** `audit_logs` (RPC `anonymize_user_audit_logs`) — zostają,
     ale bez PII.
   - **Faktury zostają** (10 lat retencji prawnej, niezależnie od GDPR).
   - **Reszta danych usera** — DELETE (memberships, support conversations,
     email_preferences, mfa_recovery_codes, push_subscriptions, etc.).
   - **Stripe customer** — anonimizujemy email u Stripe (`customer.update`).

## Konsekwencje

### Pozytywne

- Pomyłka jest odwracalna — 14 dni na "Anuluj usunięcie".
- Hijack mitigated — atakujący musi mieć dostęp do emaila przez 14 dni.
- Prawnie zgodne (RODO mówi "bez zbędnej zwłoki", 14 d to akceptowalne).
- Faktury VAT zachowane (zgodność z prawem RP).

### Negatywne / koszty

- Niektórzy userzy będą oczekiwać natychmiastowego usunięcia ("usuń teraz"
  request). Mamy w docs/refund-policy mówić im o 14 d window.
- Subskrypcja Stripe zostaje aktywna przez 14 d — anulujemy automatycznie
  przy usunięciu (cron).
- `gdpr_deletion_requests` zostaje w DB na zawsze (audit kto i kiedy poprosił).

### Wymaga

- Trigger immutable na `audit_logs` (Faza 28, migracja 00052) — nie da się
  ich UPDATE/DELETE poza RPC anonimizacji.
- Email cancel link z tokenem (HMAC, ważność 14 d).
- Cron co godzinę (Inngest `gdprProcessDeletionsJob`).

## Rozważane alternatywy

- **Natychmiastowe DELETE** — ryzyko + niezgodne z prawem (faktury). Odrzucone.
- **30 dni cooling-off** — niepotrzebnie długo, frustracja userów. Odrzucone.
- **24 h** — za krótko na typowy weekend / urlop. Odrzucone.

## Linki

- Migracja `00051_gdpr_deletion_requests.sql`, `00052_audit_logs_immutable_trigger.sql`
- `app/api/gdpr/export/route.ts` — eksport danych przed usunięciem
- `app/gdpr/cancel/page.tsx` — link anulowania
- `lib/inngest/jobs/gdpr-process-deletions.ts`
