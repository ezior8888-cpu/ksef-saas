# KSeF SaaS — Agent Instructions

## Projekt

Aplikacja SaaS do wystawiania i odbierania faktur VAT w integracji z KSeF 2.0 (Krajowy System e-Faktur, Polska). Multi-tenant, solo-founder MVP, target: mikroprzedsiębiorcy i księgowi.

## Stack (NIEZMIENNY)

- Next.js 16 (App Router), TypeScript, React Server Components
- Tailwind CSS + shadcn/ui (style: new-york, baseColor: neutral)
- Supabase (Postgres + RLS, region Frankfurt `eu-central-1`)
- NextAuth.js (Auth.js v5) — Email/Password + Google OAuth
- Inngest — background jobs (event-driven, step functions)
- Cloudflare R2 — storage XML FA(3)
- Vercel — hosting
- **pnpm** — menedżer pakietów (`pnpm-lock.yaml`); w root nie używaj `npm install` (brak `package-lock.json`; globalny `.npmrc` z opcjami pnpm potrafi psuć npm).

## Konwencje kodu

### Routing (App Router)

- Strony chronione: grupa `app/(dashboard)/` — wymaga auth przez middleware.
- Strony niechronione: grupa `app/(auth)/` — login/register/forgot-password.
- API routes: `app/api/*/route.ts`.
- Komponenty prywatne strony: folder `_components/` wewnątrz folderu strony.

### TypeScript

- Włączony `strict: true`. Bez `any`, bez `@ts-ignore` bez wyjaśnienia w komentarzu.
- Typy domenowe w `types/` (np. `types/invoice.ts`).
- Import alias `@/*` od root projektu.

### Komponenty

- Domyślnie Server Components. `"use client"` dodaję TYLKO gdy komponent używa `useState`, `useEffect`, event handlerów lub browser API.
- Używam komponentów shadcn z `@/components/ui/*`. Nigdy nie instaluję MUI, Chakra ani innych bibliotek UI.
- Nazwy komponentów — PascalCase (`InvoiceRow`, `SubmitButton`).
- Nazwy plików komponentów — `kebab-case.tsx` lub PascalCase.tsx (trzymaj konsekwentnie to samo w projekcie).

### Logika biznesowa

- Wszystko co nie jest UI, ląduje w `lib/`.
- `lib/ksef/` — klient KSeF API, auth, submit, inbox.
- `lib/supabase/` — tylko klienty Supabase (`client.ts`, `server.ts`, `middleware.ts`).
- `lib/xml/` — generator i walidator FA(3) XML.
- `lib/inngest/functions/` — definicje background jobs.
- `lib/audit/log.ts` — helper do zapisywania logów do tabeli `audit_logs`.

### Supabase / bazy danych

- Używam `@supabase/supabase-js` i `@supabase/ssr`. NIE używam Prisma ani Drizzle.
- RLS (Row Level Security) jest włączony na WSZYSTKICH tabelach z `tenant_id`.
- Klient server-side z service_role używam TYLKO w Inngest jobs i admin endpointach.
- W komponentach i route handlerach używam klienta z uwierzytelnionego sessionu (respektuje RLS).

### Formularze

- React Hook Form + Zod do walidacji.
- Komponenty Form z `@/components/ui/form` (shadcn).
- Walidacja klient + server (Zod schema używam w obu miejscach).

### KSeF-specific

- Wszystko co dotyczy KSeF — rozróżniam środowisko TEST (`KSEF_ENV=test`) i PROD (`KSEF_ENV=production`).
- NIE używam prawdziwych NIP-ów w testach (fikcyjny testowy: `1234567890`).
- XML FA(3) waliduję LOKALNIE (libxmljs2) PRZED wysyłką do KSeF.
- Credentials KSeF w bazie szyfruję `KSEF_CREDENTIALS_ENCRYPTION_KEY`.

### Styling

- Wszystkie style przez klasy Tailwind. Nie piszę CSS-in-JS ani plików `.module.css`.
- Zmienne tematu (kolory, radius) w `app/globals.css` (zdefiniowane przez shadcn init).
- Helper `cn()` z `@/lib/utils` do warunkowego łączenia klas.

### Compliance (Polska)

- RODO — retencja 10 lat dla danych fakturowych.
- Logowanie audytowe — każda akcja istotna zapisana w `audit_logs`.
- Dane hostowane w EU (Frankfurt).

## Infrastruktura i dostępy

Ta sekcja jest tu, bo `AGENTS.md` czyta KAŻDA sesja agenta. Bez niej nowy czat
nie wie, że serwery istnieją, i odbija się od zadań operacyjnych.

### Serwery (Hetzner, region NBG1)

| Rola | IP | Co tam działa |
|---|---|---|
| `app-1` | `116.203.71.134` | aplikacja Next.js + worker pg-boss |
| `ops-1` | `91.98.134.85` | panel Coolify (port 8000, dostęp filtrowany po IP) |
| `db-1` | `178.104.128.144` | Supabase self-hosted: Postgres, GoTrue, Kong, MinIO |

Klucz SSH: `~/.ssh/hetzner_faktflow_ed25519`, użytkownik `root`.

```bash
ssh -i ~/.ssh/hetzner_faktflow_ed25519 root@178.104.128.144
```

Kontener Postgresa: `supabase-db-ovrhjbsdpjdlnmkle1ulid4s`.

### CO GDZIE ROBISZ — przeczytaj to, zanim cokolwiek wgrasz

| Chcesz… | Idziesz na | Sekcja niżej |
|---|---|---|
| wgrać migrację SQL | `db-1` | „Wgrywanie migracji" |
| wdrożyć kod | `ops-1` (Coolify steruje `app-1`) | „Wdrożenie produkcji" |
| zobaczyć logi aplikacji / workera | `app-1` | `docker logs` |
| wejść w panel Coolify z przeglądarki | tunel SSH | pułapki na końcu |

**CZTERY RZECZY, KTÓRE ZASKAKUJĄ KAŻDĄ NOWĄ SESJĘ.** Każda kosztowała nas
realny czas, więc nie są to przestrogi teoretyczne:

1. **`pnpm db:push:prod` NIE DZIAŁA.** Jest w `package.json`, więc wygląda na
   właściwą drogę, ale to pozostałość po Supabase Cloud — wymaga
   `SUPABASE_DB_URL`, którego nie ma. Migracje wgrywa się ręcznie, procedurą
   niżej. Nie próbuj tego skryptu i nie „naprawiaj" go bez uzgodnienia.
2. **AUTO-DEPLOY NIE DZIAŁA — repozytorium nie ma webhooka.** Flaga
   `is_auto_deploy_enabled` po stronie Coolify jest włączona, ale
   `gh api repos/.../hooks` zwraca pustą listę: nic nie powiadamia Coolify
   o pushu. **Po każdym pushu wyzwól wdrożenie ręcznie.** Kiedyś 13 commitów
   poszło na `main` bez ani jednego wdrożenia, bo ktoś wziął ręcznie
   wyzwolony deploy za efekt webhooka.
3. **Wdrażasz DWIE aplikacje, nie jedną.** `id=1` to Next.js, `id=2` to worker
   pg-boss z tego samego repo. Sam worker importuje szeroki przekrój `lib/**`,
   więc pominięcie go zostawia produkcję w stanie mieszanym: strona na nowym
   kodzie, joby na starym.
4. **Baza może wyprzedzać aplikację i to jest w porządku** — migracja wgrana
   przed wdrożeniem nie psuje działającej wersji, o ile jest addytywna
   (`ADD COLUMN` z wartością domyślną, nowa tabela). Odwrotna kolejność
   (kod przed migracją) wywala produkcję. **Zawsze: najpierw migracja,
   potem wdrożenie.**

### Kolejność przy pełnym wydaniu

```
1. pnpm test && pnpm typecheck && pnpm build   ← lokalnie, PRZED pushem
2. migracje na db-1  (+ wpis do schema_migrations + NOTIFY pgrst)
3. git push origin main
4. wdrożenie id=1 (aplikacja) i id=2 (worker)
5. weryfikacja: kontenery healthy, /api/health, strona, PostgREST
```

Krok 1 nie jest zbytkiem: produkcyjny build trwa 12-18 minut, a `pnpm build`
lokalnie łapie w trzy minuty te same błędy (np. plik `'use server'`
eksportujący coś innego niż funkcję asynchroniczną — `pnpm typecheck` tego
NIE łapie).

### Wgrywanie migracji na produkcję

NAJPIERW przeczytaj plik migracji i sprawdź, czy nie ma `DROP`, `TRUNCATE`
ani `DELETE FROM`. Dopiero potem uruchamiaj.

```bash
DB=178.104.128.144; K=~/.ssh/hetzner_faktflow_ed25519
PGC=supabase-db-ovrhjbsdpjdlnmkle1ulid4s
M=00063_nazwa

scp -i $K supabase/migrations/$M.sql root@$DB:/tmp/
ssh -i $K root@$DB "docker cp /tmp/$M.sql $PGC:/tmp/ && \
  docker exec $PGC psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  --single-transaction -f /tmp/$M.sql"
```

Po wykonaniu ZAWSZE dwie rzeczy, inaczej migracja jest połowiczna:

```bash
ssh -i $K root@$DB "docker exec $PGC psql -U postgres -d postgres \
  -c \"INSERT INTO supabase_migrations.schema_migrations (version, name)
        VALUES ('00063','nazwa') ON CONFLICT (version) DO NOTHING;\" \
  -c \"NOTIFY pgrst, 'reload schema';\""
```

Bez `NOTIFY pgrst` nowe tabele istnieją w bazie, ale aplikacja zwraca
`PGRST205 Could not find the table`. To nie jest teoria, potknęliśmy się
o to przy migracji 00060.

**Trzy rzeczy do sprawdzenia PRZED uruchomieniem, poza `DROP`/`TRUNCATE`:**

- **`UPDATE` na istniejących wierszach** — policz najpierw, ilu dotknie:
  `SELECT count(*) FROM tabela WHERE <ten sam warunek>;`. Zero wierszy
  znaczy, że możesz uruchamiać spokojnie; tysiąc znaczy, że najpierw pytasz
  właściciela.
- **Polityki RLS** — sprawdź nazwy kolumn w tabelach, do których się
  odwołujesz. `memberships` ma `organization_id`, NIE `tenant_id`; tabele
  agenta używają helpera `public.get_current_tenant_id()`. Zła kolumna =
  wycofana transakcja (to akurat kończy się bezpiecznie dzięki
  `--single-transaction`, ale kosztuje przebieg).
- **Numer migracji** — musi być kolejny i niezajęty:
  `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3;`

**Weryfikacja PO wgraniu — nie ufaj samemu „CREATE TABLE" w wyjściu.**
Sprawdź trzy rzeczy: obiekt istnieje, wpis w `schema_migrations` jest,
a PostgREST naprawdę go widzi:

```bash
ssh -i $K root@$DB "docker exec $PGC psql -U postgres -d postgres \
  -c \"\\d nazwa_tabeli\" \
  -c \"SELECT version, name FROM supabase_migrations.schema_migrations
        ORDER BY version DESC LIMIT 3;\""
```

Test PostgREST-a (najważniejszy, bo to on wywala `PGRST205`) — z `db-1`,
przez adres kontenera, bo sam kontener nie ma `curl`:

```bash
ssh -i $K root@$DB 'IP=$(docker inspect -f \
  "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" \
  supabase-rest-ovrhjbsdpjdlnmkle1ulid4s)
curl -s "http://$IP:3000/nazwa_tabeli?limit=1"'
```

**Jak czytać wynik:** `42501 permission denied` to ODPOWIEDŹ POPRAWNA —
znaczy, że PostgREST znalazł tabelę i odmówił dopiero na autoryzacji
(zapytanie leci bez tokenu). Dopiero `PGRST205` (brak tabeli) albo
`PGRST204` (brak kolumny) oznaczają nieprzeładowany cache schematu.

### Wdrożenie produkcji

Wdrożeniami steruje Coolify na `ops-1`. Najpewniejsza droga to `tinker`,
bo interfejs bywa zawodny.

Kod PHP podajemy na WEJŚCIU, przez heredoc w apostrofach — nie przez
`--execute`:

```bash
ssh -i ~/.ssh/hetzner_faktflow_ed25519 root@91.98.134.85 \
  'docker exec -i coolify php artisan tinker' <<'PHP'
$a = App\Models\Application::find(1);
queue_application_deployment(application: $a,
  deployment_uuid: (string) new \Visus\Cuid2\Cuid2(),
  force_rebuild: false, commit: 'HEAD', is_api: false);
PHP
```

Worker jobów to `id=2` — ta sama komenda z `find(2)`. Build trwa 12-18 minut.

**Dlaczego heredoc, a nie `--execute`.** Wariant z `--execute="..."` przechodzi
przez DWA shelle: lokalny i zdalny. `\$a` przeżywa lokalny jako `$a`, a potem
zdalny rozwija je do pustego napisu i do tinkera trafia `= App\Models\...`:

```
PHP Parse error: Syntax error, unexpected '=' on line 1
```

Heredoc w apostrofach (`<<'PHP'`) nie rozwija niczego lokalnie, a apostrofy
wokół komendy zdalnej zamykają sprawę po drugiej stronie. Przy okazji znika
też potrzeba podwajania ukośników w `App\\Models\\` i `\\Visus\\Cuid2`.
`docker exec` musi mieć `-i`, inaczej nie przyjmie wejścia.

Ten sam wzorzec działa do wszystkiego, co robimy tinkerem — na przykład
do sprawdzenia, co jest w kolejce wdrożeń:

```bash
ssh -i ~/.ssh/hetzner_faktflow_ed25519 root@91.98.134.85 \
  'docker exec -i coolify php artisan tinker' <<'PHP'
foreach (App\Models\ApplicationDeploymentQueue::orderBy('id','desc')->take(4)->get() as $d) {
  echo $d->id . " | " . $d->application_name . " | " . $d->status . " | " . $d->commit . "\n";
}
PHP
```

**Czytanie wyjścia `tinker`:** odbija on wpisane linie z prefiksem `>` i skraca
długie znakiem `<`. Filtrowanie po początku linii (`grep "^app"`) gubi wynik
i wygląda, jakby wdrożenie nie istniało. Filtruj po treści, nie po `^`.

**Statusy w kolejce:** `queued` → `in_progress` → `finished` albo `failed`.
Build trwa 12-18 minut, więc odpytuj co minutę, a nie w pętli bez przerwy.

### Kiedy wdrożenie padnie

Wyciągnij logi — bez nich zgadujesz:

```bash
ssh -i ~/.ssh/hetzner_faktflow_ed25519 root@91.98.134.85 \
  'docker exec -i coolify php artisan tinker' <<'PHP'
$d = App\Models\ApplicationDeploymentQueue::find(NUMER);
$logs = json_decode($d->logs, true) ?? [];
foreach (array_slice(array_map(fn($l) => $l['output'] ?? '', $logs), -40) as $line) {
  echo $line . "\n";
}
PHP
```

Coolify przy nieudanym buildzie **wycofuje nową wersję i zostawia działającą
starą** — awarii produkcji nie ma, masz czas na diagnozę.

### Weryfikacja po wdrożeniu

Nie kończ na „status = finished". Sprawdź, co faktycznie wstało:

Nazwy kontenerów to hasze generowane przez Coolify i zmieniają się przy
każdym wdrożeniu — nie wpisuj ich z pamięci, wyszukaj:

```bash
K=~/.ssh/hetzner_faktflow_ed25519

# 1. co działa, na jakim commicie, czy healthy
ssh -i $K root@116.203.71.134 \
  'docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}" | grep -v coolify-'

# 2. aplikacja odpowiada (nazwa kontenera znaleziona automatycznie)
ssh -i $K root@116.203.71.134 'C=$(docker ps --format "{{.Names}}" \
  | grep "^gpcs70aai71any6dnf8w69l8"); docker exec $C \
  curl -s -o /dev/null -w "app: HTTP %{http_code} w %{time_total}s\n" \
  http://localhost:3000/api/health'

# 3. strona publiczna (apex przekierowuje na www — to normalne)
curl -s -L -o /dev/null -w "%{http_code} %{url_effective}\n" https://faktflow.pl

# 4. błędy w logach obu kontenerów
ssh -i $K root@116.203.71.134 'for C in $(docker ps --format "{{.Names}}" \
  | grep -E "^gpcs70aai71any6dnf8w69l8|^chy9lasi0mcbuy0i54a1hr3t"); do
  echo "--- $C"; docker logs --since 10m $C 2>&1 | grep -i error | head -5; done'
```

Prefiksy nazw: aplikacja `gpcs70aai71any6dnf8w69l8`, worker
`chy9lasi0mcbuy0i54a1hr3t` — to identyfikatory aplikacji w Coolify i one
się nie zmieniają, zmienia się tylko sufiks po myślniku.

W logach aplikacji ostrzeżenia `Using the user object as returned from
supabase.auth.getSession()` to znany szum, nie awaria — nie zgłaszaj ich
jako problemu.

### Pułapki, które kosztowały nas awarie

- **Pusty `dockerfile_target_build` w Coolify** buduje OSTATNI etap pliku.
  Dopisanie etapu na końcu `Dockerfile` raz wyłączyło produkcję na 15 godzin.
  Aplikacja ma jawnie `runner`, worker `worker`.
- **Healthcheck Coolify wymaga `curl` w obrazie.** Bez niego deploy kończy się
  statusem „unhealthy" i wycofaniem, mimo poprawnie działającego procesu.
- **Zmienne środowiskowe mają bliźniaki `is_preview`.** Wyglądają jak duplikaty,
  ale nimi nie są. Produkcja używa `is_preview = false`.
- **`proxy.ts` przepuszcza tylko wymienione rozszerzenia.** Czego nie ma we
  wzorcu, leci przez bramkę auth i kończy przekierowaniem na `/login`.
  Dla wideo objawia się to wyłącznie cichym błędem dekodera.
- **Lokalny `.env.local` celuje w INNĄ bazę** (`utuzzxstfcnglppplvlw.supabase.co`)
  niż produkcja. To celowe. Nie podmieniaj bez uzgodnienia.
- **Build padający z `exit code 137` to zabójca OOM, nie błąd kodu.** `pnpm build`
  na `app-1` potrzebuje więcej pamięci, niż maszyna ma fizycznie: pułap sterty
  w `Dockerfile` to 3072 MB, a realnie wolne jest ~2.2 GB (sam `dockerd` bierze
  ~775 MB). Build jedzie na swapie i przy udanym przebiegu zjada go **4.5 GB**.
  **`app-1` musi mieć ≥ 8 GB swapu** — przy 4 GB wdrożenie ginie. Sprawdzenie:

  ```bash
  ssh -i ~/.ssh/hetzner_faktflow_ed25519 root@116.203.71.134 'swapon --show'
  ```

  Potwierdzenie diagnozy w logach jądra `app-1`:
  `dmesg -T | grep -i oom-kill`. Zdarzyło się 29 sierpnia 2026, gdy urósł
  `lib/flo/`; wcześniej build po prostu nie dobijał do sufitu.
- **Panel Coolify ma filtr po IP w chmurowej zaporze Hetznera, nie na serwerze.**
  Objaw jest mylący: przeglądarka ładuje się w nieskończoność, bo Hetzner
  odrzuca pakiety po cichu, zamiast zamknąć połączenie. Na serwerze `ufw` jest
  wyłączony i `iptables` nic nie blokuje, więc szukanie tam to strata czasu.
  Zamiast dopisywać zmienny domowy adres do zapory — tunel:

  ```bash
  ssh -i ~/.ssh/hetzner_faktflow_ed25519 -N -L 8000:localhost:8000 root@91.98.134.85
  ```

  Potem `http://localhost:8000`. Działa, bo `APP_URL` Coolify jest puste
  i panel trzyma się nagłówka `Host`.

### Praca w worktree

Sesje agentów bywają uruchamiane w `.claude/worktrees/*`, na osobnych gałęziach
lub w stanie „detached HEAD". Wtedy `git push` na `main` NIE przejdzie.
Sprawdź `git status` na starcie; jeśli nie jesteś na `main`, wypchnij swoją
gałąź i otwórz pull request zamiast walczyć z `main`.

## Co NIE robić

- Nie proponować alternatywnych technologii do stacku powyżej.
- Nie używać pages routera (tylko App Router).
- Nie używać `getServerSideProps` / `getStaticProps` (to Pages Router).
- Nie używać Redux ani Zustand bez konkretnej potrzeby — Server Components + React Context + URL state wystarczą w 95% przypadków.
- Nie używać Prisma / Drizzle ORM — `@supabase/supabase-js` wystarczy.
- Nie sugerować przepisania na Remix, SvelteKit itd.

## Dobre praktyki dla AI

Gdy piszesz nowy kod:

1. Sprawdź, czy podobna logika już istnieje w `lib/`.
2. Używaj TypeScript strict — pełne typy, nie `any`.
3. Dla Server Components — async/await bezpośrednio, bez `useEffect`.
4. Dla Client Components — dodawaj `"use client"` na górze pliku.
5. Commituj małe, logiczne zmiany (jeden commit = jedna sensowna zmiana).
