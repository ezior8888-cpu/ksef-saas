# Stripe Customer — trwały claim i odbiór 00083

Stan: lokalna gałąź; migracja jest tylko plikiem. Codex nie uruchamiał SQL, nie wywoływał żywego Stripe, nie wdrażał i nie publikował tej zmiany. Według datowanego wpisu Bartka na db-1 wykonano 00078–00082, lecz nie sprawdzono tego tu niezależnym odczytem bazy. Tutejsza 00083 Customer pozostaje niewykonanym plikiem i wymaga już istniejącej 00081; produkcyjna 00082 dotyczy widoku zaległości.

## Problem i granica gwarancji

Dotychczas dwa pierwsze równoległe wywołania `ensureStripeCustomer` mogły oba wykonać `customers.create`, zanim którykolwiek zapisał `tenants.stripe_customer_id`. Warunkowy zapis w bazie wybierał jednego Customer, ale drugi już istniał u Stripe z emailem, nazwą i NIP-em. To osierocony rekord i problem retencji danych, nawet jeśli nie ma drugiego Checkout.

00083 daje firmie jeden trwały identyfikator próby przed wywołaniem Stripe. Claim jest przydzielany pod blokadą wiersza `tenants` — ten sam porządek blokad stosuje Checkout. Pierwsze wywołanie ma losowy identyfikator w kluczu idempotencji i `metadata.customerAttemptId`; kolejne widzi `creating` i nie wywołuje Stripe. Po sprawdzeniu tożsamości Customer osobny RPC zapisuje `stripe_customer_id` w firmie i `completed` w próbie w jednej transakcji. Potwierdzenie zapisu utracone po COMMIT można rozpoznać świeżym odczytem dokładnie tego samego ID.

Gdy odpowiedź `customers.create` lub sprawdzenia Customer jest niepewna, claim przechodzi do `uncertain`; jeśli nawet zapis tego stanu się nie powiedzie, `creating` nadal blokuje nową próbę. Znane ID jest zapisywane w próbie do uzgodnienia. Nie ma automatycznego wygaśnięcia ani ponownego `customers.create`: Stripe może usunąć klucz idempotencji po co najmniej 24 godzinach, więc użycie go później nie dowodzi ponowienia tej samej operacji. [Dokumentacja idempotencji Stripe](https://docs.stripe.com/api/idempotent_requests). [Wyszukiwanie Customer](https://docs.stripe.com/api/customers/search) jest opóźnione i nie nadaje się jako dowód braku rekordu bezpośrednio po zapisie.

Co 5 minut monitor liczy `creating` starsze niż 15 minut i wszystkie `uncertain`. Alarm zawiera tylko liczniki, bez emaili, NIP-ów i ID Customer; krytyczny Slack musi potwierdzić 2xx, a błąd dostarczenia nie ustawia deduplikacji.

## Odbiór i okno wdrożenia — Bartek

1. Potwierdzić dokładny obraz webu i workera na Coolify oraz odczytowo porównać raport Bartka o 00075–00082 z rzeczywistym stanem db-1, szczególnie 00078 i 00081. Zweryfikować backup i próbę odtworzenia. Na kopii bazy zastosować 00083 po 00081; sprawdzić RLS, brak bezpośredniego INSERT/UPDATE dla service_role i brak EXECUTE dla anon/authenticated. Przed otwarciem zakupów potwierdzić, że PostgREST widzi nowe RPC claim_stripe_customer_attempt, record_stripe_customer_attempt i hold_stripe_customer_attempt dla service_role; przy nieaktualnym cache schematu odświeżyć go według [instrukcji Supabase](https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema). Nie wyciągać wniosku o stanie produkcji z samej gałęzi Git.
2. Przed zmianą odciąć stare instancje od tworzenia Customer, Checkout i Billing Portal, opróżnić żądania w toku, a potem dopiero uruchomić nowy kod z 00083. Stary kod omija nowy claim. Rollback do starego kodu wymaga ponownego odcięcia tych wejść; sama zmiana obrazu jest niebezpieczna.
3. W test mode i na kopii bazy sprawdzić dwa równoległe pierwsze żądania tej samej firmy, osobne firmy, istniejące powiązanie, błąd sieci po utworzeniu Customer, utraconą odpowiedź RPC po COMMIT, błędne metadane, usuniętego Customer, kolizję z przypisanym Customer oraz odmowę SQL dla anon/authenticated. Dwa równoległe wywołania mają spowodować najwyżej jeden `customers.create`. Po niepewnej odpowiedzi późniejsze wywołanie, również po 24 godzinach, nie może ponawiać tworzenia.
4. Zweryfikować syntetyczny alarm `creating > 15 min` i `uncertain` z działającym `SLACK_WEBHOOK_URGENT`, wyłącznie licznikami, oraz ponowienie po braku webhooka, HTTP 4xx/5xx i timeout. Sprawdzić, że błąd odczytu tabeli nie jest raportowany jako zdrowy wynik.
5. Przed uruchomieniem produkcyjnym przejrzeć historyczne Customers w trybie live i test osobno. Porównać każdy `tenants.stripe_customer_id` z Customer ID i `metadata.tenantId` w Stripe, a następnie wyszukać dodatkowe Customers z tą samą metadaną. Uwzględnić paginację i opóźnienie indeksu wyszukiwarki Stripe. Dla osieroconych rekordów sprawdzić subskrypcje, faktury, płatności, metody płatności i tax IDs. Nie usuwać automatycznie ani nie scalać rekordów tylko dlatego, że jedna lista jest pusta. Uzgodnić z właścicielem i osobą odpowiedzialną za RODO zakres zachowania/usunięcia oraz udokumentować decyzję.

## Uzgadnianie `creating` i `uncertain`

Identyfikować próbę po `tenant_id` i `id` w `stripe_customer_attempts`, bez publikowania danych klienta w alarmie. Jeśli zapisane jest `stripe_customer_id`, pobrać dokładnie tego Customer w odpowiednim trybie Stripe, sprawdzić `metadata.tenantId`, powiązane subskrypcje i dane rozliczeniowe. Gdy ID nie ma, szukać `metadata.customerAttemptId` oraz `metadata.tenantId` i przejrzeć Customers tej firmy i czas próby w Stripe; brak wyniku w wyszukiwaniu nie dowodzi, że Customer nie powstał. Idempotency key może już nie istnieć. Nie usuwać claimu, nie resetować stanu i nie ponawiać `customers.create` bez niezależnych dowodów. Udokumentowany ręczny repair może przypisać potwierdzonego Customer i oznaczyć próbę w jednej transakcji pod blokadą firmy; wymaga osobnej recenzji SQL i śladu audytowego. Ten pakiet celowo nie udostępnia ogólnego endpointu resetu.

Odczyt diagnostyczny na kopii lub przez uprawnionego operatora:

```sql
SELECT status, count(*)
FROM public.stripe_customer_attempts
GROUP BY status
ORDER BY status;
```

Ograniczenie: testy jednostkowe nie zastępują próby z rzeczywistym Postgres i Stripe test mode. Przed wdrożeniem Bartek musi potwierdzić współpracę 00077 triggera niezmienności, 00081 blokady tenant i 00083 RPC oraz rzeczywiste granty.
