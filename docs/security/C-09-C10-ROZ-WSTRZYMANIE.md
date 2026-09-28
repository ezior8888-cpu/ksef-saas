# ROZ — tymczasowe wstrzymanie wysyłki po PR #82 i #84

Stan na 28.09.2026: oba PR-y są scalone do `main` (`b25c126`), a #71 z blokadą ROZ w PROD pozostaje otwarty. Stan wdrożenia w Coolify oraz liczba faktur ROZ zaakceptowanych przez KSeF nie są potwierdzone. Ten dokument dotyczy przejściowego hotfixu bez migracji; nie jest dowodem, że problem wystąpił na serwerze.

## Powód blokady

- #82 odejmuje od przychodu ROZ zaliczki po identyfikatorze bez wiarygodnego sprawdzenia środowiska KSeF. Na bieżącym `main` faktura nie ma jeszcze trwałej kolumny `ksef_environment`, więc historyczne TEST/PROD mogą się pomieszać.
- #84 generuje kwoty ROZ z danych zaliczek przeniesionych w zdarzeniu kolejki. Worker nie odtwarza ich z zaakceptowanych zaliczek i nie porównuje całej treści z utrwalonym szkicem. Podmieniony albo stary event może zmienić XML przy zachowanych identyfikatorach.
- Samodzielny #84 nie zawiera blokady ROZ PROD z zależnego #71. Blokada tylko formularza nie zatrzyma zdarzenia już obecnego w Inngest albo pg-boss.

## Zachowanie hotfixu

`codex/security-main-roz-hold` odmawia wysyłki ROZ we wszystkich środowiskach w akcji, wspólnym enqueue, workerze oraz w bezpośredniej funkcji wysyłki. Worker sprawdza zapisany rodzaj faktury także wtedy, gdy stare zdarzenie nie niesie `finalData` lub deklaruje VAT. Sprawdza ponownie w kroku wysyłki, bo Inngest może wznowić wcześniejszy krok z checkpointu. ROZ można nadal zapisać jako szkic. Wcześniej zaakceptowany dokument zachowuje ścieżkę odczytu wyniku; hotfix nie cofa wysłanej faktury i nie naprawia jej księgowania.

Po wyczerpaniu starego zadania ROZ status lokalny jest `failed` z kodem `ROZ_HOLD_RECONCILE` i komunikatem o ręcznym uzgodnieniu, **nie** `rejected` (odrzucenie przez KSeF). Zdarzenie jest kończące dla kolejki Offline24; powiadomienia o odrzuceniu i karta automatycznej poprawki są pomijane. Gdy równoległy stary worker zapisze akceptację, świeże odczyty i warunkowe aktualizacje chronią status oraz numer KSeF, a późne zdarzenie sukcesu naprawia wpis Offline24 oznaczony wcześniej jako `failed`. To ogranicza fałszywe alarmy, ale nie zastępuje sprawdzenia aktywnych starych workerów i historii na db-1.

## Odbiór przez Bartka

1. Potwierdzić datowany SHA i godzinę uruchomienia osobno dla webu i workera w Coolify. Sam merge nie dowodzi wdrożenia.
2. Sprawdzić, czy stary worker ma aktywne zadania ROZ. Nowy kod nie zatrzyma POST-u, który stary proces już rozpoczął.
3. Odczytowo ustalić liczbę zaakceptowanych i oczekujących ROZ na db-1 oraz zweryfikować ręcznie ich XML, zaliczki i środowisko; do raportu wystarczą liczby i wynik, bez danych faktur.
4. Po wdrożeniu monitorować faktury z `last_error_code=ROZ_HOLD_RECONCILE` i odpowiadające im wpisy audytu. Hotfix nie wysyła e-maila ani pusha mówiącego, że KSeF odrzucił dokument, ponieważ to wstrzymanie lokalne i stary worker może jeszcze zapisać akceptację. Brak aktywnego neutralnego alarmu jest otwartym zadaniem.
5. Przed późniejszym zniesieniem blokady przećwiczyć na kopii trwałą proweniencję środowiska, kanoniczne powiązanie pełnych danych ROZ z XML oraz atomowy claim zaliczki przez jedną ROZ. Stare zdarzenia bez pełnej migawki uzgadniać ręcznie.

Hotfix nie wymaga wykonania SQL. Codex nie uruchamiał migracji, nie scalał do `main` i nie wdrażał serwera.
