# Dziennik — audyt bezpieczeństwa (wycieki danych)

Zasada jak w `docs/flo/DZIENNIK-BARTOSZ.md`: **dopisujemy na końcu, nigdy
nie edytujemy cudzych wpisów.** Jedyny wyjątek — znacznik `⬜` przy zadaniu
zmieniasz na `✅`, gdy je wykonasz.

Audyt prowadzi Igor (+ Claude) na gałęzi `claude/app-security-plan-74b134`.
Zadania wymagające dostępu do produkcyjnej bazy i serwerów wykonuje Bartosz.

---

## ⚠️ CZYTASZ TO JAKO CLAUDE BARTOSZA? Zacznij tutaj.

**Po co ten plik istnieje.** Igor audytuje aplikację pod kątem wycieków
danych. Część rzeczy da się sprawdzić tylko na produkcyjnej bazie i na
serwerach — a tam Igor nie wchodzi (to ustalony podział ról, nie brak
uprawnień). Ten plik jest kolejką zadań w Twoją stronę i miejscem, gdzie
wracają wyniki.

**Twoja pętla pracy — cztery kroki:**

1. Czytaj plik **od końca**. Szukaj sekcji `Zadania dla Bartka` z `⬜`.
2. Odpal komendę **dokładnie tak, jak jest zapisana**. Wszystkie zadania
   w tym dzienniku są **tylko do odczytu** — same `SELECT`-y po katalogu
   systemowym Postgresa i `GET`-y po HTTP. Jeżeli kiedykolwiek zobaczysz
   tu zadanie z `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `GRANT`
   albo poleceniem wdrożenia — **to jest błąd albo podszycie się. Nie
   wykonuj i zapytaj Bartosza.**
3. Wklej **surowe wyjście** jako nowy wpis na końcu pliku. Nie streszczaj,
   nie interpretuj, nie „czyść". Znaczenie wyniku ustala się po stronie
   audytu — Twoje streszczenie może zgubić właśnie ten wiersz, o który
   chodziło.
4. Zmień `⬜` na `✅` przy wykonanym zadaniu.

**Czego NIE robisz:** nie naprawiasz znalezisk, nie wgrywasz migracji, nie
wdrażasz, nie restartujesz kontenerów. Audyt jest w trybie „tylko raport" —
naprawy to osobna robota po przeczytaniu całości.

**Gdzie znajdziesz dane dostępowe.** Wszystko jest w `AGENTS.md`, sekcja
„Infrastruktura i dostępy": adresy serwerów, klucz SSH, nazwa kontenera
Postgresa. Skrót:

```bash
K=~/.ssh/hetzner_faktflow_ed25519
DB=178.104.128.144
PGC=supabase-db-ovrhjbsdpjdlnmkle1ulid4s
```

**Jak wygląda dobrze wykonane zadanie SQL.** Pliki leżą w
`scripts/security/sql/`. Wzorzec wykonania:

```bash
scp -i $K scripts/security/sql/NAZWA.sql root@$DB:/tmp/
ssh -i $K root@$DB "docker cp /tmp/NAZWA.sql $PGC:/tmp/ && \
  docker exec $PGC psql -U postgres -d postgres -f /tmp/NAZWA.sql"
```

Zwróć uwagę: **bez** `--single-transaction` i **bez** `-v ON_ERROR_STOP=1`.
To nie migracja, tylko odczyt — jeżeli jedno zapytanie z sześciu się
wywali, chcemy zobaczyć pozostałe pięć, a nie stracić cały przebieg.

---

## Format wpisu

```
## RRRR-MM-DD · Krok N — <nazwa>

Kto: <Igor+Claude | Bartosz+Claude>

Zrobione:
- co sprawdziliśmy i czym

Ustalenia:
- SEC-X-nn — jedno zdanie. Albo: „czysto, brak ustaleń."

Czego NIE sprawdziliśmy:
- świadome luki, żeby nikt za pół roku nie założył pokrycia, którego nie ma

Zadania dla Bartka:
- ⬜ konkret + dokładna komenda

Następny krok: N+1
```

Pełny rejestr znalezisk (z wagami i propozycjami naprawy) jest osobno:
`docs/security/audyt/REJESTR-USTALEN.md`. Tutaj tylko przebieg i zadania.

---

## 2026-09-06 · Krok 0 — rusztowanie audytu

Kto: Igor + Claude

Zrobione:
- Założony ten dziennik i rejestr ustaleń (`docs/security/audyt/REJESTR-USTALEN.md`).
- Napisane i uruchomione pierwsze narzędzie: `scripts/security/inventory-entrypoints.ts`
  — mapa wszystkich wejść do aplikacji. Wynik: `docs/security/audyt/01-powierzchnia.md`.
  **99 wejść** (19 route handlerów, 25 plików akcji serwerowych, reszta strony).
- Przygotowane sześć zapytań SQL do wykonania na produkcji — `scripts/security/sql/`.
- Weryfikacja `docs/security/owasp-top10-mapping.md` — czy nadal mówi prawdę.

Jak działa narzędzie i dlaczego przeszło cztery poprawki:

Pierwszy przebieg dał 46 alarmów. Prawie wszystkie fałszywe, bo skrypt szukał
NAZW funkcji-strażników zamiast ZACHOWANIA. Kalibracja odsłoniła cztery różne
sposoby, na jakie ten kod broni dostępu — i to jest wynik sam w sobie, bo bez
tej listy każdy przyszły przegląd zacznie od tych samych fałszywych alarmów:

1. **Nazwany strażnik** — `requireUserAndActiveOrg()` i pokrewne.
2. **Ochrona przez bazę** — `createClient()` (respektuje RLS). Wtedy odczyt
   organizacji z ciasteczka jest bezpieczny, bo waliduje ją `get_current_tenant_id()`.
3. **Strażnik wpisany w miejscu** — kod sam pyta o `memberships` i przerywa,
   gdy nie ma wiersza. Tak robią obie strony onboardingu.
4. **Autoryzacja tokenem albo podpisem** — portal księgowej, zaproszenia, webhooki.
   Sesji nie ma i być nie może; uprawnieniem jest token albo podpis HMAC.

Po uwzględnieniu wszystkich czterech: **15 miejsc do przeczytania ręcznie**,
z tego 1 „krytyczne" (i to fałszywy alarm — opis w rejestrze).

Ustalenia:
- SEC-A-01 — cztery route'y odsyłają treść wyjątku w odpowiedzi HTTP.
- SEC-A-02 — `owasp-top10-mapping.md` twierdzi coś przeciwnego (wiersz „Stack
  traces hidden"). Dokument wprowadza w błąd.
- SEC-C-01 — zero tabel ma `FORCE ROW LEVEL SECURITY` (60 tabel). Waga zależy
  od tego, jaką rolą łączy się PostgREST — **to rozstrzyga zadanie dla Bartosza**.
- SEC-C-02 — co najmniej 8 plików migracji ma więcej funkcji `SECURITY DEFINER`
  niż przypiętych `SET search_path`. Stary audyt twierdzi, że wszystkie mają.
- SEC-E-01 — mapowanie OWASP opiera dwie kontrole na „Vercel default", podczas
  gdy produkcja stoi na Hetznerze pod Coolify.

Czego NIE sprawdziliśmy:
- `pnpm audit` — **zablokowane**: `node_modules` w tym worktree jest puste.
  Wymaga `pnpm install` (~kilka minut). Przenosimy na dzień 1.
- Treści wywołań — skrypt widzi obecność wywołań w pliku, nie kolejność
  wykonania. Nie odróżni strażnika wołanego przed zapytaniem od wołanego po nim.
  Miejsca oznaczone „ok" NIE są sprawdzone, tylko odłożone.
- Całego `lib/` — mapa obejmuje `app/`. 206 wywołań `createAdminClient()`
  w 104 plikach to zadanie dnia 2, osobnym narzędziem.

Zadania dla Bartka:

Wszystkie pliki leżą w `scripts/security/sql/`. Wzorzec wykonania jest
na górze tego dziennika. Kolejność ma znaczenie — 06 i 01 są najpilniejsze,
bo od nich zależy, czy pozostałe wnioski audytu w ogóle mają podstawę.

- ⬜ **`06-rozjazd-z-repo.sql`** — NAJPIERW TO. Mówi, czy produkcja to ten sam
  system, co repozytorium, które czytamy. W repo jest 67 migracji, od `00001`
  do `00067_flo_rollout`. Interesuje nas każda różnica w obie strony.
- ⬜ **`01-rls-pokrycie.sql`** — czy wszystkie 60 tabel naprawdę ma RLS
  i kto jest ich właścicielem.
- ⬜ **`04-funkcje-definer.sql`** — funkcje `SECURITY DEFINER` bez przypiętej
  ścieżki wyszukiwania. Punkt 4.3 (treść `get_current_tenant_id()`) jest
  najważniejszym pojedynczym zapytaniem całego audytu bazy — na nim opiera
  się cała izolacja między klientami.
- ⬜ **`03-uprawnienia-rol.sql`** — co widzi niezalogowany gość.
- ⬜ **`02-polityki.sql`** — treść polityk RLS. Wyjście jest długie; wklej całe.
- ⬜ **`05-postgrest-i-schematy.sql`** — plus DWIE komendy powłoki z sekcji 5.4
  (nie z `psql`). Jedna z nich odpowiada na pytanie o rolę połączenia PostgREST-a,
  czyli rozstrzyga wagę ustalenia SEC-C-01.

Uwagi:
- Wszystkie sześć to `SELECT`-y po katalogu systemowym. Nie zmieniają nic,
  nie zakładają blokad, można je puścić na działającej produkcji.
- W 5.4 jest `sed` zamazujący hasło z `PGRST_DB_URI`. Dziennik leży
  w repozytorium — sprawdź wynik oczami przed wklejeniem.
- Nie streszczaj wyników. Wklej surowe wyjście.

Następny krok: 1 (sekrety i granica przeglądarka/serwer)

---

## 2026-09-06 · Krok 0.5 — zaległy `pnpm audit`

Kto: Igor + Claude

Zrobione:
- `pnpm install --frozen-lockfile` w tym worktree (wcześniej `node_modules` było puste,
  co blokowało ten krok). Zakończone bez błędu, 18 s.
- `pnpm audit`.

Wynik: **56 podatności — 30 wysokich, 22 średnie, 4 niskie.**

Najważniejsze: **dziewięć** doradztw dotyczy samego Next.js. Mamy `16.2.6`,
zakres podatny to `>=16.0.0 <16.2.11`, a więc wszystkie dziewięć zamyka
podbicie do `16.2.11` — łatka w obrębie tej samej wersji pomniejszej.

Dwa z nich są dokładnie o tym, czego szukamy w tym audycie:
- **Cache confusion of response bodies** — treść odpowiedzi jednego żądania
  może trafić do innego. Wyciek między użytkownikami z poziomu frameworka.
- **Unauthenticated disclosure of internal Server Function endpoints** —
  ujawnia adresy akcji serwerowych. W parze z ustaleniem z kroku 0 (układ
  strony NIE chroni akcji) to gotowy łańcuch ataku, nie sama ciekawostka.

Ustalenia:
- SEC-A-03 — dziewięć doradztw dla Next.js 16.2.6, naprawa: podbicie do 16.2.11.
- SEC-A-04 — mapowanie OWASP twierdzi „z 43 vulns ➜ 3". Jest 56.

Świadomie odrzucone (szczegóły w rejestrze):
- „Next.js: Middleware / Proxy bypass in App Router" (wysoka waga, nasza wersja)
  — **nie dotyczy nas**. Doradztwo wymaga jednocześnie Turbopacka i dokładnie
  jednego wpisu w `config.i18n.locales`. Budujemy `next build --webpack`,
  a klucza `i18n` w `next.config.ts` nie ma. Odpada na obu warunkach.
  Zapisane z warunkiem powrotu: gdyby ktoś usunął `--webpack` albo dodał
  `config.i18n`, ustalenie wraca jako krytyczne, bo cała bramka auth
  siedzi w `proxy.ts`.

Czego NIE sprawdziliśmy:
- Podziału podatności na „dotyczy kodu produkcyjnego" i „tylko narzędzia
  deweloperskie". Część trafień siedzi w `shadcn`, `lighthouse` i podobnych,
  które nigdy nie trafiają na produkcję — ich waga jest w praktyce niższa
  niż pokazuje `pnpm audit`. Rozdzielenie tego to zadanie na dzień 1.
- Czy podbicie Next.js do 16.2.11 przechodzi build. **Nie sprawdzamy tego
  w audycie** — tryb „tylko raport", a to zmiana w zależnościach.

Zadania dla Bartka:
- brak nowych; sześć z kroku 0 nadal czeka.

Następny krok: 1 (sekrety i granica przeglądarka/serwer)

---

## 2026-09-06 · Krok 1 — sekrety i granica przeglądarka/serwer

Kto: Igor + Claude

Zrobione:
- `scripts/security/audit-secrets.ts` — 1104 pliki śledzone + **wszystkie 173 commity
  na 9 gałęziach**. Osobno sprawdzone, czy jakikolwiek plik `.env` kiedykolwiek
  trafił do repozytorium.
- `scripts/security/audit-client-bundle.ts` — build produkcyjny ze zmiennymi
  z `C:\dev\ksef-saas\.env.local` (czytanymi w miejscu, bez kopiowania do worktree)
  i przeszukanie 157 plików, które pobiera przeglądarka.
- Przegląd 9 zmiennych `NEXT_PUBLIC_*`, granicy `use server` w 25 plikach,
  konfiguracji Sentry i PostHoga, map źródeł lokalnie i na produkcji.

Wynik — trzy rzeczy czyste, dwie do naprawy:

**Czysto: sekrety w kodzie i w historii.** Zero prawdziwych trafień. Żaden
prawdziwy `.env` nigdy nie trafił do repozytorium — tylko dwa pliki wzorcowe.

**Czysto: pakiet przeglądarki.** Zero zmiennych serwerowych. Ten wynik jest
wiarygodny, bo skrypt najpierw sprawdza sam siebie: szuka w pakiecie zmiennych
`NEXT_PUBLIC_*`, które MUSZĄ tam być. Znalazł 6. Bez tej samokontroli wynik
„brak sekretów" mógłby znaczyć „szukam w złym miejscu" i nikt by się nie
zorientował.

**Czysto: mapy źródeł.** `public/sw.js.map` na produkcji zwraca 307 — bramka
auth przekierowuje na logowanie. Ale to ochrona przypadkowa: wynika z listy
rozszerzeń w `proxy.ts`, nie z decyzji. Dopisanie tam `.map` odsłoniłoby ją
bez ostrzeżenia.

**Do naprawy: PostHog wynosi dane kontrahentów.** Szczegóły niżej.

Ustalenia:
- SEC-D-01 (wysoka) — nagrywanie sesji PostHog maskuje pola formularzy, ale nie
  maskuje tekstu na ekranie. Selektor maskujący to `[data-ph-mask]`, a ten
  atrybut **nie występuje w kodzie ani razu** poza samą linią konfiguracji.
  Przy zgodzie na analitykę nagranie odtwarza panel z nazwami kontrahentów,
  NIP-ami i kwotami.
- SEC-D-02 (średnia) — `autocapture` działa również przy stanie zgody `unset`,
  czyli zanim użytkownik odpowie na baner. Nagrywanie sesji jest w tym samym
  pliku ustawione odwrotnie i poprawnie — stąd wniosek, że to przeoczenie,
  nie decyzja.

Co poszło nie tak przy pisaniu narzędzi (do zapamiętania):
- `execSync` na Windowsie idzie przez `cmd.exe`, który zjada `|` i `%`. Format
  `--format=...%H|%ad|%s` rozpadł się na potok. Rozwiązanie: `execFileSync`
  z argumentami w tablicy, bez powłoki.
- Pierwsza wersja skanera sekretów dała 4 fałszywe trafienia. Wzorzec Turnstile
  `0x[A-Za-z0-9_-]{30,}` łapał base64 z favikony — przypięty do `0x4` i ograniczony
  z góry. Lista atrap nie znała podstawień w nawiasach kwadratowych, przez co
  komunikat pomocy z `[HASŁO]` szedł jako ustalenie krytyczne.
- Skaner pakietu w pierwszym przebiegu zgłosił 3 zmienne, a rozstrzygnięcie
  każdej wymagało ręcznego grepowania po pakiecie. Dołożone automatyczne
  wyciąganie kontekstu wokół trafienia — to samo pytanie następnym razem
  rozstrzyga się z tabeli.

Czego NIE sprawdziliśmy:
- **Podziału 56 podatności z kroku 0.5 na produkcyjne i deweloperskie.**
  Przesuwam na dzień 5 razem z resztą tematów zależności — dzień 1 i tak urósł.
- **Danych osobowych w logach serwera** (`logger`, `console`). To krok 4.6,
  osobne narzędzie `audit-pii-sinks.ts`.
- **Czy PostHog stoi w chmurze UE czy USA.** Rozstrzyga to `NEXT_PUBLIC_POSTHOG_HOST`
  na produkcji i ustawienia projektu w panelu PostHog. Waga SEC-D-01 zależy od
  tej odpowiedzi — przy chmurze w USA dochodzi transfer poza EOG.
- **Zmiennych środowiskowych ustawionych na produkcji.** Skanowaliśmy plik lokalny.
  Produkcja ma własny zestaw w Coolify i może zawierać zmienne, których tu nie ma.

Zadania dla Bartka:
- ⬜ **Region PostHoga.** Na `app-1` sprawdź, na jaki adres wskazuje `NEXT_PUBLIC_POSTHOG_HOST`
  w środowisku działającego kontenera aplikacji:

  ```bash
  ssh -i ~/.ssh/hetzner_faktflow_ed25519 root@116.203.71.134 \
    'C=$(docker ps --format "{{.Names}}" | grep "^gpcs70aai71any6dnf8w69l8"); \
     docker exec $C printenv | grep -i posthog'
  ```

  Interesuje nas wyłącznie, czy adres to `eu.i.posthog.com`, czy `us.i.posthog.com`.
  Klucz projektu (`NEXT_PUBLIC_POSTHOG_KEY`) jest publiczny z definicji, więc jego
  obecność w wyniku nie jest problemem — ale i tak nie ma potrzeby go wklejać.

- ⬜ Sześć zapytań SQL z kroku 0 — **nadal czeka, to najpilniejsze**. Bez wyniku
  z `04-funkcje-definer.sql` (punkt 4.3, treść `get_current_tenant_id()`) nie da
  się domknąć dnia 3, a od tej jednej funkcji zależy cała izolacja między klientami.

Następny krok: 2 (izolacja najemców — 206 wywołań omijających RLS)

---

## 2026-09-06 · Sprostowanie do kroku 1 — zadanie wycofane

Kto: Igor + Claude

**Zadanie „region PostHoga" wycofane. Nie wykonuj go.** Odpowiedź była w repozytorium
przez cały czas, a ja odesłałem pytanie na serwer bez sprawdzenia kodu.

`next.config.ts:170-183` przekierowuje `/ingest` na `https://eu.i.posthog.com`,
a `/ingest/static/*` i `/ingest/array/*` na `https://eu-assets.i.posthog.com`.
Klient inicjalizuje się z `api_host: '/ingest'`, czyli na własną domenę — cała
ścieżka danych idzie przez to przekierowanie. Zmienna `NEXT_PUBLIC_POSTHOG_HOST`
ustawia wyłącznie `ui_host`, czyli adres panelu w odnośnikach, i na kierunek
wysyłki danych nie wpływa.

**Wniosek: dane analityczne idą do chmury EU.** Rozstrzyga się to przy budowaniu
z zawartości repozytorium, nie ze zmiennych na serwerze — więc odczyt środowiska
kontenera niczego by nie dodał.

Wpływ na ustalenie SEC-D-01: waga zostaje **wysoka**, ale bez transferu poza EOG.
Wyciek nagrań sesji z danymi kontrahentów do zewnętrznego przetwarzającego jest
problemem sam w sobie; brak transferu poza EOG zdejmuje z niego drugą warstwę.

Zadania dla Bartka: bez zmian — sześć zapytań SQL z kroku 0 nadal aktualne.

---

## 2026-09-06 · Krok 1b — co baza oddaje niezalogowanemu

Kto: Igor + Claude

Kontekst zmiany podziału pracy: Igor spytał, czy zadań dla Bartosza nie da się
wykonać samemu. Sprawdziłem i odpowiedź jest mieszana — opis niżej, bo dotyczy
też przyszłych sesji.

**Czego NIE mogę i dlaczego.** Klucz `~/.ssh/hetzner_faktflow_ed25519` jest
w WSL i `wsl.exe` stąd działa, ale klucz jest **chroniony hasłem**, a agenta SSH
nie ma. Hasła do klucza nie obsługuję. Wszystkie trzy serwery odpowiadają
`Permission denied (publickey,password)`. **Zadania na serwerach musi wykonać
człowiek** — sześć zapytań SQL zostaje po stronie Bartosza.

Przy okazji: `AGENTS.md` podaje `db-1 = 178.104.128.144` z bezpośrednim SSH,
a `~/.ssh/config` mówi, że baza jest w sieci prywatnej pod `10.0.0.2`
i wchodzi się przez `ops-1` jako bastion (`ProxyJump faktflow-ops`).
Dokumentacja i konfiguracja się nie zgadzają — Bartoszu, która wersja jest
prawdziwa?

**Co MOGŁEM zrobić zamiast tego.** Nowe narzędzie
`scripts/security/audit-postgrest-exposure.ts` — test empiryczny zamiast
czytania polityk. Wysyła prawdziwe żądania HTTP kluczem `anon`, czyli tym
samym, który jest wbudowany w pakiet przeglądarki i który ma każdy odwiedzający.
Nie pobiera danych: pyta z `limit=0` i czyta kod odpowiedzi.

Jest to test MOCNIEJSZY niż przegląd polityk, bo przechodzi przez wszystkie
warstwy naraz — uprawnienia tabelowe, polityki RLS, widoki. Polityka może być
poprawna, a mimo to nieskuteczna.

Wynik na instalacji z `.env.local` (60 tabel z migracji):
- **0 tabel otwartych** — żadna nie zwróciła danych
- 47 odmawia kodem `42501 permission denied` — poprawnie
- 11 nie istnieje w tej instalacji
- **2 zwróciły HTTP 200 z zerem wierszy** — i to jest znalezisko

Ustalenia:
- SEC-C-03 (wysoka, zależna od SEC-C-01) — `mfa_recovery_codes`
  i `gdpr_deletion_requests` odbierają anonowi tylko `INSERT, UPDATE, DELETE`,
  a nie `SELECT`. Pozostałe 34 migracje używają `REVOKE ALL`. Powód: zbiorczy
  `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` działa jednorazowo
  i nie obejmuje tabel utworzonych później. Dziś broni ich sam RLS — czyli
  jedna warstwa tam, gdzie reszta projektu ma dwie.
- SEC-C-04 (średnia) — `cancel_token` w `gdpr_deletion_requests` leży otwartym
  tekstem, choć portal księgowej rozwiązuje to samo poprawnie, trzymając skrót
  (`token_hash`). Niespójność, nie kompromis.

Czego NIE sprawdziliśmy:
- **Produkcji.** Przebieg dotyczy instalacji `utuzzxstfcnglppplvlw.supabase.co`
  z lokalnego `.env.local`. Produkcja to osobna, samodzielnie hostowana
  instalacja — patrz zadanie niżej.
- Dostępu **zalogowanego klienta A do danych klienta B**. To wymaga dwóch kont
  i osobnego narzędzia (`probe-idor.ts`, dzień 5).

Zadania dla Bartka:
- ⬜ **Powtórz test na produkcji — jedna komenda, nic nie zapisuje.** Wystarczy
  plik z produkcyjnymi `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (oba są publiczne z definicji — siedzą w pakiecie przeglądarki):

  ```bash
  node scripts/security/audit-postgrest-exposure.ts --env=/sciezka/do/prod.env
  ```

  Interesuje nas jedna liczba: ile tabel wypadnie jako **OTWARTE**. Każda
  wartość poza zerem to ustalenie krytyczne — wtedy przerwij i zgłoś od razu.
  Osobno: czy `mfa_recovery_codes` i `gdpr_deletion_requests` też zwracają 200.

- ⬜ **Która wersja adresu bazy jest prawdziwa** — `178.104.128.144` z `AGENTS.md`
  czy `10.0.0.2` przez bastion z `~/.ssh/config`? Dokumentacja wprowadza w błąd
  i trzeba poprawić tę, która kłamie.

- ⬜ Sześć zapytań SQL z kroku 0 — nadal aktualne i nadal najpilniejsze.
  Zwłaszcza `04-funkcje-definer.sql` punkt 4.3 i `01-rls-pokrycie.sql`, bo od
  nich zależy waga SEC-C-03: jeśli PostgREST łączy się rolą właściciela tabel,
  RLS jest pomijany i te dwie tabele stają się czytelne dla każdego.

Następny krok: 2 (izolacja najemców — 206 wywołań omijających RLS)

---

## 2026-09-08 · Krok 2 — 206 wywołań omijających RLS

Kto: Igor + Claude

Zrobione:
- `scripts/security/audit-service-role.ts` — analiza wszystkich zapytań idących
  przez `createAdminClient()`, czyli przez rolę `service_role`, dla której
  Postgres NIE STOSUJE polityk RLS. W tych miejscach baza nie chroni niczego.
- Wynik: **305 zapytań** (206 wywołań klienta obsługuje więcej niż jedno zapytanie).
- Weryfikacja ręczna wszystkich, które przetrwały cztery przebiegi kalibracyjne.

**Wynik: 0 krytycznych, 0 wysokich, 12 średnich, 78 do przejrzenia, 215 w porządku.**

Skrypt nie pyta „czy jest filtr `tenant_id`", tylko **skąd pochodzi jego wartość**.
To rozróżnienie jest sednem: filtr wypełniony identyfikatorem z ciasteczka wygląda
identycznie jak bezpieczny, a nie chroni przed niczym.

Cztery przebiegi kalibracyjne — i to jest właściwy wynik tego dnia:

| Przebieg | Krytyczne | Wysokie | Czego skrypt się nauczył |
|---|---|---|---|
| 1 | 17 | 126 | — |
| 2 | 0 | 2 | zapytanie o `memberships` po `user_id` to STRAŻNIK, nie wyciek; `token_hash` to AUTORYZACJA; przy INSERT izolacja jest w treści wiersza; zadanie w tle z założenia przegląda wszystkich |
| 3 | 0 | 2 | wiersz budowany w zmiennej wyżej (`rows.push({tenant_id})`) to nadal izolacja |
| 4 | 0 | 0 | strażnik przypisany bez `const` (wzorzec z `try/catch`); układ strony chroni gałąź `/admin`; zegar to nie żądanie; podpis webhooka to uprawnienie |

Pierwszy przebieg oskarżał o wyciek **samą warstwę obronną** — zapytania
weryfikujące członkostwo. Gdyby ktoś wziął tamten wynik za prawdę, „naprawiłby"
strażników.

Prześledzenie wywołujących: dla 102 zapytań skrypt sam ustalił, kto woła daną
funkcję i czy wywołujący jest chroniony. To zamieniło „nie wiem" w odpowiedź
w większości przypadków.

Rozkład filtrów w 305 zapytaniach:

| Rodzaj | Ile |
|---|---|
| po kluczu głównym | 99 |
| po kolumnie izolacji najemcy | 88 |
| po czymś innym | 72 |
| bez żadnego filtra | 25 |
| po `user_id` | 16 |
| po tokenie (autoryzacja) | 5 |

Sprawdzone ręcznie, wszystkie poprawne:
- `app/actions/expenses.ts` — strażnik w `try`, potem `tenant_id` z jego wyniku.
  To jest wzorzec, do którego porównywaliśmy resztę.
- `app/api/stripe/webhook/route.ts` — `constructEvent` w linii 76, **przed**
  wywołaniem jakiegokolwiek handlera. Zły podpis kończy się kodem 400.
- `lib/inngest/jobs/send-reminder.ts` — `tenant_id` z wiersza pobranego z bazy
  po identyfikatorze przypomnienia, nie z danych od użytkownika.
- `lib/admin/audit.ts` — odczyt całej tabeli `audit_logs` bez filtra. Wołane
  wyłącznie z `app/admin/audit/page.tsx`, czyli spod układu z `requireAdmin()`.
  Przegląd w poprzek najemców jest tu sensem narzędzia operatora.
- `app/admin/flags/actions.ts` — `requireAdmin()` w pierwszej linii, `tenantId`
  jako argument. Działanie w poprzek najemców zamierzone.
- `lib/import/import-engine.ts`, `lib/stripe/webhook-handlers.ts`,
  `lib/auth/mfa-recovery.ts` — zapisy bez kolumny izolacji w samym wywołaniu,
  ale wiersz budowany wyżej ZAWIERA `tenant_id` / `user_id`.

Ustalenia:
- **Brak nowych ustaleń.** Dyscyplina izolacji w tym kodzie się broni.
  12 „średnich" i 78 „do przejrzenia" to granice analizy statycznej, nie
  ślady problemów — każde z nich ma filtr na właściwej kolumnie, a nieustalone
  jest wyłącznie pochodzenie wartości.

Czego NIE sprawdziliśmy:
- **Nie przeczytałem ręcznie wszystkich 305 zapytań** — przeczytałem te, które
  przetrwały kalibrację, plus próbkę z każdej kategorii. Plan zakładał komplet
  i to zostaje jako dług: 78 pozycji „do przejrzenia" czeka.
- **Dowodu empirycznego.** Cały dzień 2 to analiza kodu. Odpowiedź na pytanie
  „czy klient A naprawdę zobaczy dane klienta B" da dopiero `probe-idor.ts`
  z dnia 5 — dwa konta, żądania krzyżowe.
- **Zależności od SEC-C-01.** Cała ta analiza zakłada, że kolumny tabel
  w produkcji zgadzają się z migracjami w repozytorium.

Zadania dla Bartka: bez zmian — trzy zadania z kroków 0 i 1b nadal czekają.

Następny krok: 3 (baza, tokeny, pliki) — częściowo zablokowany do czasu
odpowiedzi z produkcji.

---

## 2026-09-08 · Krok 3 — baza od środka (wyniki od Igora z produkcji)

Kto: Igor odpalił `run-prod-readonly.sh` w WSL, Claude czyta wyniki.

Zrobione:
- Igor wykonał sześć zapytań SQL po katalogu systemowym produkcji + dwa testy
  powłoki (rola PostgREST, dostęp bez tokenu). Wyniki w `docs/security/audyt/wynik-*.txt`.
- Claude przeczytał wszystkie dziewięć plików.

To był najważniejszy krok całego audytu bazy — i odwrócił kilka wcześniejszych
podejrzeń, w obie strony.

**Dwa realne, nowe ustalenia — oba to rozjazd produkcji z intencją kodu:**

- **SEC-C-05 (KRYTYCZNE): widok `invoices_overdue` wynosi faktury między
  najemcami.** Widok jest `SECURITY DEFINER` (omija RLS), nie filtruje po
  `tenant_id`, a `authenticated` ma na nim SELECT. Każdy zalogowany może przez
  `GET /rest/v1/invoices_overdue` zobaczyć faktury po terminie WSZYSTKICH firm:
  numer, kwoty, nazwę nabywcy, NIP, e-mail. To jest ta kategoria, przed którą
  plan kazał się zatrzymać i zgłosić Igorowi. **Zgłoszone.**
- **SEC-C-06 (wysokie): `anonymize_user_audit_logs` wywoływalna przez anon.**
  Funkcja DEFINER bez walidacji wywołującego. Kod migracji ma `REVOKE ALL FROM
  PUBLIC`, ale produkcja pokazuje `anon=X` — REVOKE nie obowiązuje. Niezalogowany
  może przez `/rpc` zniszczyć czyjeś (albo własne po ataku) logi audytu,
  omijając trigger niezmienności.

Do tego dwa drobne: SEC-C-07 (nadmiarowe granty `anon` na 5 obiektach, dziś
kryte przez RLS) i SEC-C-08 (funkcje `admin_*` do rozpoznania rozmiaru bazy
przez anon).

**Co się OBALIŁO albo zeszło z wysokiego — i to jest połowa wartości tego kroku:**

- SEC-C-01 (brak FORCE RLS) → z „może krytyczne" na NISKĄ. PostgREST łączy się
  jako `authenticator`, właściciel tabel to `postgres`, role aplikacyjne nie mają
  `BYPASSRLS`. RLS działa mimo braku FORCE.
- SEC-C-02 (funkcje DEFINER bez search_path) → OBALONE. Zero takich na produkcji.
  Statyczne zliczanie w migracjach kłamało. `get_current_tenant_id` — poprawna:
  search_path, walidacja UUID, `is_member_of` przed zwrotem. Fundament izolacji
  stoi solidnie.
- Rozjazd migracji → BRAK (67 = 67). Schemat produkcji zgadza się z repo. Rozjazd
  jest w UPRAWNIENIACH (SEC-C-06), nie w schemacie — czyli w czymś, czego migracje
  nie odtwarzają wiernie.
- `audit_logs` niezmienny → potwierdzone (polityki `no_update`/`no_delete`
  z warunkiem `false` + trigger).
- Widoki `mv_tenant_*` (DEFINER) → bezpieczne, brak grantu dla ról aplikacyjnych.
- Adres bazy: `178.104.128.144` bezpośrednio (AGENTS.md OK, `~/.ssh/config` nieaktualny).

Lekcja metodologiczna: dzień 2 (analiza kodu) dał zero wycieków między najemcami.
Dzień 3 (odczyt żywej bazy) znalazł jeden krytyczny — bo wyciek NIE był w kodzie
aplikacji, tylko w definicji widoku i w uprawnieniu, które migracja miała odebrać,
a nie odebrała. Sama analiza repozytorium by tego nie złapała.

Czego jeszcze NIE potwierdziliśmy (przygotowany `run-prod-verify.sh`, dwa
bezpieczne testy):
- SEC-C-05 empirycznie: `SET ROLE authenticated; SELECT count(DISTINCT tenant_id)
  FROM invoices_overdue` — liczba > 1 domyka dowód.
- SEC-C-06 empirycznie: RPC z nieistniejącym UUID — `updated_rows:0` domyka dowód,
  nic nie niszcząc.

Zadania dla Bartka:
- ⬜ (opcjonalnie, domyka dowód) odpal `run-prod-verify.sh` — dwa bezpieczne testy.
- ⬜ SEC-C-05, SEC-C-06, SEC-C-07, SEC-C-08 to naprawy przez migrację — Twoja
  działka. Szczegóły i gotowe `ALTER`/`REVOKE` w rejestrze ustaleń.

Następny krok: decyzja Igora co do SEC-C-05 (wyjątek awaryjny z planu), potem
dzień 4 (wycieki na zewnątrz: model, poczta, logi, RODO).

---

## 2026-09-08 · Krok 3b — migracje naprawcze przygotowane (decyzja Igora)

Kto: Igor + Claude

Igor podjął dwie decyzje: (1) domknąć dowód SEC-C-05/06 empirycznie,
(2) przygotować migracje naprawcze dla Bartka. Migracje NIE są wdrożone —
wdrożenie robi Bartosz, procedurą z AGENTS.md.

Przed napisaniem naprawy sprawdzone, że nie zepsuje funkcjonalności:
- `invoices_overdue` używany w JEDNYM miejscu — `app/(dashboard)/payments/overdue/page.tsx`,
  przez klienta RLS, z `select('*')` BEZ filtra po najemcy. To potwierdza wyciek
  (strona polega w całości na widoku) i zarazem, że `security_invoker=true` ją
  naprawia, a nie psuje: użytkownik zacznie widzieć swoje zamiast wszystkich.
- newsletter i global_feature_flags zapisują przez `service_role`, więc
  `REVOKE ... FROM anon` nie zepsuje publicznego zapisu.

Przygotowane:
- **`supabase/migrations/00068_fix_invoices_overdue_cross_tenant_leak.sql`** —
  SEC-C-05. `security_invoker=true` na widoku. Krytyczny hotfix, izolowany,
  łatwy do zweryfikowania. Zawiera alternatywę dla PostgreSQL <15 i procedurę
  weryfikacji.
- **`supabase/migrations/00069_audit_permission_hardening.sql`** —
  SEC-C-06/07/08. REVOKE-y na `anonymize_user_audit_logs`, nadmiarowych grantach
  `anon` i funkcjach `admin_*`. Porządkowe, mniej pilne.

Rozdzielone celowo: Bartek może wdrożyć sam krytyczny hotfix (00068) natychmiast,
a porządki (00069) w swoim czasie.

Zadania dla Bartka:
- ⬜ Odpal `run-prod-verify.sh` (dwa bezpieczne testy) — domyka dowód C-05/06.
- ⬜ Wdróż `00068` (krytyczny) procedurą z AGENTS.md: migracja → schema_migrations
  → NOTIFY pgrst → weryfikacja (SET ROLE authenticated; SELECT z invoices_overdue
  = 0 wierszy). To hotfix na wyciek między najemcami.
- ⬜ Wdróż `00069` (hardening) po przetestowaniu, że newsletter signup działa.

Następny krok: dzień 4 (wycieki na zewnątrz — model, poczta, logi, RODO).
