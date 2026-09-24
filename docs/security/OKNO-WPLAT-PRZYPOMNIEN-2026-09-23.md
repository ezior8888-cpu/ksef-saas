# Okno wpłat przed wysyłką przypomnienia — 23.09.2026

Autor: Astra/Codex. Kontynuacja po [roboczym PR #23](https://github.com/ezior8888-cpu/ksef-saas/pull/23). Zakres: kod aplikacji, testy i procedura operacyjna. Bez migracji/SQL, dostępu do produkcji, prawdziwej poczty, merge i wdrożenia. Ten dokument uzupełnia historyczny opis zgody na przypomnienia; wcześniejszy wpis o ograniczeniu do jednej faktury odnosił się do poprzedniego commitu.

## Scenariusz i zmiana

Jeżeli kontrahent opłacił inną fakturę, poprzednia kontrola sprawdzała tylko fakturę z przypomnienia. Nowa kontrola działa w ostatnim odczycie workera, bez osobnego utrwalanego kroku przed Resend:

- nadal sprawdza pełny odcisk bieżącej faktury, saldo, pauzę, ostatnią wpłatę przypisaną do niej i wyłączenie kontrahenta;
- wymaga NIP faktury do wiarygodnego porównania innych wpłat; NIP z kolumny i danych nabywcy musi być spójny;
- czyta płatności tej organizacji z ostatnich dni według payment_date albo świeżo zapisane według created_at; powiązane faktury pobiera w partiach do 100 ID, jawnie sprawdza ich organizację i poprawny 10-cyfrowy NIP. Świeża wpłata na innej fakturze tego samego kontrahenta zatrzymuje mail;
- sprawdza niezerowe importy bankowe według daty transakcji, księgowania albo importu; obejmuje również wiersze oznaczone jako dopasowane lub ignorowane, ponieważ znaczniki nie mogą ukryć wpłaty. Zgodny lub niepoprawny/brak NIP w takim wierszu wstrzymuje mail do ręcznej oceny;
- odczyt wpłat, importów i listy wykluczonych kontrahentów ma limit 501 oraz dokładną liczność; przy ponad 500 wierszach, obciętej odpowiedzi, błędzie lub niespójnej relacji organizacja–faktura wysyłka zostaje wstrzymana. Wykluczenia porównują NIP po normalizacji także wtedy, gdy w bazie są znaki formatowania. Przejściowy błąd bazy może zostać ponowiony jedynie w pierwotnym terminie zgody.

Daty payments.payment_date oraz payment_imports.transaction_date/booking_date są typu DATE. Filtr zaczyna się od dnia kalendarzowego obejmującego moment sprzed 48 godzin i blokuje cały dzień graniczny. Może to wydłużyć wstrzymanie o część dnia, lecz nie skróci ochrony przez brak godziny przelewu.

## Granice i odbiór

To ochrona przed wpłatami **widocznymi w tej bazie**, a nie gwarancja znajomości stanu konta bankowego. W repo istnieje schemat payment_imports, ale nie ma kodu zasilającego go danymi banku. Przelew niezaimportowany pozostaje niewidoczny. Odczyt obejmuje transaction_date, booking_date i imported_at, także dla wierszy oznaczonych jako dopasowane/ignorowane. Płatność ręcznie wpisana później ze starszą payment_date jest sprawdzana przez created_at. Nadal nie dowodzi, że bank przekazał wszystkie transakcje i że jego NIP jest prawidłowy. Sam NIP przekazany w imporcie nie jest niezależnym dowodem tożsamości nadawcy. Ponieważ schemat nie ma pola kierunku, oba znaki kwoty są traktowane ostrożnie jako możliwa wpłata; może to wstrzymać mail także po przelewie wychodzącym. Bartek musi sprawdzić konwencję znaku i kierunek na konkretnym dostawcy przed uruchomieniem importu. Nie ma atomowej transakcji obejmującej odczyt bazy i zewnętrzną wysyłkę, więc wpłata przyjęta po ostatnim sprawdzeniu może się minąć z mailem.

Bartek powinien przed aktywacją szerszej automatyki potwierdzić źródło i świeżość importów, produkcyjne granty/RLS i relację tenant–invoice w bazie oraz wykonać scenariusze dwóch firm i przelewu bez dopasowania na testowej instancji. Bieżący schema 00014 daje authenticated UPDATE/DELETE do payments, payment_imports i payment_reminders, a payments.invoice_id nie ma złożonego FK na tenant. Użytkownik z takim dostępem może zmienić/usunąć dowód wpłaty lub status ekranu; to rzeczywista granica bezpieczeństwa i warunek odbioru przed szerszym włączeniem automatyki, nie kosmetyczny punkt dokumentacji. Sam kod nie potwierdza produkcyjnych grantów. Wskaźnik pending na stronie zaległości jest orientacyjny; autorytatywny dispatch/receipt pozostaje w service-only flo_approvals. Przy większym wolumenie potrzebny jest indeksowany, serwerowy odczyt przypisanych wpłat z jasnym kontraktem czasu i tożsamości. Limit 500 wierszy na odczyt celowo wstrzymuje wysyłkę w zatłoczonym koncie; to ograniczenie dostępności, nie potwierdzenie bezpieczeństwa całego konta. Nie tworzono tu migracji.

Przy wstrzymaniu przypomnienia operator powinien obejrzeć wpłaty i historię dostaw, nie kasować znacznika dispatch ani nie tworzyć nowego klucza wysyłki w celu obejścia blokady. Stałe zdanie o płatności już wysłanej nadal łagodzi ryzyko, lecz nie zastępuje kontroli stanu.

## Weryfikacja

Testy syntetyczne obejmują wpłatę na innej fakturze tego samego NIP, obcą firmę i NIP, niespójne powiązanie tenant–invoice, niedopasowany import, odmiany pomijane, graniczny dzień, błędy odczytu oraz przepełnienie limitu. Transport jest atrapą; brak wysyłki w przypadkach odmowy jest sprawdzany. Wyniki pełnej lokalnej walidacji i konkretnego commitu/CI zostaną wpisane po ich zakończeniu. Bez testu żywego banku, dostawcy poczty i produkcyjnego PostgREST.
