# KSeF API Error Codes (Faza 35)

Lookup dla błędów zwracanych przez API KSeF 2.0. Pełne, aktualne tłumaczenia
trzymamy w bazie (`error_translations` table) i przekładamy w UI.

> ⚠️ **Źródło prawdy:** tabela `error_translations` w DB + dokumentacja MF
> (https://ksef.mf.gov.pl). Lista niżej jest **przewodnikiem operacyjnym**
> (najczęściej widywane kody + co z nimi zrobić), nie kompletnym katalogiem.
> MF aktualizuje kody; po większych release'ach KSeF warto zsynchronizować
> `error_translations`.

## Klasyfikacja (jak ich używamy)

Każdy kod KSeF mapujemy na jedną z 4 kategorii w `lib/ksef/error-classifier.ts`:

| Klasa | Co znaczy | Reakcja Inngest |
|---|---|---|
| **CLIENT_INPUT** | Błąd po stronie user-a (zły NIP, duplikat, walidacja) | `NonRetriableError` — nie retry'ujemy |
| **AUTH** | Token wygasł, bad credentials | Refresh tokenu + 1 retry |
| **KSEF_DOWN** | KSeF zwrócił 5xx / timeout | Pełen retry schedule (30s → 1h) |
| **MAINTENANCE** | Zapowiedziana przerwa | Offline24 od razu |

## Najczęstsze kody — co znaczą, co robić

### Authentication / Authorization (21100-21199)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21100 | Invalid signature / nieprawidłowy podpis | AUTH | Sprawdź `KSEF_CREDENTIALS_ENCRYPTION_KEY`, rotated? |
| 21101 | Token expired | AUTH | `lib/ksef/auth.ts` auto-refresh; jeśli pętla — bug |
| 21102 | Invalid token format | AUTH | Patrz `ksef_sessions` — zła kolumna? |
| 21103 | Unauthorized access | AUTH | Tenant nie ma uprawnień KSeF dla tego NIP |
| 21105 | Subject context required | AUTH | Brakuje context `tenant_nip` w request — bug |

### Submit / Validation (21200-21299)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21200 | Invalid XML format | CLIENT_INPUT | Sprawdź `lib/xml/validator.ts` — walidacja XSD lokalna powinna złapać |
| 21202 | Schema validation failed | CLIENT_INPUT | XSD niezgodny — sprawdź wersję FA(3) |
| 21270 | Duplicate invoice number | CLIENT_INPUT | User próbuje wystawić tę samą fakturę 2× (unikalny `internal_number`) |
| 21280 | Invalid invoice type | CLIENT_INPUT | Generator XML wybrał zły szablon (advance/correction/final) |

### Status / UPO (21300-21399)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21301 | Invoice not found | CLIENT_INPUT | Race condition — pytamy o status faktury, której KSeF jeszcze nie przetworzył |
| 21320 | UPO not ready | (poll) | Normalne; cron `upoRetryStaleJob` próbuje co 24h |

### Infrastruktura KSeF (21900-21999)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21900 | Service unavailable | KSEF_DOWN | Retry schedule; alert `#urgent` gdy > 1 h |
| 21950 | Planned maintenance | MAINTENANCE | Offline24 od razu; user dostaje QR |
| 21999 | Internal server error | KSEF_DOWN | Retry; reportuj do MF jeśli persistent |

---

## Procedura debugowania błędu KSeF

User zgłosił "moja faktura ma błąd" (`/invoices/[id]` pokazuje czerwoną banner).

### Krok 1 — Zlokalizuj invoice w DB

```sql
SELECT id, internal_number, ksef_status, ksef_error_code,
       ksef_error_message, created_at
FROM invoices
WHERE id = '<uuid z URL>'
   OR internal_number = '<numer>';
```

### Krok 2 — Sprawdź historię prób

```sql
SELECT attempt_number, status, error_code, error_message,
       request_payload, response_body, created_at
FROM ksef_submissions
WHERE invoice_id = '<uuid>'
ORDER BY created_at;
```

Pokazuje wszystkie próby: pierwsza, retry'e, finalna. Każda ma raw response
z KSeF (`response_body`).

### Krok 3 — Sprawdź czy KSeF w ogóle żył

```sql
SELECT checked_at, status, response_time_ms
FROM ksef_health_log
WHERE checked_at > now() - interval '1 hour'
ORDER BY checked_at DESC;
```

Jeśli health był OK ale faktura padła — błąd po naszej stronie (CLIENT_INPUT).
Jeśli health był DOWN — KSEF_DOWN, retry powinien już zadziałać.

### Krok 4 — Polskie tłumaczenie kodu

```sql
SELECT code, pl_message, action_hint
FROM error_translations
WHERE code = '<kod z ksef_submissions.error_code>';
```

`action_hint` to wskazówka dla user-a (np. "Sprawdź NIP nabywcy"). Jeśli brak
mapowania → dodać do `error_translations` (migracja).

### Krok 5 — Decyzja

| Wynik dochodzenia | Akcja |
|---|---|
| Bug walidacji po naszej stronie (np. zły XML) | Fix XML generator + retest na test env |
| Bad input user-a (zły NIP, duplikat) | Pokaż user-owi `action_hint`, "skoryguj i wystaw ponownie" |
| KSeF down — retry działał | Powiedz user-owi "spróbuj za chwilę", jutro powinno pójść |
| Po retries → Offline24 | User ma już QR; przypomnij że ma 24h na ręczne złożenie |

---

## Specjalne przypadki

### "Faktura w stanie processing" > 30 min

UPO normalnie przychodzi w sekundach do minut. > 30 min = albo KSeF zatkany,
albo job `downloadUpo` padł. Patrz:
```sql
SELECT * FROM upo_receipts WHERE invoice_id = '<uuid>';
SELECT * FROM inngest_run_log WHERE function_id = 'download-upo' ORDER BY created_at DESC LIMIT 10;
```

### "Wszystkie faktury z dziś mają błąd 21100"

Globalny problem auth → najprawdopodobniej rotated `KSEF_CREDENTIALS_ENCRYPTION_KEY`
bez re-encrypt sesji w `ksef_sessions`. Patrz [key-rotation.md](./key-rotation.md).

### "Faktura zaakceptowana, ale nie mam UPO"

UPO retry cron (`upoRetryStaleJob`) powinien dorzucić w ciągu 24h. Manual
trigger: `pnpm trigger:submit` (skrypt).

---

## Aktualizacja `error_translations`

Po większym release KSeF (zwykle co kwartał MF publikuje nowe kody):

1. Pobierz aktualną listę z dokumentacji MF.
2. Diff z `error_translations` w DB.
3. Nowa migracja `00XXX_ksef_error_codes_<data>.sql` z INSERT-ami /
   UPDATE-ami.
4. Deploy przez `pnpm db:push:prod`.

## Powiązane

- [sentry-error-codes.md](./sentry-error-codes.md) — szerszy patron error-handling
- [docs/architecture/ksef-flow.md](../architecture/ksef-flow.md) — pełny flow
- [ADR-0004](../adr/0004-ksef-retry-i-offline24.md) — retry schedule
- `lib/ksef/error-classifier.ts` — klasyfikator kodów
- Tabele: `ksef_submissions`, `error_translations`, `ksef_health_log`
