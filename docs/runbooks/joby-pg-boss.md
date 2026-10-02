# Joby w tle — pg-boss (runbook)

Od 18 sierpnia 2026 wszystkie joby chodzą na **pg-boss** w naszym Postgresie
(schemat `pgboss` na `db-1`). Inngest odpięty 02.10.2026 (etap 10) — bez
ścieżki powrotu. Dostępy i zmienne: `AGENTS.md`, sekcja
„Infrastruktura i dostępy” (`source .agents/infra.env`).

## Jak to działa

| Element | Gdzie | Co robi |
|---|---|---|
| Wysyłka zadania | aplikacja web, `lib/jobs/enqueue.ts` | `sendJobEvent` → kolejka z `EVENT_QUEUE_MAP` (`lib/jobs/queues.ts`); zdarzenie może iść do kilku kolejek |
| Worker | Coolify **id=2**, `lib/jobs/worker.ts` | odbiera kolejki, prowadzi crony (`CRON_JOBS`), healthcheck HTTP dla Coolify |
| Rejestracja jobów | `lib/jobs/handlers/*` | kolejka → ciało joba z `lib/jobs/runners/*`, limity (`batchSize`, `groupConcurrency`), `onExhausted` |
| Ponowienia | wrapper workera | licznik `__attempt` w danych, harmonogram jak w Inngest; po wyczerpaniu `onExhausted` |
| Dziennik przebiegów | `inngest_run_log` (`lib/jobs/run-log.ts`) | każdy przebieg: sukces / błąd, czas; czyta go monitor alarmów i `/admin/system` |
| Heartbeat | cron `cron.ops-heartbeat` → `OPS_HEARTBEAT_URL` | ping co minutę do Healthchecks; **brak pinga = alarm** |

Wdrożenie zawsze obejmuje **web (id=1) i worker (id=2)** — worker importuje
szeroki przekrój `lib/**`, a stan mieszany psuje joby (AGENTS.md, pułapka 3).

## Stan kolejek

Najszybciej: bramka Telegrama, `/kolejki` (funkcja `ops.queues()`, 00100) —
zaległe, aktywne i nieudane z 24 h per kolejka.

Z `db-1` (tylko odczyt):

```bash
source .agents/infra.env
ssh -i $K root@$DB "docker exec $PGC psql -U postgres -d postgres -c \"
  SELECT name, state, count(*), min(created_on) AS najstarsze
    FROM pgboss.job
   WHERE state IN ('created','retry','active','failed')
   GROUP BY 1, 2 ORDER BY 1, 2;\""
```

Crony: ostatnie uruchomienie = `max(created_on)` dla kolejki `cron.*`.

## Logi workera

```bash
source .agents/infra.env
ssh -i $K root@$APP 'C=$(docker ps --format "{{.Names}}" | grep "^$WORKER_PREFIX");
  docker logs --since 30m $C 2>&1 | tail -100'
```

Logger workera maskuje pola z NIP-em i adresem e-mail (`lib/jobs/logger.ts`).
Błędy jobów idą do Sentry (worker od 01.10.2026).

## Typowe sytuacje

| Objaw | Co sprawdzić | Co zrobić |
|---|---|---|
| Alarm Healthchecks (brak pinga) | czy kontener workera działa; logi; czy baza odpowiada | restart workera w Coolify albo wdrożenie; po starcie zaległe zadania wykonają się same |
| Zadania czekają w `created` | logi workera (czy kolejka „aktywna”), limity `groupConcurrency` | jeśli worker żyje, a kolejka stoi — restart workera |
| Faktury wiszą w „Wysyłanie” | `docs/runbooks/hamulce-ksef.md`, `ksef_submissions` | uzgodnienie po numerach referencyjnych dzieje się przy ponowieniu (#126) |
| Wyłączyć crony (test, przełączanie) | — | `WORKER_DISABLE_SCHEDULES=true` na workerze — worker czyści też zapisany harmonogram |

**Nie kasuj** wierszy w `pgboss.*` ręcznie bez uzgodnienia — to także historia
przebiegów i ochrona przed podwójnym wykonaniem.
