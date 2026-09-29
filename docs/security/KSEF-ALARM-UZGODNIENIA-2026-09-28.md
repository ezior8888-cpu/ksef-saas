# KSeF — neutralny alarm uzgodnienia statusu i wstrzymanej ROZ

Stan na 28.09.2026: zmiana jest robocza i zależy od hotfixów ROZ oraz ochrony zaakceptowanej faktury. Nie została jeszcze scalona ani wdrożona. Sam zielony wynik CI nie potwierdza działania kanału Slack, workera ani stanu db-1.

## Co wykrywa

Istniejący monitor krytyczny, uruchamiany co pięć minut przez aktywny backend jobów, wykonuje dwa niezależne zapytania **tylko o liczbę wierszy** faktur wychodzących:

1. `ksef_number IS NOT NULL` oraz `ksef_status IS DISTINCT FROM 'accepted'` — historyczna lub nowa rozbieżność pomiędzy numerem z KSeF a stanem lokalnym, również przy `NULL`.
2. `last_error_code = 'ROZ_HOLD_RECONCILE'` oraz `ksef_status IS DISTINCT FROM 'accepted'` — lokalnie wstrzymana ROZ, której wynik wymaga uzgodnienia.

Jeden dokument może spełniać oba warunki; liczb nie sumuje się jako liczby unikalnych faktur. Treść alertu nie zawiera ID, NIP, kwot ani danych kontrahentów. Alarm jest neutralny: **nie** twierdzi, że KSeF odrzucił dokument, nie zmienia danych i nie wznawia wysyłki. Deduplikacja trwa 30 minut dla danej kombinacji dwóch sygnałów, dopiero po potwierdzonej odpowiedzi 2xx z pilnego kanału Slack. Pojawienie się drugiego rodzaju rozbieżności wywołuje nowy alarm bez czekania na koniec tego okna. Błąd bazy lub dostarczenia jest zgłaszany do Sentry przez istniejący monitor i nie zapisuje znacznika dostarczenia.

## Odbiór przez Bartka

1. Potwierdzić SHA oraz czas wdrożenia workera i webu w Coolify. Potwierdzić, który `JOBS_BACKEND` działa i że cron monitora rzeczywiście wykonuje się co pięć minut. Nie wnioskować o wdrożeniu z samego merge.
2. Potwierdzić konfigurację `SLACK_WEBHOOK_URGENT` i kontrolnie dostarczyć alarm na środowisku testowym bez danych klientów; sprawdzić, że brak odpowiedzi 2xx nie jest uznawany za dostarczenie.
3. Odczytowo porównać liczniki monitora z db-1. Nie publikować identyfikatorów ani danych faktur w PR lub Slack. Osobno uzgodnić każdy przypadek z KSeF i XML przed jakąkolwiek zmianą statusu lub ponowieniem.
4. Jeżeli monitor nie działa, do czasu naprawy wykonywać odczyt liczników ręcznie. Nie używać alarmu jako dowodu, że historyczne faktury są poprawne: zero wykrytych przypadków oznacza tylko zero według tych dwóch predykatów w chwili odczytu.

Ta zmiana nie dodaje migracji. Codex nie wykonywał SQL ani żadnej operacji na db-1.
