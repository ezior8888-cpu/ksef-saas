# Podsumowanie — audyt bloku 1 (funkcjonalność i logika domenowa)

Dla Bartka, na rano. Sesja: 2 października 2026, start 03:26:56 UTC (05:26 czasu polskiego), gałąź `audyt/blok-1`, punkt wyjścia `c989309`. Szczegóły w `RAPORT.md` (94 znaleziska z dowodami) i `PLAN.md` (24 pozycje, wszystkie ZROBIONE). Każda poprawka to osobny commit `fix|feat(P-NN): …`, więc da się ją przejrzeć i cofnąć pojedynczo (`git revert <hash>`).

## W skrócie

- **Ścieżka „wystaw i wyślij od razu” działała.** Zwykła faktura VAT w PLN była poprawnie liczona, przechodziła aktualny XSD FA(3) i dostawała numer KSeF oraz UPO.
- **Wszystko obok tej ścieżki się urywało.** Problemy:
  - szkicu nie dało się wysłać ani usunąć;
  - korekta z numerem KSeF miała XML niezgodny ze schematem;
  - korekta zmniejszająca kwotę nie zapisywała się w bazie;
  - PDF z ponad ok. 22 pozycjami rozpadał się na dziesiątki stron;
  - daty w formularzach liczyły się w UTC, więc „14 dni” dawało 13 dni;
  - lista faktur nie miała wyszukiwania;
  - numer faktury trzeba było wpisywać ręcznie.
- **Naprawiłem 24 pozycje z planu:** 5 błędów K1, 7 pozycji K2, 10 pozycji K3 i 2 drobiazgi K4 (tabela niżej). Każda pozycja ma test.
- **Większość pozostałych K1 i K2 dotyczy kodu, który zmieniają otwarte PR.** Chodzi o PR #63, #64, #71, #85, #86, #122, #128, #134, #147, #158 i #159. Zgodnie z Twoim ustaleniem z nocy oznaczyłem te znaleziska numerem PR i ich nie ruszałem.
- **Kilka spraw czeka na Twoją decyzję.** Między innymi metoda liczenia VAT, oznaczanie zapłaty, ponowna wysyłka odrzuconych faktur i zdjęcie blokad korekt i ROZ — lista niżej.
- **Jedna migracja do wgrania:** `00200`, przed wdrożeniem kodu (P-06).
- **Nic nie jest zablokowane ani odłożone.** Plan zamknął się po ok. 2 h 15 min pracy. W dodatkowym obchodzie doszły jeszcze dwie pozycje (P-23, P-24).

## Co było zepsute i co naprawiłem

| Pozycja | Co naprawione | Znaleziska (waga) | Commit |
|---|---|---|---|
| P-01 | Korekta z numerem KSeF: poprawna nazwa elementu `NrKSeFFaKorygowanej` — wcześniej każda taka korekta odpadała na XSD | F-049 (K1) | `9ff3f20` |
| P-02 | PDF: równy nagłówek tabeli, zawijanie długich nazw, łamanie stron z powtórzonym nagłówkiem (40 pozycji: 149 stron → 2–3) | F-054 (K1) | `f2faffc` |
| P-03 | Import FA(3): numer rachunku, numery faktur i kody zostają tekstem (wcześniej „000123” → 123, NrRB w notacji naukowej) | F-079 (K1) | `a1e6d87` |
| P-04 | Skrzynka KSeF po przerwie > 90 dni nie pomija miesięcy faktur kosztowych | F-039 (K1) | `f4a5298` |
| P-05 | Daty w formularzach w czasie polskim (`lib/format/warsaw-date.ts`): „14 dni” = 14 dni, po północy data wystawienia to dziś | F-013 (K1) | `194bda1` |
| P-06 | Korekta zmniejszająca kwotę i anulowanie dają się zapisać — **migracja 00200** | F-004 (K2) | `f13e21b` |
| P-07 | Eksport „KPiR Excel” domyślnie z kosztami | F-058 (K2) | `9e1ed2a` |
| P-08 | Szkic: przycisk „Wyślij do KSeF” i „Usuń szkic”; zapis szkicu walidowany na serwerze | F-001 (K2), F-042 (K4) | `07d7686` |
| P-22 | „Wystaw i wyślij” tylko z dzisiejszą datą wystawienia (KSeF odrzuca późniejszą, a wcześniejszą traktuje jak offline) | F-092 (K2) | `e94c10e` |
| P-09 | Lista faktur: wyszukiwanie (numer, nabywca, NIP, kwota), filtr statusu i okresu, stronicowanie po 50 | F-086 (K2) | `f6784ce` |
| P-10 | Portal księgowej: tylko dokumenty księgowe (bez szkiców i odrzuconych), kierunek, polskie statusy | F-063 (K2) | `da57935` |
| P-16 | KSeF kod 21184 „Sesja tymczasowo niedostępna” (API 2.8.0) → ponowienie w nowej sesji zamiast odrzucenia | F-050 (K2) | `8392351` |
| P-11 | Data sprzedaży do 60 dni po dacie wystawienia (art. 106i ust. 7) zamiast zakazu | F-014 (K3) | `328d486` |
| P-12 | Formularz odrzuca dane, których nie przyjmie XSD ani baza (znaki sterujące, długości, zakresy) | F-041 (K3) | `577dc91` |
| P-13 | Korekta: pozycje „przed/po” parowane po treści, nie po kolejności | F-019 (K3) | `65cfca9` |
| P-14 | PDF faktur z importu historii: czytelna stawka zamiast „undefined” | F-067 (K3, część PDF) | `b1c420a` |
| P-15 | Kategorie kosztów: reguła „nazwa sprzedawcy” działa dla sprzedawców bez NIP | F-084 (K3) | `89d757d` |
| P-17 | Dane firmy (nazwa, adres) do edycji; NIP bez zmian | F-008 (K3) | `ce4a87c` |
| P-18 | Kontrahenci: wyszukiwanie, edycja, usuwanie | F-011 (K3) | `508f786` |
| P-19 | Wydatki: wybór miesiąca | F-087 (K3, część) | `67796fa` |
| P-20 | Podpowiedź kolejnego numeru faktury (licznik +1, nowy miesiąc/rok → od 1, zajęty numer przeskakiwany) | F-015 (K3) | `2017b80` |
| P-23 | Masowa walidacja kontrahentów w paczkach po 100 (przy kilkuset kontrahentach job padał) | F-088 (K3) | `2a6eccb` |
| P-21 | PDF: ilość i cena do 4 miejsc, „VAT UE” zamiast „NIP” | F-069 (K4) | `2bce837` |
| P-24 | Szczegóły faktury: sekcja „Płatność”, pełna precyzja, „VAT UE”, czas przyjęcia po polsku | F-094 (K4), F-091 (część) | `4ab652c` |

## Czego nie naprawiłem i dlaczego

**Zablokowane / odłożone:** nic.

**W kodzie zmienianym przez otwarte PR** (szczegóły i numery w `PLAN.md` → „Poza planem”). Najważniejsze K1/K2, które zostaną po scaleniu tych PR albo wymagają powrotu:
- korekty: kolejna korekta liczy „stan przed” z faktury pierwotnej (F-016, PR #63), korekty `zw` (F-018, częściowo PR #63), PDF korekty pokazuje stan po zamiast przed/po (F-055), JPK_FA odmawia okresu z korektą (F-060, PR #128);
- zaliczki i ROZ: brak danych zamówienia w ZAL (F-020, PR #85), adnotacje firmy w KOR i ROZ (F-022), kwoty i kontrola ROZ (F-024, F-025);
- wysyłka KSeF: pętle 550/440 i stany zawieszone (F-028, F-032), błędy XSD jako awaria (F-029, PR #147), wynik niepewny (F-030, PR #71), powód odrzucenia ginie (F-031), Offline24 (F-045–F-048, PR #122 i #147);
- koszty: koszt z KSeF może po cichu nie powstać (F-038, PR #64), waluta kosztów (F-076, PR #128), hotele i gastronomia (F-077), deduplikacja importu (F-078, PR #64);
- przypomnienia ignorują korekty (F-073, PR #86).

**Po scaleniu PR warto wrócić do:** F-002 (ponowna wysyłka odrzuconej — po #71), F-003 (zdjęcie blokad KOR i ROZ — po P-01, P-06 i #63, z testem na KSeF TEST), F-055/F-060 (zapis stanu przed korektą), F-093 (getter `ksefCode` → `ksefErrorCodes` z `lib/ksef/submit.ts`, po #159), limit 1000 wierszy w akcji walidacji kontrahentów (F-088, po #154).

## Decyzje podjęte samodzielnie — do potwierdzenia

1. **„Wystaw i wyślij” i wysyłka szkicu tylko z dzisiejszą datą wystawienia (P-22, P-08).** KSeF odrzuca datę późniejszą niż dzień przyjęcia, a wcześniejszą traktuje jako fakturę offline (dokumentacja MF, F-092). Szkic z inną datą wystawienia **nie zostanie wysłany**: użytkownik dostaje komunikat „usuń szkic i wystaw ponownie z dzisiejszą datą”. Nie przestawiam daty automatycznie, bo zmieniałoby to treść dokumentu bez wiedzy użytkownika. Do rozważenia: przycisk „Wyślij z dzisiejszą datą”, który przepisze datę za zgodą użytkownika, oraz świadomy tryb offline z wcześniejszą datą.
2. **Kto może co:**
   - edycja danych firmy — `owner` i `admin` (P-17, jak inne ustawienia firmy);
   - edycja i usuwanie kontrahentów — `owner`, `admin`, `member`, bez roli księgowej (P-18);
   - wysyłka i usunięcie szkicu — ten sam poziom co dotychczasowe „Wystaw i wyślij” (każdy członek aktywnej organizacji, P-08). Rola księgowej nie jest tu osobno blokowana — do decyzji w bloku bezpieczeństwa.
3. **Limity formularza (P-12):** jednostka ≤ 50 znaków, nazwy i adresy ≤ 512, ilość i cena ≤ 4 miejsca po przecinku, faktura < 10 mld zł (granice kolumn `NUMERIC`).
4. **Data sprzedaży do 60 dni po dacie wystawienia (P-11)** — art. 106i ust. 7; źródło pierwotne ustawy niezweryfikowane (strony gov.pl blokowane przez proxy), reguła z wtórnego źródła.
5. **Podpowiedź numeru (P-20)** bierze ostatnią zwykłą fakturę sprzedażową (najpóźniejsza data wystawienia, potem utworzenia), bez korekt i zaliczek, które zwykle mają własne serie. Pole zostaje edytowalne.
6. **Szczegóły faktury (P-24)** pokazują NIP albo VAT UE nabywcy; PESEL konsumenta celowo pomijam (PDF też go nie drukuje).
7. **Wersja cache PDF (`PDF_RENDERER_VERSION`) bez zmian**, bo podbija ją PR #122. Zmiany PDF z P-02, P-14 i P-21 zobaczysz dla starych faktur dopiero po podbiciu wersji (albo po scaleniu #122).

## Migracje i kroki ręczne

1. **Migracja `supabase/migrations/00200_correction_negative_total_paid_check.sql`** (P-06) — **wgrać przed wdrożeniem kodu**, procedurą z `AGENTS.md` („Wgrywanie migracji”). Zmienia tylko CHECK `check_paid_amount_valid`: dopuszcza `gross_total < 0` przy `paid_amount = 0`; bez `DROP TABLE`, `UPDATE` ani `DELETE`. Wpis do `schema_migrations` jako `00200` + `NOTIFY pgrst`. Lokalny dowód: `bash scripts/verify-migration-00200.sh` (stawia tymczasowy Postgres 16, nie łączy się z żadną zdalną bazą).
2. Po scaleniu PR #122 albo przy następnym wdrożeniu — podbić `PDF_RENDERER_VERSION` w `lib/pdf/pdf-storage.ts`, żeby stare PDF wygenerowały się nowym rendererem.
3. Faktury zaimportowane przed P-03 mogą mieć zepsute numery rachunków — naprawi je ponowny import (po scaleniu PR #64 z deduplikacją).
4. Wdrożenie: obie aplikacje (id=1 i id=2), bo m.in. P-03, P-04, P-16 i P-23 zmieniają kod wykonywany przez workera.

## Jak sprawdzić najważniejsze poprawki (ok. 10 minut w aplikacji, środowisko TEST)

1. **Nowa faktura** → pole numeru ma podpowiedź kolejnego numeru; przycisk „14 dni” daje termin 14 dni po dacie wystawienia; data sprzedaży za tydzień jest przyjmowana; data wystawienia jutro → „Wystaw i wyślij” pokazuje komunikat (P-20, P-05, P-11, P-22).
2. **Zapisz szkic** → w szczegółach „Wyślij do KSeF” (status „W kolejce”) albo „Usuń szkic”, a numer jest wolny (P-08).
3. **Faktura z 30 pozycjami i ceną 100,1234** → PDF ma 2–3 strony z nagłówkiem tabeli na każdej, cena w całości; szczegóły faktury pokazują termin i rachunek (P-02, P-21, P-24).
4. **/invoices?q=FV&status=przyjete** → lista zawężona i stronicowana (P-09).
5. **Korekta zmniejszająca kwotę** faktury z numerem KSeF (na TEST, po migracji 00200) → zapisuje się, XML przechodzi XSD (P-06, P-01).
6. **Raporty → Eksport → KPiR Excel** → koszty zaznaczone (P-07). **Ustawienia → Dane firmy** → zmiana adresu działa (P-17). **/contractors?q=525** → wyszukiwanie i edycja (P-18).

Każda pozycja ma też komendę testu w `PLAN.md` (linia „Sprawdzenie”).

## Pomysły na później (nie implementowane)

- Sprzedaż walutowa, WDT i eksport (kurs NBP, P_14_xW, VAT UE nabywcy) — F-007; spełnia kryterium konkurencji, ale to za duży zakres na jedną noc.
- Oznaczanie zapłaty z poziomu faktury (F-006) — wymaga decyzji o granicy bezpieczeństwa płatności.
- Ręczne dodawanie kontrahenta i zapis nabywcy wpisanego ręcznie (F-011).
- Rabaty (P_10), marża, samofakturowanie, JST (F-051).
- Wiele zaliczek do jednego zamówienia (F-021).
- Operacje masowe na fakturach (F-090), wyszukiwanie w skrzynce KSeF (F-087).
- Proforma i duplikaty; liczenie od brutto.
- Metoda liczenia VAT od sumy w stawce zamiast od pozycji (F-012) — decyzja podatkowa, zmienia kwoty.

## Poza zakresem (inne bloki audytu)

Pełna lista w `RAPORT.md` → „Poza zakresem”. Bezpieczeństwo — tylko wskazania plików: walidacja danych w akcjach korekt (`components/invoices/correction-actions.ts`), RLS pozycji faktury przyjętej (`supabase/migrations/00002_rls_policies.sql`), klucz pamięci sesji KSeF (`lib/ksef/session-cache.ts`), kontrola roli przy certyfikacie KSeF (`components/settings/actions.ts`), tokeny portalu księgowej (`components/settings/accountant-actions.ts`, `app/accountant/[token]`), organizacja w akcjach wydatków (`app/actions/expenses.ts`). Wydajność: cache PDF praktycznie nie trafia (`lib/pdf/pdf-storage.ts`), długie odpytywanie KSeF blokuje workera. Dokumentacja: `AGENTS.md` opisuje nieaktualny stos.

## Weryfikacja na koniec sesji

| Komenda | Stan zastany (`c989309`) | Teraz |
|---|---|---|
| `pnpm typecheck` | exit 0 | exit 0 |
| `pnpm lint` | exit 0, 33 ostrzeżenia | exit 0, 32 ostrzeżenia (żadne nowe; dwa zniknęły przy zmienianych formularzach) |
| `pnpm test` | exit 0, 66 testów | exit 0, 67 testów |
| `pnpm test:vitest` | exit 0, 296 plików / 4170 testów | exit 0, 320 plików / 4330 testów |
| `pnpm build` | exit 0 | exit 0 |

Nowe testy: 24 pliki w `tests/unit/` (nazwy po polsku, w każdym komentarz z numerem znaleziska) + `scripts/verify-migration-00200.sh`. Żaden istniejący test nie został osłabiony; dwa zmienione testy są opisane w commitach P-11 (zamiast „zawsze odrzuca” — odrzucenie po 61 dniach i akceptacja po 12) i P-22 (zamrożony zegar w teście granicy MFA).

## Czego nie robiłem

Bez pushu na `main`, bez PR, bez wdrożenia, bez SSH, bez zapisu do żadnej zdalnej bazy, KSeF wyłącznie na mockach, bez `seed:*`/`trigger:*`/`ksef:*`/`db:push*`. Pliki tymczasowe w `.audyt-tmp/` (poza gitem).
