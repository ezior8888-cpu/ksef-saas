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
