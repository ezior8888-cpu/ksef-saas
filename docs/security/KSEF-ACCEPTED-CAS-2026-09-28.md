# KSeF — zaakceptowana faktura ma pierwszeństwo przed spóźnionym błędem

Stan na 28.09.2026: poprawka jest oparta na roboczym PR #87 i nie wymaga migracji. Nie uruchomiono jej na serwerze. Zmiana chroni przyszłe przeploty pracy dwóch workerów; nie naprawia automatycznie danych historycznych.

## Scenariusz

Callback po wyczerpaniu prób odczytywał `ksef_status`, a następnie bezwarunkowo zapisywał `failed` lub `rejected`. Równoległy worker mógł w tej przerwie zapisać `accepted` z numerem KSeF. Stary callback nadpisywał wtedy status akceptacji i emitował zdarzenie porażki. W ścieżce Offline24 najpierw powstawał wpis kolejki, a późniejszy zapis faktury mógł podobnie cofnąć akceptację do `offline_queued`.

## Zachowanie poprawki

- Status błędu zapisuje się tylko przy stanie różnym od `accepted`; predykat obejmuje też historyczny `NULL`. Jeśli warunkowy zapis nie zmieni wiersza, callback czyta aktualny status poza zapamiętanym krokiem Inngest. Akceptacja z numerem KSeF kończy go bez audytu i zdarzenia porażki.
- Przed audytem oraz przed emisją zdarzenia porażki odbywa się kolejny świeży odczyt. Odbiorcy zdarzeń nadal weryfikują status, ponieważ akceptacja może nastąpić po emisji.
- Dodanie do Offline24 odmawia dla już zaakceptowanej faktury. Gdy akceptacja nastąpi po utworzeniu wiersza kolejki, warunkowy zapis faktury jej nie nadpisuje, a świeżo dodany wiersz zostaje uzgodniony jako `sent`.
- Zwykła ścieżka `failed`, `rejected` i `offline_queued` pozostaje dostępna, jeśli faktura faktycznie nie została zaakceptowana.

## Odbiór operatora

1. Najpierw rozstrzygnąć wdrożenie PR #87. Potwierdzić datowane SHA webu i workera w Coolify oraz brak starych procesów po wymianie. Ta poprawka jest od niego zależna.
2. Odczytowo policzyć faktury z numerem KSeF i statusem innym niż `accepted` oraz wpisy Offline24 otwarte przy fakturze zaakceptowanej. Wynik i zakres czasu zapisać bez danych kontrahentów.
3. Każdy historycznie niespójny dokument uzgodnić z KSeF przed ręczną zmianą statusu lub kolejną wysyłką. Nie uruchamiać automatycznego ponowienia na podstawie samego lokalnego `failed/rejected`.
4. Sprawdzić po wdrożeniu, czy nie rosną liczniki nowych niezgodności oraz czy akceptacje i błędy nie tworzą sprzecznych powiadomień.

Testy z atrapą bazy odtwarzają wskazane przeploty, ale nie dowodzą atomowości produkcyjnego PostgREST ani działania żywego KSeF. Nie wykonano SQL, migracji ani wdrożenia.
