# Plan napraw — blok 1

Kolejność według `ZADANIE.md`:
1. fundamenty;
2. K1;
3. K2 (najpierw naprawy, potem dokończenia);
4. K3;
5. nowe funkcje spełniające kryteria;
6. K4.

**Fundament:** runner testów istnieje (`pnpm test` i `pnpm test:vitest`, 4170 testów), więc nie potrzeba osobnej pozycji. Wspólny moduł dat warszawskich powstaje w P-05 i z niego korzystają dalsze pozycje.

**Zasada nadrzędna:** nie zmieniam fragmentów kodu przerabianych przez otwarte PR (ustalenie z 2.10, `STAN.md`). Przed każdą pozycją sprawdzam hunki PR w zmienianych plikach.

Kryterium każdej pozycji obejmuje też: `pnpm typecheck`, `pnpm test` i `pnpm test:vitest` przechodzą.

---

### P-01 — Korekta: poprawna nazwa elementu numeru KSeF faktury korygowanej
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-049
Zmiana: `lib/ksef/fa3-correction-generator.ts` — `NumerKSeFFaKorygowanej` → `NrKSeFFaKorygowanej`. Nowy test generuje korektę z numerem KSeF rodzica i waliduje ją lokalnym XSD.
Kryterium: `pnpm exec vitest run tests/unit/korekta-nr-ksef-xsd.test.ts` — przed zmianą błąd XSD, po zmianie XML poprawny.
Commit: `9ff3f20`
Sprawdzenie: `pnpm exec vitest run tests/unit/korekta-nr-ksef-xsd.test.ts` — korekta z numerem KSeF rodzica przechodzi oficjalny XSD (przed poprawką: „Element NumerKSeFFaKorygowanej is not expected”).

### P-02 — PDF: tabela pozycji z równym nagłówkiem, zawijaniem nazw i łamaniem stron
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-054
Zmiana: `lib/pdf/invoice-renderer.ts` (tylko rysowanie tabeli):
- nagłówek rysowany w jednym wierszu;
- wysokość wiersza liczona z wysokości nazwy;
- przy końcu strony nowa strona z powtórzonym nagłówkiem;
- podsumowanie przeniesione na nową stronę, gdy się nie mieści.
Kryterium: test renderuje fakturę z 1, 40 i 60 pozycjami (także z długimi nazwami). Sprawdza:
- liczbę stron (1 pozycja → 1 strona, 40 → co najwyżej 3);
- że wszystkie etykiety nagłówka mają tę samą współrzędną Y.
Commit: `f2faffc`
Sprawdzenie: `pnpm exec vitest run tests/unit/pdf-tabela-pozycji.test.ts` (przed poprawką: 8 różnych Y nagłówka, 40 pozycji = 149 stron); w aplikacji: PDF faktury z 30+ pozycjami ma 2–3 strony z nagłówkiem tabeli na każdej. Wersji cache PDF nie podbijałem (zmienia ją PR #122) — bez #122 stary PDF z cache może się pokazać do zmiany faktury.

### P-03 — Import FA(3): pola liczbopodobne zachowane jako tekst
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-079
Zmiana: `lib/import/fa3-parser.ts` (i ten sam wzorzec w `lib/import/jpk-fa-parser.ts`, jeśli dotyczy): parser bez automatycznej konwersji wartości; liczby parsowane jawnie tam, gdzie są kwotami.
Kryterium: test — NrRB z 26 cyfr, P_2 „000123”, „1e3”, PKWiU „62.10” i NIP wracają bez zmian; kwoty nadal liczbowe; istniejące testy importu przechodzą.
Commit: `a1e6d87`
Sprawdzenie: `pnpm exec vitest run tests/unit/import-pola-tekstowe.test.ts` — NrRB, numery „000123”/„1e3” wracają bez zmian, kwoty dalej liczbowe; dotyczy nowych importów (już zaimportowane faktury z popsutym rachunkiem zostają — import ponowny po scaleniu).

### P-04 — Skrzynka KSeF: kolejne okno od końca poprzedniego, nie od globalnego HWM
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-039
Zmiana: `lib/inngest/jobs/inbox-polling.ts` — następny punkt startu = `min(HWM, window.to)` (dokumentacja MF: „moment zakończenia = `dateRange.to`, gdy została podana”). Wyliczenie wydzielone do czystej funkcji z testem.
Kryterium: test — okno 2026-01-01..04-01 z HWM 2026-10-02 zapisuje 2026-04-01; okno bieżące z HWM wcześniejszym niż `to` zapisuje HWM.
Commit: `f4a5298`
Sprawdzenie: `pnpm exec vitest run tests/unit/skrzynka-hwm-koniec-okna.test.ts` — przy zaległości okno 01.01–01.04 zapisuje 01.04 zamiast HWM 02.10 (na starej logice test pada); bieżące okno dalej idzie do HWM z KSeF.

### P-05 — Formularze faktur: daty liczone w czasie polskim
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-013
Zmiana:
- nowy `lib/format/warsaw-date.ts`: „dziś” w Europe/Warsaw i dodawanie dni do daty kalendarzowej bez strefy;
- użycie w `components/invoices/invoice-form.tsx` (domyślna data, przyciski terminu), `correction-form.tsx` i `final-form.tsx`;
- `advance-form.tsx` pomijam — te wiersze zmienia PR #85.
Kryterium: test helpera przy `TZ=Europe/Warsaw` i `TZ=UTC`: 2026-10-02 + 14 = 2026-10-16; 2026-10-31T23:30Z → „dziś” = 2026-11-01.
Commit: `194bda1`
Sprawdzenie: `pnpm exec vitest run tests/unit/daty-formularzy-warszawa.test.ts`; w aplikacji (przeglądarka w Polsce): data wystawienia 02.10 + przycisk „14 dni” → termin 16.10 (wcześniej 15.10). Formularz zaliczki bez zmian — PR #85.

### P-06 — Korekta zmniejszająca kwotę daje się zapisać (migracja 00200)
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-004
Zmiana: nowy plik `supabase/migrations/00200_correction_negative_total_paid_check.sql`. CHECK `check_paid_amount_valid` dopuszcza `gross_total < 0` przy `paid_amount = 0`; dla nieujemnych zostaje warunek `paid_amount <= gross_total`. Migracji nie wgrywam (krok dla Bartka).
Kryterium: skrypt na czystym Postgresie w Dockerze (tabela z tym samym CHECK). INSERT z `gross_total = -246` pada przed migracją i przechodzi po niej; `paid_amount > gross_total` dla dodatnich nadal pada. Gdy Docker niedostępny — kroki ręczne w `PODSUMOWANIE.md`.
Commit: `f13e21b`
Sprawdzenie: `bash scripts/verify-migration-00200.sh` (tymczasowy lokalny Postgres 16): przed 00200 INSERT korekty z gross_total -246 jest odrzucany, po 00200 przechodzi; wpłata > brutto nadal odrzucana. Na produkcji: wgrać 00200 przed wdrożeniem kodu.

### P-07 — Eksport KPiR: koszty dołączone domyślnie
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-058
Zmiana: `components/exports/exports-center.tsx` — wybór „KPiR Excel” zaznacza „Faktury otrzymane (koszty)”; etykieta mówi, że obejmuje też paragony. Logika domyślności w czystej funkcji.
Kryterium: test funkcji (`kpir_excel` → koszty włączone; `jpk_fa` → bez zmian) i test komponentu (jsdom), że przełączenie na KPiR zaznacza pole.
Commit: `9e1ed2a`
Sprawdzenie: `pnpm exec vitest run tests/unit/eksport-kpir-koszty-domyslnie.test.tsx`; w aplikacji: Raporty → Eksport → „KPiR Excel” zaznacza „Koszty: faktury otrzymane i paragony”. Pusty okres z samymi kosztami nadal kończy się „Brak faktur” — to w exports-generate.ts (PR #71, #128).

### P-08 — Szkic faktury: wysyłka do KSeF i usunięcie
Status: ZROBIONE
Typ: DOKOŃCZENIE
Znaleziska: F-001, F-042
Zmiana:
- nowy `components/invoices/draft-actions.ts`:
  - `sendDraftInvoiceAction`: zwykła faktura w stanie `draft` tej organizacji; snapshot `fa3_data`; `validateInvoice` i kontrola podstawy `zw`; potem `enqueueKsefSubmitAfterDraft`;
  - `deleteDraftInvoiceAction`: tylko `draft`; usuwa pozycje i fakturę; audyt `invoice.draft_deleted`.
- przyciski w szczególe faktury;
- `saveDraftAction` waliduje tym samym schematem co formularz.
Kryterium: testy jednostkowe na mockach:
- wysyłka szkicu woła kolejkę;
- faktura nie-szkic, obca organizacja i korekta są odrzucane;
- błąd walidacji nie kolejkuje;
- usunięcie działa tylko dla szkicu;
- zapis szkicu z błędnym NIP jest odrzucony.
Commit: `07d7686`
Sprawdzenie: `pnpm exec vitest run tests/unit/szkic-wysylka-usuwanie.test.ts tests/unit/szkic-walidacja-serwerowa.test.ts`; w aplikacji: Nowa faktura → „Zapisz szkic” → w szczególe „Wyślij do KSeF” (status zmienia się na W kolejce) albo „Usuń szkic” (numer wolny do ponownego użycia). Szkic z datą inną niż dziś trzeba wystawić od nowa.

### P-22 — „Wystaw i wyślij” tylko z dzisiejszą datą wystawienia
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-092 (znalezione w trakcie P-08)
Zmiana:
- `components/invoices/actions.ts` (`saveAndSendInvoiceAction`, zaraz po walidacji Zod): data wystawienia różna od dziś (Europe/Warsaw, `lib/format/warsaw-date.ts`) → czytelny błąd bez zapisu; szkic z inną datą nadal można zapisać;
- formularz pokazuje ten sam komunikat.
- Korekty, zaliczki i ROZ pomijam: ich akcje zmieniają PR #63, #71, #85.
Kryterium: test akcji — data jutrzejsza i wczorajsza odrzucone bez zapisu i bez kolejki, dzisiejsza przechodzi; `saveDraftAction` z inną datą nadal zapisuje.
Commit: `e94c10e`
Sprawdzenie: `pnpm exec vitest run tests/unit/wystaw-data-dzis.test.ts`; w aplikacji: Nowa faktura z datą wystawienia jutro → „Wystaw i wyślij” pokazuje komunikat o dzisiejszej dacie, „Zapisz szkic” działa.

### P-09 — Lista faktur: wyszukiwanie, filtr statusu i okresu, stronicowanie
Status: ZROBIONE
Typ: DOKOŃCZENIE
Znaleziska: F-086, F-091 (podtytuł listy)
Zmiana:
- `app/(dashboard)/invoices/page.tsx`: parametry w URL (`q`, `status`, `od`, `do`, `strona`), zapytanie z `range` i `count`, formularz GET bez JS, nawigacja stron;
- nowy `lib/invoices/list-query.ts`: parsowanie parametrów i bezpieczne budowanie filtra (numer, nazwa nabywcy, NIP).
Kryterium: testy `list-query` (parsowanie, ucieczka znaków `,()%*`, zakres stron) i test strony na mocku klienta: filtry trafiają do zapytania, a `range` odpowiada stronie.
Commit: `f6784ce`
Sprawdzenie: `pnpm exec vitest run tests/unit/lista-faktur-filtry.test.ts`; w aplikacji: /invoices?q=FV&status=przyjete&od=2026-09-01 — lista zawężona, pod nią „Strona 1 z N”.

### P-10 — Portal księgowej: dokumenty księgowe zamiast surowej listy
Status: ZROBIONE
Typ: DOKOŃCZENIE
Znaleziska: F-063
Zmiana: `lib/accountant/load-accountant-portal.ts` oraz `components/accountant/invoice-list.tsx`:
- tylko faktury przyjęte w KSeF lub odebrane (bez szkiców i odrzuconych);
- kolumna kierunku (sprzedaż / koszt) i polskie nazwy statusów;
- „Pobierz XML” tylko tam, gdzie XML istnieje.
Kryterium: test loadera (filtr statusów w zapytaniu, mapowanie kierunku) i test listy (brak przycisku XML bez pliku, polskie etykiety).
Commit: `da57935`
Sprawdzenie: `pnpm exec vitest run tests/unit/portal-ksiegowej-lista.test.tsx`; w aplikacji: link portalu księgowej (/accountant/<token>) — tabela z kolumną Rodzaj, bez szkiców, „Pobierz XML” tylko przy fakturach z plikiem. Brak filtra okresu i PDF zostaje na później.

### P-11 — Data sprzedaży do 60 dni po dacie wystawienia
Status: ZROBIONE
Typ: NAPRAWA
Znaleziska: F-014
Zmiana: `lib/schemas/invoice-form.ts` (reguła daty sprzedaży) oraz `lib/xml/invoice-calculator.ts` (`validateInvoice`). Dozwolone `saleDate <= issueDate + 60 dni` (art. 106i ust. 7); później — błąd z wyjaśnieniem.
Kryterium: test schematu i `validateInvoice`: +10 dni przechodzi, +61 dni odrzucone, data wcześniejsza przechodzi.
Commit: `328d486`
Sprawdzenie: `pnpm exec vitest run tests/unit/data-sprzedazy-60-dni.test.ts` i `pnpm test` (kalkulator: 61 dni odrzucone, 12 dni przyjęte); w aplikacji: faktura z datą sprzedaży za tydzień zapisuje się i wysyła.

### P-12 — Formularz faktury odrzuca dane, których nie przyjmie XSD ani baza
Status: W TOKU
Typ: NAPRAWA
Znaleziska: F-041
Zmiana: `lib/schemas/invoice-form.ts` (schemat pozycji i nabywcy):
- znaki sterujące w tekstach odrzucane z czytelnym komunikatem;
- numer niepusty po przycięciu;
- nazwa nabywcy ≤ 512, jednostka ≤ 50;
- ilość i cena w zakresie `NUMERIC(12,2)` wartości pozycji.
Kryterium: test schematu dla każdego przypadku z F-041; dotychczasowe testy formularza przechodzą.

### P-13 — Korekta przed/po: pary pozycji według treści, nie kolejności
Status: TODO
Typ: NAPRAWA
Znaleziska: F-019
Zmiana: `lib/ksef/fa3-correction-generator.ts` (`beforeAfterRows`):
- pozycje identyczne pomijane niezależnie od kolejności;
- zmienione parowane po nazwie (a przy braku dopasowania po kolejności);
- usunięte → tylko „przed”, dodane → tylko „po”.
Kryterium: test — usunięcie środkowej z trzech pozycji daje tylko wiersz „przed” tej pozycji; sumy P_13/P_14/P_15 bez zmian; istniejące testy korekt przechodzą.

### P-14 — PDF: czytelna stawka dla faktur z importu historii
Status: TODO
Typ: NAPRAWA
Znaleziska: F-067 (część PDF; JPK w PR #128)
Zmiana: `lib/pdf/invoice-renderer.ts` — etykieta stawki dla kodów FA(3) spoza mapy (np. „0 KR”, „np I”, „0 WDT”) pokazuje sam kod zamiast „undefined”; w podsumowaniu też.
Kryterium: test renderu z pozycją „0 KR” — w tekście PDF nie ma „undefined”.

### P-15 — Kategorie kosztów: reguły „nazwa sprzedawcy” są stosowane
Status: TODO
Typ: NAPRAWA
Znaleziska: F-084
Zmiana: `lib/categorization/rule-engine.ts` — dopasowanie reguł `name_exact` po znormalizowanej nazwie sprzedawcy, gdy brak reguły po NIP; włączenie w kolejność klasyfikacji (`lib/categorization/index.ts`).
Kryterium: test na mocku bazy — wydatek bez NIP od sprzedawcy z regułą `name_exact` dostaje kategorię z reguły.

### P-16 — KSeF: kod 21184 „Sesja tymczasowo niedostępna” → nowa sesja
Status: TODO
Typ: NAPRAWA
Znaleziska: F-050
Zmiana: `lib/ksef/submit.ts` — przy 21184 unieważnienie sesji z pamięci podręcznej i błąd ponawialny. Bez zmian w jobach (te są w PR).
Kryterium: test na mocku klienta KSeF — odpowiedź z kodem 21184 unieważnia sesję i daje błąd ponawialny.

### P-17 — Dane firmy: edycja nazwy i adresu przez właściciela
Status: TODO
Typ: DOKOŃCZENIE
Znaleziska: F-008
Zmiana:
- nowa akcja `app/actions/company-profile.ts`: tylko rola `owner`; walidacja Zod; NIP niezmienny; audyt;
- formularz w `app/(dashboard)/settings/` (nowy komponent) zamiast danych tylko do odczytu.
Kryterium: testy akcji — właściciel zapisuje, inna rola odrzucona, pusty adres odrzucony, NIP nie jest zapisywany.

### P-18 — Kontrahenci: wyszukiwanie, edycja i usuwanie
Status: TODO
Typ: DOKOŃCZENIE
Znaleziska: F-011
Zmiana:
- `app/(dashboard)/contractors/page.tsx`: wyszukiwanie po nazwie i NIP;
- nowa akcja `app/actions/contractors.ts`: edycja nazwy i adresu, usunięcie; walidacja Zod; sumy kontrolne NIP; audyt;
- formularz edycji.
Kryterium: testy akcji (edycja, odrzucenie złego NIP, usunięcie, obca organizacja) i parsowania wyszukiwania.

### P-19 — Wydatki: wybór miesiąca
Status: TODO
Typ: DOKOŃCZENIE
Znaleziska: F-087 (część: wydatki)
Zmiana: `app/(dashboard)/expenses/page.tsx` — parametr `miesiac` (RRRR-MM) w URL, nawigacja poprzedni/następny miesiąc, zakres dat w czasie polskim (P-05).
Kryterium: test parsowania i zakresu miesiąca (grudzień → styczeń, zła wartość → bieżący miesiąc).

### P-20 — Podpowiedź kolejnego numeru faktury
Status: TODO
Typ: NOWA
Znaleziska: F-015
Uzasadnienie (kryterium c): numeracja z seriami jest w podstawowym obiegu u wszystkich czterech konkurentów (Fakturownia, inFakt, wFirma, iFirma — źródła w `RAPORT.md`). Ręczne wpisywanie numeru przy każdej fakturze prowadzi do dziur i duplikatów w serii, czyli wprost do problemu z art. 106e ust. 1 pkt 2.
Zmiana:
- nowy `lib/invoices/next-number.ts`: zwiększa ostatni człon liczbowy z zachowaniem zer wiodących; podmienia rok i miesiąc w numerze, gdy zmienił się okres, i wtedy zeruje licznik;
- strona `app/(dashboard)/invoices/new/regular` przekazuje podpowiedź do formularza (pole pozostaje edytowalne).
Kryterium: testy funkcji — FV/2026/10/007 → FV/2026/10/008; przełom miesiąca → FV/2026/11/001; przełom roku; numer bez cyfr → brak podpowiedzi.

### P-21 — PDF: pełna precyzja ilości i ceny; „VAT UE” zamiast „NIP”
Status: TODO
Typ: NAPRAWA
Znaleziska: F-069
Zmiana: `lib/pdf/invoice-renderer.ts` — ilość i cena jednostkowa z dokładnością do 4 miejsc (bez zbędnych zer); identyfikator nabywcy z właściwą etykietą.
Kryterium: test renderu — cena 100,1234 wypisana w całości; numer VAT-UE z etykietą „VAT UE”.

---

## Poza planem

Każde znalezisko spoza planu z powodem. „Kod zmieniany w PR #N” znaczy, że naprawa kolidowałaby z otwartym PR (ustalenie z 2.10). Wracamy do tych miejsc po scaleniu PR.

| Znalezisko | Powód |
|---|---|
| F-002 ponowna wysyłka odrzuconej | Decyzja projektowa (blokada ponowień celowa, ryzyko dubla) i kod w PR #63, #71, #122, #147. Po scaleniu #71 dołożyć ekran uzgodnienia i ponowną wysyłkę dla odrzuceń lokalnych i jednoznacznych. |
| F-003 blokady KOR i ROZ | Decyzja Bartka: zdjąć po P-01, P-06, PR #63 (F-017/F-018) i teście na KSeF TEST. |
| F-005 zakres korekt | Kod zmieniany w PR #63 (`correction/page.tsx`, `correction-actions.ts`). |
| F-006 oznaczanie zapłaty | Granica bezpieczeństwa płatności (migracje 00073/00074) — wymaga decyzji, kto i jak zapisuje płatność. |
| F-007 sprzedaż walutowa i zagraniczna | Nowa funkcja o dużym zakresie (kurs NBP, P_14_xW, WDT, eksport, np II, VAT-UE nabywcy). Spełnia kryterium c, ale nie da się jej bezpiecznie zrobić w jedną noc — „Pomysły na później”. |
| F-009 formaty kluczy KSeF | Format kluczy z MCU niepotwierdzony; akcja uploadu zmieniana w PR #63, #160, #161. |
| F-010 koszty historyczne | Kod zmieniany w PR #63, #86. |
| F-012 metoda liczenia VAT | Decyzja biznesowo-podatkowa (zmienia kwoty wszystkich faktur). |
| F-016 kolejna korekta | Kod zmieniany w PR #63 (PR utrwala stan przed = faktura pierwotna). |
| F-017 korekta kwotowa | Naprawiane w PR #63. |
| F-018 korekty `zw` | Częściowo w PR #63; reszta wymaga rozszerzenia schematu i generatora korekt — po scaleniu #63. |
| F-020 elementy ZAL | Nowe pola formularza i blok `Zamowienie`; formularz i generator zmieniane w PR #85. |
| F-021 wiele zaliczek | Nowa funkcja (encja zamówienia) — „Pomysły na później”. |
| F-022 adnotacje KOR/ZAL/ROZ | ZAL naprawiane w PR #85; KOR i ROZ wstrzymane — razem ze zdjęciem blokad (F-003). |
| F-023 metoda kasowa | Naprawiane w PR #158. |
| F-024, F-025 kwoty i kontrola ROZ | ROZ wstrzymane; `final-actions.ts` zmieniany w PR #63, #71, #85; pulpit w PR #151. |
| F-026 kwoty >2 miejsc w zaliczce | Formularz zaliczki zmieniany w PR #85; K4. |
| F-027 niezmienność | Naprawiane w PR #63, #71. |
| F-028 pętla 550/440 | Kod `submit-invoice.ts` zmieniany w PR #63, #71, #122, #147, #159. |
| F-029 XSD/auth jako awaria | Naprawiane częściowo w PR #147. |
| F-030 wynik niepewny | Naprawiane w PR #71. |
| F-031 powód odrzucenia | Kod zmieniany w PR #64, #71, #159. |
| F-032 stany zawieszone | Kod zmieniany w PR #63, #71, #147, #159. |
| F-033 XML niedeterministyczny | Naprawiane w PR #161. |
| F-034 atomowe przejęcie | Naprawiane w PR #71. |
| F-035 sonda zdrowia | Kod zmieniany w PR #64, #147. |
| F-036 przepustowość, Retry-After | Naprawiane w PR #159. |
| F-037 UPO | Kod zmieniany w PR #63, #71, #159. |
| F-038 koszt nie powstaje | Kod `inbox-polling.ts` (kroki po insercie) zmieniany w PR #64. |
| F-040 formularz a walidacja przy wysyłce | Naprawiane w PR #134. |
| F-043 edycja wydatku | Kod zmieniany w PR #128. |
| F-044 NIP 0000000000 | K4; import używa go jako zastępczego NIP-u — zmiana wymaga przeglądu importu (PR #63, #64, #86). |
| F-045 KOD I, XML | Naprawiane w PR #147. |
| F-046 QR Offline24 | Naprawiane w PR #122. |
| F-047 terminy Offline24 | Naprawiane w PR #147. |
| F-048 `offlineMode`, offline ZAL/KOR | Kod zmieniany w PR #63, #71, #122, #147. |
| F-051 marża, samofakturowanie, JST | Nowe funkcje — „Pomysły na później”. |
| F-052 unikalność per NIP | K4; decyzja o modelu organizacji z tym samym NIP. |
| F-053 próg MPP | Naprawiane w PR #151. |
| F-055 PDF korekty | Wymaga zapisu stanu przed korektą (`correction-actions.ts` w PR #63, #71; dane PDF w PR #122). KOR i tak wstrzymane — warunek zdjęcia blokady. |
| F-056 PDF ROZ | ROZ wstrzymane; dane PDF w PR #122. |
| F-057 e-mail szkicu | Akcja e-mail i PDF zmieniane w PR #122. |
| F-059 filtr „Korekty” | Ten sam hunk zmieniany w PR #71. |
| F-060 JPK_FA z korektą | Generator zmieniany w PR #128; wymaga stanu przed korektą (jak F-055). |
| F-061 JPK_V7M | Format wyłączony; kod zmieniany w PR #128 — naprawić przed włączeniem. |
| F-062 CSV | Kod zmieniany w PR #128. |
| F-064 stare korekty | Zależy od danych produkcyjnych; migracja porządkująca to decyzja Bartka (bez dostępu do bazy). |
| F-065 pulpit | Kod zmieniany w PR #71, #86, #128, #151. |
| F-066 eksporty | Kod zmieniany w PR #71. |
| F-067 (JPK) | Generator JPK zmieniany w PR #128; część PDF w P-14. |
| F-068 paczka PDF | Kod zmieniany w PR #122. |
| F-070 strefa w raportach | Kod zmieniany w PR #63, #71, #86, #128. |
| F-071 limit 1000 | Kod zmieniany w PR #63, #71, #86, #128. |
| F-072 zaległe | Kod zmieniany w PR #71, #86. |
| F-073 przypomnienia a korekty | Naprawiane w PR #86. |
| F-074 ustawienia przypomnień | `reminder-scheduler.ts` zmieniany w PR #153; reszta to projekt obiegu przypomnień (FLO). |
| F-075 nota 40 EUR | Naprawiane w PR #155. |
| F-076 waluta kosztów | Naprawiane w PR #128. |
| F-077 hotel i gastronomia | Zapis wydatku zmieniany w PR #128, #158; wymaga też decyzji o kategoriach KPiR („nie stanowi kosztu”). |
| F-078 deduplikacja importu | Naprawiane w PR #64. |
| F-080 magiczny import | Kod zmieniany w PR #63, #86. |
| F-081 przegląd kosztów | Decyzja projektowa (domyślne odliczenie i przegląd przez FLO). |
| F-082 okres odliczenia | Kod zmieniany w PR #63, #71, #86, #128. |
| F-083 metadane skrzynki | Kod zmieniany w PR #63, #64. |
| F-085 `origin` importu | Naprawiane w PR #64. |
| F-087 (skrzynka) | Strona skrzynki — K3, mniejsza wartość niż wydatki; „Pomysły na później”. |
| F-088 masowa walidacja kontrahentów | NIEPEWNE; akcja zmieniana w PR #154. |
| F-089 import plików | Kod zmieniany w PR #63, #64, #86. |
| F-090 operacje masowe | Nowa funkcja — „Pomysły na później”. |
| F-091 drobiazgi | K4; podtytuł listy w P-09, reszta w różnych plikach PR. |
