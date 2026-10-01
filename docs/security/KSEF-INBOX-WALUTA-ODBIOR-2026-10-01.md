# Waluta kosztów ze skrzynki KSeF — odbiór C-11

Stan kodu na 1 października 2026: skrzynka zapisuje walutę z metadanych KSeF w `invoices.currency`, ale dotychczasowy job tworzący `expenses` nie pobierał tej kolumny. Kwota 100 EUR mogła zostać zapisana jako 100 PLN i trafić do KPiR. To ustalenie z kodu, **nie potwierdzony incydent produkcyjny**; nie mamy datowanego SHA webu i workera ani liczby takich kosztów na db-1.

Poprawka C-11 wymaga poprawnego kodu waluty i obecnej kwoty VAT przed utworzeniem kosztu. [Oficjalny kontrakt KSeF `InvoiceMetadata`](https://raw.githubusercontent.com/CIRFMF/ksef-api/main/open-api.json) określa `vatAmount` jako kwotę **w PLN**, także dla faktury obcowalutowej; netto i brutto są w walucie dokumentu. Dlatego kod zachowuje VAT z metadanych oddzielnie, zamiast przeliczać go drugi raz. Dla waluty obcej pobiera kurs NBP i zapisuje przy koszcie oryginalne netto/brutto, VAT metadanych w PLN, kurs, numer i datę tabeli. **Każdy taki koszt pozostaje poza KPiR i bez odliczenia VAT do ręcznego porównania z XML**, nawet gdy kurs jest dostępny. Gdy kursu brak, kwoty źródłowe zostają z opisem, a VAT PLN pozostaje tylko w śladzie metadanych. Błąd sieci NBP powoduje ponowienie joba bez zapisu kosztu. Korekta ujemna zachowuje znak i symetryczne zaokrąglenie.

Formularz wydatku pokazuje ostrzeżenie o jednostkach i wymaga jawnego potwierdzenia sprawdzenia XML, kursu i kwot PLN. Akcja serwerowa sprawdza walutę powiązanej faktury (także dla historycznych kosztów bez nowego śladu). **Bez poprawnie zapisanego przy koszcie kursu nie pozwala włączyć go do KPiR, nawet po zaznaczeniu potwierdzenia**; samo potwierdzenie nie przelicza kwot. Historyczny koszt można natychmiast wyłączyć z KPiR bez potwierdzenia, także gdy waluta w bazie jest pusta; pozostaje wtedy nieprzejrzany. Po udanym zapisie powstaje wpis w `audit_logs`. Potwierdzenie jest decyzją człowieka, nie automatycznym dowodem poprawności kwot.

Zmiana daty dokumentu unieważnia stary ślad kursu; ponowne włączenie do KPiR wymaga kontrolowanego przeliczenia. Dotyczy to także wierszy, które utraciły powiązanie z fakturą KSeF — można je bezpiecznie wyłączyć, ale nie zatwierdzić. Przy braku kursu job nie uruchamia kategoryzacji zakładającej PLN i nie wysyła danych faktury do zewnętrznego klasyfikatora AI.

Raport KPiR, podsumowanie przepływów i pobieranie kosztów do eksportu odmawiają wyniku, gdy w wybranym okresie jest koszt KSeF oznaczony jako uwzględniony, lecz bez potwierdzonej waluty, zgodnego śladu kursu i przeglądu. Nie pomijają go po cichu, bo plik wyglądałby wtedy na kompletny. Generatory CSV zatrzymują się również przy fakturze walutowej: obecny format oznacza wszystkie kwoty jako PLN, a metadane KSeF mogą mieć netto/brutto w walucie dokumentu i VAT w PLN. To ograniczenie obowiązuje do uzgodnienia sposobu przeliczenia i importu przez księgową.

Analogicznie przychodowe KPiR, miesięczne sumy i wykresy, CSV, JPK_FA oraz generatory KPiR XLSX/JPK_V7M wymagają jawnego PLN na każdej użytej fakturze sprzedaży. Odmowa jest zamierzona: nie ma tu bezpiecznego przeliczenia całej faktury, pozycji i podatku. Portal księgowej zwraca komunikat `422`, a zadanie eksportu kończy się z powodem bez ponawiania. JPK_V7M i kilka integracyjnych formatów są dodatkowo już wstrzymane z innych przyczyn. Po wdrożeniu należy przejrzeć historyczne eksporty, bo pliki wydane przed blokadą nie zostaną naprawione automatycznie.

Migracja `00100_ksef_expense_provenance_guard.sql` osłania pochodzenie kosztu także przy bezpośrednim zapisie przez PostgREST. Cofnie uprawnienie `INSERT` do `expenses` dla roli `authenticated` (obecne joby tworzą koszty jako `service_role`) i zablokuje zmianę `source`, `ksef_invoice_id` oraz oryginalnego śladu FX przy koszcie KSeF. Nie pozwoli też użytkownikowi usunąć kosztu powiązanego z KSeF; można go wyłączyć z KPiR, zachowując ślad faktury. Waluta zaakceptowanej faktury jest już niezmienna dla roli użytkownika dzięki migracji `00073`. Wdrożenie `00100` należy do właściciela repo; Codex jej nie wykonał. Numer `00100` uwzględnia migrację `00099_ksef_submission_references.sql` z `main`. Przed wdrożeniem Bartek musi sprawdzić historię `00097`–`00099` na serwerze.

Ta osłona **nie domyka integralności księgowej**: użytkownik tenanta nadal ma bezpośredni `UPDATE` kwot `net_amount`, `vat_amount`, `gross_amount` i flag `is_deductible`/`is_reviewed`. Dla kosztu z prawidłowym śladem FX może tym ominąć formularz i audyt potwierdzenia, a raport przyjmie zmienione kwoty jako PLN. Ograniczenie tych pól wymaga odrębnego, kontrolowanego przepływu korekt po stronie bazy/serwera, bez utraty legalnej edycji w UI. Do tego czasu C-11 nie stanowi pełnej ochrony przed celowym zapisem przez klienta i nie powinno być uznane za zamkniętą granicę księgową.

## Odbiór operatora bez ujawniania faktur

1. Bartek ustala datowane SHA webu i workera w Coolify oraz backend jobów. Sam merge do `main` nie dowodzi wdrożenia poprawki.
2. Bartek uruchamia poniższy **wyłącznie odczytowy** licznik na db-1, przez konto z uprawnieniem do odczytu. Do zgłoszenia przekazuje datę, walutę i trzy liczby, bez identyfikatorów firm i kontrahentów. Codex nie uruchamia SQL.

```sql
SELECT
  COALESCE(NULLIF(upper(trim(i.currency)), ''), '<brak>') AS waluta,
  count(*) AS koszty_z_ksef,
  count(*) FILTER (WHERE e.is_deductible) AS uwzglednione_w_kpir,
  count(*) FILTER (WHERE e.ocr_extracted_data->>'fx' IS NULL) AS bez_sladu_kursu
FROM public.expenses AS e
JOIN public.invoices AS i
  ON i.id = e.ksef_invoice_id AND i.tenant_id = e.tenant_id
WHERE e.source = 'ksef_inbox'
  AND (i.currency IS NULL OR upper(trim(i.currency)) <> 'PLN')
GROUP BY 1
ORDER BY 1;
```

3. Jeśli wynik jest niezerowy, Bartek i księgowa sprawdzają **każdy** historyczny koszt w bezpiecznym środowisku względem oryginalnego XML, właściwej daty i tabeli NBP oraz już wygenerowanych KPiR/JPK. Szczególnie sprawdzają korekty ujemne i kwoty VAT w PLN z faktury walutowej. Nie stosują masowej poprawki SQL na podstawie samego licznika. Ustalenie zasad podatkowych i ewentualnych korekt należy do Igora i księgowej.
   Historyczny koszt bez śladu kursu nie zyska automatycznie możliwości zaksięgowania. Potrzebny jest osobny, kontrolowany przepływ ręcznego przeliczenia z numerem tabeli i audytem albo bezpieczne odtworzenie kosztu po uzgodnieniu przez księgową. Nie włączać go jednym kliknięciem.
   Bartek powinien osobno policzyć faktury sprzedaży z walutą inną niż PLN lub pustą walutą, bez wynoszenia danych klientów. Taki wynik wyznacza zakres ręcznego przeglądu uprzednich eksportów i raportów:

```sql
SELECT
  COALESCE(NULLIF(upper(trim(currency)), ''), '<brak>') AS waluta,
  count(*) AS faktury_sprzedazy
FROM public.invoices
WHERE direction = 'outgoing'
  AND (currency IS NULL OR upper(trim(currency)) <> 'PLN')
GROUP BY 1
ORDER BY 1;
```
4. Przed wydaniem: lokalne testy/CI dla joba, potem kontrolowany test na kopii z dwiema firmami i fakturami PLN, EUR, ujemną korektą, brakiem kursu i błędem NBP. Po wdrożeniu Bartek sprawdza rzeczywisty nowy wpis oraz brak błędnie zaksięgowanych kwot. Nie umieszcza XML ani danych kontrahentów w PR lub logu.

Brak waluty zatrzymuje job bez utworzenia kosztu. Ponieważ obecny watchdog nie liczy tej klasy błędów, Bartek powinien okresowo odczytać samą liczbę faktur przychodzących bez powiązanego wydatku, rozdzielając dokumenty celowo pominięte od błędów joba. Dopiero po ustaleniu kryterium oczekiwanego kosztu można dodać alarm, który nie będzie fałszywie zgłaszał faktur niebędących kosztem firmy.

Wycofanie kodu jest możliwe przez ponowne wdrożenie poprzedniego obrazu, ale przywróci ryzyko błędnego automatycznego księgowania nowych faktur walutowych. Historyczne wiersze wymagają osobnego rozliczenia; ponowienie joba nie naprawia istniejącego kosztu, bo działa ochrona przed duplikatem.

## Dogrywka po niezależnym przeglądzie (1 października)

- Portal księgowej pobiera dla JPK_FA tylko sprzedaż. Nieprawidłowy koszt KSeF nadal zatrzymuje KPiR, ale nie blokuje niezwiązanego JPK_FA. Zawieszony obecnie generator Comarch Optima także odmawia przy EUR lub braku waluty przed oznaczeniem wartości jako PLN.
- Migracja `00100` pozostaje częściową ochroną. Klient z rolą `authenticated` nadal może bezpośrednio zmienić kwoty i flagi istniejącego kosztu KSeF. Poprawka zamykająca wszystkie takie UPDATE wymaga równoczesnego, zweryfikowanego zapisu akcji serwerowej; automatyczna kontrola odmówiła obu prób rozdzielonych w czasie ze względu na ryzyko złamania legalnej edycji i zmianę granicy `service_role`. Nie wykonano odrzuconej zmiany. C-11 pozostaje otwarte także po ewentualnym wdrożeniu `00100`.
- Dla nowego KSeF FX `vat_deductible_amount` startuje od 0, a formularz nie pozwala wpisać zweryfikowanej kwoty odliczenia. Potwierdzenie XML i włączenie kosztu do KPiR może więc zaliczyć cały VAT do kosztów. Decyzja, jaką część VAT wolno odliczyć, należy do Igora i księgowej; do czasu pełnego przepływu nie nazywać tego automatycznie uzgodnionym kosztem.
- Deduplikacja kosztów KSeF to osobna zależność: na `main` SELECT→INSERT nie jest atomowy. Otwarty stos PR #64 ma migrację `00090` (UNIQUE z kontrolą historii) i obsługę konfliktu `23505`; bez uzgodnienia jej z `00100` dwa joby mogą utworzyć dwa koszty. Bartek musi najpierw potwierdzić stan 00090 na db-1 i wynik kontroli duplikatów. Nie zakładać wdrożenia na podstawie gałęzi.
- Odczyty faktur w eksporcie i raportach nie zawsze są stronicowane. Przy ponad 1000 wierszach mogą pominąć późniejsze faktury, także FX. To osobna sprawa kolejki z testem 1001 wierszy; obecna blokada walutowa nie stanowi dowodu kompletności bardzo dużego okresu. Nie wydawać takiego zakresu bez dodatkowego uzgodnienia.

Żadnej migracji ani kontroli na db-1 nie uruchamiano w tej pracy. Stan kodu roboczego, stan GitHuba i stan produkcji trzeba raportować oddzielnie.
