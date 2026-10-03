# C-12 / C-20 — odbiór integralności archiwum XML

Pakiet od `main` (`407ac44dcc354920fac3c6fe014ee977ae734c13`), po przeniesieniach
Claude #179–#183. Migracja `00129_xml_document_invoice_identity.sql` jest
**plikiem do przeglądu**, nie potwierdzeniem wykonania SQL. Codex nie uruchamia
migracji, nie scala do `main` i nie wdraża tego pakietu.

## Co gwarantuje kod

- Każda próba wysyłki faktury zapisuje XML z `IfNoneMatch: '*'`, również przy
  ponowieniu. Odpowiedź 412 powoduje odczyt oryginalnych bajtów; identyczny plik
  pozwala kontynuować, różny plik lub awaria odczytu zatrzymują wysyłkę przed KSeF.
- Metadane powstają z dokładnych bajtów magazynu, również dla XML z BOM lub
  innym kodowaniem. Hash/rozmiar przekazany przez caller jest oczekiwaniem
  do sprawdzenia. Faktura i ścieżka muszą należeć do wskazanej firmy.
- Istniejącego dowodu nie aktualizujemy. Dwa wiersze, zmieniona ścieżka, hash,
  rozmiar lub dostawca powodują błąd. Konflikt INSERT `23505` jest sukcesem
  dopiero po odczycie zgodnego wiersza. Unikalność w bazie wymaga `00129`.
- Błąd metadanych **po akceptacji** nie cofa prawdziwego wyniku KSeF. Zachowany
  jest alarm Sentry i dotychczasowy podgląd B14; nie obiecujemy kompletnego PDF
  ani kodu QR, jeżeli dowodu brakuje.
- Odzyskanie wcześniejszej wysyłki wymaga porównania magazynu z
  `request_payload_hash` konkretnej próby; 440 korzysta z dowodu oryginalnej
  własnej sesji, nie z aktualnej próby. Brak starego hash nie uprawnia do
  wytworzenia dowodu wyłącznie z obecnego pliku w magazynie.

## Odbiór Bartosza przed ewentualnym wdrożeniem

1. Potwierdzić stan `main`, wersję webu i workera oraz obecność wcześniejszych
   migracji C-11/C-12. Informacja „scalone” sama nie potwierdza wersji serwera.
2. W uzgodnionym oknie zatrzymać zapisy XML przez stary worker i import webowy.
   Stary helper aktualizuje istniejący wiersz; sam indeks nie powstrzyma takiej
   aktualizacji. Zachować wstrzymanie do uruchomienia obu aplikacji na nowym SHA.
3. Zebrać odczytowe wyniki poniższych kontroli. Duplikatów nie usuwać automatycznie,
   nie wybierać arbitralnie pierwszego/najnowszego wiersza. Uzgodnić je z XML
   magazynu i plikiem przyjętym przez KSeF, zachowując historię decyzji.
4. `file_size_bytes IS NULL` nie oznacza dowodu zgodnego z nowym kontraktem.
   Ręczne uzupełnienie wymaga sprawdzenia istniejącej ścieżki, SHA-256 dokładnych
   bajtów i dostawcy; nie wyliczać hash z tekstu po dekodowaniu. To oddzielna
   autoryzowana operacja, bez automatycznego backfillu w tym pakiecie.
5. Kolejność po zgodzie na wydanie: scalony plik `00129` → weryfikacja indeksu
   i rejestru migracji → worker → web → odbiór. Migracja blokuje zapisy podczas
   kontroli duplikatów i tworzenia indeksu; duplikat przerywa całą transakcję.
   Nie uruchamiać dwóch buildów produkcyjnych równolegle.
6. Sprawdzić na KSeF TEST i używanym MinIO: pierwsza próba, identyczne ponowienie,
   celowo różny plik pod tym samym testowym kluczem, awaria odczytu oraz dwa
   równoległe zapisy metadanych. Przekazać datę, SHA obu aplikacji, liczbę wierszy,
   wynik porównania bajtów, pobrania XML i PDF/KOD I — bez XML ani danych klientów.

Poniższy SQL jest wyłącznie wzorem **odczytu dla operatora**, nie skryptem
uruchomionym przez Codexa. Nie wypisuje tożsamości faktur ani klientów.

```sql
SELECT count(*) AS duplicate_invoice_groups
FROM (
  SELECT tenant_id, invoice_id
  FROM public.xml_documents
  GROUP BY tenant_id, invoice_id
  HAVING count(*) > 1
) AS duplicated;

SELECT count(*) FILTER (WHERE file_size_bytes IS NULL) AS missing_size,
       count(*) FILTER (WHERE storage_provider IS DISTINCT FROM 'r2') AS other_provider
FROM public.xml_documents;

SELECT count(*) AS missing_or_foreign_invoice
FROM public.xml_documents AS x
LEFT JOIN public.invoices AS i ON i.id = x.invoice_id
WHERE i.id IS NULL OR i.tenant_id IS DISTINCT FROM x.tenant_id;

SELECT count(*) AS conflicting_accepted_payloads
FROM public.xml_documents AS x
JOIN public.invoices AS i ON i.id = x.invoice_id AND i.tenant_id = x.tenant_id
JOIN public.ksef_submissions AS s ON s.invoice_id = i.id AND s.tenant_id = i.tenant_id
WHERE i.ksef_status = 'accepted'
  AND s.status = 'accepted'
  AND s.response_ksef_number = i.ksef_number
  AND s.request_payload_hash IS NOT NULL
  AND s.request_payload_hash IS DISTINCT FROM x.sha256_hash;

SELECT indisunique, indisvalid, pg_get_indexdef(indexrelid)
FROM pg_index
WHERE indexrelid = to_regclass('public.uq_xml_documents_tenant_invoice');
```

## Granice odbioru i następny pakiet

Testy lokalne korzystają z atrap usług. Nie potwierdzają działania warunkowego
PUT na produkcyjnym MinIO, indeksu na db-1 ani poprawnego odczytu QR przez KSeF.
Nie naprawiają historycznych konfliktów i nie odblokowują Offline24, KOR ani ROZ.

Skan zależności 03.10 wykrył niezależny blokujący alert
[`GHSA-vfj7-8cjw-p6xm`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
w niezmienionym lockfile (`shadcn → fast-glob → micromatch → braces`).
**Jeden następny pakiet kodowy:** usunięcie tej blokady skanu bez wyłączania
bramki CI i bez ogólnego ignorowania podatności. Nie rozpoczęto go tutaj.

Oddzielny zakres operatorski, nadal oczekujący, to **odbiór C-12 na KSeF TEST**:
porównanie oficjalnego XML z archiwum i KOD I dla wysyłki/importu/skrzynki,
a KOD II dopiero z certyfikatem typu 2 i uzgodnionym scenariuszem testowym.
Brak dostępu/certyfikatu lub potwierdzenia SQL jest konkretną przeszkodą;
nie zastępować dowodu operatora kolejnym testem z mockiem.

## Polecenie startowe do nowego czatu

> Kontynuuj security ksef-saas. Zacznij od katalogu
> `C:\Users\Igor\.codex\worktrees\security-main-pdf-hotfix\ksef-saas`, gałąź
> `codex/security-xml-evidence-integrity`. Przeczytaj AGENTS.md oraz końcowy wpis
> 03.10 i blok „Aktualny stan i następny krok” w
> `docs/security/DZIENNIK-ODPORNOSCI-CYBER.md`, C-20 i rejestr numerów w
> `docs/koordynacja/CLAUDE-DO-CODEXA.md`, aktualizację 03.10 w
> `docs/security/PLAN-ODPORNOSCI-CYBER.md` oraz
> `docs/security/XML-EVIDENCE-INTEGRITY-ODBIOR-2026-10-03.md`.
> Sprawdź świeży main, aktualne PR-y i zapisane wyniki, nie utożsamiaj merge
> z wdrożeniem. Jeden następny pakiet to CYB-DEP-BRACES: usuń blokadę skanu
> zależności produkcyjnych GHSA-vfj7-8cjw-p6xm przez bezpieczną zmianę
> zależności/pakowania, po zbadaniu faktycznych użyć. Nie wyłączaj skanu ani
> nie dodawaj ogólnego wyjątku. Pracuj w osobnym czystym worktree na nowej
> gałęzi codex/* od aktualnego origin/main; nie nadpisuj gałęzi Claude ani
> niezapisanych zmian starego C-12 i `C:\dev\ksef-saas`.
> Sprawdź poprawkę testami, buildem i recenzją, zaktualizuj te same dokumenty.
> Nie uruchamiaj migracji, nie scalaj do main ani nie wdrażaj bez oddzielnego
> polecenia właściciela. Po tym jednym pakiecie zatrzymaj się i przekaż stan.
