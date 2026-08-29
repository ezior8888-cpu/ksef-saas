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
