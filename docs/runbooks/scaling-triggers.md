# Scaling Triggers Runbook (Faza 34)

Kiedy skalować, co skalować i — najważniejsze — **kiedy przestać płacić za
zarządzane SaaS-y i przenieść się na Hetznera**.

Filozofia projektu: *free/cheap tier first*. Skalujemy reaktywnie, na podstawie
metryk, nie przeczuć. Ten dokument definiuje progi, żeby decyzja "trzeba
zeskalować" była mechaniczna, a nie paniczna o 2 w nocy.

Każdy komponent ma dwa progi:
- **OBSERWUJ** — zacznij patrzeć na wykres co kilka dni.
- **DZIAŁAJ** — zrób akcję z kolumny "Akcja" w ciągu tygodnia.

---

## 1. Progi per komponent

### Vercel (hosting + funkcje serverless)

| Metryka | OBSERWUJ | DZIAŁAJ | Akcja |
|---|---|---|---|
| Function duration p95 | > 2 s | > 5 s | Profiluj wolny route; rozbij na Inngest job |
| Function errors (5xx) | > 0.5% | > 2% | Sprawdź Sentry; zwykle timeout DB lub OOM |
| Function memory (peak) | > 70% limitu | > 90% | Podnieś `memory` w `vercel.json` dla route'a |
| Concurrent executions | — | bliski limitu planu | Upgrade planu lub kolejkowanie przez Inngest |
| Bandwidth / mies. | 70% limitu | 90% | Sprawdź CDN cache hit ratio; upgrade |

Vercel auto-skaluje funkcje — nie ma "dodaj serwer". Wąskim gardłem jest
**plan** (limity concurrency / bandwidth) i **czas funkcji**, nie liczba maszyn.

### Supabase (Postgres + Auth + RLS)

| Metryka | OBSERWUJ | DZIAŁAJ | Akcja |
|---|---|---|---|
| CPU bazy | > 50% | **> 70%** (DoD Fazy 34) | Upgrade compute add-on; przejrzyj slow queries |
| Połączenia (pooler) | > 60% puli | > 80% | Wymuś pooler w trybie `transaction`; podnieś plan |
| Dysk | 60% | 80% | Upgrade dysku; sprawdź retencję `audit_logs` |
| Query p95 | > 300 ms | > 500 ms | `EXPLAIN ANALYZE`; dodaj indeks (wzór: 00055) |
| Materialized view refresh | > 30 s | > 90 s | Rozbij MV / zwiększ interwał crona z Fazy 21 |

> Loadtest `pnpm load:stress:db` celowo dobija bazę — obserwuj te metryki
> w dashboardzie Supabase **w trakcie** biegu.

### Inngest (background jobs)

| Metryka | OBSERWUJ | DZIAŁAJ | Akcja |
|---|---|---|---|
| Queue depth (oczekujące) | > 500 | > 5000 | Sprawdź czy worker nie pada; podnieś concurrency |
| Step errors | > 1% | > 5% | Sentry; sprawdź retry budget submitInvoice |
| Throughput (runs/min) | bliski limitu planu | limit planu | Upgrade planu Inngest |

KSeF submit ma własny throttle 60/min per tenant (Faza 23) — to celowe,
nie traktuj jako wąskie gardło.

### Upstash Redis (cache + rate limiting)

| Metryka | OBSERWUJ | DZIAŁAJ | Akcja |
|---|---|---|---|
| Komendy / dzień | 60% limitu planu | 85% | Upgrade planu lub podnieś TTL cache |
| Latencja p99 | > 50 ms | > 150 ms | Sprawdź region instancji (musi być EU) |

### Cloudflare R2 (XML FA(3) + backupy)

| Metryka | OBSERWUJ | DZIAŁAJ | Akcja |
|---|---|---|---|
| Storage | — | wzrost kosztu | OK — R2 jest tani; retencja prawna 10 lat wymusza wzrost |
| Class A ops (zapisy) | — | spike | Zwykle backup cron — sprawdź czy nie dubluje |

---

## 2. Decyzja: kiedy migrować na Hetzner

Stack zarządzany (Vercel + Supabase + Inngest + Upstash) jest **idealny na
start** — zero DevOps, szybki dowóz funkcji. Staje się drogi dopiero przy
skali. Migracja na Hetzner (self-hosted) to świadoma decyzja, nie awaria.

### Rozważ migrację, gdy spełnione są ≥ 2 z poniższych:

1. **Koszt** — łączny rachunek SaaS > ~600–800 €/mies. *stabilnie* przez 3 mies.
   (na Hetznerze ten sam workload to zwykle 50–150 €/mies. + Twój czas).
2. **Plan Supabase** — jesteś na płatnym compute add-on i nadal ocierasz się
   o 70% CPU mimo zoptymalizowanych zapytań.
3. **Limity planów** — concurrency Vercela lub throughput Inngest blokują
   wzrost, a kolejny tier jest nieproporcjonalnie drogi.
4. **Masz czas na DevOps** — migracja to realnie 2–4 tygodnie pracy +
   ciągłe utrzymanie (patche, monitoring, backupy).

### Czego NIE robić

- Nie migruj "bo taniej" przy < 100 płacących klientach — Twój czas jest
  droższy niż różnica w rachunku.
- Nie migruj wszystkiego naraz. Kolejność: najpierw DB (Postgres na Hetzner
  + PITR), potem hosting (Next.js w kontenerze), na końcu joby.
- Nie ruszaj migracji w sezonie (mandatory KSeF, końce kwartałów VAT).

### Co obejmuje migracja (skrót)

| Z | Na Hetzner |
|---|---|
| Supabase Postgres | Postgres + PgBouncer + `pgBackRest` (PITR) |
| Supabase Auth | self-hosted GoTrue lub zostaje Supabase (auth da się rozłączyć od DB) |
| Vercel | Next.js w Dockerze za Caddy/nginx, 1–2 VPS + load balancer |
| Upstash | Redis na VPS |
| Inngest | zostaje (SaaS) albo self-hosted |
| R2 | zostaje — tani i działa |

Pełny plan migracji to osobny dokument — pisany dopiero, gdy progi powyżej
realnie zostaną przekroczone.

---

## 3. Szybki przegląd przed skalowaniem

Zanim zapłacisz za wyższy plan — sprawdź, czy nie da się taniej:

1. **CDN cache** — czy strony marketingowe i statyczne assety mają wysoki
   cache hit ratio na Cloudflare? (zob. `docs/performance-budget.md`).
2. **Cache TTL** — czy gorące odczyty idą przez Redis (Faza 22)?
3. **Slow queries** — `EXPLAIN ANALYZE` na top 5 zapytań z dashboardu Supabase.
4. **Bundle** — czy First Load JS nie rośnie? (budżet 300 KB).

Często "potrzeba większego planu" to w rzeczywistości brakujący indeks.
