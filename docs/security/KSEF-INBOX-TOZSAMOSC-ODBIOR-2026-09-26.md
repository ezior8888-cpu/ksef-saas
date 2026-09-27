# Skrzynka KSeF: tożsamość faktury przychodzącej — odbiór 00089

Stan na 2026-09-26: `00089_incoming_ksef_identity.sql` i `00090_expense_ksef_invoice_identity.sql` są wyłącznie lokalnymi plikami. Nie uruchomiono SQL ani migracji. Według dziennika wydania Bartka db-1 ma migracje do `00082`; Codex nie odczytał tej bazy. `00083`–`00090` i odpowiadający im kod wymagają spójnego odbioru na kopii oraz kontrolowanego wydania. Ten dokument nie jest potwierdzeniem wdrożenia.

Aktualizacja 2026-09-27: pliki są opublikowane do przeglądu w szkicowym PR #64, nadal bez wykonania SQL. Otwarty PR #60 przeniósł swoją niezależną migrację zwolnienia VAT na `00091`. Przy zachowaniu tej numeracji kolejność integracji schematu to #62 (`00083–00085`) → #63 (`00086–00088`) → #64 (`00089–00090`) → #60 (`00091`). Przed każdą próbą Bartek musi odczytowo potwierdzić historię db-1; nie wgrywać `00091` wcześniej jako „niezależnej”, jeśli późniejsze uzupełnienie `00083–00090` nie zostało sprawdzone na kopii i uzgodnione z narzędziem migracji. Jeśli #60 musi wejść wcześniej, numerację należy wspólnie rozstrzygnąć przed scaleniem. Ten wpis nie stanowi zgody na wdrożenie.

## Dlaczego ta zmiana jest potrzebna

`inbox-polling` sprawdzał numer KSeF przed osobnym zbiorczym INSERT. Indeksy nazwane jak unikalne w `00001`/`00004` nie były UNIQUE. Stary indeks `00028` przypadkowo blokował część wyścigów przez `(tenant_id, internal_number)`, ale blokował też **różne** faktury przychodzące od dwóch wystawców używających np. `FV/1`. Błąd jednego wiersza odrzucał cały batch. Po upływie 48-godzinnego okna polling nie musi odzyskać pominiętego dokumentu.

`00089` nie usuwa żadnego wiersza. Odrzuca wykonanie, jeśli istnieje przychodząca faktura z numerem KSeF i nieznanym środowiskiem albo duplikat tego samego `(tenant_id, ksef_environment, ksef_number)`. Dodaje UNIQUE dla takiej trójki, a unikalność numeru wewnętrznego ogranicza do faktur wychodzących. Nowe przychodzące z numerem KSeF muszą mieć środowisko. Indeks nie filtruje po `origin`: stary poller błędnie zapisywał `origin='app'`.

Ta unikalność celowo nie obejmuje przychodzących **bez** numeru KSeF. Obecne wywołania importu zapisują je tylko jako wychodzące (import pliku) albo jako przychodzące z numerem KSeF (historia KSeF). Przed dodaniem w przyszłości importu innych dokumentów przychodzących trzeba zaprojektować odrębną, atomową tożsamość z wystawcą; samo wcześniejsze `SELECT` po numerze faktury nie zatrzyma wyścigu i może pomylić dwóch różnych sprzedawców.

Kod zapisuje `origin='ksef_inbox'`, rozróżnia kierunek i środowisko przy odczycie, a po `23505` ponawia **cały atomowy batch** bez potwierdzonych duplikatów. Nie wykonuje częściowych insertów, które po późniejszym błędzie mogłyby stracić powiadomienia. Porównuje skrót XML, jeśli jest dostępny, sprzedawcę, datę i kwotę; rozbieżność oraz legacy `NULL` zatrzymują job. Karty FLO, auto-kategoryzacja, push i eventy odnoszą się tylko do wierszy rzeczywiście wstawionych przez dany przebieg. Import historii zachowuje numer wystawcy i nie odrzuca dwóch przychodzących z różnym numerem KSeF tylko dlatego, że ich własny numer jest taki sam.

Osobny wyścig występował po doręczeniu eventu: dwa joby auto-kategoryzacji mogły jednocześnie nie znaleźć wydatku i utworzyć dwa koszty w KPiR. `00090` dodaje UNIQUE `(tenant_id,ksef_invoice_id)` dla niepustego ID oraz złożony FK wiążący koszt z fakturą **tego samego tenanta**. Stary FK po samym UUID tego nie gwarantował. Kod po `23505` potwierdza dokładny koszt zamiast uznawać dowolny konflikt za sukces. Złożony FK jest `NOT VALID`: nowe zapisy są sprawdzane, a historyczne wymagają późniejszego `VALIDATE` po audycie.

## Odczytowy preflight na kopii bazy

Poniższe zapytania są dla operatora i mają zwracać **liczniki**, bez eksportowania NIP-ów ani numerów faktur do PR/komentarzy. Codex ich nie wykonywał. Przed próbą operator potwierdza pełny ciąg `schema_migrations`, SHA webu i workera, kopię oraz próbę jej odtworzenia.

```sql
SELECT count(*) AS incoming_unknown_environment
FROM public.invoices
WHERE direction = 'incoming' AND ksef_number IS NOT NULL
  AND ksef_environment IS NULL;

SELECT count(*) AS duplicate_identity_groups
FROM (
  SELECT tenant_id, ksef_environment, ksef_number
  FROM public.invoices
  WHERE direction = 'incoming' AND ksef_number IS NOT NULL
  GROUP BY tenant_id, ksef_environment, ksef_number
  HAVING count(*) > 1
) AS duplicates;

SELECT count(*) AS legacy_inbox_wrong_origin
FROM public.invoices
WHERE direction = 'incoming' AND origin = 'app'
  AND fa3_data->>'_source' = 'inbox-metadata';

SELECT count(*) AS duplicate_expense_groups
FROM (
  SELECT tenant_id, ksef_invoice_id
  FROM public.expenses
  WHERE ksef_invoice_id IS NOT NULL
  GROUP BY tenant_id, ksef_invoice_id
  HAVING count(*) > 1
) AS duplicates;

SELECT count(*) AS cross_tenant_expense_links
FROM public.expenses AS e
JOIN public.invoices AS i ON i.id = e.ksef_invoice_id
WHERE e.ksef_invoice_id IS NOT NULL AND e.tenant_id <> i.tenant_id;
```

Każdy `NULL` wymaga ustalenia środowiska z zewnętrznego dowodu KSeF; nie wolno przypisać bieżącego `KSEF_ENV` z samej daty lub konfiguracji. Duplikaty i obce powiązania kosztów trzeba uzgodnić razem z pozycjami, płatnościami, audytem i skutkami księgowymi; nie usuwać ich samym skryptem. Licznik `legacy_inbox_wrong_origin` nie zatrzymuje migracji, ale oznacza ręczny przegląd historii FLO. Pusta liczba duplikatów w bazie nie dowodzi, że dawny indeks `00028` nie zgubił importu: trzeba porównać historię odebraną z KSeF z zapisami także poza ostatnimi 48 godzinami.

## Próba i wydanie operatora

Na odizolowanej kopii sprawdzić 00083–00090 w kolejności, role i granty po 00086, rollback całych 00089/00090 przy preflight failure oraz indeksy, CHECK i FK. `00089` i `00090` trzymają `SHARE ROW EXCLUSIVE` od preflight do COMMIT; jest to celowa przerwa dla zapisów faktur i kosztów, której długość trzeba zmierzyć na kopii. Zatrzymać pollery i auto-kategoryzację web/worker na czas zgodnego wdrożenia bazy i kodu; stary poller po zmianie indeksu może błędnie traktować `23505` jako błąd całego batcha. Sprawdzić dwa równoległe przebiegi dla tego samego `(tenant,env,ksef_number)`, dwóch sprzedawców z `FV/1`, TEST i PROD z tym samym numerem KSeF, nieznane środowisko, konflikt skrótu, równoległą auto-kategoryzację i obcy `ksef_invoice_id` przez PostgREST. Po ręcznym uzgodnieniu historii operator waliduje `expenses_ksef_invoice_same_tenant_fk` i odczytuje `convalidated`; sama obecność constraintu nie oznacza walidacji. Po wydaniu porównać liczbę pobranych faktur z KSeF z bazą i monitorować błędy jobów oraz skutki w KPiR. Żadna z tych prób nie została jeszcze przeprowadzona na prawdziwym PostgreSQL/KSeF.

Pozostaje granica transakcyjności: INSERT i późniejszy fan-out do FLO/push/eventów są osobnymi operacjami. Awaria procesu po commicie INSERT, a przed fan-out, może pozostawić fakturę bez części działań następczych; retry pg-boss odfiltruje ją jako już istniejącą. Gwarancja skutków po takim crashu wymaga osobnego transakcyjnego outboxa i idempotentnego konsumenta. Nie odtwarzać automatycznie każdego brakującego kosztu: użytkownik może świadomie usunąć wydatek, a stary poller zapisywał `origin='app'`. Do czasu outboxa potrzebny jest odczytowy alert i ręczne uzgodnienie. Nie przedstawiać 00089–00090 jako rozwiązania exactly-once.
