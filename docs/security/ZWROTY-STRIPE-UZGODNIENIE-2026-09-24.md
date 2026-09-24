# Zwroty Stripe: trwała decyzja i uzgodnienie — 2026-09-24

**Stan:** pakiet lokalny, przed odbiorem. Ten dokument nie potwierdza wykonania migracji, działania na Stripe ani stanu produkcji.

## Problem

Dotychczas admin mógł ponowić `issueRefund` po utracie odpowiedzi Stripe lub błędzie zapisu lokalnego. Lokalny status nadal mógł być `succeeded`, mimo że Stripe przyjął zwrot. Bez klucza idempotencji nowa próba była osobnym żądaniem finansowym. Spóźniony webhook płatności mógł także nadpisać `refunded` na `succeeded`. Tabela `stripe_refunds` miała unikalny identyfikator samego zwrotu, ale nie blokowała drugiej decyzji dla tej samej płatności.

Stripe opisuje [ponawianie z kluczem idempotencji](https://docs.stripe.com/api/idempotent_requests), lecz klucze mogą zostać usunięte po co najmniej 24 godzinach, a pierwszy wynik `500` jest odtwarzany dla tego samego klucza. Samo ponowienie po niejednoznacznej odpowiedzi nie jest więc dowodem, że zwrot nie powstał. [Lista zwrotów Stripe](https://docs.stripe.com/api/refunds/list) może zostać zawężona do PaymentIntent lub Charge podczas uzgodnienia.

## Granica bezpieczeństwa

Nowa operacja pełnego zwrotu jest zapisywana przed zewnętrznym wywołaniem i ma stały klucz idempotencji oraz unikalną płatność. Stany `processing` i `reconciliation_required` blokują nowy zwrot; `completed` oznacza zapis potwierdzonego wyniku. Odpowiedź niepewna lub błąd zapisu pozostawia ślad do uzgodnienia, bez automatycznego tworzenia nowego klucza. Panel administratora odczytuje ten stan i nie pokazuje ponownej akcji. Odczyt zakończony błędem nie może być interpretowany jako brak zwrotu. Stan `processing` starszy niż 15 minut jest traktowany operacyjnie jak wynik niepewny: panel pokazuje potrzebę uzgodnienia, a cykliczny monitor wysyła alert z liczbą takich operacji bez identyfikatorów klientów. Nie zmienia to automatycznie statusu ani nie odblokowuje ponownego wywołania Stripe.

Pełny zwrot wysyła do Stripe jawną kwotę z płatności. Potwierdzenie sukcesu wymaga odpowiedzi Stripe ze statusem `succeeded` i trwałego lokalnego zapisu. Inny stan pozostaje do uzgodnienia; klient nie powinien dostać komunikatu ani maila „zwrot wykonany” na podstawie samego wysłania żądania. Spóźniony webhook płatności nie może cofnąć lokalnego stanu `refunded`. Guard w bazie odrzuca cały spóźniony zapis `succeeded`/`failed` także podczas istniejącej operacji zwrotu, a webhook po zapisie ponownie sprawdza wynik przed uruchomieniem audytu, windykacji lub faktury. Opóźniony job faktury VAT sprawdza bieżący status płatności tuż przed utworzeniem dokumentu. Nadal możliwy jest wyścig między ostatnim odczytem joba i zwrotem; dlatego odbiór wymaga scenariusza równoległego i kontroli późniejszych faktur.

## Odbiór Bartka

1. Odczytowo sprawdzić realny schemat/granty, wcześniejsze zwroty i częściowe zwroty dla każdej płatności, relacje firmy między `stripe_refunds` i `stripe_payments`, zgodność `stripe_payments.status` z panelem Stripe oraz kopię i restore. Historyczne niepewne przypadki rozliczyć ręcznie; nowa tabela sama nie odtworzy odpowiedzi utraconych przed jej powstaniem. Ocenić rozmiar tabeli i okno blokady zapisu przy tworzeniu indeksu. Nowy złożony FK `stripe_refunds_payment_tenant_fk` ma stan `NOT VALID`: egzekwuje przyszłe zapisy, ale nie uzdrawia historii. Po wyjaśnieniu rozbieżności zaplanować osobną walidację tego constraintu i potwierdzić `pg_constraint.convalidated = true`.
2. **Wstrzymać administracyjne zwroty na czas migracji i wymiany wszystkich instancji webu.** Stary web wysyłał do Stripe przed zapisem i nie można dopuścić, aby obsługiwał zwroty równolegle z nowym kodem. Na osobnej bazie i w Stripe **test mode** wykonać migrację `00075`, wdrożyć dokładny web i worker, a potem sprawdzić jeden zwrot, dwa równoległe kliknięcia, utratę odpowiedzi, błąd zapisu po odpowiedzi, spóźniony webhook i ponowny odczyt panelu. Nie używać żywego klienta ani produkcyjnej płatności jako próby.
3. Potwierdzić, że rola klienta nie może zapisywać operacji, a operator widzi stan niepewny i nie ma przycisku do nowej próby. Zapis audytu i mail są związane z potwierdzonym wynikiem; brak maila rozlicza się oddzielnie.
4. Dopiero po przeglądzie wyników i ścieżki rollbacku rozważyć wydanie produkcyjne. Rollback nie może ponownie odsłonić przycisku zwrotu dla operacji niepewnych. Starszego obrazu webu nie uruchamiać z nową tabelą bez sprawdzenia jego zachowania.

Przykładowy preflight na bazie (same liczniki, bez danych klientów):

```sql
SELECT count(*) AS refund_tenant_mismatches
FROM public.stripe_refunds r
LEFT JOIN public.stripe_payments p ON p.id = r.payment_id
WHERE p.id IS NULL OR r.tenant_id <> p.tenant_id;

SELECT count(*) AS paid_despite_local_refund
FROM public.stripe_payments p
WHERE p.status = 'succeeded'
  AND EXISTS (SELECT 1 FROM public.stripe_refunds r WHERE r.payment_id = p.id);

SELECT count(*) AS payments_with_multiple_refunds
FROM (
  SELECT payment_id FROM public.stripe_refunds
  GROUP BY payment_id HAVING count(*) > 1
) x;
```

Dodatkowa kontrola wyłącznie odczytowa dla operacji zablokowanych po awarii procesu:

```sql
SELECT count(*) AS stale_refund_operations
FROM public.stripe_refund_operations
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '15 minutes';
```

Te liczby nie wykryją zwrotu przyjętego przez Stripe bez lokalnego rekordu. Trzeba osobno sprawdzić jego panel/eksport i rozliczyć rozbieżności przed odblokowaniem zwrotów.

Przy `reconciliation_required` albo `processing` starszym niż 15 minut operator zapisuje identyfikator płatności i operacji, sprawdza w Stripe zwroty dla PaymentIntent/Charge, kwotę, walutę i status, a następnie dokumentuje wynik poza publicznym repo. Dopóki wynik nie jest pewny, nie wykonuje drugiego `refunds.create`, nawet z dawnym kluczem. Powtórzenie po upływie okna retencji klucza może zostać potraktowane jak nowe żądanie. Oczyszczenie niepewnego stanu i ewentualna nowa próba wymagają osobnej, jawnie audytowanej procedury; ten pakiet jej automatycznie nie wykonuje.

## Otwarte poza tym pakietem

Wyścig dwóch dostaw webhooka nadal wymaga atomowego przejęcia zdarzenia i kontrolowanej finalizacji. Potrzebne jest osobne przejście całej ścieżki rozliczania `refund.*` i `charge.refunded`, statusów `pending`/`failed`/`canceled`, częściowych zwrotów oraz powiadomień. Nie traktować zielonych testów hermetycznych jako potwierdzenia operacji finansowej na Stripe.
