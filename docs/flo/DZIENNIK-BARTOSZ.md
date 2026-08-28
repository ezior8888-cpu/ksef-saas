# Dziennik — Bartosz (tor A: silnik)

Zasada: dopisujemy na końcu, nigdy nie edytujemy cudzych wpisów.
Ten plik należy do Bartosza. Dziennik Masła: `DZIENNIK-MASLO.md`.

## 2026-08-24 · Krok 1 — kontrakt `types/flo.ts`

Zrobione:
- `types/flo.ts` — pełny kontrakt danych agenta, przepisany z części III.2 planu.

Dodane ponad plan (uzupełnienie luki w kontrakcie, zgodnie z zasadą „zmiany
wyłącznie przez dodanie”):
- `FloPrefs` + `FloTaxProfile` — typ był używany w sygnaturze `getPrefs()`
  w części III.3, ale nie był zdefiniowany w III.2.
- `FloApproveResult`, `FloApproveInput`, `FloDismissMode` — zwrotki i wejścia
  akcji serwerowych z III.3, żeby interfejs miał je z typu, a nie z domysłu.
- `FloListItem` — wyciągnięty do osobnego interfejsu (był typem inline
  w `FloProposalView.items`); kształt pól bez zmian.

`FloPrefs` NIE MA pola poziomu autonomii — zachowanie agenta jest identyczne
u każdego klienta (część II.3). W pliku jest to zapisane komentarzem, żeby
nikt tego nie „poprawił” za pół roku.

Uwagi dla Masła:
- Kontrakt jest w `main`. Możesz startować z krokiem 3 (karta bazowa).
- `FloApproveResult` z `reason: 'stale'` to NORMALNY przypadek, nie awaria —
  patrz Twój krok 19.
- Wszystkie kwoty przychodzą jako gotowe napisy. Nie formatuj ich u siebie.

Następny krok: 2

## 2026-08-24 · Krok 2 — atrapy `lib/flo/fixtures.ts`

Zrobione:
- `lib/flo/fixtures.ts` — 12 propozycji i 3 pozycje panelu zatwierdzonych.

Pokrycie:
- sześć wariantów karty: `info`, `single`, `preview`, `choice`, `list`, `input`
- cztery rodzaje podglądu: `invoice`, `message`, `diff`, `file`
- przypadki brzegowe: tytuł 120 znaków, treść 410 znaków, propozycja bez
  dowodów, propozycja wygasająca za 4 minuty, paczka 10 faktur z 3 pozycjami
  odznaczonymi i wymagającymi podglądu, kwota 1 234 567,89 zł, nazwa
  kontrahenta bez spacji na 60 znaków
- karta z paskiem cofnięcia (`undoableUntil`) — czynność, którą FLO zrobił sam

Weryfikacja:
- `pnpm typecheck` — 0 błędów w `types/flo.ts` i `lib/flo/fixtures.ts`.
  UWAGA: repozytorium ma 6 zastanych błędów w `.next/types/*` (nieaktualne
  artefakty builda z 17.08 wskazujące na `app/(marketing)/page.js`). Ta sama
  liczba przed i po moich plikach — sprawdzone przez tymczasowe usunięcie.
  Do naprawy osobno przez `rm -rf .next` i ponowny build.
- `npx eslint types/flo.ts lib/flo/fixtures.ts` — czysto.

Uwagi dla Masła:
- Atrapy są w `main`. `FLO_FIXTURES` i `FLO_SCHEDULED_FIXTURES`.
- Znaczniki czasu liczone są przy załadowaniu modułu, więc odliczanie
  do `expiresAt` działa na żywo (karta `fx-diff-ksef-fix` wygasa za 4 minuty
  od startu serwera — celowo, do testu odliczania).
- W panelu zatwierdzonych KAŻDA pozycja ma `approvedAtLabel`. Jeśli kiedyś
  zobaczysz pozycję bez tego pola — to błąd silnika, zgłoś w dzienniku.

Następny krok: 3 (migracja `00061_flo.sql`)

## 2026-08-24 · Krok 3 — migracja `00061_flo.sql`

Zrobione:
- `supabase/migrations/00061_flo.sql` — sześć tabel agenta, 7 indeksów,
  4 polityki RLS, komplet REVOKE.

Decyzje projektowe (i dlaczego):
- `kind` jako TEXT, nie ENUM — rodzajów propozycji jest 33 i będą przybywać;
  ENUM wymagałby migracji przy każdym nowym. Waliduje Zod na granicy.
- `status` odwrotnie: mały zamknięty zbiór, więc CHECK pilnuje go w bazie.
- `flo_proposals_topic_live` — UNIQUE częściowy na (tenant_id, topic_key)
  dla statusów open/approved. To jest mechanizm „jeden temat = jedna karta”
  wymuszony przez bazę, nie przez kod.
- `flo_approvals_live` — UNIQUE częściowy na proposal_id gdzie consumed_at
  IS NULL. Druga zgoda na to samo nie ma prawa powstać.
- `flo_usage` i `flo_shadow` mają RLS włączony BEZ polityki SELECT = odmowa
  dla wszystkich poza service_role. To dane operatorskie (koszt modelu,
  trafność w trybie cichym), klient nie ma powodu ich oglądać.
- `user_id` w `flo_approvals` bez FK do auth.users: prawny ślad zgody żyje
  w `audit_logs` (niemutowalnych), a te wiersze znikają z kontem przez
  CASCADE po tenant_id. Odstępstwo od szkicu z części III.1 — tam było FK.

Weryfikacja (bez bazy — migracji nie wgrywam, robi to Bartosz):
- parser: 39 instrukcji, nawiasy zbilansowane (46/46), zero linii
  zaczynających się od `-` innych niż komentarz `--`
- konwencja polityk zgodna z resztą repo:
  `USING (tenant_id = public.get_current_tenant_id())` — funkcja z 00037
- brak kolizji numeru migracji

DO ZROBIENIA PRZEZ CZŁOWIEKA: `pnpm db:push:prod` (albo lokalnie), potem
regeneracja `types/database.ts` przy najbliższej okazji.

Uwagi dla Masła: brak.

Następny krok: 4

## 2026-08-24 · Krok 4 — typy lokalne `lib/flo/db-types.ts`

Zrobione:
- `lib/flo/db-types.ts` — sześć typów wierszy + sześć typów wstawiania,
  okrojony łańcuch filtrów PostgREST i `floDb()` rzutujące klienta
  administracyjnego przez `unknown`.

Dlaczego tak:
- `types/database.ts` nie zna tabel z 00061 i regeneruje się osobno, więc
  bez tego kroku każde zapytanie agenta miałoby błąd typów.
- `FloDbClient` widzi WYŁĄCZNIE sześć tabel agenta. Tym rzutowaniem nie da
  się przypadkiem sięgnąć do faktur ani kontrahentów.
- `FloProposalRow.kind` jest typu `string`, nie `FloProposalKind` — w bazie
  to TEXT i wartość mogła tam trafić ze starszej wersji kodu. Walidujemy
  strażnikiem przy odczycie, zamiast udawać, że baza gwarantuje typ.

Zmiana w `types/flo.ts` (zgodna z zasadą „tylko dodawanie” — typ dla
importujących jest identyczny):
- `FLO_PROPOSAL_KINDS` i `FLO_CARD_VARIANTS` jako tablice `as const`, a unie
  wyprowadzone z nich przez `typeof [...][number]`. Powód: lista jest
  potrzebna w czasie wykonania — do walidacji `kind` z bazy i do testu
  kontraktowego z kroku 5, który sprawdza, że każdy rodzaj ma przypisany
  wariant karty.
- `isFloProposalKind()` — strażnik dla wartości z bazy i z kolejki.

Weryfikacja:
- tymczasowy plik `lib/flo/__smoke.ts` z realistycznymi zapytaniami (select
  z filtrami i sortowaniem, maybeSingle, insert+select+single, update z eq,
  upsert z onConflict) — `pnpm typecheck` bez błędów, plik skasowany.
- `npx eslint lib/flo/ types/flo.ts` — czysto.
- `pnpm typecheck` — zero błędów w plikach agenta. W repo nadal 6 zastanych
  błędów w `.next/types/*` (nieaktualne artefakty builda z 17.08).

Uwagi dla Masła:
- `types/flo.ts` dostał dwie nowe stałe (`FLO_PROPOSAL_KINDS`,
  `FLO_CARD_VARIANTS`) i strażnik. Nic, co już importujesz, się nie zmieniło.

Następny krok: 5 (test kontraktowy)

## 2026-08-24 · Krok 5 — test kontraktowy

Zrobione:
- `lib/flo/kind-variant.ts` — mapa 33 rodzajów propozycji → 6 wariantów karty.
  `Record<FloProposalKind, FloCardVariant>` wymusza kompletność już na
  etapie kompilacji: dopisanie rodzaju bez wpisu w mapie zatrzymuje build.
- `tests/unit/flo-contract.test.ts` — 16 testów w czterech grupach.

Co sprawdza:
1. każda atrapa zgadza się ze schematem Zod odpowiadającym FloProposalView
2. wszystkie 6 wariantów i wszystkie 4 rodzaje podglądu mają reprezentanta
3. każdy rodzaj propozycji ma przypisany wariant; mapa nie zawiera rodzajów
   spoza listy
4. wariant `preview` zawsze ma podgląd i wymusza jego otwarcie
5. pozycje listy wymagające podglądu są domyślnie odznaczone
6. przypadki brzegowe są obecne (długi tytuł/treść, brak dowodów, szybkie
   wygasanie, paczka 10 pozycji z 3 odstającymi, długa nazwa bez spacji,
   pasek cofnięcia)
7. w atrapach nie ma śladu po „poziomie/trybie autonomii”

Weryfikacja, że test nie jest pusty: tymczasowo ustawiłem
`requiresPreview: false` na propozycji ponaglenia — test padł z czytelnym
komunikatem („atrapa fx-preview-chase nie wymusza podglądu”). Atrapy
przywrócone, 16/16 zielone.

Uwagi dla Masła: `FLO_KIND_VARIANT` mówi, którą kartą rysuje się każdy rodzaj
propozycji. Nie musisz jej używać (serwer i tak przysyła `variant`), ale
przyda się przy budowaniu podglądów w Storybooku/atrapach.

Następny krok: 6

## 2026-08-24 · Krok 6 — koniec automatycznych ponagleń (SPŁATA DŁUGU)

Zrobione:
- `lib/inngest/jobs/reminder-scheduler.ts` — przepisany. Cron nie emituje już
  zdarzenia wysyłki i nie zapisuje wierszy do `payment_reminders`. Tworzy
  propozycję `payment.chase` w `flo_proposals` z kluczem tematu
  `payment.chase:<invoiceId>:<stage>` (deduplikacja przez unikalny indeks
  częściowy z 00061), terminem ważności 48 h i odciskiem danych.
- `lib/inngest/client.ts` — `remindersSendRequested` ma teraz obowiązkowe
  pole `approvalId`.
- `lib/inngest/jobs/send-reminder.ts` — na wejściu odmawia działania bez
  `approvalId` (NonRetriableError, bo brak zgody nie naprawi się przy
  kolejnej próbie).
- `app/actions/reminders.ts` — ręczna wysyłka przekazuje `approvalId`
  (tymczasowo `crypto.randomUUID()`; krok 8 zastąpi go wierszem w
  `flo_approvals` z migawką tego, co klient widział).
- `supabase/migrations/00062_reminders_opt_in.sql` — dokumentacja nowego
  znaczenia flag w bazie (COMMENT ON COLUMN/TABLE).
- `tests/unit/flo-no-auto-send.test.ts` — 6 testów strażniczych.

ODSTĘPSTWO OD PLANU — DO DECYZJI BARTOSZA:
Plan mówił „UPDATE istniejących wierszy reminder_settings na false”. NIE
zrobiłem tego. Powód: po tej zmianie `enabled` nie znaczy już „wysyłaj
automatycznie”, tylko „proponuj ponaglenia do zatwierdzenia”. Klient, który
miał TRUE, zgodził się na coś mocniejszego niż to, co dostaje teraz —
zerowanie flagi odebrałoby mu funkcję bez powodu. Klient z FALSE nadal nie
dostaje propozycji. Jeśli mimo to chcesz twardy reset, to jedna linijka:
`UPDATE public.reminder_settings SET enabled = false;`

Stan po zmianie: jedyne miejsce emitujące wysyłkę ponaglenia to akcja
serwerowa uruchamiana kliknięciem człowieka. Cron jest z tej ścieżki
odcięty — sprawdzone przez `grep` po całym `lib/` i `app/`.

Weryfikacja:
- `npx vitest run tests/unit/` — 11 plików, 120 testów, wszystko zielone
- `pnpm typecheck` — zero nowych błędów (6 zastanych w `.next/types`)
- eslint na wszystkich dotkniętych plikach — czysto

DO ZROBIENIA PRZEZ CZŁOWIEKA: wgrać migracje 00061 i 00062. Do tego czasu
cron będzie próbował pisać do nieistniejącej tabeli `flo_proposals` — błąd
wyląduje w `errors` i nie wywali joba, ale propozycje nie powstaną.

Uwagi dla Masła: ekran `/settings/reminders` opisuje jeszcze automat.
Przy okazji swoich treści (Twój krok 26) przepisz go tak, żeby mówił
„FLO zaproponuje, Ty wysyłasz”. Nie ma i nie będzie opcji automatycznej.

Następny krok: 7 (lib/flo/proposals.ts — cykl życia propozycji)

## 2026-08-24 · Krok 7 — cykl życia propozycji

Zrobione:
- `lib/flo/proposals.ts` — `createProposal`, `expireStale`, `listOpen`,
  `isMuted` + czysta funkcja `toProposalView` (wiersz bazy → karta).
- `tests/unit/flo-proposals.test.ts` — 11 testów funkcji czystej.

Decyzje:
- `createProposal` przy istniejącej ŻYWEJ propozycji tego tematu aktualizuje
  ją w miejscu. WYJĄTEK: propozycji o statusie `approved` nie podmieniamy —
  zgoda dotyczyła konkretnej treści, więc podmiana pod ręką byłaby zgodą na
  jedno, a wykonaniem czegoś innego.
- Wyciszenie sprawdzane PRZED zapisem, nie przy wyświetlaniu — inaczej baza
  puchłaby od kart, których nikt nie zobaczy.
- Wyścig na INSERT (23505) traktowany jako sukces deduplikacji, nie awaria.
- `expireStale` nie kasuje wierszy: wygasła propozycja to materiał do pomiaru
  trafności w trybie cichym, nie śmieć.
- `toProposalView` zwraca `null` dla nieznanego rodzaju. Baza pamięta rzeczy
  ze starszych wersji kodu; cisza jest dopuszczalna, bełkot na ekranie nie.
- Najważniejszy bezpiecznik w tym pliku: pozycja listy z `needsPreview: true`
  dostaje `preselected: false` NIEZALEŻNIE od tego, co mówi ładunek. To jest
  jedyna rzecz stojąca między nami a hurtową wysyłką faktury na złą kwotę.

Uwagi dla Masła: `toProposalView` domyślne etykiety przycisków bierze
z wariantu, a niestandardowe z ładunku (`primaryLabel`). Twoje treści z kroku
25–31 wejdą w to bez zmian po stronie interfejsu.

Następny krok: 8

## 2026-08-24 · Krok 8 — żeton zgody

Zrobione:
- `lib/flo/approval.ts` — `requireApprovalId`, `evaluateApproval` (czysta),
  `createApproval`, `consumeApproval`, `FloApprovalError` z powodem odmowy.
- `lib/flo/db-types.ts` — dodane `gt` do filtrów zapisu (potrzebne do
  atomowego zużycia żetonu).
- `lib/inngest/jobs/send-reminder.ts` — ręcznie wpisany strażnik z kroku 6
  zastąpiony wywołaniem `requireApprovalId`. Reguła ma jedno miejsce.
- `tests/unit/flo-approval.test.ts` — 10 testów.

Jak działa:
- Cztery warstwy sprawdzenia: żeton istnieje, dotyczy TEJ propozycji, nie
  jest zużyty, nie wygasł (30 minut).
- Zużycie jest ATOMOWE — wszystkie warunki w jednym UPDATE z `RETURNING`.
  Gdyby sprawdzać je osobno przed zapisem, między sprawdzeniem a zapisem
  mieściłby się wyścig, w którym dwa równoległe kliknięcia przepuszczają
  dwie wysyłki tej samej faktury do rejestru państwowego.
- Gdy UPDATE nic nie zmienił, dociekamy dlaczego i zwracamy konkretny powód.
  „Coś poszło nie tak” jest bezużyteczne i dla klienta, i dla nas.
- Podwójne kliknięcie nie tworzy dwóch żetonów (unikalny indeks częściowy
  z 00061); druga próba dostaje ten sam identyfikator.
- Kolejność sprawdzeń jest celowa: „to zgoda na inną sprawę” przed „zgoda
  wygasła”, bo pierwsze jest dla człowieka bardziej zrozumiałe.

Weryfikacja:
- `npx vitest run tests/unit/` — 13 plików, 141 testów, wszystko zielone
- `pnpm typecheck` — zero nowych błędów
- eslint na wszystkich plikach agenta — czysto

MIGRACJE NIEWGRANE — BLOKADA:
`pnpm db:push:prod:dry` kończy się „Brak SUPABASE_DB_URL”. Zmiennej nie ma
ani w `.env.local` (jest tam 49 innych), ani w środowisku; `psql` też nie
jest zainstalowany. Nie szukałem tego poświadczenia gdzie indziej.
Do wykonania przez człowieka — zob. raport.

Następny krok: 9 (test architektoniczny — żadna ścieżka z crona nie dosięga
funkcji wychodzących)

## 2026-08-24 · Krok 9 — test architektoniczny

Zrobione:
- `tests/unit/flo-architecture.test.ts` — 8 testów pilnujących własności W1
  („nic nie wychodzi na zewnątrz bez kliknięcia człowieka”).

WAŻNE ODKRYCIE przy budowie: test oparty na samym grafie IMPORTÓW byłby
zawsze zielony i nic niewart. Zadania w tym projekcie rozmawiają przez
KOLEJKĘ, nie przez importy — cron `process-offline-queue` nie importuje
wysyłki do KSeF, tylko emituje zdarzenie, które odbiera osobne zadanie.
Test buduje więc graf z dwóch rodzajów krawędzi: import + „kto emituje
zdarzenie → kto je obsługuje”.

Druga pułapka, w którą sam wpadłem: zdarzenia w `client.ts` deklarowane są
DWOMA sposobami (`eventType(` i `zodEvent(`). Pierwsza wersja sondy widziała
tylko 16 z 25 zdarzeń i gubiła połowę krawędzi. Dlatego w teście są osobne
asercje „sanity”: liczba źródeł, liczba zdarzeń, liczba krawędzi kolejkowych,
obecność plików wysyłkowych. Bez nich test potrafi po cichu zzielenieć na
zawsze po dowolnej zmianie nazw.

ZNALEZIONE DWIE ŚCIEŻKI z crona do wysyłki na zewnątrz (lista `KNOWN_UNGATED`):
1. `process-offline-queue` → `submit-invoice` → KSeF. Uzasadniona: faktury
   zatwierdzono przed awarią MF, dosyłka nie jest nową decyzją. Brakuje
   jednak śladu tamtej zgody. ZAMYKA: krok 11.
2. `co-pilot-monthly` → paczka do księgowej mailem, gdy tenant ustawił dzień
   miesiąca. To jest zgoda przez ustawienie — dokładnie ten model, który
   odrzuciliśmy przy ponagleniach. ZAMYKA: krok 41 (B-01).
Nowa ścieżka spoza tej listy wywala test i blokuje scalenie.

Weryfikacja, że test nie jest pusty: dodałem tymczasowy plik z cronem
importującym `submitInvoiceFullFlow` — test padł, wskazując dokładną ścieżkę
`__violation.ts → submit-invoice-full.ts [wysyłka faktury do KSeF]`.
Plik usunięty, 8/8 zielone.

Następny krok: 10

## 2026-08-24 · Krok 10 — re-walidacja przy wykonaniu

Zrobione:
- `lib/flo/fingerprint.ts` — `fingerprintOf`, `diffFacts`, `describeChange`,
  `relativeDay`, `readState`, `computeFingerprint`, `assertFresh`,
  `FloStaleError`.
- `tests/unit/flo-fingerprint.test.ts` — 16 testów.
- `lib/inngest/jobs/reminder-scheduler.ts` — przepisany na `createProposal`
  z kroku 7 i `computeFingerprint` z tego kroku. Zniknęły tymczasowe
  helpery (`fingerprintFor`, `buyerName`, `toNumber`); został `formatPln`
  do przeniesienia w kroku 14.

Kluczowa decyzja — PODZIAŁ NA FAKTY I KONTEKST:
do skrótu wchodzą wyłącznie rzeczy, których zmiana ma unieważnić propozycję
(kwoty, statusy, terminy). Nazwa kontrahenta i numer faktury to kontekst:
służą do napisania komunikatu, ale ich zmiana nie blokuje wysyłki, bo nie
zmienia sensu decyzji. Bez tego podziału zmiana nazwy firmy w GUS
unieważniałaby gotowe ponaglenia.

Druga: odcisk liczy się TĄ SAMĄ drogą przy tworzeniu i przy sprawdzaniu
(`computeFingerprint` czyta stan z bazy w obu przypadkach). Gdyby cron budował
fakty po swojemu, każda propozycja wyglądałaby na nieaktualną w chwili
otwarcia i agent milczałby zawsze.

BŁĄD ZŁAPANY PRZEZ WŁASNY TEST: `relativeDay` liczyło granicę doby w strefie
serwera. Kontenery chodzą w UTC, klient żyje w Warszawie — wpłata o 00:30
czasu polskiego to dla serwera 22:30 dnia poprzedniego, więc agent
powiedziałby „wczoraj” o czymś, co dla klienta wydarzyło się dziś w nocy.
To jest awaria systemowa nr 8 z analizy odporności. Naprawione: granica doby
wyznaczana jawnie przez `Intl.DateTimeFormat` w strefie Europe/Warsaw.
Test uruchomiony w trzech strefach (lokalna, UTC, America/New_York) —
16/16 zielone w każdej.

Weryfikacja:
- `npx vitest run tests/unit/` — 15 plików, 165 testów, wszystko zielone
- `pnpm typecheck` — zero nowych błędów
- eslint — czysto

Następny krok: 11 (lib/flo/execute.ts — wykonawca propozycji; zamyka też
pozycję nr 1 z KNOWN_UNGATED)

## 2026-08-25 · Poprawka po zgłoszeniu Masła + weryfikacja produkcji

Zgłoszenie z DZIENNIK-MASLO.md: `tests/unit/flo-architecture.test.ts` padał
na Windows (4 z 8). Miał rację — `relative()` zwraca tam ścieżki z odwrotnymi
ukośnikami, a klucze `OUTGOING_SINKS` i `KNOWN_UNGATED` są zapisane zwykłymi.
Dodany helper `toPosix()` przy obu wywołaniach `relative()`. 8/8 zielone.
Dobrze, że nie ruszał mojego pliku — mapa własności zadziałała.

WNIOSEK NA PRZYSZŁOŚĆ: Masło pracuje na Windows, ja na macOS, a produkcja
stoi na Linuksie. Każdy kod dotykający ścieżek plików musi być pisany
przenośnie, bo inaczej „u mnie działa” będzie normą, a nie wyjątkiem.

Weryfikacja produkcji (db-1, przez procedurę z AGENTS.md):
- sześć tabel `flo_*` istnieje
- 00061 i 00062 zarejestrowane w `supabase_migrations.schema_migrations`
- 17 indeksów, 4 polityki RLS, komentarze kolumn z 00062 na miejscu
- wykonane `NOTIFY pgrst, 'reload schema'` (krok, bez którego aplikacja
  zwraca PGRST205 — pułapka opisana w AGENTS.md)

Stan repozytorium: moje 4 commity z wczoraj są na origin/main, doszedł
commit Masła (helpery interfejsu). Zestaw po scaleniu: 16 plików, 179 testów.

Następny krok: 11 (lib/flo/execute.ts)

## 2026-08-26 · Krok 11 — wykonawca propozycji

Zrobione:
- `lib/flo/handlers/index.ts` — rejestr wykonawców (rodzaj → handler).
- `lib/flo/execute.ts` — `executeProposal`.
- `tests/unit/flo-fake-db.ts` — atrapa klienta bazy w pamięci.
- `tests/unit/flo-execute.test.ts` — 11 testów.
- `lib/audit/log.ts` — dwie nowe akcje: `flo.proposal.executed` / `.failed`.

KOLEJNOŚĆ KROKÓW W WYKONAWCY (nienegocjowalna, każda zamiana otwiera inną
klasę awarii):
świeżość → atomowe przejęcie → zużycie żetonu → handler → dziennik.
Świeżość PRZED przejęciem, bo nieaktualnej propozycji nie ma sensu nawet
blokować pod siebie. Przejęcie PRZED żetonem, bo inaczej dwa równoległe
kliknięcia spaliłyby żeton, zanim ustaliłoby się, kto wykonuje.

Klucz idempotencji to samo przejście statusu:
`UPDATE ... SET status='executing' WHERE id=? AND status IN ('open','approved')`.
Pięćdziesiąt kliknięć wykona ten UPDATE, warunek spełni jedno. Bez osobnej
tabeli blokad i bez zewnętrznego zamka.

Decyzje, które warto pamiętać:
- Przegrani wyścigu dostają `{ok:true}`, nie błąd. Ich kliknięcie doprowadziło
  do działania — straszenie ich komunikatem byłoby kłamstwem.
- Po nieudanym wykonaniu NIE odtwarzamy zużytego żetonu. Gdyby funkcja
  wychodząca zdążyła zadziałać, druga próba wysłałaby to samo dwa razy.
  Człowiek zatwierdza od nowa, czyli świadomie.
- Klient nigdy nie widzi treści błędu technicznego (test pilnuje, że w
  komunikacie nie ma `ECONNREFUSED` ani adresów IP).

Weryfikacja, że test współbieżności nie jest deklaratywny: usunąłem warunek
`.in('status', CLAIMABLE)` z przejęcia — test padł (handler wywołany więcej
niż raz). Warunek przywrócony.

KOREKTA WŁASNEGO ZAPISU: w kroku 9 napisałem w `KNOWN_UNGATED`, że pozycję
`process-offline-queue` zamyka krok 11. To była nieprawda. Żeton mógłby tam
trafić dopiero wtedy, gdy wysyłka faktur zacznie przechodzić przez
propozycje — czyli przy P-02, w kroku 32. Komentarz poprawiony.

Następny krok: 12

## 2026-08-26 · Krok 12 — pamięć decyzji i wyciszanie

Zrobione:
- `lib/flo/decisions.ts` — `nextDecisionState` (czysta reguła), `recordDecision`,
  `muteKind`, `unmuteKind`, `isMuted`, `listMutedKinds`.
- `tests/unit/flo-decisions.test.ts` — 12 testów.
- `lib/flo/proposals.ts` — lokalne `isMuted` usunięte; jedno źródło prawdy.

Decyzje:
- `dismissed` to licznik odrzuceń Z RZĘDU, nie suma z całego życia konta.
  Przyjęcie zeruje serię i zdejmuje wyciszenie. Ktoś, kto raz odrzucił,
  potem skorzystał, a po pół roku odrzucił znowu, nie prosił o ciszę.
- „Nigdy więcej takich” ucisza NATYCHMIAST, osobną funkcją. To nie jest
  drugie odrzucenie z rzędu, tylko jasna prośba — czekanie z ciszą do
  następnego razu byłoby ignorowaniem tego, co człowiek powiedział.
- Cisza jest odwracalna z ekranu ustawień (`unmuteKind`, `listMutedKinds`
  dla toru interfejsu, krok 21 Masła).
- Wyciszenie jest per organizacja i per rodzaj — testy pilnują, że nie
  przecieka ani na inne konto, ani na inne sprawy.

Przy okazji: `assertFresh` tworzy teraz klienta bazy dopiero wtedy, gdy
propozycja naprawdę zależy od jakiegoś rekordu. Podsumowanie roku nie ma
jak się zdezaktualizować, więc nie ma powodu otwierać połączenia — a testy
nie potrzebują zmiennych środowiskowych.

Weryfikacja:
- `npx vitest run tests/unit/` — 18 plików, 201 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Następny krok: 13 (lib/flo/undo.ts + cron flo.tick)

## 2026-08-26 · Krok 13 — cofnięcie i puls agenta

Zrobione:
- `lib/flo/undo.ts` — `captureUndo`, `evaluateUndo` (czysta reguła),
  `undoAction`, okno 10 minut.
- `lib/flo/tick.ts` — `runFloTick`: wygaszanie przeterminowanych + podnoszenie
  propozycji porzuconych w stanie „wykonuję”.
- `lib/jobs/handlers/flo-tick.ts` + wpis w `queues.ts` (`cron.flo-tick`,
  07:30 Europe/Warsaw) + import w `worker.ts`.
- `tests/unit/flo-undo-tick.test.ts` — 12 testów.

Decyzje:
- Cofnięcie NIE nadpisuje pól, których człowiek dotknął w międzyczasie.
  Przed przywróceniem sprawdzamy, czy wartość nadal jest ta, którą ustawił
  agent; jeśli ktoś ją poprawił ręcznie, wycofujemy się z komunikatem
  „zostawiam Twoją wersję”. Bez tego cofnięcie kasowałoby cudzą pracę.
- Puls podnosi propozycje wiszące w „wykonuję” dłużej niż 15 minut (worker
  mógł zginąć w połowie). Wracają do stanu „zatwierdzona”, nie „otwarta” —
  człowiek już się zgodził, więc odbieranie mu tej zgody byłoby cofaniem
  jego decyzji. Żeton jest wtedy zużyty, więc realne wykonanie i tak wymaga
  ponownego kliknięcia. To domyka obietnicę z komentarza w `execute.ts`.
- ŚWIADOME ODSTĘPSTWO: nie tworzę bliźniaczej funkcji Inngest dla tego crona.
  Produkcja pracuje na pg-boss od 18 sierpnia, Inngest jest odpinany —
  dokładanie do niego nowych funkcji byłoby długiem w chwili powstania.
  Starsze zadania mają jeszcze bliźniaki z okresu przejściowego, nowe nie.
- Test inwentaryzacji cronów podniesiony z 22 na 23, z komentarzem dlaczego.
  Ta liczba ma być zmieniana świadomie — cron dokłada się cicho, a każdy
  kosztuje przebiegi na produkcji.

## 2026-08-26 · Krok 14 — szablony i kwoty

Zrobione:
- `lib/flo/money.ts` — `formatPln`, `formatPlnPlain`, `formatDays`.
- `lib/flo/copy.ts` — 15 szablonów, `renderCopy`, `renderTemplate`,
  `placeholdersOf`, `FloCopyError`.
- `tests/unit/flo-copy.test.ts` — 13 testów, w tym właściwościowy na 500 losowań.

NAJWAŻNIEJSZA ASERCJA: żaden szablon nie zawiera ani jednej cyfry. Cyfra
wpisana na sztywno („14 dni”, „23% VAT”) sprawia, że agent zaczyna kłamać
klientom, u których liczba jest inna — i nikt tego nie zauważy, bo tekst
wygląda poprawnie. Do tego test właściwościowy: dla 500 losowych zestawów
wartości każda liczba w wyrenderowanym tekście musi pochodzić z danych.

Decyzje o kwotach:
- Twarda spacja (U+00A0) jako separator tysięcy i przed „zł”: „22 140,00 zł”
  nie ma prawa złamać się na końcu linii w mailu ani w PDF.
- `formatPlnPlain` dla plików czytanych przez maszynę — twarda spacja
  w arkuszu potrafi zamienić liczbę w tekst i zepsuć import u księgowej.
- `useGrouping: 'always'` — domyślny `Intl` dla polskiego pomija separator
  przy czterech cyfrach („4300,00”), przez co dwie kwoty obok siebie wyglądają
  jak z dwóch różnych programów. Złapane przez test.

DO POPRAWY KIEDYŚ (nie w tym kroku): `formatPln` w `lib/reminders/templates.ts`
używa gołego `Intl`, więc w istniejących mailach kwoty czterocyfrowe są bez
separatora. Rozjazd kosmetyczny, ale realny — do ujednolicenia przy pracy
nad treściami ponagleń.

Weryfikacja:
- `npx vitest run tests/unit/` — 20 plików, 227 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

## PUNKT INTEGRACJI Z MASŁEM — blok 1 domknięty

Od tego momentu pierwsza prawdziwa propozycja przechodzi CAŁĄ drogę:
cron `flo.tick` → `createProposal` → wątek → kliknięcie → żeton zgody →
re-walidacja → wykonawca → dziennik audytowy → status `done`.

Czego Masło jeszcze nie ma: `app/actions/flo.ts`. Jego kroki 3-18 działają
na atrapach bez zmian, blokada zaczyna się przy jego kroku 19. To jest
następna rzecz do zrobienia po bloku 2.

Następny krok: 15 (lib/flo/llm.ts — warstwa modelu)

## 2026-08-26 · Krok 15 — warstwa modelu

Zrobione:
- `lib/flo/llm.ts` — `generateCopy`, `validateModelCopy` (czysta), `modelFor`.
- `tests/unit/flo-llm-budget.test.ts` — część testów (razem z krokiem 16: 22).

Jak to działa:
- Model dostaje NAZWY pól i wzór do ulepszenia, a nie wartości. Ma zwrócić
  zdanie z placeholderami; liczby podstawia kod z kroku 14. Halucynacja kwoty
  jest przez to strukturalnie niemożliwa, a nie „mało prawdopodobna”.
- Trzy sita na wyjściu: schemat (JSON z title/body), ZAKAZ JAKIEJKOLWIEK
  CYFRY, biała lista placeholderów. Po odrzuceniu jedna ponowna próba
  z informacją, co było źle. Po drugim — szablon.
- `claude-haiku-4-5` domyślnie, `claude-sonnet-5` tylko tam, gdzie danych
  jest dużo, a wywołanie jedno (domknięcie miesiąca, podsumowanie roku).
  Kryterium to nie „ważność”, tylko objętość kontekstu.
- Zużycie zapisywane TAKŻE dla odrzuconych odpowiedzi — inaczej pętla
  ponowień byłaby niewidoczna w rachunku, czyli dokładnie tam, gdzie boli.

ŚWIADOME ODSTĘPSTWA (oba opisane w kodzie):
1. KOLEJKA WSADOWA — nie teraz. Plan przewiduje ją dla nocnych wywołań
   z `flo.tick`, ale puls dziś nie generuje ŻADNYCH treści (reguły funkcji
   dochodzą od bloku 3). Zbudowałbym potok bez nadawcy. Wraca przy pierwszej
   funkcji produkującej propozycje nocą, razem z odbiorem wyników przed 07:30.
2. PAMIĘĆ PODRĘCZNA PROMPTU — znacznik jest, oszczędności jeszcze nie ma.
   Część stała ma dziś kilkaset tokenów, a próg opłacalności liczy się
   w tysiącach. Urośnie, gdy dojdzie przewodnik po głosie agenta od Masła.
   Zapisane w komentarzu, żeby nikt nie uznał tego za działającą optymalizację.

## 2026-08-26 · Krok 16 — bezpiecznik kosztowy

Zrobione:
- `lib/flo/budget.ts` — cennik, `estimateCostUsd`, `evaluateBudget` (czysta),
  `assertBudget`, `recordUsage`, `readSpend`.

Liczby (założenia jawnie w kodzie):
- kurs 3,60 zł/USD jako stała — limity są z natury przybliżone, a odpytywanie
  NBP po to, żeby wiedzieć, czy wolno wywołać model za grosz, byłoby absurdem
- cel 0,95 zł/mies. na klienta (≈3% ceny netto), twardy limit 3 zł (≈9%)
- limit dobowy 0,60 zł — celowo NIE 1/30 miesięcznego: klient może mieć jeden
  ciężki dzień (import historii, domknięcie miesiąca) i nie ma powodu go za to
  karać. Ten limit istnieje przeciw pętli ponowień, nie przeciw klientowi.
- alarm dla operatora przy dwukrotności celu, czyli PRZED twardym limitem —
  wtedy jeszcze da się poprawić regułę, po fakcie zostaje tłumaczenie rachunku

NAJWAŻNIEJSZE ZACHOWANIE: po przekroczeniu limitu agent NIE MILKNIE.
Przechodzi na szablony — klient traci elokwencję, nie funkcje. Propozycje
powstają dalej, liczby są te same, zdania sztywniejsze. Osobny test pilnuje,
że przy wyczerpanym budżecie nie leci ani jedno wywołanie modelu, a treść
nadal zawiera kwotę i numer faktury.

Weryfikacja:
- `npx vitest run tests/unit/` — 21 plików, 249 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

BLOK 2 DOMKNIĘTY. Zostaje krok 17 (minimalizacja danych w promptach) —
zadanie z bramki prawnej, świadomie zostawione jako osobny krok, bo dotyka
tego, co wychodzi poza naszą infrastrukturę.

Następny krok: 17 (lib/flo/redact.ts)

## 2026-08-26 · Krok 17 — minimalizacja danych

Zrobione:
- `lib/flo/redact.ts` — `redactText`, `redactForModel`, `containsSensitive`.
- `lib/flo/llm.ts` — podpowiedzi (`hints`) przechodzą przez minimalizację
  przed zbudowaniem prompta.
- testy w `tests/unit/flo-redact-expense.test.ts`.

Maskowane: numery kont (IBAN i bez prefiksu), PESEL, e-mail, telefon, kod
pocztowy, adres, oraz — jako siatka na resztę — każdy ciąg co najmniej
dziewięciu cyfr. NIP wpada w tę siatkę CELOWO: treść karty da się napisać
bez niego, a jawne dopuszczenie (`allowNip`) jest decyzją widoczną w miejscu
wywołania.

Dwie decyzje:
- Zamiana na znacznik (`[konto]`), nie usunięcie. Puste miejsce prowokuje
  model do uzupełnienia luki zmyśloną wartością; „wyślij na [konto]" jest
  zrozumiałe i bezpieczne.
- Kolejność wzorców ma znaczenie: gdyby ogólny wzorzec na długie liczby szedł
  pierwszy, IBAN zostałby zamaskowany jako „liczba" i stracilibyśmy
  informację, czym naprawdę był.

## 2026-08-26 · Krok 18 — W-01 paragon z telefonu

Zrobione:
- `lib/flo/functions/expense-review.ts` — `assessExpense` (czysta),
  `buildExpenseReviewProposal`, `buildOcrFailedProposal`, `readSellerHistory`,
  `findStuckOcrJobs`, handler `expense.review`.
- `lib/flo/functions/index.ts` — jedno miejsce zapełniające rejestr
  wykonawców; ładowane przez worker (skutek uboczny importu).
- `lib/flo/copy.ts` — warianty szablonów (`:done`, `:ask`, `:failed`).

TRZY AWARIE Z KATALOGU, KAŻDA Z TESTEM:
1. Zły odczyt — trzy niezależne sita: brak wymaganego pola, kontrola
   arytmetyczna (netto+VAT=brutto, tolerancja 2 gr) i kontrola rzędu
   wielkości wobec mediany u tego sprzedawcy. To ostatnie łapie klasyczny
   błąd „312,40 → 31 240", którego nie widzi ani arytmetyka, ani pewność.
2. Wydatek prywatny — kategorie z natury wątpliwe (spożywcze, odzież,
   elektronika) pytają ZAWSZE, nawet przy idealnym odczycie i znanym
   sprzedawcy. Nieznany sprzedawca pyta powyżej 500 zł; poniżej nie zawraca
   głowy, bo pytanie o każdy drobiazg byłoby udręką.
3. Zawieszony odczyt — `findStuckOcrJobs` po trzech minutach; karta mówi
   wprost, że zdjęcie ZOSTAŁO W ARCHIWUM i podaje dwie drogi wyjścia.
   Bez tego zdania klient wyrzuca paragon i po miesiącu nie ma czego odtwarzać.

Najważniejsza różnica w treści: przy wątpliwościach agent PYTA i nie twierdzi,
że zaksięgował. Wariant `:ask` nie zawiera słowa „Zaksięgowałem" i nie ma
zapisu cofnięcia — bo nie ma czego cofać. Osobny test tego pilnuje.

CO ZOSTAJE DO PODŁĄCZENIA (świadomie, nie przeoczenie):
- `process-ocr.ts` jeszcze nie tworzy propozycji — dopisanie tego to jedna
  funkcja, ale zmienia zachowanie produkcyjne OCR, więc chcę to zrobić razem
  z W-02 (krok 19), gdy będzie komplet reguł kosztowych.
- `findStuckOcrJobs` ma właściwą częstotliwość dopiero w strażniku zadań
  (co 15 min), nie w dobowym pulsie. Puls zostaje jako siatka bezpieczeństwa.
  Podwójne wywołanie jest nieszkodliwe — klucz tematu daje jedną kartę.

Weryfikacja:
- `npx vitest run tests/unit/` — 22 pliki, 270 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Następny krok: 19 (W-02 koszty z KSeF + podłączenie propozycji do OCR)

## 2026-08-26 · Krok 19 — W-02 koszty ze skrzynki KSeF

Zrobione:
- `lib/flo/functions/expense-inbox.ts` — `classifyInboxDocuments`,
  `buildInboxSummaryProposal`, `pairReceiptsWithInvoices`,
  `evaluateContinuity`, `cursorMatchesWindow`.
- `supabase/migrations/00063_flo_inbox_and_rules.sql` — tabela
  `ksef_inbox_cursor` (utrwalony kursor paginacji + liczniki).

TRZY AWARIE:
1. Cudza faktura — nieznany sprzedawca powyżej 500 zł oraz każdy dokument
   z niepełnymi danymi sprzedawcy trafia do „do decyzji", nigdy sam do księgi.
   Drobne kwoty od nieznanych przechodzą, bo pytanie o każdy byłoby udręką.
2. Ten sam zakup dwa razy — `pairReceiptsWithInvoices` łączy po znormalizowanej
   nazwie, kwocie (±1 gr) i dacie (±3 dni). Wynik idzie WYŁĄCZNIE do domknięcia
   miesiąca. Bez powiadomienia i bez słowa „duplikat": klient sfotografował
   paragon, a potem dostał fakturę — nie zrobił nic złego.
3. Urwane pobieranie — najgroźniejsza, bo cicha. `evaluateContinuity` daje
   `resume` (mamy token — dokończ), `incomplete` (token się skończył, a liczby
   się nie zgadzają — alarm) albo `complete`. Kursor jest związany z oknem dat:
   token z innego zapytania dałby wyniki z innego zakresu i cichą lukę.

Jedna karta na przebieg, nie jedna na dokument — pięć faktur w nocy to pięć
powiadomień o siódmej rano, czyli hałas, przez który ludzie wyłączają
powiadomienia i przestają widzieć również te ważne. Odmiana przez liczebnik
po stronie serwera, bo tam powstaje tekst.

## 2026-08-26 · Krok 20 — W-03 nauka reguł

Zrobione:
- `lib/flo/functions/expense-rules.ts` — `ruleApplies` (czysta),
  `computeBounds`, `ruleSourceMarker`, `buildRuleProposal`,
  `invalidatesRules`, `invalidateRulesForTenant`, handler `expense.rule`.
- Migracja 00063 dokłada `min_amount` / `max_amount` do `categorization_rules`.

TRZY AWARIE:
1. Reguła nauczona na wyjątku — reguła zapamiętuje sprzedawcę I WIDEŁKI
   KWOTOWE (dotychczasowe kwoty ×2,5 w górę, ÷2,5 w dół). Wydatek poza
   widełkami pyta MIMO istnienia reguły. Bez tego reguła z zakupu za 200 zł
   księgowałaby laptop za 8000 — cicho, przez wiele miesięcy.
   Reguły sprzed migracji (bez widełek) działają jak dotąd; nie zmieniam
   zachowania rzeczy, które już działają.
2. „Kto to zaksięgował" — `ruleSourceMarker` niesie nazwę reguły, datę
   powstania i odnośnik do wyłączenia. Bez daty i drogi wyjścia znacznik
   byłby ozdobą, nie wyjaśnieniem.
3. Zmiana profilu podatkowego — `invalidatesRules` przy zmianie formy albo
   statusu VAT. Reguły KASUJEMY, nie wyłączamy: reguła oparta na nieaktualnym
   założeniu jest gorsza od jej braku, bo wygląda na przemyślaną. Brak profilu
   po którejś stronie nie kasuje niczego — nie wolno kasować cudzej pracy
   na podstawie niewiedzy.

Propozycja mówi wprost, jakich kwot reguła dotyczy („od 39,60 zł do 247,50 zł
— przy większych i tak zapytam"). „Zawsze tak księguj" bez podania zakresu
byłoby zgodą w ciemno.

DŁUG DO SPŁACENIA W KROKU 21 (jawnie, żeby nie wyglądało na przeoczenie):
- `process-ocr.ts` i `inbox-polling.ts` nadal nie tworzą propozycji ani nie
  używają kursora. Funkcje są gotowe i przetestowane, ale wpięcie zmienia
  zachowanie produkcyjnych zadań, a te dwa dotykają realnych dokumentów
  klientów. Robię to jednym świadomym ruchem w kroku 21, razem z W-04,
  zamiast trzema wdrożeniami po kawałku.
- `ruleApplies` nie jest jeszcze wpięte w `lib/categorization/rule-engine.ts`
  — to samo uzasadnienie.

Weryfikacja:
- `npx vitest run tests/unit/` — 23 pliki, 299 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto
- migracja 00063: nawiasy zbilansowane, brak kolizji numeru

DO WGRANIA PRZEZ CZŁOWIEKA: migracja 00063 (procedura z AGENTS.md).

Następny krok: 21 (W-04 łowca zapomnianych kosztów + wpięcie W-01..W-03)

## 2026-08-26 · Migracja 00063 WGRANA NA PRODUKCJĘ

Wykonane przeze mnie procedurą z AGENTS.md (scp → docker exec psql →
schema_migrations → NOTIFY pgrst). Najpierw sprawdziłem plik pod kątem
DROP/TRUNCATE/DELETE — czysty, same CREATE IF NOT EXISTS, ADD COLUMN
IF NOT EXISTS, REVOKE i COMMENT.

Weryfikacja po wgraniu: tabela `ksef_inbox_cursor` istnieje, dwie nowe
kolumny w `categorization_rules`, wpis 00063 w `schema_migrations`,
schemat PostgREST przeładowany.

## 2026-08-26 · Krok 21 — W-04 + SPŁATA DŁUGU WPIĘCIA

Zrobione:
- `lib/flo/functions/expense-missing.ts` — `detectRecurringCycles`,
  `findMissingThisMonth`, `buildMissingDocsProposal`, `sellersToForget`.
- `lib/flo/functions/inbox-cursor.ts` — odczyt/zapis/kasowanie kursora.

WPIĘCIE (dług z kroków 18-20, spłacony jednym ruchem):
- `process-ocr.ts` tworzy teraz kartę agenta: przy udanym odczycie meldunek
  albo pytanie (reguły z W-01), przy nieudanym — kartę z drogą wyjścia
  i informacją, że zdjęcie zostało w archiwum.
- `lib/ksef/inbox.ts` dostał haczyk `onPage` + `resumeToken`. Utrwalenie
  kursora następuje PO zapisaniu strony, nie przed: token bez zapisanych
  danych wskazywałby na miejsce, do którego tak naprawdę nie doszliśmy.
- `inbox-polling.ts` czyta kursor (tylko dla tego samego okna dat), utrwala
  go po każdej stronie, sprawdza ciągłość i kasuje kursor po komplecie.
  Rozjazd liczb ląduje w logu błędu — to jedyny sygnał, jaki dostaniemy.
- `inbox-polling.ts` tworzy zbiorczą kartę „N nowych kosztów, M do decyzji".
- `rule-engine.ts` sprawdza widełki kwotowe: wydatek poza zakresem zwraca
  `null`, czyli spada do kolejnej warstwy i kończy się pytaniem do człowieka.
  Reguły bez widełek (sprzed 00063) działają jak dotąd.

W-04 — zasada językowa ważniejsza od kodu: mówimy WYŁĄCZNIE o dokumencie,
nigdy o kwocie do dopisania. Test przeszukuje źródło modułu i sprawdza, że
nie ma tam ani `from('expenses')`, ani `.insert(`, ani `createAdminClient` —
gdyby ktoś kiedyś dopisał wygodne „utwórz koszt z typowej kwoty", mielibyśmy
w produkcie funkcję zachęcającą do zaniżania podatku i to my bylibyśmy jej
autorem.

Dodatkowo: `payload.primaryIntent` w kontrakcie widoku. Karty, które nie mają
czego wykonać (W-04 prowadzi do wgrania dokumentu), deklarują `open` zamiast
`approve` — inaczej trzeba by pisać handler, który udaje, że coś zrobił.

## 2026-08-26 · Krok 22 — K-01 wiem, co jest zapłacone

Zrobione:
- `lib/flo/functions/payment-confirm.ts` — `selectOverdueForConfirmation`,
  `buildPaymentConfirmProposal`, `classifyConfirmation`, handler.

TRZY AWARIE:
1. Pomyłkowe „tak" — karta pokazuje NUMER, KWOTĘ I DATĘ każdej faktury,
   nigdy samej nazwy firmy. Przy dwóch fakturach tego samego kontrahenta
   sama nazwa to prosta droga do zamknięcia niewłaściwej należności.
   Do tego zapis cofnięcia w wyniku handlera.
2. Pytanie za wcześnie — dopiero dobę po terminie, zbiorczo, nigdy pushem.
   „Jeszcze czekam" odkłada o 7 dni.
3. Rzeczywistość nie jest binarna — trzecia odpowiedź z kwotą. Bez niej
   klient musiałby skłamać agentowi, żeby przestał pytać, i od tego momentu
   wszystkie dane byłyby fałszywe. Kwota większa od należności to pomyłka
   w pisaniu, nie nadpłata — odmawiamy zamiast zapisywać bzdurę.

Zapis idzie do `payments`, tej samej tabeli co import wyciągów, żeby
potwierdzenie ręczne i wpłata z banku znaczyły dokładnie to samo.

Weryfikacja:
- `npx vitest run tests/unit/` — 24 pliki, 322 testy, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

BLOK 3 (wydatki) DOMKNIĘTY I WPIĘTY. Agent tworzy realne propozycje
z dwóch źródeł: zdjęć z telefonu i skrzynki KSeF.

Następny krok: 23 (K-02 ponaglenia — wykonawca dla propozycji, które cron
tworzy od kroku 6)

## 2026-08-26 · Krok 23 — K-02 ponaglenia (domknięcie pętli z kroku 6)

Zrobione:
- `lib/flo/functions/payment-chase.ts` — część czysta: `evaluateChaseSafety`,
  `validateRecipient`, `buildChaseProposal`, stała `DISCLAIMER`.
- `lib/flo/functions/payment-chase-handler.ts` — wykonawca: okno
  bezpieczeństwa na żywych danych, wiersz w `payment_reminders`, emisja
  zdarzenia wysyłki Z ŻETONEM ZGODY.
- `lib/reminders/templates.ts` — zdanie ratunkowe dopisane do etapów 2, 3 i 4.
- `lib/inngest/jobs/reminder-scheduler.ts` — używa `buildChaseProposal`,
  jedno źródło prawdy dla treści i progów.

POTRÓJNA OBRONA, bo każda warstwa z osobna ma dziurę:
1. Re-walidacja przy kliknięciu (wykonawca) — nie widzi wpłaty jeszcze
   niezaksięgowanej.
2. Okno bezpieczeństwa 48 h na wpłaty od kontrahenta — nie widzi gotówki.
   Blokuje NAWET gdy wpłata nie została dopasowana do tej faktury:
   księgowanie bywa wolniejsze niż przelew.
3. Zdanie ratunkowe w treści maila — nie chroni przed wysłaniem, tylko
   łagodzi skutek.

ZNALEZIONE PRZY OKAZJI: etapy 2, 3 i 4 szablonów ponagleń NIE MIAŁY zdania
ratunkowego. Etap 1 miał. To jest odwrotność tego, co powinno być — im
ostrzejsza wiadomość, tym większa szkoda, jeśli adresat już zapłacił.
Dopisane, plus test pilnujący, że każdy etap je ma.

Wiersz w `payment_reminders` powstaje dopiero w wykonawcy, czyli po zgodzie.
Od kroku 6 cron go nie tworzy — kolejka wpisów „pending", których nikt nie
wyśle, to śmieci w bazie i fałszywy obraz w raportach.

TEST ARCHITEKTONICZNY ZŁAPAŁ MNIE NA GORĄCYM UCZYNKU: po wpięciu
`buildChaseProposal` do crona powstała statyczna ścieżka „cron → moduł, który
potrafi wysyłać". Rozdzieliłem moduł na czysty i wykonawczy zamiast dopisywać
wyjątek do listy długu. To jest dokładnie ta sytuacja, do której ten test
powstał — i pierwszy raz zadziałał na czymś, co sam napisałem.

## 2026-08-26 · Krok 24 — K-05 odsetki

Zrobione:
- `lib/flo/interest.ts` — tabela stóp z datami, naliczanie w podokresach,
  `shouldOfferInterest`, `formatInterestBreakdown`.
- Złoty zbiór: 20 przypadków, w tym przełom zmiany stopy, rok przestępny
  (2028: luty ma 29 dni), jeden dzień, dzień płatności, daty odwrócone,
  okres przez dwie zmiany stopy.

⚠️ NAJWAŻNIEJSZE: `RATES_VERIFIED = false`.
Wartości stóp to dane prawne, zmieniane decyzjami RPP i obwieszczeniami
ministra. NIE WOLNO ich brać z pamięci modelu. Algorytm jest przetestowany
i liczy poprawnie to, co mu się poda — ale dopóki flaga stoi na `false`,
`shouldOfferInterest()` zwraca `false` i agent nie proponuje odsetek nikomu.

DO ZROBIENIA PRZEZ CZŁOWIEKA: sprawdzić stawki w źródle urzędowym, uzupełnić
pole `source` przy każdej pozycji i dopiero wtedy przestawić flagę. Test
przypomina, że jedno bez drugiego nie ma sensu. To jest pytanie na rozmowę
z księgową albo prawnikiem (bramka prawna, część VI.2 planu).

Poza tym: naliczanie w podokresach, bo zaległość przez zmianę stopy liczona
jedną stawką daje kwotę, której klient nie obroni — a wezwanie z kwotą nie do
obronienia traci powagę i zabiera powagę wszystkiemu, co wyślemy później.
Domyślnie WYŁĄCZONE, poniżej 10 zł opcja się nie pojawia.

Weryfikacja:
- `npx vitest run tests/unit/` — 25 plików, 352 testy, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Następny krok: 25 (K-03 ocena kontrahenta — ŻÓŁTE, buduje się za flagą)
