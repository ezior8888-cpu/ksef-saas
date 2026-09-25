# Stripe: zewnętrzne zwroty i spory — plan domknięcia granicy (2026-09-25)

**Status:** historyczny plan sporządzony przed lokalnym pakietem 00080; opis endpointu i zakresu bieżącego pakietu poniżej dotyczą stanu PR #42. Implementację i warunki odbioru opisuje [runbook 00080](STRIPE-SPRAWY-FINANSOWE-ODBIOR-2026-09-25.md). Nie uruchomiono SQL ani nie sprawdzono konfiguracji Stripe/Coolify/db-1. Dopóki Bartek nie potwierdzi 00078, traktujemy ją i zależne 00079 jako niewdrożone.

## Ustalenie z kodu

Endpoint /api/stripe/webhook obsługuje sześć zdarzeń subskrypcji i faktur. Pozostałe typy zwraca jako pominięte, zanim powstanie wpis w stripe_webhook_events. Zwrot wykonany w Stripe Dashboard i spór nie tworzą więc lokalnego śladu. Blokada faktura VAT–refund z 00079 widzi tylko lokalny claim lub rekord zwrotu. Nie może zablokować zdarzenia, o którym aplikacja nie wie. Runbook refund-and-disputes.md deklarował działanie webhooka i alertu, których kod nie implementuje.

W mapowaniu invoice.payment_succeeded referencje PI/charge pochodzą tylko ze starszych pól faktury. Gdy podpisany payload ich nie zawiera, wiersz płatności może nie mieć klucza potrzebnego do jednoznacznego połączenia zewnętrznego zwrotu z tenantem. Wersja API klienta ustawiona w aplikacji nie dowodzi wersji snapshotu konkretnego webhooka. Trzeba sprawdzić event.api_version i prawdziwe payloady endpointu.

## Zakres wcześniejszego pakietu PR #42

Kod lokalny liczy w monitorze zarówno processing starsze niż 15 minut, jak
i każde reconciliation_required. Opłacony invoice subskrypcji bez poprawnego
legacy PaymentIntent/Charge zostaje zatrzymany **przed** lokalnym zapisem;
podpisany webhook otrzymuje kod payment_reference_missing_or_invalid i stan
failed do ręcznego uzgodnienia, nie automatyczny retry. Przy nowszej wersji
endpointu może to zatrzymać opłacone faktury, więc preflight prawdziwych
payloadów jest warunkiem rollout. Runbook opisuje ręczne postępowanie.
Brak zmian SQL i automatycznej obsługi zewnętrznych refundów/sporów.
## Inwariant docelowy

1. Każde zdarzenie zewnętrznego zwrotu lub sporu, które dotrze do endpointu, ma trwały identyfikator Stripe i widoczny stan: powiązane z dokładnie jedną płatnością albo skierowane do ręcznego uzgodnienia. Brak dopasowania nigdy nie oznacza sukcesu.
2. Zdarzenie powiązane z płatnością zakłada hold pod tą samą blokadą wiersza, której używają claim faktury VAT i administracyjnego zwrotu. Istniejąca faktura pozostaje nienaruszona i wymaga decyzji księgowej; nie anulujemy jej ani nie wystawiamy korekty automatycznie.
3. Statusy pending i requires_action blokują automat, ale nie są liczone jako wypłacony zwrot. Sumę zwróconą liczymy wyłącznie ze zwrotów succeeded. Spór nie jest refundem i ma osobny rejestr.
4. Duplikat evt_* ani kilka eventów dla jednego re_*/du_* nie powiela kwoty. Opóźnione snapshoty nie cofają bieżącego stanu pobranego z Stripe.
5. Zwrot rozpoczęty przez aplikację i jego webhook muszą zbiegać się w jednym zapisie bez ponownego wywołania Stripe. Niepewnego wyniku operacji nie ponawiamy automatycznie.

## Kolejność implementacji

**A. Dowód konfiguracji i historii (Bartek, odczytowo).** Potwierdzić dokładny SHA webu/workera na Coolify, zastosowane migracje 00075–00079 na db-1, aktywny endpoint i subskrybowane typy zdarzeń Stripe, event.api_version oraz reprezentatywne podpisane invoice.payment_succeeded. Zliczyć płatności bez PI/charge, niejednoznaczne charge, zewnętrzne refundy/spory i faktury VAT. Porównać wyniki z Stripe po pełnych ID; bez ręcznego przypisywania tenantów z metadata, e-maila lub skrótu numeru faktury. Dane klienta nie trafiają do alertów.

**B. Brama bazy 00080, przygotowana i testowana na kopii.** Osobny rejestr incydentów finansowych z unikalnym ID obiektu Stripe, typem, aktualnym statusem, referencjami PI/charge, opcjonalnym payment_id, czasem i stanem uzgodnienia. Zapis przez service-role-only RPC: jedna transakcja, blokada stripe_payments FOR UPDATE, silne dopasowanie identyfikatorów, kontrola kwoty/waluty/tenanta, idempotencja po ID obiektu. Trigger lub równoważny guard na utworzenie faktury VAT i claim admin refundu odmawia przy hold. Brak jednoznacznego dopasowania pozostaje w kwarantannie z alertem; projekt globalnego hold dla nierozpoznanych zdarzeń wymaga osobnej decyzji operacyjnej, bo zatrzyma fakturowanie wszystkich firm. Nie zgadywać powiązania.

**C. Webhook i uzgadnianie.** Obsłużyć co najmniej refund.created, refund.updated, refund.failed oraz charge.dispute.created/updated/closed; charge.refunded potraktować jako sygnał do uzgodnienia Charge, nie jako drugi refund. Po podpisie i claimie evt_* pobrać aktualny Refund/Dispute ze Stripe po pełnym ID, nie opierać decyzji o spóźniony payload. Nieznane referencje i awarie odczytu muszą być widoczne i ponawiane wyłącznie tam, gdzie wiadomo, że nie było skutków. Przy niepewnej transakcji nie zwalniać claimu bez ustalenia wyniku. Dodać licznikowy monitor kwarantanny, holdów i nieprzetworzonych webhooków na obu backendach jobów. Zapewnić ręczną procedurę zakończenia sprawy z audytem decyzji.

**D. Próba i rollout.** Test na osobnym Postgresie i Stripe test mode: pełny/częściowy refund, pending→succeeded/failed, duplikaty i odwrócona kolejność eventów, spór won/lost, webhook przed/po odpowiedzi refundu admina, płatność/faktura przed zdarzeniem, brak i konflikt PI/charge, współbieżne RPC, awaria finalizacji oraz oba backendy jobów. Test jednostkowy SQL nie zastępuje próby dwóch sesji Postgresa. Po potwierdzeniu 00078 i 00079 oraz kopii/restore Bartek wdraża migrację i zgodny web/worker w kontrolowanym oknie, subskrybuje typy webhooka, następnie sprawdza alerty i liczniki. Kod nie jest dowodem, że Stripe wysyła zdarzenia na produkcyjny endpoint.

## Odrzucony skrót operacyjny

Samo dopisanie refund/dispute do listy webhooków i oznaczanie każdego zdarzenia
jako failed nie jest procedurą uzgodnienia. RPC z 00076 nie odzyskuje claimu
failed, a monitor liczy te wpisy stale. Każdy zwrot — także wykonany prawidłowo
przez aplikację — tworzyłby trwały błąd i powtarzany alarm. Pełne wdrożenie
wymaga oddzielnego stanu sprawy, idempotentnego powiązania ze zwrotem admina,
kontrolowanego zamknięcia po dowodach oraz sprawdzonego dostarczenia alarmu.
Z tego powodu wcześniejszy pakiet PR #42 nie subskrybował nowych typów i nie udawał, że je
obsługuje.
## Granice gwarancji

Zewnętrzne Stripe i nasz Postgres nie tworzą wspólnej transakcji. Jeśli faktura VAT powstanie przed nadejściem webhooka lub cyklicznym wykryciem zmiany, automat nie cofnie dokumentu; sprawa musi trafić do księgowego. Ręczne uzgadnianie historii i okresowy odczyt Stripe są konieczne także po uruchomieniu webhooka.

Źródła: [typy zdarzeń Stripe](https://docs.stripe.com/api/events/types), [Refund](https://docs.stripe.com/api/refunds/object), [Dispute](https://docs.stripe.com/api/disputes/object), [Invoice Payment](https://docs.stripe.com/api/invoice-payment/object), [lista Invoice Payments](https://docs.stripe.com/api/invoice-payment/list).
