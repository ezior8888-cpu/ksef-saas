# KSeF Offline24 — odbiór kodów QR (C-12)

**Stan 1 października 2026:** kod nie ma bezpiecznego provisioningu prywatnego klucza certyfikatu KSeF typu Offline (typ 2), więc nie potrafi jeszcze wystawić wymaganej wizualizacji faktury offline przed nadaniem numeru KSeF. To świadoma blokada wydania PDF, a nie obsługa QR II uznana za gotową. Nie potwierdzono produkcyjnego SHA webu/workera ani stanu kolejki na db-1.

[Specyfikacja Ministerstwa Finansów](https://github.com/CIRFMF/ksef-api/blob/main/kody-qr.md) wymaga KODU I z hashem XML i, dla wizualizacji przed nadaniem numeru, KODU II podpisanego certyfikatem Offline. Wcześniejszy kod budował własny adres `/web/verify?d=` i mógł zapisać `HASH:` zamiast podpisu. Oba payloady kolejki są teraz puste do czasu prawidłowego przygotowania certyfikatu. Czysty konstruktor QR II ma testy kryptograficzne, lecz nie jest podłączony do wysyłki i nie otrzymuje klucza.

`generateInvoicePdf` sprawdza fakturę **przed odczytem cache i ponownie przed wydaniem pliku**. Bez numeru KSeF odmawia PDF dla każdego dokumentu, który wszedł na ścieżkę offline: według znacznika, statusu lub tenantowego wpisu w kolejce. Końcowy odczyt kolejki poprzedza odczyt faktury, zgodnie z kolejnością zapisu znacznika i wpisu. To obejmuje `failed`/`rejected` po zmianie statusu oraz osierocony wpis kolejki po przerwanym zapisie. Błąd odczytu kolejki również wstrzymuje PDF. Zwykły szkic nie jest blokowany. Po nadaniu numeru PDF wymaga poprawnego KODU I; brak hasha utrwalonego XML, NIP-u lub innej części URL wstrzymuje także stary PDF w cache. Klucz cache zawiera odcisk URL KODU I i numeru KSeF, więc późniejsze uzupełnienie hasha albo nadanie numeru wymusza nowy render. Pojedyncze i zbiorcze pobieranie zwracają status 409 przy brakującym kodzie lub zmianie stanu w trakcie renderu; e-mail dodatkowo sprawdza stan bezpośrednio przed wysłaniem.

Kolejka zapisuje znacznik na fakturze przed wstawieniem wiersza, a po konflikcie unikalności domyka status zamiast zwracać istniejący wpis bez naprawy. Jeśli zapis kolejki nie powiedzie się po znaczniku, PDF pozostaje zablokowany do uzgodnienia lub ponowienia. Nie kasować znacznika ręcznie, dopóki nie zostanie sprawdzony stan KSeF i kolejki.

## Warunek odblokowania

1. Bartek potwierdza datowane SHA webu i workera oraz środowisko KSeF; sam merge nie dowodzi wdrożenia. Odczytowo ustala liczbę faktur bez numeru KSeF ze znacznikiem offline oraz liczbę osieroconych wpisów kolejki, bez wynoszenia danych klientów.
2. Projekt provisioningu certyfikatu typu Offline musi objąć jego ważność, powiązanie z podatnikiem i środowiskiem, bezpieczne przechowywanie prywatnego klucza, kontrolę dostępu, rotację, wycofanie i audyt użycia. Nie wkładać klucza do repo ani logów.
3. Na KSeF TEST zweryfikować KOD I i KOD II dla różnych typów faktur, korekty, przejścia offline→accepted, wygaśnięcia certyfikatu, błędu podpisu, braku XML i ponowienia kolejki. Dopiero po takim odbiorze włączyć PDF przed numerem KSeF.
4. Wcześniej wydane PDF lub wiadomości e-mail z nieprawidłowym QR wymagają osobnego odczytu i decyzji operatora; ta zmiana nie cofa ich automatycznie.

Nie uruchamiano SQL, migracji, wdrożenia ani testów na żywym KSeF.

## Bloker R6 po recenzji Claude — nie scalać PR #122

Odczyt kodu potwierdził, że obecny loader KODU I wymaga `invoices.xml_storage_path` i pasującego wiersza `xml_documents` z SHA-256. Zwykła wysyłka zwraca hash z uploadu XML, ale zapis akceptacji utrwala tylko ścieżkę przy fakturze; w aplikacji nie ma INSERT do `xml_documents`. Import historii KSeF przed zapisem faktury odrzuca surowy XML i nie utrwala nawet ścieżki. W rezultacie blokada z PR #122 może zwrócić 409 również dla poprawnie przyjętej faktury i zatrzymać całą paczkę ZIP. To scenariusz potwierdzony statycznie, nie liczba przypadków na db-1. Zielone CI/Security nie weryfikuje dostępności produkcyjnych PDF.

Bartek może wykonać **wyłącznie odczytowy** agregat poniżej i przekazać same liczby z datą, bez identyfikatorów firm, faktur i XML. Codex go nie uruchamiał. `matching_docs > 1` oznacza duplikat, a `all_docs > matching_docs` wiersze o innej ścieżce.

```sql
WITH accepted AS (
  SELECT i.id, i.tenant_id, i.xml_storage_path,
    CASE WHEN i.fa3_data #>> '{import,source}' = 'ksef_history'
      THEN 'ksef_history' ELSE 'other' END AS origin,
    (SELECT count(*) FROM public.xml_documents d
      WHERE d.tenant_id = i.tenant_id AND d.invoice_id = i.id
        AND d.storage_path = i.xml_storage_path) AS matching_docs,
    (SELECT count(*) FROM public.xml_documents d
      WHERE d.tenant_id = i.tenant_id AND d.invoice_id = i.id) AS all_docs
  FROM public.invoices i
  WHERE i.ksef_status = 'accepted' AND NULLIF(i.ksef_number, '') IS NOT NULL
)
SELECT origin, count(*) AS accepted,
  count(*) FILTER (WHERE xml_storage_path IS NULL) AS missing_path,
  count(*) FILTER (WHERE xml_storage_path IS NOT NULL AND matching_docs = 0) AS missing_doc,
  count(*) FILTER (WHERE matching_docs > 1) AS duplicate_doc,
  count(*) FILTER (WHERE all_docs > matching_docs) AS unrelated_doc
FROM accepted GROUP BY origin;
```

Ten licznik nie sprawdza istnienia obiektu MinIO. Bezpieczny backfill wymaga potwierdzenia dokładnych bajtów XML: dla wysyłki porównania istniejącego archiwum z dowodem uploadu, dla importu ponownego pobrania oryginału z KSeF we właściwym kontekście firmy i sprawdzenia danych identyfikujących fakturę. Hash liczyć z oryginalnych bajtów, nie z odtworzonego XML ani `parsed` JSON. Przy sprzecznych/duplikowanych wpisach wstrzymać i zbadać ręcznie. Przyszły zapis ścieżki i hasha musi być idempotentny oraz odporny na częściową awarię między MinIO a bazą; potrzebuje preflightu historii i testów współbieżności. Nie pomijać po cichu takich faktur w ZIP i nie wydawać PDF z niezweryfikowanym QR. Dopiero po tej naprawie, odbiorze na kopii i testach KSeF TEST można rozważać scalenie PR #122.