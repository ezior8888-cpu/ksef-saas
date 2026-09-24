# Plan wydania zmian GDPR

Stan: 2026-09-15. Dotyczy zależności schematu, których wymaga kod GDPR
z [PR #1](https://github.com/ezior8888-cpu/ksef-saas/pull/1).
Projekt źródłowy: [PROPOZYCJE-SCHEMATU-GDPR.md](PROPOZYCJE-SCHEMATU-GDPR.md).

## Co już jest na produkcji

Dwie z trzech zależności zostały wgrane **15 września 2026**, bo dało się
udowodnić, że są addytywne wobec kodu faktycznie działającego (`b9c3703`):

| migracja | co robi | stan |
|---|---|---|
| `00070_gdpr_processing_claim` | wartość ENUM `processing` + kolumna `processing_started_at` | **wgrana** |
| `00071_gdpr_one_active_request` | UNIQUE na aktywnym żądaniu per użytkownik | **wgrana** |
| `00072_gdpr_cancel_token_hash` | zmiana nazwy kolumny + SHA-256 | **WSTRZYMANA** |

### Na czym oparto ocenę bezpieczeństwa 00070 i 00071

Sprawdzone w `lib/gdpr/deletion.ts` na wdrożonym commicie, nie założone:

- żadne zapytanie nie używa `select('*')` — wszystkie mają jawne listy
  kolumn, więc nowa kolumna jest dla działającego kodu niewidoczna;
- status jest wyłącznie porównywany równościowo, nie ma wyczerpującego
  dopasowania, które nowa wartość ENUM mogłaby rozsadzić;
- `createGdprRequest` już dziś zapobiega duplikatom na poziomie aplikacji
  (SELECT przed INSERT), więc UNIQUE zadziała tylko przy prawdziwym
  wyścigu — a wtedy zamiast niebezpiecznego duplikatu powstaje błąd,
  który naprawia się sam przy ponowieniu.

Weryfikacja funkcjonalna wykonana na żywej bazie w transakcji z `ROLLBACK`:
pierwsze żądanie przechodzi, drugie dla tego samego użytkownika jest
odrzucone, stan `processing` również zajmuje slot, a po `canceled`
użytkownik może złożyć nowe. Tabela pozostała pusta.

## Czego NIE wgrano i dlaczego

`00072` to **zmiana nazwy kolumny**, a nie zmiana addytywna. Reguła
z `AGENTS.md` („baza może wyprzedzać aplikację") obowiązuje wyłącznie dla
zmian addytywnych i tutaj nie ma zastosowania.

Kod wdrożony dziś odwołuje się do `cancel_token` w czterech zapytaniach.
Po zmianie nazwy użytkownik nie utworzy ani nie anuluje żądania usunięcia
konta, a worker nie odczyta kolejki. To awaria obsługi GDPR, nie
wyprzedzenie schematu.

Do tego migracja jest **nieodwracalna** — SHA-256 jest jednokierunkowy.

## Okno wydania dla 00072

### Warunki wstępne

1. PR #1 scalony do `main` (a wraz z nim `#2` → `#3` → `#4`, jeśli
   wydanie ma być spójne).
2. `pnpm test && pnpm typecheck && pnpm build` lokalnie PASS na commicie,
   który ma iść na produkcję.
3. Potwierdzone, że nowy `lib/gdpr/deletion.ts` czyta `cancel_token_hash`
   i hashuje token z linku tak samo, jak robi to backfill: SHA-256 na
   **tekście HEX** tokenu, nie na bajtach po dekodowaniu HEX.
4. Świeża kopia zapasowa `gdpr_deletion_requests`.

### Kolejność

```
1. wstrzymać obsługę żądań GDPR
   - zatrzymać workera (Coolify id=2) albo wyłączyć cron GDPR
   - potwierdzić, że żaden job nie jest w locie
2. kopia zapasowa tabeli:
   \copy public.gdpr_deletion_requests TO '/tmp/gdpr_backup.csv' CSV HEADER
3. policzyć stan przed migracją (dowód dla punktu 5):
   SELECT count(*) AS przed, count(*) FILTER (WHERE status IN ('pending','processing')) AS aktywne
   FROM public.gdpr_deletion_requests;
4. wgrać 00072 (--single-transaction, procedura z AGENTS.md)
   + wpis do schema_migrations + NOTIFY pgrst
5. zweryfikować (niżej)
6. wdrożyć OBIE aplikacje: id=1 oraz id=2
7. wznowić obsługę, zweryfikować ścieżkę end-to-end
```

Punkt 6 musi objąć obie aplikacje. Sam worker importuje szeroki przekrój
`lib/**`, więc pominięcie go zostawia produkcję w stanie mieszanym:
strona na nowym kodzie, joby na starym.

### Weryfikacja po migracji

```sql
-- kolumna zmieniona, stara nie istnieje
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='gdpr_deletion_requests'
  AND column_name IN ('cancel_token','cancel_token_hash');
-- oczekiwane: wylacznie cancel_token_hash

-- wszystkie wartosci maja format 64 hex
SELECT count(*) FROM public.gdpr_deletion_requests
WHERE cancel_token_hash !~ '^[a-f0-9]{64}$';
-- oczekiwane: 0

-- liczba wierszy sie zgadza z punktem 3
SELECT count(*) FROM public.gdpr_deletion_requests;
```

**Uwaga, żeby nie wyciągnąć fałszywego wniosku z CHECK-a.** Jawny token
powstaje jako `randomBytes(32).toString('hex')`, czyli również 64 znaki
hex. Wzorzec `^[a-f0-9]{64}$` pasuje więc tak samo do tokenu jawnego, jak
do skrótu. Ten CHECK pilnuje formatu i **nie jest dowodem, że backfill się
wykonał**. Jeśli w tabeli są wiersze, prawdziwym dowodem jest porównanie:
wziąć jeden token z kopii z punktu 2 i sprawdzić, że
`encode(sha256(convert_to('<token z kopii>','UTF8')),'hex')` równa się
wartości w bazie.

Przy pustej tabeli backfill jest operacją pustą i nie ma czego dowodzić —
wtedy dowodem poprawności jest dopiero test end-to-end z punktu 7.

### Test end-to-end po wznowieniu

1. Złożyć żądanie usunięcia konta na koncie testowym.
2. Sprawdzić, że w bazie jest skrót, a **nie** token z maila.
3. Kliknąć link anulowania z maila — musi zadziałać.
4. Sprawdzić alternatywną ścieżkę: anulowanie w ustawieniach przez
   zweryfikowaną sesję i aktualne hasło (dla przypadku awarii poczty).

### Wycofanie

**Nie da się odwrócić przez cofnięcie migracji** — SHA-256 jest
jednokierunkowy, a odtworzenie jawnych tokenów z kopii zapasowej
cofnęłoby całą korzyść bezpieczeństwa.

Jeśli po wdrożeniu pojawi się problem:

- **błąd w kodzie** → poprawić kod, **zachowując schemat z hashem**;
- **trzeba pilnie wrócić do starej aplikacji** → to wymusza przywrócenie
  tabeli z kopii z punktu 2 wraz ze schematem sprzed migracji. Oznacza to
  utratę żądań złożonych po migracji i jest decyzją właściciela, nie
  rutynowym rollbackiem.

Dlatego okno wydania warto wybrać wtedy, gdy liczba aktywnych żądań jest
możliwie mała — najlepiej zero, jak dziś.

## Stan wyjściowy na dziś

`gdpr_deletion_requests` ma **0 wierszy**. Krok „rozstrzygnięcie
duplikatów", który Masło oznaczył jako możliwy blocker wydania, jest
pusty. Jeśli 00072 wejdzie, zanim pojawią się prawdziwe żądania, backfill
będzie operacją pustą, a ryzyko wycofania — najniższe, jakie będzie
kiedykolwiek.
