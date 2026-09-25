# Odczytowy audyt luk Stripe → sprawy finansowe

**Status:** kod przygotowany w izolowanym worktree. Nie uruchomiono go przeciwko prawdziwemu Stripe ani bazie. Nie wykonano migracji, replay, zwrotu, merge ani wdrożenia. Migracja 00080 oraz zależne 00078–00079 pozostają niepotwierdzone na db-1.

## Co sprawdza

Skrypt porównuje pełne identyfikatory zwrotów re_ i sporów du_ utworzonych w jawnie wybranym oknie UTC z wierszami stripe_financial_cases. Dodatkowo pokazuje identyfikatory finansowych receiptów webhooka o stanie failed oraz processing/retryable starszych niż 15 minut. **Lista receiptów obejmuje całą dostępną historię bazy, nie tylko wskazane okno dat**; stary receipt w wyniku nie musi dotyczyć nowego refundu lub sporu. Nie odczytuje payloadu receiptu i nie wypisuje klienta, adresu, kwoty ani kluczy. Jest **wyłącznie odczytowy**: nie ma zapisu sprawy, resetu claimu, replay, korekty VAT ani wywołania refunds.create.

Wynik no_gaps_detected znaczy tylko: w podanym oknie, przy **dostarczonym kluczu Stripe i dostarczonym adresie bazy**, wszystkie pobrane re_/du_ miały lokalny wiersz oraz nie było widocznych niepewnych finansowych receiptów. Skrypt sprawdza, czy --mode odpowiada prefiksowi klucza test/live, lecz **nie umie udowodnić**, że URL bazy wskazuje odpowiadające środowisko. Nie porównuje zmiany statusu starszych obiektów, nie zastępuje historycznego sweepu wielu okien, nie wykrywa zdarzeń spoza wskazanego konta Stripe i nie dowodzi poprawnego hold albo dostarczenia alertu.

## Warunki uruchomienia przez operatora

1. Bartek potwierdza SHA zgodnego webu/workera na Coolify oraz faktyczne wykonanie 00075–00080 na db-1, w tym 00078. Potwierdza kopię i próbę odtworzenia oraz poprawną konfigurację endpointu Stripe i alarmów.
2. Operator w bezpiecznej sesji sprawdza **osobno** w Stripe Dashboard, jaki to account i test/live, a w konfiguracji, do jakiej bazy wskazuje NEXT_PUBLIC_SUPABASE_URL. Klucz STRIPE_SECRET_KEY powinien mieć wyłącznie potrzebny odczyt Stripe, jeśli używany jest restricted key. SUPABASE_SERVICE_ROLE_KEY ma szersze uprawnienia; nie umieszczać go w CI ani publicznych logach.
3. Dla każdego wycinka maksymalnie 31 pełnych dni UTC uruchamia lokalnie:

       pnpm exec tsx scripts/security/audit-stripe-financial-gaps.ts --mode test --from 2026-09-23 --to 2026-09-25

   Zakres to [from, to): od północy from włącznie, do północy to wyłącznie. Dzień końcowy musi być już zakończony. Dla produkcji używa --mode live wyłącznie po potwierdzeniu właściwego konta i bazy. Dla dłuższej historii uruchamia kolejne ciągłe, niepokrywające się okna. Nie uruchamia w CI z produkcyjnymi kluczami.

4. Porównuje liczbę refundów/sporów w wynikach z Stripe Dashboard dla tych samych pełnych dni UTC; sprawdza, czy paginacja nie została ucięta. Każdy wynik attention lub incomplete wymaga ręcznego porównania identyfikatorów w Stripe i bazie. Dowód z danymi pozostaje poza publicznym repo.

## Interpretacja

- Kod wyjścia 0 i no_gaps_detected: brak wykrytej luki **w powyższym ograniczonym zakresie**. Nadal wymagane potwierdzenie konta, bazy, okna i liczników.
- Kod 1 i attention: missingRefundIds/missingDisputeIds lub uncertainReceipts. Trzeba wstrzymać zależny automat dla ustalonego zakresu, rozliczyć płatność, zwrot/spór i już wystawiony VAT/KSeF. Wpis failed/processing bez sprawy nie tworzy automatycznie hold konkretnej płatności.
- Kod 2 i incomplete: błąd, brak 00080, sprzeczny wynik, ucięta strona lub limit. **Nie wolno** interpretować częściowych danych jako zera luk. schema_unavailable oznacza m.in. brak tabeli 00080; database_unavailable i stripe_unavailable nie ujawniają surowych błędów ani kluczy.

Limit to 50 stron × 100 obiektów **na każdy typ** (refund/dispute), 5000 niepewnych receiptów i 500 stron bazy. Przekroczenie limitu kończy się incomplete; skrócić okno lub rozwiązać przyczynę, a nie ignorować wynik. Zapytania o lokalne sprawy są ograniczone do paczek pełnych ID z Stripe i weryfikują kompletność odpowiedzi bazy, nawet gdy serwer zwróci mniej wierszy niż zamówiono.

Nie wywoływać record_stripe_financial_case dla brakujących obiektów: RPC 00080 wymaga aktywnego, prawidłowo claimowanego receiptu. Nie usuwać i nie resetować failed/processing ani nie ponawiać operacji finansowej bez sprawdzenia jej skutków. Oddzielna, audytowalna procedura odzyskiwania receiptu pozostaje do zaprojektowania.

Źródła API: [lista zwrotów](https://docs.stripe.com/api/refunds/list), [lista sporów](https://docs.stripe.com/api/disputes/list), [lista zdarzeń — tylko do 30 dni](https://docs.stripe.com/api/events/list). Procedura wdrożenia 00080: [runbook](STRIPE-SPRAWY-FINANSOWE-ODBIOR-2026-09-25.md).
