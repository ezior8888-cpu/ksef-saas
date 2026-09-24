# Stripe: subskrypcje, Checkout i plan faktury VAT — odbiór 2026-09-24

**Stan:** lokalny pakiet zależny od roboczego PR #34. Nie uruchomiono migracji, Stripe live, KSeF ani wdrożenia Hetzner/Coolify.

## Powód i granica

[Stripe nie gwarantuje kolejności webhooków](https://docs.stripe.com/webhooks#event-ordering), a sekundowy event.created nie jest numerem wersji subskrypcji. Atomowy odbiór jednego zdarzenia nie chroni przed starszym, ale innym subscription.updated: mogło ono cofnąć bieżący status lub plan. Nieznany Price ID był też opisywany jako plan miesięczny, Checkout nie sprawdzał istniejącej subskrypcji, a opóźniony job VAT brał dzisiejszy plan zamiast planu opłaconej faktury.

- Wszystkie cztery obsługiwane zdarzenia subskrypcji (created, updated, deleted, trial_will_end) pobierają aktualny obiekt Stripe. Migracja 00078 serializuje cykl pobranie → zapis dla jednego subscription ID przez 90-sekundową dzierżawę, token i rosnący numer fencing. Stary token nie może nadpisać nowszego stanu. RPC atomowo sprawdza token, zapisuje dozwolone pola i zwalnia dzierżawę. Błąd przed próbą zapisu może zostać ponowiony; utracona odpowiedź po próbie zapisu jest niepewna i wymaga uzgodnienia.
- Migracja odbiera service_role bezpośredni INSERT/UPDATE/DELETE na subscriptions; aplikacja pisze tylko przez RPC. Stary kod webhooka przestanie działać po 00078. Kod i migrację trzeba przełączyć wspólnie przy wstrzymanym wejściu webhooka.
- Nieznana cena, status, kilka pozycji, niepełna lista lub ilość inna niż jedna zatrzymują synchronizację. Lokalny model opisuje dokładnie jedną usługę. Wpis o końcu trialu przechodzi tę samą kontrolę powiązania Customer z firmą.
- Checkout sprawdza lokalną bazę i aktualne subskrypcje Customer w Stripe. Żądania firmy w jednej godzinie używają wspólnego klucza idempotencji. To ogranicza duplikaty, ale nie zamyka wyścigu pomiędzy godzinami; trwały claim Checkout pozostaje osobnym zadaniem.
- Job VAT wyznacza plan z zapisanego snapshotu konkretnej opłaconej faktury Stripe, nie z obecnego planu. Wymaga zgodnych identyfikatorów faktury, Customer i subskrypcji, pełnej pojedynczej pozycji bez proraty oraz zgodnej kwoty. Obsługuje osobno pola Acacia i Basil. Brak lub konflikt danych zatrzymuje automatyczne wystawienie do ręcznego uzgodnienia. Wcześniejszych dokumentów nie koryguje.
- Ponowienie zapisu faktury VAT przy kolizji numeru sprawdza pełne Stripe invoice ID, kwotę, nabywcę i kompletność zapisanej pozycji. Inna faktura z tą samą skróconą końcówką albo niepełny zapis zatrzymuje automatyczne powiązanie.

## Przed oknem wdrożenia — Bartek

1. Potwierdzić PR #32 i #34 oraz zastosowanie 00075–00077. Na kopii bazy sprawdzić granty service_role, czas DDL 00078, stare subskrypcje i płatności bez pełnego snapshotu; wykonać kopię i próbę restore. Codex nie wykonywał SQL.
2. W Stripe test/live sprawdzić, że STRIPE_PRICE_MONTHLY i STRIPE_PRICE_ANNUAL wskazują właściwy produkt, PLN oraz okres miesiąca/roku. Sama nierówność ID w kodzie nie potwierdza konfiguracji. Uzgodnić istniejące Customer ID, aktywne subskrypcje i osierocone Checkout/Customer.
3. Przejrzeć wystawione faktury VAT, gdy plan zmienił się między płatnością a jobem. Korekta w KSeF wymaga decyzji księgowej. Płatności bez pełnego podpisanego snapshotu nie przechodzą automatycznie.
4. Z księgowym sprawdzić zasady VAT dla faktycznych klientów i rabatów przed włączeniem automatycznych faktur: obecny generator wylicza 23% z kwoty brutto. Nowa kontrola planu nie potwierdza prawidłowości stawki ani miejsca opodatkowania.

## Kontrolowany rollout

1. Zwracać 503 tylko dla endpointu webhooka Stripe; wstrzymać nowe Checkout. Poczekać na zakończenie starych instancji webu i workerów. Nie mieszać starego i nowego handlera.
2. Właściciel stosuje 00078 po 00077 i wymienia wszystkie instancje webu oraz workerów. Nie wykonywać migracji jako service_role; SECURITY DEFINER wymaga uprzywilejowanego właściciela.
3. W test mode wymusić odwrócone active/past_due i zmiany planu, ten sam sekundowy timestamp, dwie równoległe odpowiedzi Stripe, wygaśnięcie dzierżawy, deleted przed created, obcy Customer, błąd Stripe, nieznaną cenę/status oraz wiele pozycji. Sprawdzić oba backendy jobów. Checkout: istniejąca subskrypcja w DB/Stripe, dwa równoległe żądania, różne plany i granica godziny. VAT: plan zmieniony po płatności, Acacia/Basil, prorata, brak snapshotu, błędna waluta i kwota.
4. Otworzyć wejście po potwierdzeniu nowych instancji, podpisu Stripe, grantów i alarmów. Obserwować 2xx/5xx, retryable/failed, zajęte dzierżawy, VAT i kolejkę. Nie resetować niepewnego claimu bez porównania Stripe, bazy, audytu i zadań.

Wyłącznie odczytowe kontrole po 00078:

~~~sql
SELECT
  has_table_privilege('service_role', 'public.subscriptions', 'SELECT') AS can_read,
  has_table_privilege('service_role', 'public.subscriptions', 'INSERT') AS can_insert,
  has_table_privilege('service_role', 'public.subscriptions', 'UPDATE') AS can_update,
  has_table_privilege('service_role', 'public.subscriptions', 'DELETE') AS can_delete;

SELECT
  has_function_privilege('service_role', 'public.claim_stripe_subscription_sync(text)', 'EXECUTE') AS can_claim,
  has_function_privilege('service_role', 'public.apply_stripe_subscription_sync(text, uuid, bigint, jsonb)', 'EXECUTE') AS can_apply,
  has_function_privilege('service_role', 'public.release_stripe_subscription_sync(text, uuid, bigint)', 'EXECUTE') AS can_release;

SELECT count(*) AS expired_subscription_leases
FROM public.stripe_subscription_sync_leases
WHERE claim_token IS NOT NULL AND lease_expires_at < now();

SELECT count(*) AS uninvoiced_payments_without_snapshot
FROM public.stripe_payments
WHERE status = 'succeeded' AND vat_invoice_id IS NULL
  AND (last_webhook_payload IS NULL
       OR jsonb_typeof(last_webhook_payload) <> 'object');
~~~

Oczekiwane granty: can_read=true, zapisy bezpośrednie=false, trzy RPC=true. Historyczne rozbieżności i wcześniejszy FK NOT VALID wymagają osobnego rozliczenia według runbooka PR #34.

## Granice i rollback

Pozostają: wyścig Checkout między godzinami, zwrot wobec wystawienia/wysyłki faktury VAT, brak trwałego outboxu po webhooku oraz nieatomowy odczyt przed mailem. Płatności z wieloma pozycjami, proratą, kredytem lub niepełnym snapshotem wymagają osobnego modelu księgowego i uzgodnienia. Skrócony identyfikator Stripe w numerze VAT wymaga docelowo trwałego unikalnego powiązania po pełnym ID, z rozliczeniem historii przed zmianą formatu. Prawdziwy Stripe/KSeF/Resend i baza nie zostały sprawdzone.

Po 00078 samo cofnięcie aplikacji do starego obrazu nie przywróci zapisu subskrypcji: rola utraciła DML. Przy problemie ponownie odciąć webhook i Checkout, zachować bazę i stan claimów, naprawić nową ścieżkę albo wykonać osobno przetestowany rollback bazy przez właściciela. Nie usuwać dzierżaw lub webhook receipts, aby wymusić replay.