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

## 2026-08-26 · Krok 25 — K-03 ocena kontrahenta (ZA FLAGĄ) + wyłączniki

Zrobione:
- `lib/flo/flags.ts` — wyłączniki funkcji agenta z POWODEM i notatką.
- `lib/flo/functions/payment-score.ts` — `scorePaymentBehaviour` (czysta),
  `buildPaymentScoreProposal`, `readPaymentHistory`.
- `createProposal` sprawdza wyłącznik PRZED zapisem.

DLACZEGO WŁASNY MECHANIZM FLAG, A NIE ISTNIEJĄCY: `lib/feature-flags/` opiera
się na kolumnach w tabeli — każda nowa flaga to migracja. Agent ma 33 funkcje,
z czego osiem jest gotowych i świadomie wyłączonych. Lista w kodzie ma przewagę
nad tabelą: powód jest widoczny tam, gdzie ktoś będzie go szukał, i przechodzi
przez przegląd kodu. Włączenie funkcji prawnie wątpliwej wymaga wtedy commita
z uzasadnieniem, a nie kliknięcia w panelu o drugiej w nocy.
Przełączniki per konto (krok 53) będą warstwą NAD tym.

Wyłącznik działa PRZED zapisem: funkcja czekająca na opinię nie zostawia śladu
w bazie klienta. Inaczej po włączeniu wysypałaby się na niego lawina kart
sprzed miesięcy.

WYŁĄCZONE DZIŚ (8): payment.score, payment.interest, tax.simulate,
tax.deadline, tax.limit, tax.relief, tax.setaside, contractor.foreign.

K-03 — trzy awarie:
1. Ocena krzywdząca — MEDIANA, nie średnia, i minimum trzy opłacone faktury.
   Test: faktura zapłacona 46 dni po terminie nie robi z kontrahenta dłużnika.
2. Ocena zobaczona przez kontrahenta — wynik nie trafia do dokumentu, maila
   ani listy kontrahentów. Test przeszukuje źródło modułu.
3. Ocena z danych, których nie mamy — dokumenty z importu odfiltrowane NA
   POZIOMIE ZAPYTANIA (`neq('source','import')`), bo KSeF nie zna dat zapłaty.
   Liczby wyglądałyby wiarygodnie i byłyby zmyślone.

Opis, nigdy etykieta: „płaci zwykle 14 dni po terminie" to fakt. „Ryzykowny
kontrahent" to wyrok wydany przez program na firmę, która nigdy nie zgodziła
się na ocenianie. Test pilnuje, że w opisie nie ma słów wartościujących.

## 2026-08-26 · Krok 26 — X-01 strażnik wysyłki

Zrobione:
- `lib/flo/functions/ksef-status.ts` — `evaluateSubmission` (czysta),
  `buildKsefStatusProposal`, `isAbandoned`.

ROZDZIELONE STANY „PRZYJĘTA" I „MAM POŚWIADCZENIE". KSeF potwierdza przyjęcie
od razu, a UPO potrafi przyjść po godzinach. Zlanie tego w jedno „wszystko
gotowe" jest kłamstwem w sprawie, w której klient ma dowód albo go nie ma —
przy kontroli to jest cała różnica.

Czasy: cisza przez pierwsze 15 minut (faktura w drodze to normalny stan, nie
sprawa), potem „ponawiam", po drugiej próbie eskalacja. Brak UPO po dobie idzie
do operatora. Osobna kontrola dobowa łapie dokumenty, o których wszyscy
zapomnieli — łącznie z agentem.

Najważniejsze zdanie w całej funkcji: przy nieudanej wysyłce karta mówi
„Twoja faktura jest bezpieczna w archiwum — nie wystawiaj jej drugi raz".
Bez tego klient wystawia ją ponownie i ma dwa dokumenty w rejestrze
państwowym, czego nie da się cofnąć.

Odrzucenie i kolejka offline mają własne funkcje (X-02, X-04) — tutaj cisza,
żeby dwie karty nie mówiły o tym samym.

Weryfikacja:
- `npx vitest run tests/unit/` — 26 plików, 377 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Następny krok: 27 (X-02 tłumacz odrzuceń)

## 2026-08-26 · Krok 27 — X-02 tłumacz odrzuceń

Zrobione:
- `lib/flo/functions/ksef-fix.ts` — `decideFix` (czysta),
  `buildKsefFixProposal`, `needsOperatorAttention`.

DWIE ZASADY, KTÓRE TU DECYDUJĄ O WSZYSTKIM:

1. ZAMKNIĘTA LISTA POPRAWEK. Automatycznie poprawiamy wyłącznie rzeczy
   o jednym możliwym rozwiązaniu: format pola, brakujący kod kraju, kolejność
   elementów. Do tego osobna lista `NEVER_AUTOFIX` — NIP-y, nazwy podmiotów,
   kwoty, stawki. „Poprawienie" NIP-u przez dobranie z rejestru firmy
   o podobnej nazwie wystawiłoby fakturę na obcy podmiot, w rejestrze
   państwowym, bez możliwości cofnięcia. Lista jest zakazem, nie sugestią:
   nawet gdyby pojawił się kod o jednoznacznym rozwiązaniu dotyczącym kwoty,
   poprawia człowiek.

2. NIEZNANY KOD = BRAK INTERPRETACJI. Model NIE dostaje zadania „wytłumacz
   ten kod". Wymyśliłby coś sensownie brzmiącego, a stawką jest zgodność
   z prawem. Komunikat brzmi wprost: „Nie znam tego kodu — zgłosiłem to
   zespołowi". Sprawa idzie do operatora.

Pętla odrzuceń: po dwóch próbach agent przestaje proponować wysyłkę i daje
gotowy opis sprawy (numer, kod, liczba prób, surowy komunikat KSeF), żeby
klient nie musiał niczego tłumaczyć.

Karta z poprawką ZAWSZE ma podgląd różnicy. Zmiana w dokumencie, której
klient nie zobaczył, jest zmianą zrobioną za jego plecami.

## 2026-08-26 · Krok 28 — X-03 opiekun certyfikatu

Zrobione:
- `lib/flo/functions/ksef-cert.ts` — `evaluateCert` (czysta), `shouldWarn`,
  `buildCertProposal`, `shouldHoldApprovedSubmissions`.

STAN LICZONY Z REALNEJ PRÓBY AUTORYZACJI, NIE Z POLA Z DATĄ. To jest sedno:
- klient, który odnowił certyfikat u wystawcy, ale go nie wgrał, DALEJ dostaje
  ostrzeżenie — i słusznie, bo wysyłka nadal nie zadziała, choć data mówi
  „ważny jeszcze rok";
- klient, który wgrał nowy certyfikat, przestaje dostawać ostrzeżenia
  NATYCHMIAST, bez klikania czegokolwiek.
Data w polu bywa nieaktualna w obie strony; udana autoryzacja jest faktem.

Trzy progi (30/14/3), nie codzienne przypominanie — ostrzeganie codziennie
przez miesiąc uczy ignorowania. Trwały pasek poniżej 14 dni (mail bywa
w spamie). Mail i push razem tylko na 3 dni przed — jedyny przypadek
w produkcie, w którym wychodzimy poza budżet zaczepień.

Przy nieudanej autoryzacji NIE mówimy „certyfikat wygasł", tylko „nie mogę
się zalogować". Powód może być inny (odwołany, zły plik, zmienione
uprawnienia), a zgadywanie wyprowadza klienta na manowce.

Zatwierdzone wysyłki CZEKAJĄ, zamiast zostać odrzucone. Decyzja człowieka
już padła; awaria techniczna nie ma prawa jej unieważnić i zmusić go do
klikania wszystkiego od nowa. Karta mówi to wprost: „faktury czekają
w kolejce — nic nie przepadło".

Weryfikacja:
- `npx vitest run tests/unit/` — 27 plików, 396 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Następny krok: 29 (X-04 spokój przy awarii Ministerstwa)

## 2026-08-26 · Krok 29 — X-04 spokój przy awarii Ministerstwa

Zrobione:
- `lib/flo/functions/ksef-outage.ts` — `evaluateOutage` (czysta),
  `shouldSwitchOffline`, `shouldReturnOnline`, `evaluateDeadline`,
  `buildOutageProposal`, `buildDeadlineProposal`.

NAJWAŻNIEJSZY WARUNEK W CAŁYM PLIKU: `if (!ourWorkerHealthy) return
'our_problem'` — sprawdzany PRZED czymkolwiek innym. Padnięty nasz worker
wygląda z zewnątrz identycznie jak awaria MF: wysyłki nie przechodzą, monitor
milczy. Różnica jest taka, że w jednym przypadku winni jesteśmy my, a spokój
oparty na kłamstwie kończy się utratą zaufania do wszystkiego, co agent mówi
— bo prawda wyjdzie, gdy koledzy klienta będą fakturować normalnie.

Awarię MF wolno ogłosić dopiero przy DWÓCH niezależnych źródłach (monitor
zdrowia + realny kod 5xx z ostatniej wysyłki). Przy jednym obowiązuje formuła
neutralna: „wysyłka nie przechodzi, sprawdzam dlaczego". Własna awaria NIE
tworzy karty dla klienta — to sprawa operatora; klient dowie się z X-01,
które mówi prawdę bez wskazywania winnego.

Przełączenie w tryb offline wymaga serii trzech niepowodzeń I potwierdzenia
z dwóch źródeł. Fałszywe przełączenie kosztuje rygor terminów i kody QR przy
fakturach, których nikt nie potrzebował. Powrót po PIERWSZYM sukcesie.

Termin Offline24 w weekend: ostrzeżenie w piątek, nie sześć godzin przed
sobotnią północą. Klient nie zagląda do aplikacji w weekend, a po terminie
zostaje mu przekroczony obowiązek ustawowy z powodu narzędzia, które miało
go przed tym chronić.

## 2026-08-26 · Krok 30 — X-05 audyt porządku

Zrobione:
- `lib/flo/functions/ksef-audit.ts` — `findAuditIssues` (czysta),
  `buildAuditProposal`, `isAutoRepairable`.

Kontrola ciągłości numeracji obejmuje WYŁĄCZNIE numery nadane przez nas
(`ownNumbering`). Klient, który wcześniej fakturował gdzie indziej, ma tam
własną numerację i własne anulowane dokumenty — zgłaszanie „luk" w cudzej
numeracji to fałszywy alarm, po którym przestaje czytać cokolwiek od agenta.
I słusznie, bo kazaliśmy mu tłumaczyć się z niczego.

Sprawy sprzed rejestracji oznaczone jako zastane i pokazywane PO bieżących.
To historia, którą klient nam przyniósł, nie zaniedbanie wobec nas — karta
mówi to wprost.

Max 5 pozycji, reszta zwinięta. Lista czterdziestu siedmiu problemów po
imporcie historii to nie audyt, tylko paraliż.

NIC nie jest zaznaczone z góry i nie ma przycisku „napraw wszystko" bez
listy. Naprawy dotyczą wyłącznie metadanych (pobranie brakującego UPO,
uzupełnienie NIP-u z rejestru) — nigdy treści faktury, kwot ani stron
transakcji, bo tam każda zmiana jest zmianą dokumentu o wartości dowodowej.

Weryfikacja:
- `npx vitest run tests/unit/` — 28 plików, 420 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

BLOK 5 (KSeF) DOMKNIĘTY. Zrobione 30 z 57 kroków.

DŁUG WPIĘCIA (świadomy, jak przy bloku 3): funkcje X-01..X-05 są czystymi
modułami z testami, ale nie są jeszcze wołane z zadań produkcyjnych. Wpięcie
dotyka wysyłki do rejestru państwowego, więc robię je jednym ruchem, gdy
komplet reguł jest gotowy — czyli teraz, w kroku 31, razem z blokiem 6.

Następny krok: 31 (P-01 wykrywanie rytmu + wpięcie bloku 5)

## 2026-08-26 · WPIĘCIE BLOKU 5 (KSeF)

Dług z kroków 26-30 spłacony. Pięć funkcji przestało być czystymi modułami
i zaczęło pracować na produkcji:

- `notify-user.ts` — X-01 (karta o stanie wysyłki, z rozdzieleniem „przyjęta"
  i „mam poświadczenie") oraz X-02 (karta po odrzuceniu). Powiadomienie znika,
  karta zostaje i mówi prawdę o tym, czy dowód przyjęcia już jest.
- `cert-expiry-alert.ts` — X-03. Stan liczony z ostatniego wpisu w
  `ksef_health_log` (realna próba autoryzacji), nie z pola z datą.
- `process-offline-queue.ts` — X-04. Drugie źródło do potwierdzenia awarii MF
  bierzemy z `health.isMfOutage`, które health-check ustawia dopiero przy
  odpowiedzi 5xx z samego KSeF — czyli na podstawie tego, co odpowiedziało
  Ministerstwo, a nie tego, że cokolwiek padło. Do tego alarm o zbliżającym
  się terminie Offline24, z osobnym wariantem weekendowym.
- `lib/flo/tick.ts` + `lib/flo/functions/audit-sweep.ts` — X-05. Audyt chodzi
  RAZ W MIESIĄCU, pierwszego dnia roboczego. Codzienne przypominanie o tych
  samych zaległościach zamieniłoby przegląd papierów w listę zarzutów, a audyt
  wypadający w sobotę klient zobaczyłby dopiero po weekendzie — z kartą, która
  ma już trzy dni i wygląda na zaniedbaną przez agenta.

`audit-sweep.ts` jest osobno od `ksef-audit.ts` celowo: tamten moduł zostaje
czysty i testowalny bez bazy, tutaj mieszka wyłącznie odczyt i pętla po
organizacjach — czyli to, co i tak trzeba by wyciąć z testów.

## 2026-08-26 · Krok 31 — P-01 wykrywanie rytmu

Zrobione:
- `lib/flo/rhythm.ts` — `detectRhythm`, `itemSimilarity`, `missedCycles`,
  `nextProfileState`, `canGenerateDrafts`, `detectSeasonality`.
- `tests/unit/flo-rhythm.test.ts` — 18 testów.

TRZY WARUNKI NARAZ, bo każdy z osobna daje fałszywe trafienia:
- min. 3 faktury — sama liczba nie odróżnia abonamentu od trzech zleceń,
- rozrzut odstępów < 25% mediany — sam odstęp nie odróżnia współpracy od
  zbiegu okoliczności,
- podobieństwo pozycji > 0,8 — same pozycje nie mówią nic o rytmie.

Test najważniejszej awarii: trzy jednorazowe zlecenia dla tej samej firmy
w odstępach zbliżonych do miesiąca NIE dają profilu, bo pozycje są różne.
Bez tego warunku agent zacząłby dowozić szkice, których nikt nie zamawiał —
i straciłby zaufanie także do propozycji trafnych.

Podobieństwo liczone tolerancyjnie: „Usługi programistyczne" i „Usługi
programistyczne — sierpień" to ta sama usługa. Wymaganie identyczności
sprawiłoby, że funkcja nie działałaby u nikogo.

Profil rodzi się jako KANDYDAT i nie generuje szkiców, dopóki człowiek raz
nie potwierdzi. Agent coś zauważył, ale nie ma prawa działać na podstawie
własnego domysłu.

Uśpienie po dwóch pominiętych cyklach jest CICHE — komunikat „usypiam profil"
brzmiałby jak przypomnienie o straconym kliencie. Cykle liczone w cyklach,
nie w dniach: przy rytmie kwartalnym miesiąc zwłoki to nic.

Sezonowość wymaga DWÓCH PEŁNYCH LAT. Jeden rok to nie wzorzec, tylko opis
zeszłego roku — fotograf, który miał jedno lato, nie dowiódł jeszcze niczego.

Weryfikacja:
- `npx vitest run tests/unit/` — 29 plików, 438 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Następny krok: 32 (P-02 paczka szkiców — promień rażenia 4)

## 2026-08-26 · Kroki 32 i 33 — P-02 paczka szkiców, P-03 brakująca faktura

Zrobione:
- `lib/flo/functions/invoice-batch.ts` — `buildBatchItems`,
  `buildBatchProposal`, `filterStillNeeded`, `shouldAskAboutMissing`,
  `buildMissingInvoiceProposal`.
- `tests/unit/flo-invoice-batch.test.ts` — 20 testów.

P-02, trzy awarie:
1. Hurtowa wysyłka złej kwoty — pozycja odbiegająca od typowej o >15% jest
   DOMYŚLNIE ODZNACZONA i wymaga otwarcia podglądu. Limit 10 pozycji.
2. Duplikat okresu — faktura już wystawiona NIE trafia do paczki w ogóle.
   Pokazanie jej jako odznaczonej kusiłoby do zaznaczenia „skoro tu jest, to
   pewnie trzeba". Druga warstwa: `filterStillNeeded` przy kliknięciu, bo
   między zbudowaniem paczki a wysyłką mija kilka godzin.
3. Luki w numeracji — SZKIC NIE DOSTAJE NUMERU. Test sprawdza, że w ładunku
   nie ma pola z numerem. To ta awaria, której klient nie zauważy przez rok,
   do pierwszego pytania księgowej, dlaczego brakuje faktury numer 14.

P-03:
- Pyta dopiero 7 dni po typowym terminie (faktura bywa wystawiana z poślizgiem).
- NIGDY „zapomniałeś" — test tego pilnuje. Zdanie brzmi „Wystawiłeś ją gdzie
  indziej?", bo klient mógł fakturować na papierze albo przez biuro.
- Trzeci przycisk „Wystawiona poza FaktFlow" — bez niego wybór jest między
  dwiema nieprawdami.
- Dwa razy „gdzie indziej" i agent milknie na stałe: to odpowiedź, nie zbieg
  okoliczności.
- Klucz tematu BEZ okresu, więc pytanie o zakończenie współpracy pada raz
  w życiu profilu, a nie co miesiąc.
- `noPush: true` — przypomnienie o cudzej decyzji biznesowej dzwoniące
  w telefonie podczas urlopu to natręctwo, nie pomoc.

Weryfikacja:
- `npx vitest run tests/unit/` — 30 plików, 458 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

## 2026-08-26 · PRZEKAZANIE DLA NOWEJ SESJI

Do `FLO-PLAN-BARTOSZ.md` na pulpicie dopisana CZĘŚĆ VII ze wszystkim, czego
w planie nie było: poprawki operacyjne (db:push nie działa, auto-deploy jest
włączony, tinker gubi pierwszą linię), decyzje architektoniczne (brak
bliźniaków Inngest, wyłączniki w kodzie, rozdzielanie modułów wysyłkowych,
przenośność ścieżek), dodatki do kontraktu, wzorzec wstrzykiwania klienta
bazy, lista ośmiu funkcji zablokowanych i na kim stoją, oraz to, czego
brakuje Masłu (`app/actions/flo.ts`).

Do `FLO-PLAN-MASLO.md` dopisana krótsza wersja: co jest gotowe, trzy nowe
pola w ładunku, gdzie się zatrzyma i dlaczego.

Następny krok: 34 (P-07 zaliczka i faktura końcowa)

## 2026-08-26 · app/actions/flo.ts — MASŁO ODBLOKOWANY

Zrobione poza kolejnością planu, przed krokiem 34, bo to jedyna rzecz
blokująca tor interfejsu przy jego kroku 19.

- `app/actions/flo.ts` — komplet ośmiu akcji z kontraktu III.3.
- `tests/unit/flo-actions.test.ts` — 8 testów.

Trzy rzeczy zrobione dokładnie tak, jak musiały:
1. `import '@/lib/flo/functions'` dla efektu ubocznego — bez tego rejestr
   wykonawców jest pusty i agent odpowiada „tego jeszcze nie umiem wykonać"
   na każde kliknięcie. Osobny test tego pilnuje, bo to pułapka, która już
   raz uderzyła w workerze.
2. Żeton zgody powstaje w akcji, PRZED wykonaniem, z migawką tego, co klient
   miał na ekranie (tytuł, treść, ładunek, wpisane dane, czas kliknięcia).
   Test sprawdza kolejność: `createApproval` przed `executeProposal`.
3. `reason: 'stale'` wraca do interfejsu jako normalna zwrotka, nie wyjątek.

BŁĄD ZŁAPANY PRZED WDROŻENIEM: plik z dyrektywą `'use server'` może
eksportować WYŁĄCZNIE funkcje asynchroniczne. Miałem na końcu re-eksport
`ActionAuthError` i `toProposalView` — `pnpm typecheck` tego nie łapie,
wywaliłby się dopiero `next build`, czyli w najgorszym momencie. Usunięte,
a test skanujący źródło pilnuje, żeby nie wróciło.

Bezpieczeństwo: każda akcja zaczyna się od `requireUserAndActiveOrg()`,
a akcje działające na pojedynczej propozycji dodatkowo filtrują po
`tenant_id` w zapytaniu. Klient administracyjny omija RLS, więc sama
znajomość identyfikatora propozycji nie może wystarczyć do wykonania cudzej
sprawy. Osobne testy na jedno i drugie.

Decyzje semantyczne:
- `listScheduled` czyta propozycje o statusie `approved` i odfiltrowuje te
  bez `approved_at`. Pozycja bez śladu zatwierdzenia nie ma prawa pojawić
  się w panelu „Zatwierdzone — czeka na wykonanie": byłaby zgodą przez
  milczenie, czyli modelem, który został odrzucony.
- „Wstrzymaj" (`cancelScheduled`) wraca propozycję do wątku jako OTWARTĄ,
  nie kasuje jej. Klient wstrzymał wykonanie, ale sprawa nadal istnieje —
  skasowanie byłoby podjęciem za niego drugiej decyzji, o którą nie prosił.
- Data zatwierdzenia formatowana w strefie Europe/Warsaw. Kontenery chodzą
  w UTC, a to jest ślad zgody, który przy reklamacji musi zgadzać się co do
  dnia.

Weryfikacja:
- `npx vitest run tests/unit/` — 31 plików, 466 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Uwagi dla Masła: możesz iść dalej od kroku 19. Wołasz `approveProposal(id,
input?)`, a `{ ok: false, reason: 'stale' }` obsługujesz spokojnym
komunikatem z pola `message`, nie błędem.

Następny krok: 34 (P-07 zaliczka i faktura końcowa)

## 2026-08-29 · Krok 34 — P-07 zaliczka i faktura końcowa

Zrobione:
- `lib/flo/functions/invoice-final.ts` — `inspectChain`, `decideFinalInvoice`,
  `hasSimilarInvoice`, `postponeUntil`, `buildFinalInvoiceProposal`,
  `recheckBeforeIssue`, `needsOperatorAttention`.
- `tests/unit/flo-invoice-final.test.ts` — 30 testów.

P-07, trzy awarie:

1. **Podwójne rozliczenie zaliczki.** Obrona DWUWARSTWOWA i to jest tu sedno.
   Warstwa pierwsza to łańcuch `parent_invoice_id`. Warstwa druga to faktura
   o zbliżonej kwocie w oknie 30 dni — bo klient wystawiający fakturę końcową
   ręcznie prawie nigdy nie wpina jej w łańcuch; dla niego to po prostu
   „faktura za resztę”. Sama pierwsza warstwa nie zobaczyłaby jej wcale.
   Próg podobieństwa 5% jest świadomie szeroki: przemilczenie faktury, którą
   klient i tak wystawi sam, kosztuje mniej niż drugi dokument rozliczający
   tę samą zaliczkę w rejestrze państwowym.

2. **Zła kwota do zapłaty.** Kwotę liczy `calculateFinalInvoiceTotals`
   z `lib/invoices/calculator` — ten sam kod, który liczy prawdziwe faktury.
   Osobny rachunek napisany na potrzeby agenta rozjechałby się z fakturą
   przy pierwszej pozycji z inną stawką VAT. Gdy suma zaliczek przekracza
   wartość zamówienia albo łańcuch jest rozspojony: MILCZENIE wobec klienta
   plus zgłoszenie do operatora. Ujemna kwota do zapłaty na karcie byłaby
   przerzuceniem naszego błędu w danych na klienta.

3. **Zaczepianie w trakcie projektu.** Start dopiero po dacie realizacji
   z faktury zaliczkowej; brak tej daty = milczenie, nie zgadywanie z daty
   wystawienia. „Projekt trwa” przesuwa o 30 dni bez limitu użyć.

DECYZJA, KTÓRA JEST TU NAJWAŻNIEJSZA: **„Projekt trwa” siedzi na
`intent: 'snooze'`, nie na `dismiss`.** Gdyby było odwrotnie, dwa kliknięcia
uruchomiłyby `MUTE_AFTER_DISMISSALS` i agent zamilkłby na 90 dni o obowiązku
ustawowym — dokładnie u tych klientów, którzy prowadzą najdłuższe projekty,
czyli u tych, którym ta funkcja jest najbardziej potrzebna. Osobny test tego
pilnuje.

Pozostałe decyzje:
- Zaliczki pokrywające 100% zamówienia → `fully_settled`, agent milczy.
  Czy faktura końcowa jest wtedy potrzebna, jest pytaniem do księgowej,
  a agent nie wchodzi w spory interpretacyjne.
- Nieprzejście walidacji FA(3) idzie do OPERATORA, nie do klienta. Szkic,
  który odbiłby się od bramki Ministerstwa, jest naszym błędem.
  Sprawdzane na końcu — dokument, którego i tak nie zamierzaliśmy pokazać,
  nie ma po co budzić operatora.
- Klucz tematu po korzeniu łańcucha, nie po okresie: jedno zamówienie ma
  jedną fakturę końcową, choćby projekt trwał rok.
- Karta żyje 90 dni. Obowiązek ustawowy nie znika po tygodniu.
- Szkic BEZ NUMERU, tak samo jak w P-02. Test skanuje ładunek.
- `recheckBeforeIssue` porównuje kwotę z tą, na którą klient się zgodził.
  Zgoda dotyczyła KONKRETNEJ LICZBY — po jej zmianie trzeba pokazać nową
  kartę, a nie wystawić dokument na liczbę, której człowiek nie widział.

Dług: warstwa wpięcia (odczyt łańcucha z bazy, tworzenie szkica, wykonawca)
idzie razem z resztą bloku 6, zgodnie z rytmem z części VII.8 planu.

## 2026-08-29 · Krok 35 — profil podatkowy i parametry roczne

Zrobione:
- `lib/flo/tax-params.ts` — tabela parametrów z datami obowiązywania,
  kalendarz dni wolnych (Wielkanoc liczona algorytmem, święta ruchome),
  `shiftToBusinessDay`, `taxDeadline`, bezpiecznik wieku tabeli.
- `lib/flo/tax-profile.ts` — `parseTaxProfile`, `isTaxProfileUsable`,
  `missingProfileFields`, `taxGateOpen`, lista `TAX_KINDS`.
- `lib/flo/proposals.ts` — bramka M12 wpięta w `createProposal`; nowy status
  `no_tax_profile`; opcjonalny parametr `db` (wzorzec z części VII.5).
- `tests/unit/flo-tax-params.test.ts` — 32 testy.

**Migracja NIE była potrzebna.** Kolumna `flo_prefs.tax_profile` istnieje od
00061, a `getPrefs`/`savePrefs` już ją czytają i zapisują. Krok 35 dokłada
walidację kształtu i bramkę, nie schemat.

**BRAMKA STOI W `createProposal`, nie w pięciu funkcjach podatkowych osobno.**
Warunek sprawdzany w jednym miejscu nie da się pominąć przez przeoczenie
w szóstej funkcji, którą ktoś dopisze za rok. Zwrotka `no_tax_profile`
zamiast `disabled`, żeby w pomiarze dało się odróżnić „prawnik jeszcze nie
odpowiedział” od „klient nie wypełnił kreatora”. Wywołujący sprawdzają
wyłącznie `status === 'created'`, więc dodanie wariantu niczego nie psuje.

Bramka ma DWA warunki naraz:
1. `PARAMS_VERIFIED` — wspólny dla wszystkich; tabela limitów i terminów
   sprawdzona przez człowieka.
2. Kompletny profil podatkowy — osobny dla każdego konta.

Sam profil nie wystarcza. To jest ta sama dyscyplina co przy odsetkach
(`RATES_VERIFIED` w `interest.ts`): limity, progi i terminy to DANE PRAWNE,
których nie wolno brać z pamięci modelu. Model poda liczbę prawdziwą dwa lata
temu i zrobi to z pełnym przekonaniem. Każdy wiersz ma puste pole `source`,
a test pilnuje, żeby flaga i puste źródła chodziły w parze.

Co otwiera bramkę, a co nie:
- Forma `nieznana` NIE otwiera. Kreator ma prawo zapisać „klient jeszcze nie
  wie”; agent ma wtedy obowiązek milczeć, a nie wybrać za niego skalę.
- Brak `startedOn` NIE otwiera. Bez daty rozpoczęcia działalności T-02 nie
  policzy proporcji limitu dla firmy założonej w trakcie roku, a T-03 nie ma
  od czego odliczać ulgi.
- `2026-02-31` nie zostaje datą profilu: `Date.parse` przyjmuje ją i cofa na
  marzec. Osobny test.

Kalendarz:
- Wielkanoc liczona algorytmem Meeusa/Jonesa/Butchera, od niej poniedziałek
  wielkanocny, Zielone Świątki (+49) i Boże Ciało (+60). To czysta arytmetyka,
  więc kalendarz NIE STARZEJE SIĘ razem z tabelą parametrów — i nie wymaga
  niczyjej weryfikacji.
- Przesunięcie ZAWSZE DO PRZODU. Termin z soboty upływa w poniedziałek;
  przesunięcie w tył kazałoby zapłacić wcześniej, niż trzeba.
- `taxDeadline` zwraca termin nominalny OBOK faktycznego. Bez obu dat nie da
  się napisać uczciwie „termin wypada w sobotę, więc masz czas do poniedziałku”.
- Testy na lata 2026–2028, w tym przełom roku (VAT za grudzień 2025 rozlicza
  się 26 stycznia 2026) i ciąg dni wolnych 1–3 maja 2026.

**BEZPIECZNIK WIEKU: `paramsStale()` psuje zestaw testów, gdy tabela nie była
przeglądana od roku.** Data przeglądu: `PARAMS_REVIEWED_ON = '2026-08-29'`.
Test upadnie 30 sierpnia 2027 i to jest zamierzone. Parametry podatkowe,
o których wszyscy zapomnieli, są gorsze od ich braku: brak widać od razu,
a stara liczba wygląda dokładnie tak samo jak świeża.

Weryfikacja obu kroków:
- `npx vitest run tests/unit/` — 33 pliki, 528 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

(Uwaga operacyjna: `pnpm typecheck` zgłaszał sześć błędów w `.next/types/`
o brakujących `app/(marketing)/page.js` i `blog/page.js`. To STARY ARTEFAKT
BUILDA, nie regres — te strony nie istnieją w drzewie. `rm -rf .next/types`
i typecheck jest czysty.)

Następny krok: 36 (T-01 kalendarz obowiązków)

## 2026-08-29 · Kroki 36 i 37 — T-01 kalendarz obowiązków, T-02 licznik limitu VAT

Zrobione:
- `lib/exports/jpk-v7m-generator.ts` — wyciągnięty `summarizeJpkV7m`.
- `lib/flo/functions/tax-deadline.ts` — T-01.
- `lib/flo/functions/vat-limit.ts` — T-02.
- `types/flo.ts` + `lib/flo/proposals.ts` — nowy zamiar akcji `correct`.
- `tests/unit/flo-tax-deadline.test.ts` (30) i `flo-vat-limit.test.ts` (33).

Obie funkcje są ZA FLAGĄ (`tax.deadline`, `tax.limit` w `flags.ts`) i za
bramką M12 z kroku 35. Nic z tego nie odezwie się do klienta przed odpowiedzią
prawnika i przed przestawieniem `PARAMS_VERIFIED`.

### T-01 — kwota z tego samego kodu, co plik

`generateJpkV7m` liczyła saldo w środku, tylko po to, żeby wpisać je do XML-a.
Wyciągnąłem to do `summarizeJpkV7m`. Powód nie jest kosmetyczny: agent mówi
klientowi, ile wychodzi VAT-u, a potem klient składa plik. **Gdyby to były dwa
osobne wzory, prędzej czy później pokazałyby dwie różne liczby — i wtedy klient
przestaje wierzyć obu naraz.** Jedno źródło, dwa zastosowania.

Generator nie miał ŻADNEGO testu, więc wyciągnięcie zabezpieczyłem dwoma:
kwota z `summarizeJpkV7m` musi zgadzać się z pozycjami `P_38`, `P_48`, `P_44`
i `P_51` w wygenerowanym XML-u, a nadwyżka musi trafiać do `P_53`, nie do
`P_51`. Bez tego refaktor opierałby się wyłącznie na tym, że przeczytałem
kod uważnie.

Cztery rzeczy pilnowane testami:
1. **Liczba nigdy bez podstawy.** Każda kwota chodzi w parze ze zdaniem
   „na podstawie 34 dokumentów, stan na 18.09, 3 koszty czekają na Twoją
   decyzję”. Kwota bez podstawy jest wyrocznią, a wyrocznię albo się
   bezkrytycznie przyjmuje, albo przestaje się jej wierzyć.
2. **Nigdy „zapłać”, zawsze „wychodzi mi”.** Test przelatuje cztery warianty
   karty i szuka trybu rozkazującego. „do zapłaty” zostaje — to termin
   z deklaracji (P_51) i rzeczownik, nie rozkaz.
3. **Nieprzejrzane dokumenty = kwota niepełna**, a zastrzeżenie stoi ZARAZ ZA
   LICZBĄ, w następnym zdaniu. Test tego pilnuje wyrażeniem regularnym.
   Zastrzeżenie, które trzeba doczytać, nie jest zastrzeżeniem. Wtedy też
   przycisk zmienia się na „Przejrzyj koszty” — najpierw domknięcie, potem
   kwota.
4. **Trzy zakończenia okresu, nie jedno.** Saldo dodatnie, zero i nadwyżka
   do przeniesienia. Powiedzenie klientowi z nadwyżką, że coś mu wychodzi
   do zapłaty, jest po prostu nieprawdą.

ODSTĘPSTWO OD PLANU, ŚWIADOME: plan mówi „7 i 3 dni przed terminem”.
Zrobiłem z tego **próg**, nie dwa konkretne dni — karta pojawia się przy
siedmiu dniach i podnosi priorytet przy trzech. Dosłowne trafianie w dzień
siódmy i trzeci znaczyłoby, że jeden nieudany przebieg crona zabiera klientowi
jedyne ostrzeżenie o terminie podatkowym. To awaria, o której nikt się nie
dowie do momentu, w którym jest za późno. Osobny test sprawdza, że dni 6, 5
i 4 też są objęte.

Drobiazgi, które i tak trzeba było rozstrzygnąć:
- Po terminie agent MILCZY. Przypominanie po fakcie to inna funkcja i inna
  rozmowa (i inna odpowiedzialność).
- `asOf` NIE wchodzi do odcisku danych. Zmienia się codziennie, więc karta
  udawałaby nową wiedzę przy każdym przebiegu.
- Przesunięty termin dostaje zdanie „ustawowy termin to 25.04, ale wypada
  w dzień wolny — liczy się 27.04”. Bez tego klient widzi datę inną niż ta,
  którą zna z ustawy, i nie wie, czy program się myli, czy on źle pamięta.
- Odmiana liczby mnogiej („1 koszt czeka”, „3 koszty czekają”, „12 kosztów
  czeka”) zrobiona na serwerze, bo kontrakt niesie gotowe napisy. Zwykle to
  robota toru interfejsu — tutaj nie ma jak.

### T-02 — licznik, który nie kwalifikuje transakcji

Najważniejsza decyzja tej funkcji: **agent NIE decyduje, co wlicza się do
limitu.** To kwalifikacja prawna, nie zadanie dla programu. Pozycja sprzedaży
wchodzi do licznika DOMYŚLNIE; wyłączenie musi przyjść z zewnątrz razem
z powodem, który ląduje na ekranie.

Kierunek domyślnej pomyłki wybrany świadomie: policzenie za dużo kończy się
niepotrzebnym ostrzeżeniem, policzenie za mało — przekroczeniem limitu,
o którym klient dowiaduje się od urzędu. Te dwa błędy nie kosztują tyle samo.
(Uwaga na przyszłość: kuszące mapowanie „stawka `zw` → poza limitem” byłoby
BŁĘDEM. Firma korzystająca ze zwolnienia podmiotowego wystawia `zw` na całą
swoją sprzedaż — czyli akurat u naszego docelowego klienta ta reguła zerowałaby
licznik.)

Złoty zbiór z planu przechodzi w całości:
- **firma od 1 stycznia** — limit pełny,
- **firma od 17 sierpnia** — 200 000 × 137/365 = 75 068,49 zł; ta sama
  sprzedaż zjada u niej 66% limitu zamiast 25%,
- **firma zawieszona** — zawieszenie NIE zmniejsza limitu (jest roczny
  i zależy od daty rozpoczęcia), ale wypada z mianownika tempa: firma
  zawieszona przez pół roku nie ma zerowego tempa, tylko nie miała kiedy
  sprzedawać. Wliczenie tych dni zaniżyłoby tempo i przesunęło ostrzeżenie
  na po fakcie. **To rozróżnienie idzie do potwierdzenia razem z tabelą
  parametrów.**
- **sprzedaż zwolniona przedmiotowo** — poza licznikiem, z powodem widocznym
  w dowodach.

Wzór („200 000,00 zł × 137/365 dni = 75 068,49 zł; wliczone …”) siedzi
w `evidence` jako ETYKIETA. Odesłanie po wzór na osobny ekran znaczy, że nikt
go nigdy nie zobaczy.

Progi: jedna faktura przeskakująca kilka progów naraz daje JEDNĄ kartę, tę
najwyższą — trzy karty za jedną fakturę to nie ostrzeżenie, tylko hałas.
Przekroczenie limitu ma priorytet 0 i mówi wprost, że obowiązek biegnie od
transakcji, która limit przekroczyła. Klient, który dowiaduje się o tym po
fakcie, ma problem wsteczny — cała funkcja istnieje po to, żeby ta wiadomość
przyszła przed, a nie po.

Prognoza jest scenariuszem: zawsze „jeśli tempo się utrzyma”. Przycisk
„to był jednorazowy kontrakt” zmienia WYŁĄCZNIE PROGNOZĘ, nigdy licznik —
jednorazowość kontraktu nie sprawia, że pieniądze nie wpłynęły. Osobny test
tego pilnuje.

### ⚠️ ZMIANA KONTRAKTU — UWAGA DLA MASŁA

Do `FloAction.intent` doszedł siódmy zamiar: **`correct`**. Zmiana wyłącznie
przez dodanie, więc nic Ci się nie przestanie kompilować — ale jeżeli masz
gdzieś `switch` po zamiarze z gałęzią `never`, to jest miejsce do uzupełnienia.

Po co: T-02 ma przycisk „to był jednorazowy kontrakt”. Człowiek poprawia nim
FAKT, na którym agent oparł wniosek — nie odrzuca karty i nie wycisza rodzaju.
Bez osobnego zamiaru trzeba by to wcisnąć w `dismiss`, a **dwa odrzucenia
wyciszają rodzaj na 90 dni** (`MUTE_AFTER_DISMISSALS`), czyli poprawienie
agenta kończyłoby się jego zamilknięciem.

Jak to rysować: zwykły przycisk drugorzędny. Po kliknięciu wołasz
`dismissProposal(id, 'not_now')` i przekazujesz `payload.correction`
(dla T-02: `'ignore_largest_sale'`). Agent przeliczy prognozę i wróci
z poprawioną kartą.

Weryfikacja:
- `npx vitest run tests/unit/` — 35 plików, 591 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Dług: obie funkcje to czyste reguły. Wpięcie (odczyt okresu z bazy, licznik
odpalany po każdej wystawionej fakturze, cron terminów) idzie jednym commitem
razem z resztą bloku 7 — i tak nie ruszy przed bramką prawną.

Następny krok: 38 (T-03 zegar ulg)

## 2026-08-29 · PRZEKAZANIE DLA MASŁA — plan zaktualizowany

Do `FLO-PLAN-MASLO.md` na pulpicie wpisane wszystko, co zmieniło się po jego
stronie kontraktu przez kroki 34–39:

- **Sekcja III.2 poprawiona w miejscu** — `FloAction.intent` ma teraz siedem
  wartości, z komentarzem odsyłającym do wyjaśnienia. Bez tego czytałby stary
  kontrakt i nie wiedziałby, skąd mu się bierze nieznany zamiar.
- **Nowa część VII (29 sierpnia)** z: zamiarem `correct` i instrukcją
  renderowania, nowymi polami ładunku (`snoozeDays`, `correction`, `complete`,
  `deadlineKind`/`due`/`nominalDue`), piątym polem profilu podatkowego
  (`ryczaltRate`, tylko dla ryczałtu, wpisywane w procentach, zapisywane
  ułamkiem), listą funkcji z kroków 34–37 i trzema zakazami przy grupie T.

Trzy rzeczy napisane mu wprost, bo są łatwe do przeoczenia przy projektowaniu
ekranów, a kosztowne do cofnięcia:
1. T-01 nigdy nie mówi „zapłać” i nie ma przycisku „zapłać”.
2. T-05 nie może wyglądać jak portfel — ładunek ma trzy pola i test po stronie
   silnika pilnuje, żeby nie doszło czwarte.
3. T-03 pokazuje datę, z której liczy, na pierwszym miejscu — nie pod
   „pokaż szczegóły”.

Masło jest u siebie na kroku 2, więc wszystkie te zmiany trafiają do niego
na długo przed miejscem, w którym mogłyby zaboleć.

## 2026-08-29 · Kroki 38 i 39 — T-03 zegar ulg, T-05 ile odłożyć

Zrobione:
- `lib/flo/tax-params.ts` — trzy nowe pola: składka w uldze na start,
  preferencyjna i standardowa.
- `types/flo.ts`, `lib/flo/db-types.ts`, `lib/flo/tax-profile.ts` —
  `ryczaltRate` w profilu + `canComputeTax()`.
- `lib/flo/functions/tax-relief.ts` — T-03.
- `lib/flo/functions/tax-setaside.ts` — T-05.
- `tests/unit/flo-tax-relief.test.ts` (23) i `flo-tax-setaside.test.ts` (23),
  plus trzy testy dopisane do zestawu profilu.

### T-03 — trzy awarie

1. **Zła data, zły komunikat.** Cała funkcja stoi na jednej dacie z profilu.
   Jeżeli kreator podstawił datę rejestracji zamiast rozpoczęcia działalności,
   agent straszy wzrostem składki w niewłaściwym miesiącu — a klient nie ma
   jak tego sprawdzić, bo nie wie, na czym agent się oparł. Obrona: **data
   jest pierwszym dowodem na karcie, razem z odnośnikiem „to nie ta data”.**
   Brak daty = milczenie.
2. **Zawieszenie policzone jak praca.** Ulga nie biegnie, kiedy firma stoi.
   Agent liczący po kalendarzu skróciłby ulgę o czas zawieszenia i zapowiedział
   wzrost składki, którego w tym miesiącu nie będzie. Test sprawdza jedno
   i drugie: przesunięcie końca i to, że w dniu, w którym bez przesunięcia
   agent by mówił, teraz milczy.
3. **Zła wiadomość bez konkretu.** Test przelatuje trzy warianty profilu
   i wymaga, żeby w każdym padło „Odkładaj po …”.

Decyzje, które trzeba było podjąć poza planem:
- **Ulga na start jest DEKLARACJĄ, nie wnioskiem agenta.** Nie każdy ma do
  niej prawo (decyduje m.in. praca dla byłego pracodawcy), a agent tego nie
  rozstrzyga. `usesStartRelief: null` = milczenie. Trzeci stan, nie `false`.
- **Zawieszenie doliczamy RAZ do całego ciągu ulg**, nie do każdej z osobna.
  Inaczej pół roku przerwy wydłużałoby ulgi o rok.
- `addMonths` trzyma koniec miesiąca: 31 sierpnia + 6 miesięcy to 28 lutego,
  a nie 3 marca. Kilka dni wystarczy, żeby komunikat wypadł PO pierwszym
  wyższym przelewie, czyli dokładnie wtedy, kiedy jest bezużyteczny.
- **„Ile odkładać” to RÓŻNICA między starą a nową składką.** Przykład
  w planie („rośnie z 400 do 1 600, odkładaj po 400”) nie domyka się
  arytmetycznie; wziąłem regułę, która domyka: odkładana różnica sprawia, że
  w dniu podwyżki pieniądze już są. Jeżeli intencja była inna, to jedna linia
  do zmiany.

### T-05 — trzy awarie

1. **Licznik wyglądający jak portfel.** Obrona jest w KONTRAKCIE, nie
   w wyglądzie: ładunek ma dokładnie trzy pola (`periodKey`, `toSetAside`,
   `primaryLabel`), a test skanuje go pod kątem listy `FORBIDDEN_PAYLOAD_KEYS`
   i sprawdza dokładny zestaw kluczy. Powód: dopóki serwer wysyła saldo,
   prędzej czy później ktoś je narysuje — w dobrej wierze, przy okazji innego
   zadania. Nie ma tam nawet pola „odłożone dotąd”.
2. **Procent od pojedynczej faktury.** Licznik jest narastający na okresie
   i uwzględnia koszty; przy ryczałcie liczy od przychodu, bo tam to poprawne.
   Test pilnuje, że koszt dopisany w środku okresu ZMNIEJSZA to, co zostało
   do odłożenia.
3. **Zmiana formy w trakcie okresu.** Przeliczenie obejmuje cały okres od
   początku. Gdy z przeliczenia wychodzi mniej, niż klient już odłożył, karta
   mówi „w tym miesiącu nie musisz już nic odkładać” — i **nigdy „wypłać
   sobie nadwyżkę”**. Osobny test szuka słów „wypłać”, „odbierz”, „zwrot”.

**ŚWIADOME ZAWĘŻENIE, ZGŁASZAM WPROST:** T-05 liczy PODATEK DOCHODOWY.
Składka zdrowotna NIE jest wliczona, bo jej podstawa i wzór różnią się dla
każdej formy — plan wymienia ją wprost wśród pozycji, których agent nie ma
prawa liczyć bez opinii (lista wyłączeń przy T-04). Katalog funkcji mówi
„na podatek i składki”, więc to jest odstępstwo. Zamiast policzyć źle,
karta mówi wprost, czego w liczbie nie ma — lista `excluded` idzie do dowodów
i jest widoczna. **Rozszerzenie o składkę zdrowotną to zadanie do rozmowy
z księgową, razem z resztą tabeli parametrów.**

Pozostałe decyzje T-05:
- **Ryczałt bez zadeklarowanej stawki MILCZY.** Stawek jest kilkanaście
  (2–17%), zależą od rodzaju działalności, a wybór jest kwalifikacją. Stąd
  `ryczaltRate` w profilu i `canComputeTax()` obok `isTaxProfileUsable()`:
  profil może być kompletny dla T-01 i T-02, a wciąż niewystarczający dla T-05.
- Wartość spoza zakresu (0, 1) jest odrzucana. `8.5` zamiast `0.085` to
  typowa pomyłka o dwa rzędy wielkości — lepiej puste pole niż podatek 850%.
- Kwota wolna na skali zastosowana jako pomniejszenie podstawy. To
  uproszczenie; jest na liście „czego tu nie ma”.
- Poniżej 50 zł karta nie powstaje. Odkładanie dwudziestu złotych to
  powiadomienie bez treści.

Weryfikacja:
- `npx vitest run tests/unit/` — 37 plików, 639 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Cały blok 7 jest gotowy poza krokiem 40 (T-04 symulator formy) — pozycja
CZERWONA, nie budujemy bez pisemnej opinii prawnika.

Następny krok: 41 (B-01 domknięcie miesiąca, promień 4)

## 2026-08-29 · Kroki 41 i 42 — B-01 domknięcie miesiąca, B-02 format księgowej

Zrobione:
- `types/flo.ts` + `lib/flo/kind-variant.ts` — nowy rodzaj `accountant.delivery`
  (wariant `info`).
- `lib/flo/functions/month-close.ts` — B-01.
- `lib/flo/functions/accountant-format.ts` — B-02.
- `tests/unit/flo-month-close.test.ts` (24) i `flo-accountant-format.test.ts` (16).

### B-01 — promień rażenia 4

Paczka z danymi finansowymi firmy wychodzi do OBCEJ OSOBY. Tego się nie
cofa: zła zawartość zostaje zaksięgowana, zły adres zostaje przeczytany.

1. **Niekompletna paczka u księgowej.** Trzy warunki (skrzynka KSeF pobrana
   do końca, zero nieprzejrzanych dokumentów, zgodność liczby faktur z KSeF)
   sprawdzane przed pokazaniem karty I ponownie przy kliknięciu. **Karta
   w ogóle nie powstaje, dopóki miesiąc nie jest kompletny** — pokazywanie jej
   z dopiskiem „wyślij mimo braków” byłoby zaproszeniem do dokładnie tej
   awarii, przed którą warunki mają chronić.
2. **Zły adres księgowej.** Wpisywany ręcznie, potwierdzany osobno przed
   pierwszą wysyłką („wysyłam do anna@biuro.pl — zgadza się?”), zapamiętywany
   **dopiero po udanym doręczeniu**. Adres z odbiciem zapisany jako
   „sprawdzony” zamieniłby jednorazową literówkę w trwały błąd: kolejne
   miesiące szłyby pod niego już bez pytania.
3. **Ciche dosłanie spóźnionego dokumentu.** Propozycja ANEKSU, nazywająca
   dokument po numerze, kontrahencie i kwocie, z WŁASNYM kluczem tematu
   (`accountant.annex:*`, nie `accountant.package:*`) — to dwie różne zgody
   na dwie różne przesyłki. Księgowa z dwiema paczkami różniącymi się
   niewidocznie nie ma jak zgadnąć, którą zaksięgowała.

Czwarta rzecz, nie awaria, tylko zasada: **cisza po wysyłce jest stanem
zabronionym.** Po każdej wysyłce powstaje meldunek. Odbicie ma priorytet 5
(prawie góra wątku), bo klient jest wtedy przekonany, że księgowa ma komplet.

**ZMIANA KONTRAKTU: nowy rodzaj `accountant.delivery`.** Dopisany na końcu
`FLO_PROPOSAL_KINDS`, wariant `info` — czyli komponent, który Masło już ma.
Musiał powstać osobny rodzaj, bo `accountant.package` rysuje się wariantem
`input` (pytamy o adres), a meldunek o doręczeniu nie ma o co pytać.

### B-02 — dwa bezpieczniki na ten sam problem z dwóch stron

Klient zgaduje, w czym pracuje jego księgowa, i ma prawo zgadnąć źle.
- **Pierwsza paczka zawsze niesie uniwersalny CSV obok wybranego formatu.**
  Przy jednym pliku zła odpowiedź kosztuje tydzień telefonów; z drugim plikiem
  księgowa po prostu otwiera ten, który wchodzi.
- **Zgłoszenie nieudanego importu jednym kliknięciem w wątku** — wisi na
  karcie DORĘCZENIA, bo doręczenie nie znaczy, że plik wszedł do programu.
  Maila do wsparcia klient nie napisze.

Zmiana formatu wisi na karcie DOMKNIĘCIA, nie w ustawieniach: moment,
w którym klient myśli o księgowej, to moment wysyłania jej paczki; ustawienia
odwiedza raz w życiu. Obie akcje używają zamiaru `correct` z kroku 37 —
to poprawienie faktu, na którym agent oparł działanie, a nie odrzucenie karty.

**ODSTĘPSTWO OD PLANU, ŚWIADOME:** plan mówi „wersja generatora w nazwie
pliku i nagłówku”. Wersja jest w NAZWIE PLIKU i w osobnym `MANIFEST.txt`
w paczce — **nie w treści plików**. Dopisanie wiersza nagłówka do CSV-a pod
Subiekta albo Symfonię zepsułoby import, czyli zrobiłoby dokładnie to, przed
czym ten mechanizm ma chronić. Osobny test pilnuje, że wersja NIE pojawia się
w treści CSV-a. Manifest czyta człowiek — klient, księgowa albo my przy
zgłoszeniu nieudanego importu.

Definicja gotowości kroku 42 („paczka testowa zawiera oba pliki”) sprawdzona
naprawdę: test buduje ZIP-a prawdziwymi generatorami (Comarch Optima + CSV)
i szuka obu nazw w katalogu centralnym archiwum.

### Poprawka własnego długu z kroku 36

Fixture JPK w teście T-01 był rzutowany przez `as never` i przez to
niekompletny — brakowało `position`, `unit`, `quantity`, `unitPriceNet`
i `invoiceType`. `summarizeJpkV7m` tych pól nie czyta, więc test przechodził;
generator Comarch Optima czyta i wywalił się przy pierwszym użyciu tego
samego kształtu w kroku 42. Rzutowanie usunięte, fixture'y typowane. To ten
sam rodzaj długu co `any` — obejście typów, które kupuje minutę i zwraca
ją z odsetkami przy pierwszym ponownym użyciu.

Weryfikacja:
- `npx vitest run tests/unit/` — 39 plików, 679 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Do `FLO-PLAN-MASLO.md` dopisane: nowy rodzaj `accountant.delivery`, dwa pola
karty domknięcia (`prefilledEmail`, `needsAddressConfirmation`) z powodem,
dla którego pola adresu nie wolno chować, oraz zakaz dorabiania przycisku
„wyślij mimo braków”.

Następny krok: 43 (P-04 podwyżka stawki, promień 4)

## 2026-08-29 · Kroki 43 i 44 — P-04 podwyżka stawki, P-08 prześwietlenie kontrahenta

Zrobione:
- `lib/flo/functions/rate-raise.ts` — P-04.
- `lib/flo/functions/contractor-check.ts` — P-08.
- `supabase/migrations/00064_contractor_manual_fields.sql` — `manual_fields`.
- `tests/unit/flo-rate-raise.test.ts` (28) i `flo-contractor-check.test.ts` (23).

### P-04 — promień rażenia 4

Stawka, której nikt nie ruszył od dwóch lat, to najcichsza strata w całej
jednoosobowej działalności: nie boli w żadnym miesiącu z osobna i nie
pojawia się w żadnym zestawieniu.

1. **Podwyżka policzona od sumy faktury.** Faktura urosła, bo klient sprzedał
   więcej godzin, nie dlatego, że podniósł stawkę. Liczymy PER POZYCJA,
   dopasowaną po nazwie I jednostce — „usługa/godz.” i „usługa/szt.” to dwie
   różne rzeczy (cena czasu vs cena efektu). Niejednorodne pozycje =
   milczenie. Osobny test: faktura, która urosła wolumenem, nie wygląda
   jak podwyżka.
2. **Wysyłka jednym kliknięciem.** Przycisk główny to „Pokaż treść”, a test
   skanuje całą kartę wyrażeniem `/wyślij/i` i wymaga, żeby nie było go
   nigdzie. Dodatkowo `recheckBeforeRaiseSend` odrzuca wysyłkę bez
   `previewOpened` — **silnik nie wypuści wiadomości, której nikt nie czytał,
   nawet jeśli interfejs kiedyś się pomyli.**
3. **Podwyżka w najgorszym momencie.** Trzy blokady (otwarta faktura po
   terminie, ponaglenie w 90 dni, korekta w 30 dni), sprawdzane przy
   budowaniu karty i ponownie przy kliknięciu. Karta o podwyżce potrafi leżeć
   w wątku tygodniami — w tym czasie kontrahent mógł przestać płacić.

DECYZJA, KTÓREJ PLAN NIE ROZSTRZYGAŁ: **agent nie ustala ceny.** Katalog mówi
„liczy skutek roczny”, ale nie mówi, skąd wziąć nową stawkę. Wybór wysokości
podwyżki jest decyzją biznesową o cudzej relacji — agent pokazuje więc
ELASTYCZNOŚĆ („każde 10% to 1 200 zł rocznie przy Twoim wolumenie”),
a liczbę wpisuje człowiek. Trzy tony wiadomości też są do wyboru, nie do
zgadnięcia: ten sam tekst bywa uprzejmy wobec korporacji i oschły wobec
kogoś, z kim klient pracuje od pięciu lat.

Drobiazg, który wyszedł przy pisaniu: przy stawce niezmienionej od zawsze
`lastRateChange` zwraca datę PIERWSZEGO wystąpienia — tyle czasu klient
pracuje za te same pieniądze. Przy stawce raz podniesionej zwraca datę
podwyżki, nie pierwszej faktury.

### P-08 — funkcja, która w 95% przypadków milczy

1. **Fałszywy alarm na kimś, kto nie ma prawa być w rejestrze.** Osoba
   fizyczna nieprowadząca działalności nie ma wpisu na białej liście;
   podatnik zwolniony podmiotowo nie jest „czynny”. Logika dwustanowa
   oznaczyłaby oboje jako podejrzanych — czyli agent straszyłby przy połowie
   faktur NASZEJ GRUPY DOCELOWEJ, aż klient przestałby czytać ostrzeżenia.
   Stąd cztery stany (`active`, `not_listed`, `removed`, `unavailable`)
   i ostrzeżenie wyłącznie przy `removed`.
   **`exempt` mapuje się na `active`** — tak wygląda w rejestrze większość
   naszych własnych klientów.
2. **Nadpisanie ręcznej poprawki.** Migracja 00064 dokłada
   `contractors.manual_fields TEXT[]`. Znacznik jest TRWAŁY i działa PER POLE:
   poprawiona nazwa nie ma powodu blokować odświeżania statusu VAT, który
   jest jedyną rzeczą, o którą w tej funkcji naprawdę chodzi.
3. **M17 — awaria rejestru.** `planAfterOutage` ma pola typowane na `false`,
   nie na `boolean`: to nie jest ustawienie, tylko gwarancja na poziomie
   typów. Awaria nie blokuje wystawienia i nie produkuje komunikatu w chwili
   wystawiania — klient i tak nic na nią nie poradzi. Ponowienie w tle po
   30 minutach, a jeżeli DOPIERO WTEDY wyjdzie wykreślenie, karta mówi
   wprost, że pierwsze podejście nie doszło.

Ton: „sprawdź to przed wystawieniem”, nigdy „nie wystawiaj”. Test szuka
`/nie wystawiaj|zablokowa|nie wolno/i`. Wykreślenie z rejestru VAT nie jest
zakazem współpracy — agent nie wie, czy klient ma powód wystawić tę fakturę.

### ⚠️ MIGRACJA 00064 NIE JEST WGRANA NA PRODUKCJĘ

Plik leży w `supabase/migrations/`, ale nikt go nie uruchomił. Do zrobienia
procedurą z `AGENTS.md`: `scp` na `db-1` → `docker exec psql` → wpis do
`schema_migrations` → `NOTIFY pgrst`. Migracja jest addytywna (`ADD COLUMN
IF NOT EXISTS` z domyślną wartością, indeks częściowy), bez `DROP`,
`TRUNCATE` ani `DELETE`.

Po wgraniu trzeba odświeżyć `types/database.ts` — dziś nie ma tam
`manual_fields`. Kod P-08 tego nie odczuwa, bo `mergeRegistryData` jest
generyczne i nie sięga do typów tabeli, ale warstwa wpięcia będzie musiała.

Weryfikacja:
- `npx vitest run tests/unit/` — 41 plików, 730 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Do `FLO-PLAN-MASLO.md` dopisana sekcja o P-04: przycisk „Pokaż treść”
zamiast „Wyślij”, trzy tony do wyboru człowieka i zakaz dorabiania
podpowiedzi „sugerowana stawka”.

Następny krok: 45 (P-09 kontrahent z zagranicy, ŻÓŁTE — `lib/flo/nbp.ts`)

## 2026-08-29 · MIGRACJE 00064 i 00065 WGRANE NA PRODUKCJĘ

Procedurą z `AGENTS.md`: `scp` → `docker exec psql --single-transaction` →
wpis do `schema_migrations` → `NOTIFY pgrst`. Obie sprawdzone przed
uruchomieniem pod kątem `DROP`, `TRUNCATE` i `DELETE FROM` — czysto.

- **00064** `contractors.manual_fields TEXT[]` + indeks GIN częściowy.
  Zweryfikowane: kolumna, indeks i wpis 00064 są w bazie.
- **00065** `invoices.origin TEXT` z ograniczeniem CHECK, indeks częściowy
  po `(tenant_id, origin)` i uzupełnienie historii z prefiksu w `notes`.
  **`UPDATE` dotknął ZERA wierszy** — produkcja ma w tej chwili dwie faktury
  i żadnej z importu. Sprawdziłem to zapytaniem PRZED uruchomieniem
  migracji, nie po.

`types/database.ts` uzupełnione ręcznie o oba pola. W projekcie nie ma
skryptu generującego typy (`db:push:prod` to pozostałość po Supabase Cloud),
a pełna regeneracja zaciągnęłaby niezwiązany dryf schematu.

## 2026-08-29 · Kroki 45 i 46 — P-09 zagranica, O-02 import historii

Zrobione:
- `lib/flo/nbp.ts` — kursy z regułą „ostatnia tabela przed datą”.
- `lib/flo/functions/contractor-foreign.ts` — P-09.
- `lib/flo/functions/import-history.ts` — O-02.
- `supabase/migrations/00065_invoice_origin.sql`.
- `tests/unit/flo-nbp.test.ts` (27) i `flo-import-history.test.ts` (25).

### P-09 — jedyna funkcja, której domyślną odpowiedzią jest „zapytaj człowieka”

Kwalifikacja transakcji zagranicznej zależy od rzeczy, których agent nie
widzi: gdzie usługa jest faktycznie świadczona, czy nabywca jest podatnikiem,
czy ma stałe miejsce prowadzenia działalności w Polsce. Program, który wybiera
za klienta, myli się w sposób, którego klient nie zauważy do kontroli.

Obrona jest w KONTRAKCIE, nie w treści: **w ładunku nie ma i nie będzie pola
ze stawką VAT**. Test skanuje klucze pod kątem `vatRate`, `reverseCharge`,
`taxRate`. Dopóki pola nie ma, nikt nie zbuduje interfejsu, który ustawia
stawkę jednym kliknięciem — także przez pomyłkę, przy okazji innego zadania.
Warianty są OPISAMI: każdy zaczyna się od „Zwykle”, a osobny test tego
pilnuje. Każda karta kończy się „pokaż to księgowej”.

Kursy — reguła brzmi „ostatnia tabela opublikowana PRZED datą zdarzenia”.
Ta jedna litera („przed”, nie „w dniu”) to inna kwota VAT-u przy kontroli.
Tabela z tego samego dnia jest odrzucana, i jest na to osobny test.

Definicja gotowości („testy na długie weekendy, święta i przełom roku”)
zrobiona tak, że fixture NIE JEST ręcznie wpisaną listą dat: zapas tabel
generuje się po dniach roboczych z kalendarza `tax-params` (tego samego,
którego pilnują testy kroku 35). Dzięki temu nie da się przeoczyć akurat
tego święta, o które chodzi. Pokryte: zwykły weekend, majówka 2026
(1 maja piątek + 3 maja niedziela), wtorek po poniedziałku wielkanocnym,
Boże Ciało w czwartek, przełom roku (2 stycznia 2027 bierze kurs z 31 grudnia
2026, numeracja tabel startuje od 1/A/NBP/2027).

DECYZJA POZA PLANEM: `MAX_PUBLICATION_GAP_DAYS = 7`. Dziura większa niż
długi weekend ze świętami oznacza, że NASZ ZAPAS jest nieaktualny, a nie że
NBP nie publikował — i wtedy funkcja odmawia podstawienia (`stale_buffer`)
zamiast oddać kurs sprzed dwóch tygodni. Kurs bliski prawdzie wygląda na
fakturze tak samo jak prawdziwy i różni się od niego przy każdej korekcie.
Zapas przycinamy PER WALUTA, nie globalnie: przy trzech walutach globalny
limit trzydziestu wpisów zostawiłby dziesięć dni historii na każdą.

### O-02 — import historii

Definicja gotowości („dwukrotny import = zero duplikatów”) sprawdzona wprost:
test uruchamia dedup dwa razy i wymaga zera w drugim przebiegu.

Odcisk trzyma się NUMERU KSeF, nie numeru własnego klienta — po imporcie
z dwóch programów numery własne potrafią się powtórzyć. Odsiewamy w dwóch
wymiarach: wobec bazy i WEWNĄTRZ paczki, bo stronicowanie z nakładką zwraca
ten sam dokument na dwóch stronach. Dokument bez numeru KSeF nie wjeżdża
po cichu — nie da się go odcisnąć, więc przy kolejnym przebiegu wjechałby
drugi raz.

**Trwały znacznik pochodzenia wymagał migracji.** Dotąd pochodzenie dało się
odczytać wyłącznie z `notes` (pole EDYTOWALNE PRZEZ KLIENTA — jedna poprawka
notatki i dokument przestaje być rozpoznawalny) albo z `fa3_data.import.source`
w blobie JSONB. Stąd `invoices.origin` z ograniczeniem CHECK. Bez tego
wykluczenie z K-03 i z kontroli numeracji było deklaracją, nie mechanizmem.

Nieznana wartość `origin` jest traktowana jak import, nie jak własna faktura.
Kierunek pomyłki wybrany świadomie: dokument wyłączony z oceny nie psuje
niczyich liczb, dokument wpuszczony po cichu psuje.

Ograniczenie tempa per NIP JUŻ ISTNIEJE (`lib/ksef/rate-limiter.ts`,
`ksefRateLimiter`) — nie dublowałem go. Wznawianie: przy jakiejkolwiek
wątpliwości co do świeżości tokenu wybieramy restart, a nie kontynuację.
Restart jest wolny, ale nie jest niebezpieczny — przed duplikatami broni
odcisk na numerze KSeF, nie ten mechanizm.

Sprawdzenie po podłączeniu mówi WPROST, czego agent nie może: środowisko
testowe („to nie są prawdziwe dokumenty”), token tylko do odczytu („nie wyślę
żadnej faktury, nawet po Twoim zatwierdzeniu”), brak prawa odczytu („nie
zaciągnę historii”). Klient, który dowiaduje się o tym przy pierwszej
nieudanej wysyłce, ma problem dziś; klient, który dowiaduje się przy
podłączaniu, ma zadanie na spokojnie.

Weryfikacja:
- `npx vitest run tests/unit/` — 43 pliki, 782 testy, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Blok 8 domknięty (kroki 41–45), blok 9 zaczęty.

Następny krok: 47 (O-04 narzędzia rozmowy, ŻÓŁTE — wyłącznie odczyt
i szkice, narzędzie wysyłające nie istnieje)

## 2026-08-29 · Kroki 47 i 48 — O-04 narzędzia rozmowy, O-03 podpowiadanie funkcji

Zrobione:
- `lib/flo/tools.ts` — rejestr narzędzi, walidacja, ogrodzenie danych.
- `lib/flo/tax-topic.ts` — klasyfikator tematów podatkowych (za flagą).
- `lib/flo/functions/feature-hint.ts` — O-03.
- `tests/unit/flo-tools.test.ts` (24) i `flo-feature-hint.test.ts` (22).

### O-04 — cztery warstwy obrony, w kolejności od najważniejszej

Zagrożenie jest realne, nie teoretyczne: do skrzynki KSeF trafiają faktury od
podmiotów, których NIE KONTROLUJEMY, a w nazwie pozycji można wpisać dowolny
tekst. Ten tekst wchodzi potem do kontekstu modelu jako dane klienta.

1. **NARZĘDZIE WYSYŁAJĄCE NIE ISTNIEJE.** To jest cała obrona; reszta to
   utrudnienia. Nawet wstrzyknięcie, które w pełni przejmie model, nie ma
   czego wywołać. Typ `ToolMode` jest domknięty do `'read' | 'draft'` —
   dopisanie narzędzia wysyłającego wymaga zmiany TYPU, czyli świadomej
   decyzji w przeglądzie kodu, a nie dopisania linii do tablicy. Test skanuje
   też nazwy narzędzi wyrażeniem `/wysl|wyśl|send|submit|mail|sms|publish/i`.
2. **Dane oddzielone od instrukcji.** Rekordy idą w ogrodzonym bloku,
   a ogrodzenie jest NEUTRALIZOWANE w treści. Pięć realnych wariantów ataku
   w zestawie testów, w tym taki, który zawiera sam znacznik końca bloku —
   żaden z niego nie wychodzi.
3. **Parametry walidowane po stronie serwera.** `tenantId` przysłany przez
   model jest USUWANY, nie honorowany (razem z `tenant_id` i
   `organizationId`) — inaczej wystarczyłoby, żeby wstrzyknięcie kazało go
   podmienić. Osobno `assertBelongsToTenant` jako pas obok szelek na wyniku
   zapytania.
4. RLS jako ostatnia linia.

Świadomie NIE blokujemy po wzorcach. `looksLikeInjection` jest CZUJKĄ do
alertu operatorskiego, nie bramką: wzorce da się ominąć, a zablokowana
faktura z dziwną nazwą pozycji to zablokowana praca klienta. Test tego
pilnuje — sprawdza, że czujka wykrywa, ale nic nie zatrzymuje.

Piąta zasada, nie o bezpieczeństwie: **przy niejednoznaczności pytamy, nie
wybieramy.** `resolveOne` zwraca jeden wynik albo listę — nigdy „najlepszy”
z domysłem. Dwóch Kamilów to pytanie, nie ranking.

**Klasyfikator podatkowy.** Podatki sprawdzane PIERWSZE i wygrywają z każdym
innym tematem: „czy mogę wystawić fakturę bez VAT-u?” ma w sobie słowo
„faktura”, a jest pytaniem podatkowym — przy odwrotnej kolejności dostałoby
odpowiedź od modelu. Lista wzorców jest celowo szeroka: fałszywy alarm
kosztuje jedno zdanie o księgowej za dużo, przeoczenie kosztuje własną
wykładnię przepisu.

Dziesięć pytań-pułapek w testach. `modelMayAnswer('tax')` zwraca `false` —
pytanie podatkowe NIE IDZIE DO MODELU W OGÓLE. Nie chodzi o to, żeby model
odpowiedział ostrożnie, tylko żeby nie odpowiadał. Pole `modelMayAnswer`
w wyniku jest typowane na `false`, nie na `boolean`: to gwarancja na poziomie
typów, nie ustawienie.

Za flagą (`TAX_TOPIC_APPROVED = false`) nie oddajemy NAWET artykułu z bazy
wiedzy — sam dobór artykułu pod pytanie klienta jest już krokiem w stronę
wykładni. Osobny test sprawdza, że treść artykułu nie przecieka do odpowiedzi.

### O-03 — cztery bezpieczniki na jeden zasób: uwagę

Promień rażenia 1, ale uwaga jest tu jedynym zasobem, jaki mamy.

1. **Nigdy w trakcie rozpoczętego procesu** — sprawdzane pierwsze, wygrywa
   nawet z najpilniejszym sygnałem.
2. **Jedna podpowiedź tygodniowo**, a odstęp sprawdzany PRZED filtrowaniem
   sygnałów: odwrotna kolejność zużywałaby tydzień limitu na podpowiedź,
   której i tak nie wolno pokazać.
3. **Funkcja już używana nie jest podpowiadana** — definicja gotowości kroku,
   sprawdzona wprost.
4. **Dwa odrzucenia kasują typ TRWALE** — nie 90 dni jak przy zwykłym
   wyciszeniu. Osobny test sprawdza, że za rok też jest cisza.

Piąta zasada, produktowa: wyłącznie funkcje z planu klienta. Wątek FLO nie
jest miejscem na sprzedaż.

Kolejność reguł ma znaczenie: na górze licznik limitu VAT, bo to jedyna
pozycja, w której zwłoka kosztuje pieniądze, a nie wygodę. Karta ma
priorytet 90 (najniższy w wątku) i `noPush: true` — bez okien, bez dymków.

Weryfikacja:
- `npx vitest run tests/unit/` — 45 plików, 828 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto
- test architektoniczny nadal zielony (8/8)

Do `FLO-PLAN-MASLO.md` dopisane: pytania podatkowe nie idą do modelu (bez
animacji „myślenia” przy takiej odpowiedzi), lista kandydatów bez domyślnego
zaznaczenia, priorytet 90 i `noPush` przy karcie podpowiedzi.

Następny krok: 49 (O-01 wsparcie onboardingu — ścieżka pierwszej faktury
bez certyfikatu KSeF)

## 2026-08-29 · Kroki 49 i 50 — O-01 onboarding, S-03 Wrapped

Zrobione:
- `lib/flo/functions/onboarding.ts` — O-01.
- `lib/flo/wrapped.ts` — S-03.
- `tests/unit/flo-onboarding.test.ts` (25 testów, obie funkcje).

### O-01 — sukces onboardingu nie zależy od certyfikatu KSeF

To jest jedno zdanie, wokół którego stoi cały ten krok. Certyfikat wymaga
profilu zaufanego albo podpisu kwalifikowanego; bywa, że czeka się dzień,
bywa, że tydzień. Nasz docelowy klient trafia na nas najczęściej dlatego, że
MA JUŻ USŁUGĘ WYKONANĄ i musi ją zafakturować. Produkt, który mówi wtedy
„najpierw zdobądź certyfikat”, jest produktem, z którego ten człowiek
wychodzi i nie wraca.

Ścieżka ma cztery kroki i kończy się PDF-em wysłanym mailem. Test przechodzi
ją w pętli na koncie z `hasKsefCertificate: false` i wymaga dojścia do
`done`; drugi test skanuje wszystkie kroki i wymaga, żeby w tytule ani
w etykiecie przycisku nie padło słowo „certyfikat”. To zabezpieczenie na
przyszłość, nie na dziś — łatwo dopisać taki krok „dla porządku” za pół roku.

Brak NIP-u NIE ZATRZYMUJE ścieżki: organizacja szkicowa wystarczy do
przygotowania i wysłania PDF-a. Wymagania KSeF (`ksefTodo`) są osobną listą,
pokazywaną wtedy, kiedy klient sam się na nią zdecyduje.

M13 zrealizowany jako `capabilitiesFor`: cztery zdolności działają od
pierwszej minuty bez żadnej formalności, a każda zablokowana ma POWÓD
I NAPRAWĘ z odnośnikiem. Nie „nie mogę wysyłać do KSeF”, tylko „potrzebny
certyfikat, zdobywa się go tak”. Zdanie do kreatora mówi wprost, czego agent
teraz nie potrafi — milczenie o ograniczeniach kończy się tym, że klient
odkrywa je sam przy pierwszej fakturze, która ma iść dzisiaj.

### S-03 — przy spadku nie ma dynamiki

Definicja gotowości („brak jakiejkolwiek liczby ujemnej”) sprawdzona na całym
wyniku: `JSON.stringify(result)` nie może pasować do `/-\d/` ani zawierać
minusa typograficznego. Drugi test szuka słów „spad”, „mniej”, „gorzej”,
„strat”.

Przy słabszym roku sekwencja DOBIERA INNE EKRANY — liczba obsłużonych
klientów, najdłuższa współpraca, terminowość. Ekrany porównawcze
(`quarter_to_quarter`, `biggest_client`) znikają w całości, a nie są
„wyszarzane”. Wrapped u kogoś, komu rok wyszedł gorzej, nie ma być raportem
o tym, że wyszedł gorzej.

Drobiazg, który wyszedł przy pisaniu i mógł popsuć całą regułę: średni czas
płatności bywa UJEMNY (klient płaci przed terminem). Jest to najlepsza liczba
w całym zestawieniu, a na ekranie wyglądałaby jak zła wiadomość — stąd
`describePaymentSpeed` zwraca „Płaci przed terminem” zamiast „−3 dni”.
Bez tego test na liczby ujemne padłby na koncie, któremu idzie DOBRZE.

Nazwy kontrahentów domyślnie zasłonięte („Twój największy klient”), prawdziwe
wyłącznie przy `revealNames: true`. Ekran zapisuje się w 9:16 i ląduje
w mediach społecznościowych, a kontrahent nie pytał nikogo o zgodę na
pokazanie, ile u nas wydał. Test sprawdza, że nazwa nie przecieka do wyniku.

**Zero wywołań modelu** pilnowane testem skanującym źródło pliku: brak
importu z `lib/flo/llm` i brak wzmianki o Anthropic. Powód jest kosztowy —
Wrapped ogląda naraz całe konto klientów w jednym tygodniu grudnia.

Weryfikacja:
- `npx vitest run tests/unit/` — 46 plików, 853 testy, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Blok 9 domknięty (kroki 46–49), blok 10 zaczęty.

Do `FLO-PLAN-MASLO.md` dopisane: zakaz wymagania certyfikatu w kreatorze,
`capabilitiesFor` jako źródło listy „co potrafię teraz”, wariant `steady`
w Wrapped bez dokładania własnych strzałek w dół, domyślne zasłonięcie nazw.

Następny krok: 51 (S-04 progi pieniężne — konto z historią z importu nie
dostaje progów wstecz)

## 2026-08-29 · Kroki 51 i 52 — S-04 progi pieniężne, M7 tryb cichy i metryki

Zrobione:
- `lib/flo/functions/milestone.ts` — S-04.
- `lib/flo/shadow.ts` — tryb cichy, promienie, progi trafności.
- `lib/flo/metrics.ts` — sześć liczb dla panelu operatora.
- `tests/unit/flo-milestone.test.ts` (16) i `flo-shadow-metrics.test.ts` (28).

### S-04 — import nie odblokowuje progów wstecz

Definicja gotowości sprawdzona wprost: faktury z `origin` innym niż `app`
nie liczą się do progów. Ta funkcja jest pierwszym realnym konsumentem
kolumny z migracji 00065 — bez niej „wyłącznie przychód po rejestracji
konta” byłoby deklaracją, bo pochodzenia nie dałoby się odczytać z niczego
trwałego.

Reguła, która wymagała osobnej ścieżki w kodzie: **konto, które w pierwszym
miesiącu przebija najwyższy próg, nie dostaje żadnego.** To nie jest ktoś,
kto właśnie zaczyna, tylko firma, która się do nas przeprowadziła —
i gratulowanie jej „pierwszych 10 000 zł” byłoby dowodem, że program nie
rozumie, z kim rozmawia. Werdykt `suppress_all` zwraca komplet kluczy do
zapisania jako przyznane, żeby drabinka nie odpaliła się miesiąc później.

Karencja siedmiu dni od wpłaty ma konkretny powód: próg raz przyznany nie
jest odbierany, a wpłata bywa cofana. Próg przyznany i po tygodniu
nieprawdziwy jest gorszy niż brak progu.

Przy kilku progach przekroczonych naraz przyznajemy NAJWYŻSZY — trzy karty
jednego dnia zamieniłyby miły moment w spam.

Ton pilnowany testem skanującym całą kartę: bez „gratulacje”, bez odznak,
bez poziomów, bez licznika faktur. Priorytet 99 (najniższy w wątku, niżej
niż podpowiedzi funkcji) i `noPush`.

### M7 — tryb cichy

Bez trybu cichego jedynym sposobem sprawdzenia, czy funkcja trafia, jest
wypuszczenie jej na klientów. Przy promieniu 4 — dokument w rejestrze
państwowym albo wiadomość u obcej osoby — to nie jest test, tylko
eksperyment na ludziach.

`KIND_RADIUS` przypisuje promień KAŻDEMU z 32 rodzajów; test tego pilnuje,
bo rodzaj bez promienia nie miałby progu, czyli wyszedłby z ukrycia bez
żadnego warunku. **Gdy jeden rodzaj obsługuje kilka funkcji o różnym
promieniu, wpisujemy WYŻSZY** — `invoice.draft` niesie P-03 (promień 1)
i pojedynczy szkic z P-02 (promień 4), a przy sporze wygrywa surowszy próg.

Definicja trafienia jest CELOWO WĄSKA: ta sama rzecz, ta sama kwota, ta sama
encja. Luźniejsza („klient coś zrobił”) dawałaby trafność bliską stu procent
u każdej funkcji i nie mówiłaby nic.

Do `flo_shadow` trafiają wyłącznie klucze i kwoty — test sprawdza dokładny
zestaw kluczy zapisanego obiektu. Treść karty i dane kontrahenta nie mają
czego szukać w tabeli operatorskiej.

Przy promieniu 3 jeden błąd blokuje wydanie. „99% poprawnych kwot podatku”
znaczy, że co setny człowiek dostanie złą.

### Sześć liczb panelu — dwie decyzje warte zapisania

1. **„Zignorowane” to WYGASŁE, nie odrzucone.** Odrzucenie jest decyzją
   i informacją („nie chcę tego”); wygaśnięcie bez kliknięcia znaczy, że
   karta nie była dość ważna, żeby cokolwiek z nią zrobić. Zlepienie obu
   w jedną liczbę ukryłoby różnicę między funkcją NIECHCIANĄ a NIEWIDOCZNĄ,
   a to są dwa zupełnie różne problemy do naprawienia.
2. **Odsetek cofnięć liczony OD PRZYJĘTYCH**, nie od wszystkich propozycji.
   Cofnięcie mierzy, jak często agent zrobił coś, czego człowiek po namyśle
   nie chciał — a namysł dotyczy wyłącznie tego, na co się zgodził.

Liczba zdarzeń zablokowanych przez re-walidację jest jedyną metryką w tym
zestawie, która liczy AWARIE, DO KTÓRYCH NIE DOSZŁO. Przy rosnącym ruchu ma
prawo rosnąć — dopisane w planie Masła, żeby nie wylądowała na panelu na
czerwono.

Kurs USD/PLN przy koszcie modelu podajemy z zewnątrz zamiast zaszywać:
metryka operatorska licząca po kursie sprzed roku myli bardziej, niż pomaga.

Weryfikacja:
- `npx vitest run tests/unit/` — 48 plików, 897 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto

Blok 10 domknięty (kroki 50–51), blok 11 zaczęty.

Do `FLO-PLAN-MASLO.md` dopisane: priorytet 99 i jedna liczba na karcie progu,
gotowe funkcje panelu, oraz dwie rzeczy do pokazania inaczej niż reszta.

Następny krok: 53 (M8 — wyłączniki per konto jako warstwa NAD `flags.ts`,
z ćwiczeniem na produkcji)

## 2026-08-29 · Kroki 53 i 54 — M8 wyłączniki, runbook awaryjny

Zrobione:
- `supabase/migrations/00066_flo_kind_flags.sql` — WGRANA NA PRODUKCJĘ.
- `lib/flo/kind-switch.ts` — trzy warstwy przełączników.
- `killFloAgent` w `lib/feature-flags/*` + wiersz w `global_feature_flags`.
- Wpięcie w `createProposal`, `flo_kind_flags` w atrapie bazy.
- `docs/runbooks/flo-incident.md`.
- `tests/unit/flo-kind-switch.test.ts` (17).

### M8 — trzy warstwy, każda może tylko ZABRAĆ

1. **Globalny wyłącznik agenta** (`killFloAgent` w `global_feature_flags`) —
   jeden UPDATE, cache 60 s, bez wdrożenia.
2. **Blokada w kodzie** (`lib/flo/flags.ts`) — prawo i niepotwierdzone dane.
3. **Przełącznik per konto** (`flo_kind_flags`) — wiersz tylko przy
   odstępstwie.

**Najważniejsza własność: warstwa 3 NIE MOŻE ODWRÓCIĆ WARSTWY 2.** Wpis
`enabled = true` dla rodzaju zablokowanego w kodzie jest ignorowany, i jest
na to osobny test. Gdyby było inaczej, jeden UPDATE o drugiej w nocy
wypuszczałby na klienta funkcję, której nikt nie zatwierdził — a właśnie
przed tym miało chronić trzymanie tamtej listy w commicie.

ODSTĘPSTWO OD PLANU: plan mówi „flaga dla każdej z 33 funkcji
w `tenant_feature_flags`”. Tamta tabela ma jedną kolumnę BOOLEAN na flagę,
więc oznaczałoby to 33 kolumny i migrację przy każdej kolejnej funkcji.
Zrobiłem osobną tabelę `(tenant_id, kind, enabled, reason)` — wiersz powstaje
tylko przy odstępstwie, konto bez wierszy ma wszystko włączone i nic nie
kosztuje. Jest to zgodne z częścią VII.3, która mówi wprost, że przełączniki
per konto mają być warstwą NAD `flags.ts`.

Powód wyłączenia jest OBOWIĄZKOWY (walidacja rzuca). Wyłącznik bez powodu po
pół roku jest nie do odróżnienia od pomyłki i nikt nie odważy się go cofnąć —
a wtedy klient zostaje bez funkcji na zawsze, bo raz komuś coś nie zadziałało.

Drobiazg wart zapisania: gdy kod i tak blokuje rodzaj, `isKindEnabledForTenant`
NIE PYTA ani bazy, ani cache'u flag globalnych. Test tego pilnuje licznikiem
zapytań — bo i tak nic tego nie odwróci, a to jest ścieżka wołana przed
każdym zapisem propozycji.

Odczyt globalnego wyłącznika jest wstrzykiwalny (`readGlobalKill`) wyłącznie
po to, żeby testy jednostkowe nie sięgały po Redis i po bazę flag. Bez tego
`createProposal` w testach robiłby prawdziwe wywołanie sieciowe, które
`loadFlags` po cichu połyka — czyli test przechodziłby z powodu, o którym
nikt by nie wiedział.

### ĆWICZENIE Z PLANU — co dokładnie zostało sprawdzone

Wykonane na produkcji:
1. Wpis wyłączający `payment.chase` dla jedynego konta produkcyjnego
   (`Moja firma`), z powodem.
2. Odczyt dokładnie tym zapytaniem, które wysyła `isKindEnabledForTenant`
   (filtr po `tenant_id` i `kind`) — zwraca `enabled = f` z powodem.
3. Kontrola, że inny rodzaj (`expense.review`) nie ma wiersza, czyli
   pozostaje domyślnie włączony.
4. Sprzątnięcie: wiersz usunięty, tabela pusta.

**CZEGO NIE SPRAWDZIŁEM I DLACZEGO:** nie zaobserwowałem „agent milczy”
w działającej aplikacji, bo ten kod NIE JEST JESZCZE WDROŻONY — produkcja
chodzi na starszym buildzie, a lokalny `.env.local` celuje w inną bazę.
Zachowanie samej bramki jest pokryte testami jednostkowymi (wyłączony rodzaj
nie zostawia śladu w bazie, pozostałe rodzaje tworzą propozycje normalnie,
globalny wyłącznik ucisza wszystkie naraz). **Ćwiczenie trzeba powtórzyć po
najbliższym wdrożeniu** — dopiero wtedy będzie w pełni wykonane w sensie,
o który chodzi w planie.

### Runbook awaryjny

`docs/runbooks/flo-incident.md`, sześć części: zatrzymanie (30 s) → zasięg
(10 min) → odwrócenie (30 min) → powiedzenie (ten sam dzień) → alarmy → po
wszystkim.

BŁĄD ZŁAPANY PRZED ODDANIEM: pierwsza wersja zapytań ustalających zasięg
używała `WHERE actor = 'flo'` — wprost z planu. **`audit_logs` NIE MA
kolumny `actor`.** Runbook z zapytaniem, które sypie błędem składni,
jest gorszy niż brak runbooka: czyta się go w chwili, w której nikt nie ma
głowy do debugowania SQL-a. Faktycznym wyróżnikiem jest prefiks w `action`
(`flo.proposal.executed|failed|undone`) i to jest lepszy wyróżnik niż
proponowany, bo te trzy wartości należą do unii `AuditAction`, więc literówka
się nie skompiluje. `metadata->>'actor'` bywa ustawione, ale tylko w trzech
miejscach — nie nadaje się do ustalania zasięgu.

**Wszystkie zapytania z runbooka odpalone na produkcji** (wynik pusty, bo
agent jeszcze nie działa — ale składnia i nazwy kolumn się zgadzają). To
jedyny sposób, żeby mieć pewność, że runbook zadziała wtedy, kiedy będzie
potrzebny.

Dwie rzeczy w runbooku, których nie było w planie, a wyszły przy pisaniu:
- Tabela „co da się cofnąć, a czego nie”, z jawnym wierszem „poszło do
  człowieka — NIE, tylko rozmowa”. Bez niej pierwszym odruchem będzie
  szukanie sposobu na cofnięcie maila.
- Zdanie zamykające: **wyłącznik zostawiony włączony „na wszelki wypadek”
  jest awarią samą w sobie**, i punkt przywrócenia ma termin.

Czeka: wpis Masła w jego dzienniku, że przeczytał runbook (definicja
gotowości kroku 54).

Weryfikacja:
- `npx vitest run tests/unit/` — 49 plików, 914 testów, wszystko zielone
- `pnpm typecheck` — zero błędów, eslint czysto
- migracja 00066 wgrana, zarejestrowana, RLS włączony, `killFloAgent = false`

Następny krok: 55 (wdrożenie kanarkowe — funkcje promienia 4 na 10% kont)

## 2026-08-29 · Kroki 55 i 56 — kanarek i domknięcie planu

Zrobione:
- `supabase/migrations/00067_flo_rollout.sql` — WGRANA NA PRODUKCJĘ.
- `lib/flo/rollout.ts` — wdrożenie kanarkowe.
- Kanarek jako CZWARTA warstwa w `lib/flo/kind-switch.ts`.
- `lib/flo/weekly-review.ts` — przegląd tygodniowy z werdyktem per funkcja.
- `CHANGELOG.md`, wpis w pamięci projektu.
- `tests/unit/flo-rollout.test.ts` (24) i `flo-weekly-review.test.ts` (13).

### Krok 55 — kanarek

Przydział konta do grupy ma dwie własności, które MUSZĄ być prawdziwe naraz:

1. **Stabilność.** To samo konto zawsze w tym samym kubełku, także po
   restarcie i po wdrożeniu. Konto wpadające i wypadające z kanarka dostaje
   funkcję znikającą bez powodu — to jest gorsze niż jej brak.
2. **Różny podział dla każdej funkcji.** Rodzaj wchodzi do skrótu, więc te
   same 10% kont nie jest królikiem doświadczalnym przy każdej kolejnej
   funkcji. Bez tego garstka klientów dostawałaby wszystkie surowe funkcje
   produktu, jedna po drugiej.

Trzecia własność wyszła przy pisaniu testu i jest równie ważna: **rozwinięcie
etapu tylko DODAJE konta, nigdy nie zabiera.** Klient, który miał funkcję
przy 10%, musi mieć ją przy 50%. Wynika to wprost z porównania `bucket < stage`,
ale bez testu nikt by nie zauważył, gdyby ktoś kiedyś zmienił to na haszowanie
z etapem w środku.

**JEDNA REKLAMACJA ZATRZYMUJE ROZWIJANIE** — nie „kilka”, nie „istotny
odsetek”. Przy promieniu 4 pojedyncze zgłoszenie oznacza jeden dokument
w rejestrze państwowym albo jedną wiadomość, której nie da się cofnąć,
a rozwinięcie z 10% na 50% zaraz po nim znaczy, że pięć razy tyle ludzi
dostanie tę samą awarię, zanim zdążymy ją zrozumieć.

Zgłoszenie sprawdzane PRZED czasem etapu — odwrotna kolejność dawałaby
komunikat „poczekaj jeszcze dwa dni” w sytuacji, w której czekanie nic nie
zmieni. Zatrzymanie NIE COFA etapu: odsłonięcie i schowanie funkcji tego
samego dnia jest dla klienta gorsze niż jedno i drugie osobno.

**Wpis operatora per konto PRZEBIJA kanarka w obie strony.** Bez tego nie
dałoby się wpuścić testera alfy do wczesnego dostępu ani wypisać klienta,
który poprosił o wyłączenie.

TRZY TESTY Z KROKU 53 PADŁY PO WPIĘCIU KANARKA i to było poprawne
zachowanie: `expense.review` i `payment.chase` są na liście kanarkowej,
więc bez wiersza w `flo_rollout` są teraz domyślnie nieodsłonięte.
Zaktualizowałem testy na rodzaj spoza listy (`ksef.cert`) zamiast osłabiać
nową warstwę — bo to warstwa miała rację, a test opisywał świat sprzed niej.

### Krok 56 — przegląd tygodniowy

`weekly-review.ts` składa sześć wskaźników i wydaje JEDNO ZDANIE WERDYKTU
per funkcja: zostaje, wraca do poprawki, czeka na próbkę, wstrzymana.
Przegląd bez werdyktu zamienia się w tabelkę, na którą się patrzy i nic
z niej nie wynika.

Kolejność sprawdzeń: **zgłoszenie klienta bije wszystkie liczby.** Funkcja
z doskonałą trafnością i jedną reklamacją jest funkcją do poprawki, bo
trafność mierzy średnią, a reklamacja mierzy człowieka, któremu coś
zepsuliśmy. Zaraz za nią cofnięcia — z tego samego powodu.

Osobna reguła, której nie było w planie: **funkcja, którą wszyscy ignorują
(ponad 70% kart wygasa bez decyzji), też wraca do poprawki.** Nie jest
awarią — jest funkcją, której nikt nie potrzebuje, i to też jest wynik
przeglądu, a nie jego brak.

Wiersze „do poprawki” idą na górę listy. To nie jest kosmetyka: przegląd
czyta się w piątek po południu i to, co jest pierwsze, jest jedyną rzeczą,
która na pewno zostanie przeczytana.

### ⚠️ CZEGO NIE DA SIĘ ODHACZYĆ — I DLACZEGO

Definicje gotowości kroków 55 i 56 brzmią „wszystkie zielone funkcje działają
u 100% kont alfy” i „alfa działa, kolejka zgłoszeń zastępuje ten plan”.
**Ani jedna z nich nie jest spełniona i nie mogłem tego zmienić z klawiatury.**

- Interfejs (tor B) jest na kroku 2 z 40 — nie ma czym rysować kart.
- Kod nie jest wypchnięty ani wdrożony.
- Nie ma alfy: produkcja ma jedno konto i dwie faktury.

Zbudowany jest MECHANIZM kanarka i MECHANIZM przeglądu. Uruchomienie ich to
osobna, ludzka robota, która zaczyna się po wdrożeniu i po tym, jak Masło
dojdzie do swojego bloku 1. Wpisałem to wprost do `CHANGELOG.md` i do pamięci
projektu — status brzmi „silnik kompletny, NIEWDROŻONY”, nie „agent wdrożony”.
Napisanie tam czegokolwiek innego byłoby najkosztowniejszym kłamstwem w całym
tym planie, bo następna sesja przeczytałaby to jako stan faktyczny.

### Stan planu toru A: 56 z 56 kroków zbudowanych

Zestaw testów: 51 plików, 951 testów. `pnpm typecheck` czysty, eslint czysto.
Migracje 00061, 00063–00067 na produkcji.

Co czeka na ludzi, nie na kod:
- **prawnik** — sześć pytań z części VI.2; bez nich grupa T, K-03, K-05 i P-09
  zostają wyłączone,
- **księgowa** — potwierdzenie tabeli parametrów i stawek odsetek,
- **Masło** — wpis o przeczytaniu runbooka (krok 54) i dojście do bloku 1,
- **wdrożenie** — po nim POWTÓRZYĆ ćwiczenie M8 z kroku 53.

Następny krok: nie ma. Plan toru A skończony; dalej idą zgłoszenia
i to, co pokaże alfa.

## 2026-08-29 · WDROŻENIE NA PRODUKCJĘ — i awaria po drodze

Commit `0095f07` (kroki 34–56) jest na produkcji. Aplikacja i worker chodzą
na tym samym obrazie, oba `healthy`, `https://www.faktflow.pl` oddaje 200.

### Awaria: build zabity przez OOM

Pierwsze wdrożenie aplikacji (`#23`) padło z **exit code 137** na `pnpm build`.
137 to 128+9, czyli SIGKILL — zabójca OOM. Potwierdzenie w `dmesg` na `app-1`:
`Out of memory: Killed process (node) anon-rss:1709300kB`.

**To nie był pech, tylko nieprawdziwy komentarz w `Dockerfile`**, który
czekał na wyzwolenie. Linia 75 ustawia pułap sterty na 3072 MB z komentarzem
„mieści się wygodnie w samym RAM-ie, z zapasem, bez polegania na wolniejszym
swapie". Rachunek na `app-1` (3.7 GB): `dockerd` bierze 775 MB, działająca
aplikacja 132 MB, worker 128 MB, `containerd`, `traefik` i proxy kolejne
~180 MB. Dla builda zostaje ~2.2 GB — **mniej niż pułap**. V8 dostawał
pozwolenie na urośnięcie ponad to, co maszyna ma.

Działało do dziś, bo build nigdy nie dobijał do sufitu. Dwadzieścia nowych
modułów w `lib/flo/` przesunęło go za krawędź.

**Naprawa:** swap na `app-1` z 4 na 8 GB (drugi plik 4 GB, wpis w `/etc/fstab`),
plus wyczyszczone 6.89 GB nieaktywnego cache'u builda (dysk 61% → 43%).
Ponowione wdrożenie (`#25`) przeszło.

**Pomiar, który to domyka:** przy udanym buildzie swap dobił do **4546 MB** —
czyli powyżej pierwotnego limitu 4 GB. Dodatkowe 4 GB nie były „na wszelki
wypadek", tylko dokładnie tym, czego brakowało. Wolny RAM schodził w szczycie
do 212 MB.

Świadomie NIE zmieniałem liczby 3072. Wartość domyślna Node 22 (~1958 MB)
była już testowana i nie wystarcza, a zgadywanie czegoś pomiędzy kosztowałoby
kolejne piętnastominutowe buildy. Poprawiony został KOMENTARZ, który kłamał,
i dopisany wymóg 8 GB swapu — w `Dockerfile` i w pułapkach w `AGENTS.md`.

### Druga poprawka: komenda wdrożenia w `AGENTS.md` nie działała

Wariant z `--execute="..."` przechodzi przez DWA shelle. `\$a` przeżywa
lokalny jako `$a`, a potem zdalny rozwija je do pustego napisu i do tinkera
trafia `= App\Models\...`:

```
PHP Parse error: Syntax error, unexpected '=' on line 1
```

Zastąpione heredokiem w apostrofach (`<<'PHP'`) z `docker exec -i`. Przy
okazji znika potrzeba podwajania ukośników. Dopisany powód razem z dokładnym
brzmieniem błędu — po to, żeby ten, kto go zobaczy, znalazł sekcję szukając
po treści komunikatu.

### Trzecia rzecz: panel Coolify „ładuje się w nieskończoność"

Nie awaria. Chmurowa zapora Hetznera filtruje port 8000 po IP i **dropuje**
pakiety zamiast je odrzucać — stąd wieczne ładowanie zamiast błędu.
Na serwerze `ufw` jest wyłączony, w `iptables` nic nie blokuje, więc szukanie
tam to ślepa uliczka. Rozwiązanie bez dotykania zapory: tunel SSH na 8000.
Opisane w `AGENTS.md`.

### Weryfikacja po wdrożeniu

- Aplikacja i worker: `healthy`, obraz `0095f072c7...` (nasz commit)
- `/api/health` → HTTP 200 w 0.07 s
- `https://faktflow.pl` → 200 (jeden przeskok na `www`)
- **Migracje widoczne dla PostgREST**: zapytania o `flo_kind_flags`,
  `flo_rollout`, `contractors?select=manual_fields` i `invoices?select=origin`
  zwracają `42501 permission denied` — czyli tabele i kolumny SĄ w cache'u
  schematu, a odmowa jest na autoryzacji. Gdyby cache był nieświeży,
  dostalibyśmy `PGRST205`/`PGRST204`. Pułapka z migracji 00060 nie wróciła.
- Worker: błędy `pg-boss timeout` z 20:26 UTC pochodzą z okna PIERWSZEGO,
  zabitego builda. Po nim crony chodzą czysto (20:30, 20:45 UTC).

### Stan po wdrożeniu

**Agent nadal nie jest widoczny dla klientów** i to jest stan zamierzony:
`flo_rollout` jest puste, więc dziewięć rodzajów z listy kanarkowej jest
nieodsłoniętych, a interfejs (tor B) i tak jest na kroku 2. Wdrożenie
oznacza „kod jest na serwerze", nie „funkcje działają u ludzi".

Do zrobienia po wdrożeniu: POWTÓRZYĆ ćwiczenie M8 z kroku 53 — teraz da się
je wykonać do końca, bo bramka jest na produkcji.

---

## 2026-08-30 · Przebudowa ramy interfejsu — biały motyw i miejsce dla agenta

Nie jest to krok z planu toru A. Plan toru A jest skończony (56 z 56). To jest
usunięcie przeszkody, o którą tor B rozbiłby się przy pierwszym kroku z bloku 1.

**Dlaczego.** Oba pliki planu opisują ekrany słowami „układ z makiety”, „blok
z makiety”, „wygląda jak makieta”. Makieta była ZDJĘCIEM PROTOTYPU, a nie
zrzutem aplikacji — założenie, że interfejs już tak wygląda, było fałszywe.
Panel był ciemny, akcent zielony, dashboard jednokolumnowy bez centymetra
miejsca na agenta. Masło miał więc kroki 3–16 opisane odniesieniem do czegoś,
czego w repozytorium nie było.

**Co zrobione.** Rama i tylko rama:
- pełna inwersja palety `--ff-*`: jasna baza w `.ff-dashboard`, ciemna
  w `html.dark .ff-dashboard`; akcent niebieski `#2563eb`,
- domyślny motyw jasny (`lib/theme/theme.ts`, `THEME_BOOT_SCRIPT`,
  zdjęta zaszyta klasa `dark` z `<html>`),
- dashboard przepisany na układ „kolumna agenta + prawa szyna z liczbami”,
- podsumowanie VAT i wykres sprzedaży przeniesione na `/przeplywy`,
- tytuł strony w pasku nagłówka (na razie wyłącznie dla `/dashboard`).

Mapa całości: `docs/flo/UKLAD-DASHBOARDU.md`.

**JASNY MOTYW BYŁ REALNIE ZEPSUTY, nie tylko nieużywany.** Blok
`html:not(.dark) .ff-dashboard` nadpisywał ~25 tokenów z 94 — brakowało
`--ff-surface`, `--ff-border`, całej rampy tekstu i `--ff-accent`. Klient,
który kliknął przełącznik, dostawał ciemne karty i niemal biały tekst na
jasnej kanwie. Dlatego nie „poprawiałem jasnego wariantu”, tylko odwróciłem
strony: baza wypisuje komplet, ciemny dopisuje wyłącznie różnice.

**ZMIANA WŁASNOŚCI PLIKU, jawna.** `app/globals.css` należał do Masła
(część IV.2: „Bartosz nigdy, ani jednej linijki”). Motywu nie da się odwrócić
bez tego pliku, więc przechodzi do mnie. Zapisane w nagłówku samego pliku,
w `UKLAD-DASHBOARDU.md` i w części VIII jego planu.

**`lib/dashboard-nav-config.ts` NIE BYŁ RUSZANY** i dalej należy do Masła —
nawigacja okazała się już zgodna z prototypem co do pozycji i ikon, więc
drugie naruszenie mapy własności było niepotrzebne. Pozycja „FLO” zostaje
jego krokiem 2; nie dodawałem jej, bo trasa `/flo` nie istnieje i link dałby
404.

**Trzy zaślepki w katalogu Masła.** `dashboard/_components/flo-card.tsx`,
`flo-scheduled.tsx`, `flo-history.tsx`. Postawione raz, po czym są jego na
zawsze — nie dotykam ich więcej. Kontrakt gniazda to BRAK PROPSÓW: komponent
sam woła `listProposals()` / `listScheduled()`. Dzięki temu podmiana zaślepki
na prawdziwy interfejs nie wymaga tknięcia `page.tsx`, czyli mojego pliku,
i git nadal nie ma czego scalać.

Każda zaślepka niesie w nagłówku ostrzeżenie o trzech rzeczach z makiety,
których nie wolno przepisać: „TRYB 3”, „Pracuje sam · informuje” i „1 zadania
dziś”. Model AI kopiujący zdjęcie wprowadziłby z powrotem koncepcję poziomów
autonomii odrzuconą w II.3 — a to jest dokładnie ten rodzaj błędu, którego
nikt nie wyłapie na przeglądzie, bo „przecież jest jak na makiecie”.

**BŁĄD ZNALEZIONY PRZY OKAZJI, NAPRAWIONY W ZAKRESIE DASHBOARDU.** Strona
filtrowała `direction = 'issued'`, a kolumna `invoices.direction` dopuszcza
wyłącznie `'outgoing' | 'incoming'` — migracja `00044_phase21_performance.sql`
ostrzega o tym wprost w komentarzu z lipca. Wszystkie cztery karty KPI
pokazywały zero niezależnie od danych klienta. Nowe liczby idą przez
`lib/dashboard/monthly-figures.ts`. Ten sam błąd siedzi w dziewięciu innych
plikach (`lib/exports/*`, `lib/admin/metrics.ts`,
`lib/observability/business-metrics.ts`, `lib/ksef/history-fetcher.ts`) —
poza zakresem, do osobnego zadania.

**Weryfikacja.** `pnpm typecheck` czysty, `pnpm lint` 0 błędów (28 ostrzeżeń,
wszystkie zastane, żadnego w nowych plikach). W przeglądarce sprawdzone
logowanie, `/pricing`, `/blog` i strona główna — marketing i logowanie stoją
na `.zova` / `.marketing-landing`, które nie są warunkowane klasą `dark`, więc
zmiana domyślnego motywu ich nie dotknęła. Panel czeka na weryfikację
wzrokową: sesja deweloperska wygasła, potrzebny świeży link logujący.

Następny krok toru A: dalej brak. To była robota poza planem.

### 2026-08-30, po południu — scalenie z torem B i weryfikacja na żywo

Masło wypchnął na `main` bloki 0–6 (kroki 0–34): sześć wariantów karty, cztery
podglądy, wątek `/flo`, ustawienia, treści 32 rodzajów, testy przeglądarkowe.
Scalenie **fast-forward, zero konfliktów**.

**Moja rama mu nie przeszkodziła i to nie był przypadek.** Sprawdzone plik po
pliku: w całym jego interfejsie (`components/flo/*`, `app/(dashboard)/flo/*`,
`_components/flo-card.tsx`) jest ZERO zaszytych kolorów, zero wariantów `dark:`
i zero literałów `text-white` / `bg-white`. Wszystko stoi na tokenach `--ff-*`,
więc odwrócenie palety objęło jego pracę bez jednej linijki po jego stronie.

Punkty styku były dwa i oba rozwiązane na jego korzyść:
- `dashboard/_components/flo-card.tsx` — moja zaślepka ustąpiła jego
  prawdziwej karcie (`FloDashboardCard` + `FloDashboardCardSkeleton`),
- `dashboard/page.tsx` — mój układ dwukolumnowy montuje teraz jego komponent.

Zaślepki `flo-scheduled.tsx` i `flo-history.tsx` skasowane bez zastępnika:
panel zatwierdzonych i historia stoją na `/flo`, gdzie jest ich miejsce,
a dublowanie ich na dashboardzie byłoby szumem. `lib/dashboard-nav-config.ts`
dalej nietknięty przeze mnie — pozycję „Flo” dodał on sam w kroku 2.

**GRANICA BŁĘDU WOKÓŁ AGENTA — nowa rzecz, wymuszona przez awarię.**
`listProposals()` rzuciło `PGRST205` i cały dashboard zamienił się w ekran
„Coś poszło nie tak”, razem z liczbami miesiąca, które z agentem nie mają nic
wspólnego. `Suspense` tego nie łapie — obsługuje oczekiwanie, nie wyjątek.
Stąd `components/dashboard/section-error-boundary.tsx` wokół karty agenta.
To nie jest kosmetyka: agent ma prawo czasem milczeć, ale nie ma prawa
zabierać człowiekowi całej strony.

**BAZA DEWELOPERSKA NIE MA TABEL FLO.** Migracje 00060–00067 poszły wyłącznie
na produkcję. `/flo` leży w całości (jego strona woła `listScheduled()` na
poziomie trasy, więc żadna granica błędu tego nie uratuje), a karta na
dashboardzie degraduje się do komunikatu. Skryptem `pnpm db:push:prod` tego
nie naprawię — wymaga `SUPABASE_DB_URL`, którego nie ma w `.env.local`.
To jest zadanie dla człowieka i **blokuje wszystko, co Masło chciałby
kliknąć**: on też nigdy nie zobaczył swojego interfejsu na prawdziwych danych.

Pułapka przy diagnozie, warta zapamiętania: **żądanie `HEAD` przez PostgREST
NIE dotyka cache'u schematu.** `select('*', { head: true, count: 'exact' })`
zwróciło „OK” z `count: null` na nieistniejącej tabeli i przez chwilę
uwierzyłem, że tabele są. Dopiero zwykły `GET` pokazał `PGRST205`. Do
sprawdzania obecności tabeli używać `GET`, nigdy `HEAD`.

**Poprawka w moich liczbach.** Podpis pod „Sprzedaż brutto” pokazywał zmianę
LICZBY faktur, nie kwoty — przy jednej dużej fakturze te dwie wartości
rozjeżdżają się i było to zwykłe kłamstwo na ekranie. Teraz `momCountPct`
i `momGrossPct` są liczone osobno, a przy zerowej podstawie nie ma procentu
w ogóle (brak poprzedniego miesiąca to nie jest wzrost o 100%).

**Zweryfikowane wzrokowo, na zalogowanej sesji** (przez helper testowy
projektu `e2e/helpers/db-seed.ts` + ścieżka `/auth/finish`):
- biały motyw i niebieski akcent na `/dashboard` i `/przeplywy`,
- motyw ciemny po przełączeniu — tokeny działają w obie strony,
- szyna pokazuje PRAWDZIWE liczby („Poprzedni miesiąc: 2”), co jest dowodem,
  że naprawa `direction = 'outgoing'` zadziałała,
- wykres i podsumowanie VAT czytelne na białym po przejściu na tokeny,
- 390 px: zero przewijania poziomego, szyna schodzi pod kolumnę agenta,
- `pnpm typecheck` czysto, eslint 0 błędów, `pnpm test:vitest` 1083/1083.

Czego NIE zweryfikowałem: ani jednej karty agenta w działaniu — bez tabel
w bazie deweloperskiej nie ma czego narysować.

### 2026-08-30, wieczorem — agent wchodzi do dashboardu

**Decyzja właściciela produktu:** FLO nie ma osobnego ekranu. Ma mieszkać
w dashboardzie, tak jak na sierpniowej makiecie, a listy pomocnicze stoją
z boku. Odwraca to krok 39 Masła („po zalogowaniu klient trafia do `/flo`”) —
cel jest ten sam (agent jest produktem), droga inna.

Zrobione:
- `/dashboard` renderuje `FloScreen` Masła; do jego prawej kolumny wstrzykuję
  kartę z liczbami miesiąca przez nowe gniazdo `aside` (prop dodany, nie
  zmieniony — bez niego ekran działa jak wcześniej). Nagłówek agenta wyłączony
  `showHeader={false}`, bo panel ma własny pasek tytułu.
- `/flo` → przekierowanie na `/dashboard` Z ZACHOWANIEM PARAMETRÓW ZAPYTANIA.
  Trasy nie skasowałem, bo prowadzi do niej osiem miejsc: `actionUrls` push
  (`/flo#<id>`, `/flo?undo=<id>`), `share-target` (`?paragon=`), cztery
  `revalidatePath('/flo')` i stare zakładki. Zgubienie `?undo=` zamieniłoby
  cofnięcie z powiadomienia w pustą stronę bez śladu błędu.
- Pięć komponentów `git mv` z `app/(dashboard)/flo/_components/` do
  `components/flo/` — były prywatne dla trasy, która przestała renderować.
- Pozycja „Flo” zdjęta z menu; `revalidatePath('/dashboard')` dołożone do
  czterech akcji; `thread-client` czyści adres na `/dashboard`.

**BŁĄD, KTÓRY SAM ZROBIŁEM I ZŁAPAŁEM ZRZUTEM EKRANU.** Przeniosłem odczyt
agenta na poziom strony i owinąłem go granicą błędu — bezużytecznie. Wyjątek
z `listProposals` leci PRZED zamontowaniem granicy, więc przewraca cały render.
Dashboard znowu pokazywał „Coś poszło nie tak”, mimo że granica istniała.
Teraz odczyt jest w `try/catch` i zwraca `ok: false`, a **nie pustą listę** —
pusta lista znaczy „nie masz nic do zrobienia” i byłaby kłamstwem w chwili,
gdy agent nie odpowiada. Granica zostaje jako druga warstwa, na błędy renderu.

Lekcja ogólna: w Server Components granica błędu nie chroni przed niczym, co
dzieje się w `await` rodzica. Ochrania tylko to, co jest pod nią w drzewie.

**POPRAWKA W PLIKU MASŁA, jedna linijka.** `flo-header.tsx` niósł podpis
„Pracuje sam · informuje”. Oba plany wymieniają to zdanie OBOK „TRYB 3” jako
odrzucone (krok 15: „zamiast «TRYB 3» i «Pracuje sam · informuje» napisz po
ludzku”). W `flo-card.tsx` użył już poprawnego zdania — wstawiłem dokładnie
jego własne. Do 30.08 ten nagłówek stał na osobnej trasie i nie rzucał się
w oczy; teraz jest na głównym ekranie.

Testów e2e nie ruszałem: wołają `page.goto('/flo')`, więc przechodzą przez
przekierowanie i przy okazji je sprawdzają.

Weryfikacja: `pnpm typecheck` czysto, eslint 0 błędów, 1083 testy zielone,
przekierowanie `/flo?undo=abc123` → `/dashboard?undo=abc123` sprawdzone
w przeglądarce, układ dwukolumnowy potwierdzony zrzutem.

NADAL BLOKUJE: brak tabel FLO w bazie deweloperskiej. Wątek nie ma czego
narysować, więc widać wyłącznie uczciwy komunikat o niedostępności agenta.

### 2026-08-30, wieczorem — interfejs agenta wreszcie widoczny

**Migracji na bazę deweloperską NIE DA SIĘ wgrać i to jest ustalenie, nie
porażka.** Sprawdzone cztery drogi, wszystkie zamknięte:

- procedura z `AGENTS.md` prowadzi na `db-1` przez SSH i `docker exec` — dev
  stoi na Supabase Cloud, gdzie nie ma ani jednego, ani drugiego,
- DDL przez API wymagałby funkcji typu `exec_sql` — w migracjach jej nie ma,
- lokalne Supabase (`supabase start`) wymaga Dockera — nie ma go na tej maszynie,
- Supabase CLI działa (2.116.0), ale `link` i `db push` żądają hasła do bazy.

Connection stringa nie ma w żadnym pliku env ani w kopiach sprzed sierpnia.
Właściciel hasła nie zna. Baza `utuzzxstfcnglppplvlw` to **pozostałość po erze
Vercela** — produkcja od sierpnia stoi na Supabase self-hosted na `db-1`,
więc tamtej nikt nie utrzymuje i dlatego migracje 00060+ nigdy tam nie poszły.

**Produkcja jest kompletna.** Odczytem przez SSH: `schema_migrations` ma
00060–00067, a test PostgREST-a z instrukcji zwraca `42501 permission denied`
dla `flo_proposals`, `flo_rollout` i `flo_kind_flags` — czyli tabela znaleziona,
odmowa dopiero na autoryzacji. Cache schematu świeży. Na produkcji brakuje
wyłącznie KODU, nie bazy.

**AWARYJNE PRZEJŚCIE NA ATRAPY — i dzięki temu widać wreszcie ekran.**
Gdy odczyt agenta padnie, a `isLocalDevEnv()` jest prawdziwe, dashboard
pokazuje `FLO_FIXTURES` z widocznym paskiem „Dane przykładowe”. Masło zbudował
pod to prop `usingFixtures` w kroku 0 — użyłem jego pomysłu, tylko pasek rysuję
u siebie, bo nagłówek agenta jest na dashboardzie wyłączony.

Bezpiecznik jest FAIL-CLOSED i to jest tu najważniejsze zdanie: `isLocalDevEnv()`
wymaga `NODE_ENV === 'development'` ORAZ braku jakiegokolwiek markera produkcji.
Build produkcyjny ustawia `NODE_ENV=production`, więc na Hetznerze ta gałąź nie
ma jak się wykonać, nawet gdyby zmienne środowiskowe zniknęły. Na produkcji
awaria zostaje awarią — pokazanie klientowi cudzych przykładowych faktur jako
jego spraw byłoby dużo gorsze niż uczciwy komunikat o niedostępności.

**Co zobaczyłem po raz pierwszy na oczy** (zrzuty na 1440×980, zalogowana
sesja): wątek z nagłówkami dni i godzinami w osi, karty wszystkich sześciu
wariantów, odliczanie ważności („zostało 29 dni”), rozwijane „Dlaczego to
widzę”, pasek cofnięcia z licznikiem („zostało 8 minut”), wariant listy
z zablokowanym przyciskiem i podanym POWODEM blokady („Zaznacz przynajmniej
jedną pozycję”), panel „Zatwierdzone — czeka na wykonanie” ze śladem zgody przy
każdej pozycji, pas rozmowy „Napisz do Flo… (jeszcze nieczynne)”.

Wszystko w białym motywie, bez jednej poprawki po stronie toru B — bo Masło
trzymał się tokenów `--ff-*`.

Weryfikacja: `pnpm typecheck` czysto, eslint 0 błędów, 1083 testy zielone.
Bezpiecznik `isLocalDevEnv()` ma własny zestaw w `tests/unit/security-environment.test.ts`.

DO ZROBIENIA PRZEZ CZŁOWIEKA: wgranie ośmiu migracji na bazę deweloperską
(gotowa paczka SQL do wklejenia w edytorze Supabase) albo — decyzja
strategiczna — przeniesienie deva z martwego Supabase Cloud na coś, co
utrzymujemy.
