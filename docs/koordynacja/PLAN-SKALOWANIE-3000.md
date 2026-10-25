# Plan skalowania: 3000 aktywnych userów

> **Jak zacząć sesję:** napisz „Kontynuuj plan skalowania 3000, sesja N”.
> Agent czyta ten plik, robi checklistę z sekcji 0 i TYLKO wskazaną sesję
> według „Protokołu naprawy błędu” z `AGENTS.md`. Na końcu dopisuje wiersz
> w dzienniku (sekcja 6) z numerem PR.

## Po co ten plan

Zlecenie Bartosza (23.10.2026): przygotować aplikację na 3000 aktywnych
userów **bez zakupu droższych serwerów** (serwery podnosimy razem
z przybytkiem userów, kod ma być gotowy), umożliwić skalowanie **bez
zmieniania całej struktury**, sprawdzić kod pod kątem jakości i szybkości,
zbadać wąskie gardła.

Analiza (24.10.2026, stan `main` 6005c15f) przeszła przez 10 obszarów, a każdy
obszar sprawdził osobny weryfikator. Wyszło 185 ustaleń: 8 KRYT, 51 WYS,
85 ŚRED, 41 NISK, wiele z nich to te same sprawy widziane z różnych stron.
**Pełny raport z dowodami (plik:linia) i rachunkami jest prywatny**
(artefakt „Pojemność FaktWay”, link u Igora i Bartosza). Repo jest publiczne,
a raport opisuje też słabe punkty konfiguracji. Ten plik mówi tylko, co
naprawiamy i w jakiej kolejności.

## Wynik w skrócie

- **Dziś obecny sprzęt i kod nie uciągną 3000 aktywnych userów.** Według
  Bartosza (25.10) serwer bazy nie ma 4 rdzeni i 8 GB. Najpewniej to
  „wariant budżetowy” z `docs/migration/PRZEPROWADZKA-HETZNER.md` §1.7:
  3× CX23, każdy 2 vCPU / 4 GB / 40 GB (typ do potwierdzenia). Na takim
  db-1 jest dziś miejsce na ok. 200–500 aktywnych. Po sesjach kodu,
  Storage Boxie, wyłączeniu Logflare i strojeniu bazy pod 4 GB: ok.
  800–1500 (środek 1000–1200). Na 3000 trzeba db-1 z 8 vCPU / 16 GB
  i dysku poza 40 GB, a do tego etapów z sekcji 4 (repliki aplikacji
  z jednego obrazu, worker na osobnej maszynie). Żaden z nich nie wymaga
  przebudowy architektury.
- **Największa dźwignia to sprawdzanie sesji.** Produkcja podpisuje sesje
  kluczem HS256 (publiczny JWKS jest pusty), więc `getClaims()` woła GoTrue
  przez sieć. Proxy robi to 3 razy na każde chronione żądanie, a widok
  panelu łącznie ok. 6 razy.
- **Ruch w tle jest tak duży jak ruch z kliknięć:** baner KSeF co 30 s
  z każdej karty przez pełną bramkę logowania, prefetch 13 tras po każdym
  wejściu, `router.refresh()` co 4 s przy eksportach, telemetria przez proxy.
- **Joby nie są gotowe na tysiące firm:** skrzynka KSeF przestaje nadążać od
  ok. 1000 firm z KSeF (4 sloty, pełne logowanie w każdym przebiegu, rozsyłka
  bez deduplikacji). Kolejki z `batchSize` działają po jednym zadaniu.
  `singletonKey` na polityce `standard` niczego nie deduplikuje.
- **Czas jest groźniejszy niż userzy:** nocna kopia JSON trzyma całą bazę
  w pamięci workera, sprzątanie dzienników nie mieści się w limicie 8 s,
  dysk db-1 (przy CX23 tylko 40 GB) zapełnią 14 lokalnych zrzutów
  i dzienniki, a dysk z plikami — pełnowymiarowe zdjęcia paragonów.
- **Już dziś nie działa:** upload zdjęcia paragonu powyżej 1 MB (domyślny
  limit Server Actions).

## 0. Checklista startowa (każda sesja)

1. `git fetch origin` i nowa gałąź od `origin/main`:
   `git switch -c claude/skal-<N>-<temat> origin/main`. Nigdy od lokalnego `main`.
2. Przeczytaj w `AGENTS.md` „Protokół naprawy błędu” i „Co NIE robić”.
3. Przeczytaj swoją sesję w sekcji 3 i ustalenia, które wskazuje. Jeśli
   masz dostęp do prywatnego raportu, przeczytaj tam pełne wpisy.
4. Sprawdź, czy otwarty PR nie rusza tych samych plików:
   `gh pr list --state open --json number,title,headRefName`.
5. Worktree bez `node_modules`: `pnpm install --frozen-lockfile`.
6. Sprawdź, czy kod nadal wygląda tak, jak opisuje sesja. `main` idzie do
   przodu, więc ustalenie mogło się zmienić albo zniknąć.

## 1. Zasady tego planu

- **Jedna sesja = jedna gałąź = jeden PR.** Najpierw czerwony test, potem
  naprawa (protokół z `AGENTS.md`).
- **Pomiar przed i po w opisie PR.** Przy wydajności czerwony test to
  zwykle licznik: wywołań GoTrue na żądanie, zapytań na render, zadań
  w kolejce, rozmiaru pamięci. Liczba przed i po naprawie trafia do opisu.
- **Migracje (sesje 20–21):** sesja przygotowuje plik z numerem z rejestru
  w `CLAUDE-DO-CODEXA.md` i opisuje, czy wgrać go przed, czy po wdrożeniu.
  Wgrywa Bartosz.
- **Wdrożenie, zmienne środowiskowe, konfiguracja serwerów:** tylko
  Bartosz. Sesja 25 to jego lista decyzji.
- **Szczegóły słabych punktów** (limity, konfiguracja logowania) opisuj
  w PR ogólnikowo. Pełne wpisy są w prywatnym raporcie.
- **Twierdzenia o stanie produkcji** z repo (komentarze, dokumenty) to
  hipoteza. Rozstrzyga odczyt (sekcja 5).

## 2. Model obciążenia (założenia)

| Co | Założenie |
|---|---|
| Userzy i firmy | 3000 aktywnych (logują się co tydzień), ok. 2500 firm, ok. 2000 z KSeF |
| Szczyt | 9–11 w dni robocze: 400–600 sesji naraz; dni terminów (20., 25., koniec i początek miesiąca) ×3 |
| Ruch | 20–40 żądań/s z kliknięć zwykle, 100–150 w dni terminów, plus ruch w tle |
| Dokumenty | 40 wystawionych + 60 odebranych faktur na firmę miesięcznie; szczyt wysyłek 1–2 tys./h; 15 paragonów OCR na firmę |
| Serwery | app-1 CX23 (2 vCPU, 4 GB): aplikacja, worker, Redis, buildy. db-1: cały Supabase; analiza 24.10 liczyła CPX32 (4 vCPU, 8 GB, 160 GB), korekta 25.10: najpewniej CX23 (2 vCPU, 4 GB, 40 GB). Typy do potwierdzenia (sekcja 5) |

Po pierwszych tygodniach z prawdziwym ruchem podmień założenia na liczby
z produkcji (sekcja 5).

## 3. Sesje

Numer sesji to identyfikator, nie kolejność. Rozmiar: S = do kilku godzin,
M = dzień. Identyfikatory ustaleń odsyłają do prywatnego raportu (numeracja
inna niż w „Rejestrze braków” z 17.10).

**Kolejność wykonania (25.10, dla db-1 = CX23: mały dysk i RAM idą
pierwsze):** 23 → 22 → 20 → 26 → 4 → 1 → 2 → 8 → 9 → 19 → 21 → 13 → 14 →
17 → 5 → 6 → 7 → 3 → 12 → 18 → 10 → 11 → 24, a na końcu 15 i 16.
Sesje 15 i 16 dokładają obciążenie bazy, więc na CX23 robi się je po
pomiarze i z niższymi wartościami: wysyłka 6–8 slotów, OCR
i kategoryzacja 2–3.

| # | Sesja | Typ | Kto | Rozmiar | Ustalenia | Gotowe, gdy |
|---|---|---|---|---|---|---|
| 1 | Baner KSeF: odpytywanie tylko widocznej karty co 120 s, `/api/ksef/health` bez weryfikacji sesji w proxy, wynik w pamięci 15 s | kod | sesja | S | REQ-03, CAC-01, HOR-07, CPU-02 | Odpytanie z ciasteczkiem sesji nie woła GoTrue; ukryta karta nie odpytuje |
| 2 | Ścieżki techniczne (`/ingest`, `/monitoring`, `sw.js`, manifest, robots, sitemap) omijają tworzenie klienta Supabase w proxy | kod | sesja | S | REQ-05, CAC-04, CPU-08 | Test: te ścieżki nie tworzą klienta; trasy o podobnym prefiksie dalej chronione |
| 3 | Flo: `expireStale` i `releaseStuck` jednym UPDATE z warunkiem w zapytaniu zamiast listy id w adresie; izolacja błędów prologu pulsu | kod | sesja | S | FLO-01 | Test z 500 wygasłymi kartami: jedno żądanie o stałej długości, idempotentne |
| 4 | Zdjęcia paragonów zmniejszane w przeglądarce (≤ 2000 px, JPEG ok. 0,8) + czytelny komunikat przy zbyt dużym pliku; PDF bez zmian | kod | razem | S | EXT-09, HOR-V1, LIM-08, CPU-06, DBC-02, BCK-09 | Plik 4 MB wychodzi jako < 1 MB; Bartosz decyduje o oryginale |
| 5 | Limity czasu `fetch` w klientach Supabase (proxy krótko, RSC i akcje ok. 10 s, admin w workerze dłużej); przekroczenie = 503, nie wylogowanie | kod | sesja | S | REQ-V01, QRY-V1, LIM-05 | Test z atrapą, która nie odpowiada: 503 po limicie |
| 6 | Klient Redisa: 1 ponowienie, limit czasu ok. 500 ms, krótki obwód „Redis niedostępny”, ping w healthchecku z osobnym limitem | kod | sesja | S | HOR-05, LIM-04 | Niedostępny Redis daje błąd po ≤ 500 ms |
| 7 | Błąd infrastruktury ≠ brak dostępu: 5xx/429/timeout GoTrue i błąd zapytania o członkostwo → „spróbuj ponownie”, osobny komunikat i log dla 429 | kod | sesja | S | REQ-V02, GTR-03, QAL-06 | 429/503 nie zwraca `unauthenticated` ani przekierowania na `/onboarding`; fail-closed zostaje |
| 8 | Proxy: 1 wywołanie GoTrue zamiast 3 (claims z tokenu po udanym `getUser(token)`, `getClaims()` tylko tam, gdzie decyduje o trasie publicznej) | kod | razem | M | REQ-01, QRY-01, QAL-02, DBC-06 | Licznik wywołań `/auth/v1/user` na żądanie chronione: 3 → 1; testy MFA (AUD-58) zielone; przegląd Bartosza |
| 9 | Deduplikacja sesji w RSC: layout przez `getDashboardSessionUser`, `getPageContext` w `cache()`, tytuły pomocy liczone raz | kod | sesja | S | REQ-04, CAC-09, CPU-14 | 1 `getUser` i 1 zapytanie o członkostwo na render |
| 10 | Prefetch: bez `prefetch={true}` w dolnym pasku, krótsza lista `PrefetchDashboardRoutes`, reszta przy najechaniu | kod | sesja | S | REQ-02, QRY-V2, CAC-03, CPU-09 | Pomiar liczby żądań po wejściu na panel przed i po |
| 11 | Odpytywanie eksportów, importów i OCR lekką akcją statusu; `router.refresh()` raz po zmianie statusu; rosnący odstęp | kod | sesja | S | REQ-08, CAC-V01, CAC-10 | Takt odpytywania nie woła `router.refresh()`, dopóki status się nie zmieni |
| 12 | Kopia JSON: bezpiecznik rozmiaru (alarm „kopia niepełna” zamiast awarii workera), stronicowanie po kluczu; weryfikacja bez parsowania całego pliku | kod | sesja | S | JOB-02, QAL-01, CPU-03, CPU-V2 | Atrapa ponad progiem: jeden alarm, worker żyje |
| 13 | Rozsyłka skrzynki: tylko żywe firmy (nieusunięte, aktywne, z ważnym certyfikatem), pominięcie firm z czekającym zadaniem, lista po kluczu, wstawianie paczkami, `localConcurrency` z env | kod | sesja | M | JOB-01, EXT-01, HOR-03, LIM-01, JOB-V1, LIM-V-02, JOB-11, JOB-V3 | Druga rozsyłka przy czekającym zadaniu nic nie dodaje; lista > 1000 firm kompletna |
| 14 | Sesja KSeF: odświeżanie przez refresh token zamiast pełnego logowania XAdES; pełne logowanie dopiero po odrzuceniu (KSEF-08 z rejestru 17.10) | kod | razem | M | EXT-01, HOR-04, JOB-01 | Testy cache sesji + próba na KSeF TEST |
| 15 | Wysyłka do KSeF: 2–3 sloty na firmę, 10 (potem do 15) slotów razem, z pomiarem pamięci | kod | sesja | S | JOB-03, EXT-02, LIM-02 | Konfiguracja kolejki w teście; p95 czasu przed i po w opisie PR |
| 16 | Kolejki „równoległe”: `batchSize: 1` + `localConcurrency` (OCR, kategoryzacja, import, eksporty, paczki księgowego) + `groupId` = firma | kod | sesja | S | JOB-04, EXT-05, LIM-03, QAL-V01 | `tests/unit/joby-rownoleglosc.test.ts` rozszerzony; wszyscy nadawcy ustawiają grupę |
| 17 | Duble w skrzynce: wczesne wyjście w kategoryzacji, backfill pomija faktury z czekającym zadaniem; poprawione komentarze o `singletonKey` | kod | sesja | S | JOB-06, EXT-V1, LIM-06, QAL-V02, CPU-V1 | Drugie zadanie dla tej samej faktury kończy się jednym odczytem, bez pobrania XML i bez AI |
| 18 | Ponaglenia: najpierw firmy z włączonymi ponagleniami, kandydaci paczkami, przetwarzanie strona po stronie | kod | sesja | S | DB-03, JOB-08 | Firma z wyłączonymi ponagleniami nie jest czytana; pamięć niezależna od liczby stron |
| 19 | Pulpit: wspólny loader sprzedaży w `cache()` na żądanie, paczki pozycji równolegle, `count` tylko na pierwszej stronie. Od #328 Pulpit czeka na wszystkie karty naraz, więc najwolniejsza karta wyznacza czas wejścia | kod | sesja | M | QRY-02, QAL-05, QRY-05, QRY-07, CPU-13 | Licznik zapytań na render: ok. 35 → ok. 10; wyniki kart identyczne |
| 20 | Migracja: sprzątanie `audit_logs` i `inngest_run_log` paczkami, codziennie; retencja `ksef_health_log` | migracja | razem | S | DB-01, JOB-05, DBC-07, DB-09 | Test na bazie: paczka mieści się w limicie, blokada append-only działa; wgrane przez Bartosza |
| 21 | Migracja: indeksy częściowe pod crony KSeF (`CONCURRENTLY`), lżejsza funkcja przebiegu uzgadniania | migracja | razem | S | DB-02, DB-V02, DB-08 | EXPLAIN na kopii: index scan; wyniki identyczne przed i po |
| 22 | Skrypt kopii `db-backup.sh`: sprzątanie `.partial`, kontrola wolnego miejsca przed zrzutem, bez drugiej kopii w `.outbox`, retencja przed wysyłką | infra | razem | S | BCK-01, DBC-01, BCK-04, BCK-05 | Test skryptu na katalogu tymczasowym; wdrożenie na db-1 przez Bartosza |
| 23 | Pomiar: opóźnienie pętli zdarzeń, pamięć i czas żądań w logu web i workera co 60 s; `scripts/ops/pojemnosc-db.sh` (tylko odczyt); próbkowanie Sentry bez health i telemetrii | operacje | sesja | S | CPU-12, DBC-10, EXT-15 | Linia JSON z metrykami w logach obu procesów; skrypt uruchamiany jedną linią |
| 24 | Przygotowanie replik: lekki `/api/live` do HEALTHCHECK, `deploymentId` i ID z SHA, stały klucz Server Actions, `stop-timeout` | infra | razem | M | HOR-01, REQ-09, CPU-05, HOR-11, DBC-05 | Healthcheck nie dotyka bazy ani Redisa; dwa buildy tego samego commita mają te same ID akcji |
| 25 | Decyzje i konfiguracja Bartosza: limity GoTrue i przekazywanie IP klienta, klucze JWT asymetryczne, pula PostgREST (na 2 vCPU 8–10) i strojenie Postgresa pod rozmiar serwera, Storage Box + kopia MinIO + WAL, wyłączenie Logflare i Vector (na 4 GB od razu), Realtime czy endpoint statusu, model klasyfikatora | decyzja | Bartosz | M | GTR-*, DBC-04, DBC-08, BCK-02, BCK-03, DB-05, EXT-16 | Każda decyzja zapisana z datą; zmiany w oknie serwisowym za zgodą |
| 26 | Audyt odpytywania KSeF: wiersz w `audit_logs` tylko przy zmianie albo błędzie, nie przy każdym żądaniu HTTP (ok. 70% wierszy audytu) | kod | sesja | S | EXT-03 | Test: zwykłe odpytanie bez zmian nie zapisuje audytu; błąd i zmiana stanu zapisują |

## 4. Etapy skalowania (sprzęt)

| Etap | Kiedy (metryka) | Co | Kod potrzebny wcześniej |
|---|---|---|---|
| 0 | teraz, przed launchem | sesje kodu na obecnym sprzęcie + Storage Box (lokalnie 2–3 kopie), wyłączenie Logflare i Vector, Studio na żądanie, strojenie bazy pod rozmiar serwera | — |
| 1a | przed pierwszym płacącym klientem (twarda zasada z `PRZEPROWADZKA-HETZNER.md` §1.7) albo którykolwiek sygnał: na db-1 wolne < 200 MB RAM, swap Postgresa > 0,5 GB, CPU > 70% w godz. 9–11, dysk > 70%, trafność cache < 99% | db-1 CX23 → CX33 (4 vCPU, 8 GB); opcja „tylko CPU i RAM” da się cofnąć, ale zostawia dysk 40 GB, więc dane i kopie na Volume albo Storage Box | 22, 23 |
| 1b | ~1500 aktywnych albo te same sygnały na CX33 | db-1 → 8 vCPU / 16 GB (CX43 albo CPX42), potem pula PostgREST i strojenie Postgresa pod nowy rozmiar | 8, 9, 19, 21 |
| 2 | wykorzystanie pętli zdarzeń web > 0,6 w szczycie przez 3 dni albo p99 opóźnienia pętli > 100 ms | obraz budowany w CI (koniec buildów na produkcji), app-1 4 vCPU, 2–3 kontenery web z jednego obrazu, limity pamięci kontenerów | 23, 24 |
| 3 | cykl skrzynki > 10 min po sesji 14, p95 oczekiwania wysyłki > 30 s, dysk db-1 > 70% | worker na osobnej maszynie w sieci prywatnej, Redis na adresie prywatnym, MinIO na Volume albo Object Storage, archiwizacja WAL | 13, 14 + stan KSeF z pamięci procesu do Redisa/bazy |
| 4 | CPX42 > 70% CPU w zwykłe dni | Postgres na osobnym serwerze, usługi Supabase na drugim, osobny PostgREST dla workera, replika do odczytu dla raportów | 25 |

## 5. Odczyty z produkcji (tylko odczyt, robi Bartosz)

Rozstrzygają ustalenia „do sprawdzenia” i kalibrują progi. Sesja 23
zamienia je w jeden skrypt.

- **Najpierw:** typ każdego serwera (konsola Hetznera albo `nproc; free -h; df -h /`). Od tego zależą wszystkie progi.
- `swapon --show`, `docker stats --no-stream` na app-1 i db-1 (rano 9–11 i o 02:00), `vmstat` (kradzież CPU na linii CX).
- Które kontenery stosu Supabase działają na db-1 (Logflare/analytics, Vector, Studio, Storage, imgproxy, Supavisor) i rozmiar bazy `_supabase`.
- Położenie MinIO aplikacji (dokumenty są sprzeczne: db-1 czy ops-1) i jego zajętość.
- `KEEP` i `RCLONE_REMOTE` w `/etc/faktflow-backup.env`, liczba i rozmiar zrzutów w katalogu kopii.
- Pula i limity PostgREST (`PGRST_DB_POOL`, `PGRST_DB_MAX_ROWS`), limity czasu ról.
- Ustawienia Postgresa (`shared_buffers`, `work_mem`, `max_connections`, `archive_mode`) i trafność cache z `pg_stat_database`.
- 25 najdroższych zapytań z `pg_stat_statements`.
- Rozmiary 25 największych tabel i dzienny przyrost `audit_logs` oraz `inngest_run_log`.
- Konfiguracja limitów GoTrue (nazwy zmiennych `GOTRUE_RATE_LIMIT_*`, bez wartości sekretów).
- Liczby: aktywne firmy, firmy z KSeF, faktury na firmę miesięcznie.
- Kolejki pg-boss: zaległości wg kolejki i czasy przebiegów z `inngest_run_log`.

## 6. Dziennik sesji

| Data | Sesja | PR | Stan |
|---|---|---|---|
| 24.10.2026 | Analiza i plan | #329 | plan gotowy, czeka na akceptację Bartosza |
| 25.10.2026 | Korekta: db-1 nie ma 4 vCPU / 8 GB (najpewniej CX23) | #329 | przeliczone progi, nowa kolejność, sesja 26, etap 1 podzielony na 1a/1b |

**Następny krok:** po akceptacji planu przez Bartosza i potwierdzeniu typów
serwerów sesja 23 (pomiar i skrypt odczytu), potem 22, 20, 26, 4.
