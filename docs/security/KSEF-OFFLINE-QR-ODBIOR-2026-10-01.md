# KSeF Offline24 — odbiór kodów QR (C-12)

**Stan 1 października 2026:** kod nie ma bezpiecznego provisioningu prywatnego klucza certyfikatu KSeF typu Offline (typ 2), więc nie potrafi jeszcze wystawić wymaganej wizualizacji faktury offline przed nadaniem numeru KSeF. To świadoma blokada wydania PDF, a nie obsługa QR II uznana za gotową. Nie potwierdzono produkcyjnego SHA webu/workera ani stanu kolejki na db-1.

[Specyfikacja Ministerstwa Finansów](https://github.com/CIRFMF/ksef-api/blob/main/kody-qr.md) wymaga KODU I z hashem XML i, dla wizualizacji przed nadaniem numeru, KODU II podpisanego certyfikatem Offline. Wcześniejszy kod budował własny adres `/web/verify?d=` i mógł zapisać `HASH:` zamiast podpisu. Oba payloady kolejki są teraz puste do czasu prawidłowego przygotowania certyfikatu. Czysty konstruktor QR II ma testy kryptograficzne, lecz nie jest podłączony do wysyłki i nie otrzymuje klucza.

`generateInvoicePdf` sprawdza fakturę **przed odczytem cache**. Bez numeru KSeF odmawia PDF dla każdego dokumentu, który wszedł na ścieżkę offline: według znacznika, statusu lub tenantowego wpisu w kolejce. To obejmuje `failed`/`rejected` po zmianie statusu oraz osierocony wpis kolejki po przerwanym zapisie. Błąd odczytu kolejki również wstrzymuje PDF. Zwykły szkic nie jest blokowany. Po nadaniu numeru PDF wymaga poprawnego KODU I; brak hasha utrwalonego XML, NIP-u lub innej części URL wstrzymuje także stary PDF w cache. Pojedyncze i zbiorcze pobieranie zwracają status 409; e-mail korzysta z tej samej funkcji PDF.

Kolejka zapisuje znacznik na fakturze przed wstawieniem wiersza, a po konflikcie unikalności domyka status zamiast zwracać istniejący wpis bez naprawy. Jeśli zapis kolejki nie powiedzie się po znaczniku, PDF pozostaje zablokowany do uzgodnienia lub ponowienia. Nie kasować znacznika ręcznie, dopóki nie zostanie sprawdzony stan KSeF i kolejki.

## Warunek odblokowania

1. Bartek potwierdza datowane SHA webu i workera oraz środowisko KSeF; sam merge nie dowodzi wdrożenia. Odczytowo ustala liczbę faktur bez numeru KSeF ze znacznikiem offline oraz liczbę osieroconych wpisów kolejki, bez wynoszenia danych klientów.
2. Projekt provisioningu certyfikatu typu Offline musi objąć jego ważność, powiązanie z podatnikiem i środowiskiem, bezpieczne przechowywanie prywatnego klucza, kontrolę dostępu, rotację, wycofanie i audyt użycia. Nie wkładać klucza do repo ani logów.
3. Na KSeF TEST zweryfikować KOD I i KOD II dla różnych typów faktur, korekty, przejścia offline→accepted, wygaśnięcia certyfikatu, błędu podpisu, braku XML i ponowienia kolejki. Dopiero po takim odbiorze włączyć PDF przed numerem KSeF.
4. Wcześniej wydane PDF lub wiadomości e-mail z nieprawidłowym QR wymagają osobnego odczytu i decyzji operatora; ta zmiana nie cofa ich automatycznie.

Nie uruchamiano SQL, migracji, wdrożenia ani testów na żywym KSeF.
