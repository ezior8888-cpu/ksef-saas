# Trwała zgoda na przypomnienia — 23.09.2026

Autor: Astra/Codex, po dyspozycji Igora „zatwierdzam lecisz dalej”. Kontynuacja REV-03 na gałęzi codex/security-reminder-consent, od f502baa1f54128cf3c329dd25f3c8fc5531e61b2 ([PR #19](https://github.com/ezior8888-cpu/ksef-saas/pull/19)). Dokument opisuje kod i lokalną walidację przed publikacją; opis nowego roboczego PR uzupełni status publikacji oraz kontrole dokładnego commitu. Bez merge, serwera, SQL, nowych migracji i rzeczywistej poczty.

## Problem i wynik

Ręczna akcja tworzyła losowy approvalId bez zapisu zgody. FLO przekazywało zużyty token, lecz worker sprawdzał tylko niepusty identyfikator, odczytywał bieżącego adresata/szablon i nie używał edycji użytkownika. PDF powstawał dopiero po zatwierdzeniu. Odtworzenie trwałego kroku mogło użyć starego stanu płatności. Brak klucza dostawcy pozwalał powtórzyć mail po niepewnej odpowiedzi.

Teraz ręczna akcja i payment.chase używają tego samego dialogu: przygotowanie → podgląd → osobne zatwierdzenie. Podgląd pokazuje rzeczywiste Od/Do/Reply-To, temat, pełny tekst i dokładny PDF do pobrania. Edycja tekstu resetuje potwierdzenie; zmiana adresu usuwa podgląd. Wersja karty resetuje stan jej komponentu. Komunikat po zatwierdzeniu brzmi „zlecone do wysyłki”, bez deklaracji dostarczenia.

## Wykonanie

- app/actions/reminders.ts: uwierzytelnienie i firma, walidacja danych/sourceVersion, limit 20 podglądów na organizację/10 minut, zatrzymanie przy niedostępnym Redis, sprawdzenie wyłączników i wcześniejszego dispatch. Losowy token usunięty; stary direct-send endpoint zwraca odmowę bez skutków.
- lib/reminders/prepare-delivery.ts oraz delivery-schema.ts: odczyty ograniczone do firmy; zaakceptowana faktura sprzedażowa, dodatnie saldo, poprawne daty, brak pauzy. Koperta i PDF zamrożone przed kliknięciem. Schemat odrzuca dodatkowe opcje poczty, niepoprawne nagłówki/adresy i PDF ponad 512 KiB. Kwoty/szablony obecnie wyłącznie PLN — inna waluta jest jawnie blokowana. Treść jest zwykłym tekstem, HTML generowany wyłącznie przez escaping. Stałe zdanie o możliwej wpłacie jest widoczne przed zgodą i wymagane po edycji.
- Krótkotrwały szkic zapisuje się w istniejącym flo_proposals.payload jako reminder-preview:<UUID>. Jest powiązany z osobą przygotowującą. listOpen wyklucza wewnętrzne szkice przed limitem wyników. To zapis danych, nie nowa migracja. Domknięcie/wygaśnięcie szkicu nie dowodzi skasowania jego danych; polityka retencji pozostaje oddzielnym zadaniem.
- app/actions/flo.ts oraz delivery-consent.ts: wcześniejsze wiązanie wersji/input obejmuje teraz delivery. Po zużyciu zgody handler zapisuje osobny reminderDispatch w service-only flo_approvals.snapshot. Sam consumed_at nie jest dowodem zlecenia, bo służy także do wycofywania starych tokenów. Reminder ma ID zgody; dispatch zawiera również fakturę, etap i skrót finalnej wiadomości.
- delivery-safety.ts: sprawdza aktualny pełny odcisk faktury, saldo, pauzę, najnowszą wpłatę dla tej faktury i wykluczenie kontrahenta. NIP jest odczytywany także z buyer_data, normalizowany; sprzeczne numery blokują wysyłkę. Błąd odczytu nie oznacza „brak płatności”.
- send-reminder.ts: w jednym kroku obejmującym faktyczną wysyłkę odczytuje trwałą zgodę, firmę/fakturę/etap/kanał, aktywne członkostwo, świeży globalny wyłącznik oraz pozostałe blokady. Nie renderuje ponownie szablonu, nie pobiera nowego odbiorcy ani załącznika. Nowe nazwy kroków nie dziedziczą starego fetch/verify. Wiadomość i PDF są identyczne przy ponowieniu.
- Wysyłka używa stałego klucza reminder/<approvalId>. Termin jest ograniczony do najwcześniejszej daty wygaśnięcia podglądu, zgody i 30 minut od utworzenia zgody. Nie odnawia się przy retry. [Resend dokumentuje przechowywanie klucza przez 24 godziny](https://resend.com/docs/dashboard/emails/idempotency-keys); nie deklarujemy bezterminowego exactly-once.
- Potwierdzone przyjęcie przez dostawcę zapisuje się najpierw jako reminderReceipt w service-only snapshot. Dzięki temu awaria archiwizacji albo aktualizacji historii pozwala dokończyć zapis po terminie/cofnięciu zgody, bez nowej wysyłki. Błąd bazy jest ponawialny w pierwotnym oknie; odmowa domenowa nie jest. Prywatne odpowiedzi DB/Resend nie trafiają do komunikatów workerów tej ścieżki.

## Weryfikacja

- 145 plików / 2681 testów Vitest PASS, zero pominiętych; 66 XML PASS; 67 testów narzędzi bezpieczeństwa PASS.
- Typecheck PASS; lint 0 błędów i 29 istniejących ostrzeżeń (bez nowych).
- Pełny Next build --webpack PASS w 100 s, 82/82 stron, finalizacja/tracing zakończone. Izolowana kopia 1294 plików bez sekretów/.env; pełna zgodność z aktualnymi źródłami. Parametry wyłącznie w TEMP: jeden worker, 6 GB heap, webpackMemoryOptimizations, alias developerskich typów jsdom. To nie build obrazu standalone/Docker.
- Regresje obejmują prawdziwy worker i helpery z atrapami transportu: 49 przypadków zgód, zmian danych, płatności, wykluczenia, wyłączników, wygaśnięcia, receipt oraz obu modeli retry. Testy buildera obejmują także rzeczywisty PDFKit. Dialog ma testy hooków, bez pełnego E2E przeglądarki z usługami.
- Inwentaryzator offline: 302 zapytania service_role (0 krytycznych, 0 wysokich, 20 średnich, 65 do przeglądu, 217 ok); 103 wejścia / 36 sygnałów. To klasyfikacja heurystyczna, nie potwierdzenie zamknięcia obejść RLS. Nie zmieniono reguł skanera ani wyjątków.
- Dowody lokalne: TEMP/faktflow-reminder-validation-ehXJ1o oraz TEMP/faktflow-reminder-consent-build-Z6iy0M. Odcisk manifestu kopii build: c4b3d6ae9576f63bfbe825b0c2d38910b046144edd335aae9436a5cd4a4322ae.

Pierwszy pełny test wykrył statyczny test obcinający approveProposal do 2200 znaków. Poprawiono zakres odczytu do granicy następnej funkcji i ponowiono cały zestaw. Przegląd wykrył również pomijane buyer_data.nip i złą klasyfikację chwilowych błędów DB; poprawki mają regresje. Przegląd współpracującego agenta nie znalazł dalszych blokujących usterek; nie jest niezależnym pentestem.

Kod zapisany w 89cc64b05276a2ef9dfcec18ecdcfe5ab3ee3165. Gitleaks 8.30.1: 33 przygotowane pliki, brak trafień, bez wyjątków (TEMP/faktflow-reminder-scan-EW4AH9).

## Odbiór Bartka i granice

1. Potwierdzić faktyczne granty/RLS flo_proposals i flo_approvals: klient ma wyłącznie odczyt własnej firmy; zapis dispatch/receipt wyłącznie przez zaufany backend. Potwierdzić UNIQUE(invoice_id, stage), relacje firm i bezpośredni PostgREST. Dokumentacja istniejących migracji jest przesłanką projektu, nie dowodem konfiguracji produkcji.
2. Przy osobno zatwierdzonym wydaniu uwzględnić aplikację i oba backendy kolejki. Stare eventy z losowym tokenem/starym snapshotem nie mogą zostać automatycznie dopuszczone. Przed czyszczeniem/zastępowaniem starych pending sprawdzić historię dostaw. Bez odbioru nie włączać szerzej payment.chase.
3. Manualne przypomnienia podlegają teraz tym samym wyłącznikom globalnym, per konto i wdrożeniu etapowemu FLO. Brak włączenia oznacza blokadę. W tej pracy nie zmieniano flag. Przygotowanie wymaga działającego Redis. Produkcyjne przekierowanie RESEND_DEV_TO_OVERRIDE blokuje podgląd.
4. Odebrać na koncie testowym Resend, przy osobnej zgodzie na rzeczywistą pocztę: stały klucz i ten sam projekt dostawcy, PDF, opóźnienie, awarię po przyjęciu maila oraz finalizację receipt po terminie. Sprawdzić obraz Docker, web/worker, Supabase i SRH/Valkey. W tej pracy nie wykonano takich testów.
5. Brak receipt po niejednoznacznej odpowiedzi nie dowodzi braku wysyłki. Po przekroczeniu terminu system zatrzymuje próbę, zachowuje pending/dispatch i blokuje nowy etap. Operator najpierw rozlicza dostawę u dostawcy; nie usuwać znacznika ani nie generować automatycznie nowej zgody/klucza. Stary etap ma trwałą blokadę ponownego zlecenia; zatwierdzony runbook kontrolowanego wznowienia pozostaje zadaniem operacyjnym.
6. Kontrola ostatnich 48 h dotyczy płatności przypisanych do tej faktury. Nie obejmuje wszystkich, zwłaszcza jeszcze niedopasowanych wpłat kontrahenta. Osobne odczyty nie eliminują ostatniego wyścigu między zmianą danych a zewnętrzną wysyłką; potrzebny jest odbiór ograniczeń bazy i procedur operacyjnych. Dane przyjęte przez dostawcę nie oznaczają doręczenia do skrzynki.
7. Rollback nie powinien przywracać dawnego workera dla nowych zleceń ani automatycznie zdejmować blokad wysyłki. Najpierw zachować dispatch/receipt i rozliczyć kolejki. Reguły GitHuba, infrastruktura, recovery i wcześniejsze otwarte punkty bezpieczeństwa pozostają aktualne.
