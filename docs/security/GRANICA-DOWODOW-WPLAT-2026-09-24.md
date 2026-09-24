# Granica dowodów wpłaty i przypomnień — 2026-09-24

**Stan:** przygotowany kod, migracje `00073` i `00074` oraz test odbiorczy; brak wykonania SQL, odbioru rzeczywistej bazy, wdrożenia i włączenia automatyki. Ten dokument nie potwierdza bezpieczeństwa produkcji.

## Scenariusz i zmiana

Migracja `00014` daje roli `authenticated` pełen zapis do `payments`, `payment_imports` i `payment_reminders`, a ich RLS sprawdza tylko `tenant_id`. Klient z członkostwem może więc zmienić lub usunąć dowód wpłaty i stan przypomnienia. Osobny UPDATE faktury pozwala zmienić `paid_amount`, `payment_status` i `paid_at` bez dotykania tabeli wpłat. Pojedyncze FK po `id` nie wymuszają zgodności firmy dziecka i rodzica; dawny trigger `SECURITY DEFINER` mógł przeliczać saldo wskazanej obcej faktury.

- `00073_payment_evidence_boundary.sql` dodaje atomowe RPC do pauzy przypomnień, złożone FK `(tenant_id, invoice_id)` i `(tenant_id, matched_payment_id)` z `NOT VALID`, blokadę bezpośredniej zmiany stanu płatności i podstawowych danych zaakceptowanej faktury przez role klienta oraz przeliczenie salda tylko w obrębie firmy. Reaguje też na zmianę `is_auto_matched`; `paid_at` znika po utracie statusu pełnej zapłaty. Nowe FK zachowują wcześniejsze `ON DELETE CASCADE` dla faktury. Ta migracja nie cofa jeszcze starych grantów, więc jest zgodna ze starszym webem.
- Aplikacja wywołuje `set_invoice_reminders_paused` przez klienta sesyjnego. RPC ponownie sprawdza aktywne członkostwo i firmę faktury, po czym w jednej transakcji aktualizuje fakturę i anuluje jej oczekujące przypomnienia. Nie przyjmuje `tenant_id` od wywołującego.
- `00074_payment_evidence_client_lockdown.sql` odbiera klientom zapis do trzech tabel. Odczyt przez `authenticated` pozostaje tylko dla statusu `payment_reminders`, potrzebnego ekranowi zaległości; `service_role` otrzymuje jawne SELECT/INSERT/UPDATE/DELETE. Polityki klienta są tylko do odczytu.

`NOT VALID` wymusza FK dla **nowych** zapisów, lecz nie dowodzi poprawności historycznych wierszy. To zgodne z [dokumentacją PostgreSQL](https://www.postgresql.org/docs/17/sql-altertable.html). Złożone FK mogą wskazywać nieczęściowy unikalny indeks ([PostgreSQL](https://www.postgresql.org/docs/17/ddl-constraints.html)). Guard faktury działa jako wywołujący, a serwisowy trigger przeliczenia jako właściciel `SECURITY DEFINER`; zachowanie `current_user` opisuje [PostgreSQL](https://www.postgresql.org/docs/17/functions-info.html). Test na prawdziwym PostgREST pozostaje obowiązkowy.

## Kontrola Bartka przed wdrożeniem

Wyłącznie odczytowo i z zachowaniem wyników poza publicznym repo sprawdzić: ostatnią wersję migracji, rzeczywiste granty/RLS, uprawnienia `service_role`, rozmiar `invoices`/`payments`, istniejące indeksy, liczbę niespójnych relacji i sald oraz działający backup/restore. Przykładowe zapytania diagnostyczne (same liczniki, bez danych klientów):

```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('payments', 'payment_imports', 'payment_reminders')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role');

SELECT count(*) AS mismatched_payments
FROM public.payments p LEFT JOIN public.invoices i ON i.id = p.invoice_id
WHERE i.id IS NULL OR p.tenant_id <> i.tenant_id;

SELECT count(*) AS mismatched_reminders
FROM public.payment_reminders r LEFT JOIN public.invoices i ON i.id = r.invoice_id
WHERE i.id IS NULL OR r.tenant_id <> i.tenant_id;

SELECT count(*) AS mismatched_matched_imports
FROM public.payment_imports bi LEFT JOIN public.payments p ON p.id = bi.matched_payment_id
WHERE bi.matched_payment_id IS NOT NULL
  AND (p.id IS NULL OR bi.tenant_id <> p.tenant_id);

SELECT count(*) AS inconsistent_invoice_balances
FROM public.invoices i
WHERE i.paid_amount IS DISTINCT FROM (
  SELECT COALESCE(sum(p.amount), 0)
  FROM public.payments p
  WHERE p.tenant_id = i.tenant_id AND p.invoice_id = i.id
    AND (p.is_auto_matched = false OR p.is_confirmed = true)
);
```

Nie poprawiać wyników licznika automatycznie. Historyczna obca wpłata mogła już zafałszować `paid_amount`; samo zwalidowanie FK tego nie odwróci. Każdy taki przypadek wymaga oddzielnego rozliczenia z dowodem bankowym i śladem audytu. Zwykłe `CREATE UNIQUE INDEX` może blokować zapis na dużej tabeli; Bartek ocenia rozmiar i okno serwisowe albo przygotowuje bezpieczny plan budowy `CONCURRENTLY` poza transakcyjną migracją. Kod SQL nie był sprawdzony na produkcyjnym schemacie.

## Kolejność wydania i odbiór

1. Bartek potwierdza preflight, kopię, zgodność schematu i plan wycofania. Następnie wdraża **00073**. Gdy ten krok się nie powiedzie, nie wdraża aplikacji.
2. Po potwierdzeniu RPC i grantów wdraża dokładnie sprawdzony commit webu **i** workera. Stary web nadal może działać przed końcem rollout, bo `00073` zachowuje dawne zapisy. Odbiera pauzę i wznowienie na własnej testowej fakturze oraz brak wysyłki przy świeżej wpłacie.
3. Dopiero gdy oba procesy mają nowy kod, wdraża **00074**. Weryfikuje efektywne prawa `authenticated` i `service_role`, odczyt własnych/obcych statusów, brak zapisu klienta oraz sprawność jobów. Przerwanie przed `00074` pozostawia dawną lukę otwartą; nie oznaczać fazy jako zakończonej.
4. Po analizie i naprawie historycznych relacji oraz sald waliduje trzy złożone FK. `pg_constraint.convalidated` musi być `true`; `NOT VALID` pozostawione na stałe nie jest pełnym odbiorem. Potwierdza też `payment_status`/`paid_at` po kontrolowanej rekalkulacji.

Nowy przypadek w `tests/rls-isolation.test.ts` wymaga **osobnej jednorazowej bazy** z obydwoma migracjami, zgodnie z [instrukcją testu RLS](../../tests/README-RLS.md). Sprawdza bezpośredni PostgREST dwóch firm, odmowę DML, obce FK także przez `service_role`, przeliczenie wpłaty, ochronę faktury i RPC. Nie uruchamiać go na produkcji ani stagingu. Zielone testy jednostkowe i CI nie zastąpią tej próby.

Rollback po `00074` powinien przywrócić działającą wersję webu/workera opartą o RPC albo zatrzymać przypomnienia do naprawy. Rutynowe ponowne przyznanie klientom DML otworzyłoby znaną lukę. Osobno pozostają: pełna niezmienność wszystkich pól zaakceptowanej faktury, importer bankowy, atomowość odczytu wpłaty i zewnętrznej poczty, operacyjny odbiór obu kolejek oraz cała infrastruktura.
