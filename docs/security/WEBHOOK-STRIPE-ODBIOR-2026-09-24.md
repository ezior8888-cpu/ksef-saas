# Stripe webhook: przejęcie, kolejność i odbiór — 2026-09-24

**Stan:** pakiet lokalny do przeglądu. Nie potwierdza migracji bazy, zmian w Stripe ani wdrożenia na Hetzner/Coolify.

## Dlaczego ta zmiana

[Stripe nie gwarantuje kolejności zdarzeń i ponawia dostawy](https://docs.stripe.com/webhooks). Wcześniejszy kod mógł równolegle uruchomić dwa handlery dla tego samego `evt_*`: po konflikcie INSERT odczytywał status, a następnie bez warunku ustawiał `processing`. Finalizacja nie sprawdzała błędu ani liczby zmienionych wierszy. Faktura płatności otrzymana przed wierszem subskrypcji była pomijana, a późne `invoice.payment_failed` mogło uruchomić windykację po sukcesie. Stare `customer.subscription.updated` mogło wznowić już anulowaną subskrypcję. Po zmianie wersji Stripe API od Basil identyfikator subskrypcji faktury jest w [`invoice.parent.subscription_details.subscription`](https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects); mapper obsługuje ten i starszy kształt.

## Granica wdrożona w pakiecie

- Migracja `00076` udostępnia wyłącznie `service_role` atomowy claim zdarzenia i finalizację wymagającą tokenu właściciela. `processed` dostaje 200 bez handlera. Równoległe `processing` oraz `failed` dostają 503, bez podwójnego wykonania. Nie ma automatycznego przejęcia porzuconego claimu.
- `retryable` jest zarezerwowany dla typowanych błędów wykrytych **przed pierwszym lokalnym zapisem, audytem lub wysłaniem zadania**. Tylko ten stan może zostać automatycznie przejęty ponownie. Błąd po możliwych skutkach ubocznych pozostaje `failed`; błędna finalizacja po udanym handlerze pozostawia `processing`. Surowy komunikat wyjątku nie trafia do tabeli ani odpowiedzi HTTP.
- Migracja `00077` blokuje późny `succeeded → failed`, wznawianie tego samego anulowanego Stripe subscription ID oraz przeniesienie istniejącej płatności/subskrypcji do innej firmy. Nowa subskrypcja wymaga zgodności `stripe_customer_id` z przypisaniem w `tenants`; płatność może odwoływać się tylko do subskrypcji tej samej firmy. Zachowuje blokadę zwrotów z `00075`. Handlery sprawdzają wynik utrwalony w bazie przed audytem, zadaniem faktury VAT lub windykacji.
- Job maila o nieudanej płatności sprawdza trwałe `tenant_id`, ID faktury Stripe i `status` przed zarejestrowaniem powiadomienia oraz ponownie tuż przed wysyłką; pobiera też aktualną fakturę ze Stripe i wymaga statusu `open`. Jeśli płatność została potwierdzona albo faktura już nie jest otwarta, zapisuje `skipped` zamiast wysłać wezwanie. Niepewne odczyty bazy, konta właściciela lub Stripe zatrzymują mail i pozostawiają `sending` do alarmu oraz ręcznego uzgodnienia. Odczyt i zewnętrzna wysyłka nie są jedną transakcją.
- Dwa historyczne zdarzenia kolejki dotyczące anulowania i końca trialu nie miały odbiorców; handler nie wysyła już tych pustych zadań. Anulowanie nadal zapisuje stan i audyt, a przypomnienia o trialu obsługuje istniejący harmonogram, niezależnie od `JOBS_BACKEND`.
- Monitor co pięć minut alarmuje o webhookach `processing` i `retryable` starszych niż 15 minut, wszystkich `failed` oraz powiadomieniach o nieudanej płatności w `sending` ponad 15 minut. Alarm zawiera tylko liczniki, bez danych klienta, adresów i payloadu.
- Pierwsze przypisanie Stripe Customer używa warunkowego zapisu tylko przy pustym `tenants.stripe_customer_id`; żądanie, które przegra wyścig, odczytuje zwycięskie ID i nie używa osieroconego Customer do Checkout. W `00077` zwykła rola nie może ustawić ani zmienić tej kolumny, a nawet `service_role` może ustawić ją tylko pierwszy raz; nadpisanie wymaga kontrolowanego uzgodnienia przez właściciela bazy. Złożony FK wiąże subskrypcję z bieżącym przypisaniem. Przed otwarciem Checkout lub portalu kod pobiera Customer ze Stripe i wymaga zgodnej `metadata.tenantId`; stare rekordy bez tych metadanych zatrzymują dostęp do uzgodnienia. FK jest `NOT VALID`: stare rozbieżności wymagają osobnego rozliczenia i walidacji. Osierocone Customer ID po wyścigu wymagają kontrolowanego posprzątania w Stripe.

## Odbiór przez Bartka

1. Na kopii/testowej bazie sprawdzić istniejące statusy, granty, wielkość tabeli i czas budowy indeksu; wykonać kopię oraz próbę przywrócenia. Sprawdzić obecność/stan migracji `00075` oraz faktyczne granty. Sprawdzić także możliwość bezpośredniej edycji `tenants.stripe_customer_id` jako `authenticated`, zgodność `metadata.tenantId` istniejących Customer ze Stripe, rozbieżności klient–subskrypcja oraz osierocone Customer w Stripe. Szczególnie sprawdzić stare wiersze `processing`: po migracji `00076` mają `claim_token IS NULL` i **pozostaną zablokowane**. Uzgodnić je ze Stripe, płatnościami, audytem i kolejką. Nie usuwać wpisu, by wymusić ponowienie.
2. Na czas zmiany odciąć **sam endpoint webhooka** na wejściu odpowiedzią 503, wstrzymać nowe Checkout i tworzenie Customer oraz opróżnić wszystkie stare instancje webu. Stary kod nie rozumie tokenu claimu i podczas mieszanego rolloutu może wykonać handler równolegle. W krótkim oknie ponawiania Stripe zwróci dostawy; [dokumentacja Stripe](https://docs.stripe.com/webhooks) opisuje też ręczny resend. Nie wyłączać całej aplikacji ani nie puszczać części ruchu do starej wersji webhooka. Zwykły `CREATE INDEX` i `ADD FOREIGN KEY NOT VALID` wymagają krótkich blokad DDL: czas zmierzyć na kopii przed oknem produkcyjnym.
3. Po odcięciu ingress wykonać `00076`, potem `00077`, następnie wymienić wszystkie instancje aplikacji i workerów. Po rozliczeniu historycznych rozbieżności osobno wykonać `VALIDATE CONSTRAINT subscriptions_tenant_customer_fk` i sprawdzić `pg_constraint.convalidated`; nie maskować starych niezgodności automatycznym przepięciem. To zadanie **nie uruchamia SQL**. W test mode sprawdzić dwa równoległe Checkout dla firmy (jedno utrwalone Customer ID), odmowę podmienienia Customer ID również przez starą instancję `service_role`, brak otwarcia portalu dla Customer z obcą lub brakującą `metadata.tenantId`, próbę edycji tego ID zwykłą sesją i odmowę obcego powiązania, następnie podpis, dwa równoległe takie same eventy, fakturę przed subskrypcją, `failed → succeeded` także między zakolejkowaniem maila a jego wysyłką w obu backendach, opóźnione `payment_failed` po sukcesie, `deleted` przed `created`, stary `updated` po anulowaniu, błąd finalizacji i błąd po wysłaniu zadania. Sprawdzić brak podwójnej faktury VAT i windykacji po zapłacie w testowanych kolejnościach; taki test nie gwarantuje atomowości z zewnętrzną pocztą.
4. Otworzyć ingress dopiero po potwierdzeniu, że każda instancja używa nowego claimu i podpisy są poprawne. Obserwować 2xx/5xx, liczniki `processing`/`retryable`/`failed`, kolejkę, płatności oraz Stripe Workbench. Rollback do starego obrazu wymaga ponownego odcięcia endpointu — inaczej znika gwarancja pojedynczego handlera.

Przykładowe **wyłącznie odczytowe** kontrole po `00076` (bez payloadów i danych klientów):

```sql
SELECT processing_status, count(*) FROM public.stripe_webhook_events
GROUP BY processing_status ORDER BY processing_status;

SELECT count(*) AS legacy_processing_without_token
FROM public.stripe_webhook_events
WHERE processing_status = 'processing' AND claim_token IS NULL;

SELECT count(*) AS stale_processing
FROM public.stripe_webhook_events
WHERE processing_status = 'processing'
  AND received_at < NOW() - INTERVAL '15 minutes';

SELECT count(*) AS stale_retryable
FROM public.stripe_webhook_events
WHERE processing_status = 'retryable'
  AND received_at < NOW() - INTERVAL '15 minutes';

SELECT count(*) AS stale_payment_failed_notifications
FROM public.billing_notifications
WHERE kind = 'payment_failed' AND status = 'sending'
  AND sent_at < NOW() - INTERVAL '15 minutes';
SELECT count(*) AS cross_tenant_payment_links
FROM public.stripe_payments p
JOIN public.subscriptions s ON s.id = p.subscription_id
WHERE p.tenant_id <> s.tenant_id;

SELECT count(*) AS subscription_customer_mismatches
FROM public.subscriptions s
LEFT JOIN public.tenants t ON t.id = s.tenant_id
WHERE t.id IS NULL OR t.stripe_customer_id IS DISTINCT FROM s.stripe_customer_id;
```

## Uzgodnienie i granice

`processing` po utracie odpowiedzi z bazy i `failed` po częściowym handlerze mają niepewny wynik. Operator identyfikuje event w prywatnym środowisku, porównuje bieżący obiekt Stripe, wiersze płatności/subskrypcji, audyt, joby i faktury VAT. Dopiero gdy skutki są jednoznaczne, planuje kontrolowane oznaczenie zdarzenia jako zakończonego albo ponowienie. Obecny pakiet celowo **nie dostarcza funkcji resetu/replay**; bez zatwierdzonej, audytowanej procedury nie należy usuwać wiersza ani ręcznie zmieniać statusu. To warunek osobnego odbioru przed produkcyjnym uruchomieniem.

Wpis `billing_notifications` w stanie `sending` po 15 minutach także wymaga uzgodnienia: sprawdzić aktualną płatność i fakturę Stripe, krok joba oraz potwierdzenie dostawy Resend. Samo ponowne wykonanie joba może wysłać drugi mail po utracie odpowiedzi; nie usuwać claimu i nie zmieniać jego statusu bez dowodu. Pewny brak właściciela lub jego adresu zapisuje `failed` i nie jest objęty tym alarmem `sending`; wymaga osobnego przeglądu operacyjnego.

Pozostają wyścigi poza tym pakietem: starsze, ale nieterminalne stany subskrypcji mogą nadpisać nowsze (`active`/`past_due`), bo obecny mirror nie ma monotonicznej wersji zdarzenia; job faktury VAT i administracyjny zwrot mają osobny wyścig między odczytem i zapisem; zewnętrzny enqueue nie ma trwałego outboxu; między ostatnim odczytem statusu w jobie a wysłaniem maila w Resend nadal może zajść późniejsze potwierdzenie płatności. Trzeba wdrożyć wersjonowanie stanu Stripe, transakcyjne powiązanie płatności z fakturą i deduplikację jobów przed deklaracją pełnej odporności na wszystkie kolejności i awarie.
