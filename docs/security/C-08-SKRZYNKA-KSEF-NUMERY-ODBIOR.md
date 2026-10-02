# C-08 — kolizje numerów faktur odebranych w skrzynce KSeF

> **Numeracja od 02.10.2026 (C-20):** 00089 → **00120**, 00090 → **00121** (szkic #64 przeniesiony do `main`). Treść poniżej w brzmieniu sprzed przeniesienia.


Stan przygotowania: 28.09.2026. Dotyczy `main` `4770099` i proponowanej migracji
`00096_incoming_invoice_number_boundary.sql`. Plik SQL **nie został wykonany**.
Nie potwierdzono historii migracji ani wersji workera na db-1.

## Problem i skutek

`00028` ustanawia unikalność `(tenant_id, internal_number)` dla wszystkich
faktur. Worker skrzynki wpisuje numer **dostawcy** w `internal_number` faktury
przychodzącej, a wszystkie nowe faktury z przebiegu zapisuje jednym `INSERT`.
Dwie różne faktury dostawców z numerem `FV/1` (albo przychodząca i własna)
powodują `23505` i odrzucenie całej paczki. Filtr istniejących faktur nie może
rozwiązać takiej kolizji, bo ich numery KSeF są różne. Okno zapytania do KSeF
przesuwa się co przebieg i obejmuje 48 godzin; po jego upływie dokumenty mogą
przestać być pobierane. `savedCount` w kursorze jest obecnie zwiększane przy
pobraniu metadanych, przed zapisem w bazie, więc nie jest dowodem utrwalenia.
To scenariusz potwierdzony przez kod i indeks, nie stwierdzony incydent db-1.

## Wymagany odczyt operatora przed zmianą

1. Potwierdzić rzeczywisty SHA workera, historię migracji i definicje indeksów
   `invoices` na db-1. Sam plik na `main` nie potwierdza wykonania migracji.
2. Jeśli indeks środowiskowy z `00089` **nie** istnieje, policzyć duplikaty
   `(tenant_id, ksef_number)` dla przychodzących faktur z niepustym numerem
   KSeF. Jeśli istnieje, sprawdzić duplikaty dopiero po
   `(tenant_id, ksef_environment, ksef_number)`; ten sam numer w TEST i PROD
   jest wtedy dopuszczalny. Niezależnie policzyć duplikaty
   `(tenant_id, internal_number)` dla wychodzących. Niezgodne wyniki uzgodnić
   ze źródłowymi XML; migracja zatrzymuje się przed zmianą indeksu.
3. Sprawdzić logi workera pod kątem `23505` i
   `uq_invoices_tenant_internal_number`, a potem porównać listę dokumentów KSeF
   w dotkniętych oknach z zapisanymi numerami KSeF. Nie zakładać, że kolejny
   przebieg naprawił lukę po 48 godzinach.

Przykładowe zapytania **wyłącznie odczytowe** do wykonania przez operatora:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'invoices'
  AND indexname IN (
    'uq_invoices_tenant_internal_number',
    'uq_invoices_tenant_outgoing_internal_number',
    'uq_invoices_incoming_ksef_identity',
    'uq_invoices_tenant_outgoing_internal_number_c08',
    'uq_invoices_tenant_incoming_ksef_number_c08'
  );

-- Tylko gdy NIE ma uq_invoices_incoming_ksef_identity (00089):
SELECT tenant_id, ksef_number, count(*)
FROM public.invoices
WHERE direction = 'incoming' AND ksef_number IS NOT NULL
GROUP BY tenant_id, ksef_number HAVING count(*) > 1;

-- Gdy 00089 działa: ten odczyt uwzględnia środowisko.
SELECT tenant_id, ksef_environment, ksef_number, count(*)
FROM public.invoices
WHERE direction = 'incoming' AND ksef_number IS NOT NULL
GROUP BY tenant_id, ksef_environment, ksef_number HAVING count(*) > 1;

SELECT tenant_id, internal_number, count(*)
FROM public.invoices
WHERE direction = 'outgoing' AND internal_number IS NOT NULL
GROUP BY tenant_id, internal_number HAVING count(*) > 1;
```

## Odbiór migracji

Na kopii zgodnej z db-1 przetestować kolejno: różni dostawcy z tym samym
`internal_number` przechodzą; faktura dostawcy z numerem równym własnej
przechodzi; duplikat przychodzącej po `(tenant_id, ksef_number)` jest odrzucony;
duplikat wychodzącej po `(tenant_id, internal_number)` jest odrzucony; różne
firmy nie kolidują. Sprawdzić faktyczny czas blokady zapisów przy budowie
indeksów oraz brak nieoczekiwanych duplikatów po operacji.

`00096` tworzy dwa indeksy zastępcze w jednej transakcji i dopiero potem usuwa
stary. Gdy indeks tożsamości z `00089` już istnieje, nie dodaje mocniejszego
klucza między środowiskami. **Numer 00096 jest wyższy od otwartych 00083–00095.**
Przed użyciem runnera Bartosz musi sprawdzić kolejność/historię migracji,
przećwiczyć ją na kopii i ustalić okno bez zapisów. Nie wykonywać masowego
`db push` bez tego planu. Kod z #64 `00089` uzupełniono w commicie `1158076`,
aby przed późniejszym wykonaniem usuwał także dwa indeksy `_c08` i tolerował
brak starego indeksu. Przed użyciem potwierdzić zielone kontrole tego PR.

Po wykonaniu przez operatora: potwierdzić nowe definicje w `pg_indexes`, brak
starego indeksu, ponowny odbiór dwóch faktur różnych dostawców z tym samym
numerem i brak podwójnego wydatku przy równoległym imporcie. Historyczne
braki odtworzyć przez kontrolowany ponowny odczyt KSeF oraz porównanie z DB.
Wycofanie wymaga planu dla danych przyjętych po rozluźnieniu starej
unikalności; nie odtwarzać w ciemno indeksu `00028`.
