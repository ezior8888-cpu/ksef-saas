# Hamulce wysyłki do KSeF

Krok 5 planu automatyzacji (1 października 2026). Trzy blokady, które
zatrzymują wysyłkę, zanim faktura dotrze do KSeF, oraz jedna reguła
konfiguracji, która nie pozwala jobom zniknąć po cichu.

| Hamulec | Kiedy działa | Co widzi użytkownik |
|---|---|---|
| Wyłącznik `killAllKsefSubmissions` | operator włącza go SQL-em | „Wysyłka faktur do KSeF jest chwilowo wstrzymana…” |
| Blokada korekt (`KOR_HOLD`) | zawsze przy `KSEF_ENV=production` | „Wysyłka faktur korygujących… wstrzymana do czasu poprawki ich kwot” |
| Blokada ROZ (`ROZ_HOLD_RECONCILE`) | zawsze (wcześniejsza zmiana) | komunikat o rozliczeniu zaliczek |
| `JOBS_BACKEND` jawny | poza lokalnym środowiskiem | brak zmiennej = zlecenie odrzucone, worker nie startuje |

Każdy hamulec sprawdzany jest w trzech miejscach: przy kolejkowaniu
(`lib/invoices/ksef-submit-enqueue.ts`), na starcie joba przed sondą zdrowia
i Offline24 oraz tuż przed wysyłką (`lib/inngest/jobs/submit-invoice.ts`).
Zatrzymana faktura dostaje status `failed` z kodem w `last_error_code`
— to stan „do uzgodnienia”, nie „odrzucona przez KSeF”. Mail o odrzuceniu
nie wychodzi.

## Wyłącznik wszystkich wysyłek

Kiedy: KSeF przyjmuje faktury z błędem po naszej stronie, podejrzenie
podwójnych wysyłek, incydent bezpieczeństwa z certyfikatami, prośba MF.

Globalne flagi nie mają przełącznika w `/admin/flags` (tam są tylko flagi
per organizacja), więc włączasz je w bazie:

```bash
source .agents/infra.env
ssh -i $K root@$DB "docker exec $PGC psql -U postgres -d postgres -c \
  \"UPDATE public.global_feature_flags
      SET enabled = true, updated_at = now(), updated_by = 'operator',
          note = 'powód i godzina'
    WHERE flag = 'killAllKsefSubmissions'
    RETURNING flag, enabled, updated_at;\""
```

Działa natychmiast: kolejkowanie i job czytają flagę wprost z bazy, z pominięciem
60-sekundowego cache. Jeśli `RETURNING` nie zwróci wiersza, flagi brakuje
w tabeli — dopisz ją `INSERT … ON CONFLICT (flag) DO UPDATE`.

Wyłączenie: to samo z `enabled = false`.

**Co dzieje się z fakturami w trakcie:**

- Nowe kliknięcia „Wyślij” zwracają komunikat i zostawiają szkic.
- Joby już w kolejce kończą się stanem `failed` / `KSEF_PAUSED`.
- Wiersze Offline24 przechodzą w `failed` (zdarzenie ma
  `manualReconciliationRequired`) — po zdjęciu wyłącznika trzeba je wysłać
  ponownie, zanim minie termin z Offline24.
- Wysyłka, która przed włączeniem doszła do KSeF, ma numery w
  `ksef_submissions`. Ponowne wysłanie po zdjęciu wyłącznika najpierw zapyta
  KSeF o jej status, więc nie powstanie duplikat.

Faktury do ponownego wysłania po zdjęciu wyłącznika:

```sql
SELECT id, tenant_id, internal_number, updated_at
  FROM public.invoices
 WHERE ksef_status = 'failed' AND last_error_code = 'KSEF_PAUSED'
 ORDER BY updated_at;
```

Błąd odczytu flagi (baza niedostępna) też blokuje wysyłkę: kolejkowanie
zwraca komunikat „spróbuj ponownie”, a job ponawia próbę. Awaria bazy nie
może po cichu zdjąć wyłącznika.

## Blokada korekt na produkcji

Generator korekt wysyła wartości „po” zamiast różnicy i zamienia `zw` na 23%
(AUD-03, AUD-04). Dopóki to nie jest naprawione, korekta przy
`KSEF_ENV=production` zostaje szkicem. Na KSeF TEST wysyłka działa, żeby
dało się sprawdzić poprawkę.

Zdjęcie blokady to zmiana w kodzie (`isCorrectionHeldForEnv` w
`lib/ksef/submission-holds.ts`), razem z poprawką generatora i testami kwot.
Nie przełączaj jej flagą.

## `JOBS_BACKEND`

Produkcja: `JOBS_BACKEND=pgboss` w obu aplikacjach Coolify (id=1 i id=2,
`is_preview = false`). Brak zmiennej albo literówka:

- kolejkowanie rzuca błąd zamiast po cichu wysłać zlecenie do Inngest,
- `/api/health` zwraca 503 (`checks.env = fail`),
- worker nie startuje,
- `/api/inngest` rejestruje pustą listę funkcji.

Lokalnie (`NODE_ENV=development`/`test`) brak zmiennej oznacza Inngest Dev
Server, jak wcześniej. Worker lokalny wymaga `JOBS_BACKEND=pgboss`.

**Rollback na Inngest** (`docs/migration/ETAP7-PGBOSS-PLAN.md`, Etap 9):
`JOBS_BACKEND=inngest` w aplikacji id=1 i **zatrzymanie** workera id=2.
Worker z `inngest` odmawia startu, bo zdublowałby crony Inngest Cloud.
