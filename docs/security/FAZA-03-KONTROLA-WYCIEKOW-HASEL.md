# F03 — kontrola wycieków haseł i rozliczenie CodeQL

Data: 2026-09-15. Autor: Astra, na polecenie kontynuacji Igora po publikacji PR #11. Punkt wyjścia: 0ec1069e31a2c5ad79c6abbe4d3603df78fb96b7 na codex/security-account-continuation. Identyfikator: **CYB-F03-15**. Status: poprawka lokalna po testach i przeglądzie; odbiór GitHuba i środowiska osobno.

## Ustalenie

[CI PR #11](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34999065676) dla poprzedniego pakietu przeszło: 1915 Vitest, 66 XML, typy, lint i zależności. [Security](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34999065411) zatrzymało się na jednym js/insufficient-password-hash w lib/auth/breach-check.ts:43. Secret scan i CodeQL Actions przeszły. Nie jest to zielony odbiór nowej poprawki.

Przegląd przepływu potwierdził, że SHA-1 służy wymaganej przez HIBP operacji wyszukiwania: pięć znaków prefiksu do stałego adresu HTTPS, porównanie sufiksu lokalnie. Ten wynik nie jest zapisywany jako hasło konta ani używany do uwierzytelnienia. Reguła nie rozróżnia tego celu; konkretne trafienie oceniono jako false positive. Nie zmieniono algorytmu ani nazw w celu ukrycia przepływu przed skanerem.

Znaleziono przy tym rzeczywisty problem prywatności: Redis zachowywał SHA-256 sufiksu SHA-1 jako klucz cache. Pozostaje to deterministycznym odciskiem, z którym można porównywać zgadywane hasła po uzyskaniu kopii cache. Nie potwierdzono takiego incydentu; poprawka usuwa zbędny zapis.

## Zmiany

- Usunięto odczyt i zapis cache powiązanego z konkretnym hasłem. Fetch ma jawne no-store, omit credentials i zakaz przekierowań.
- Timeout 3 s obejmuje połączenie oraz całe body. Każda ścieżka sprząta timer i połączenie.
- Odczyt strumienia ma limit 256 KiB (nasz limit, nie maksymalny rozmiar protokołu). Pełna odpowiedź musi zawierać poprawne sufiksy i bezpieczne nieujemne liczniki; duplikaty, przepełnienia, błędne UTF-8, częściowy HTTP 206 i uszkodzony koniec odpowiedzi oznaczają niedostępność.
- Log zawiera wyłącznie stały komunikat. Nie zapisuje hasła, prefiksu, sufiksu, body, URL ani wyjątku dostawcy.
- Zachowano dotychczasowe fail-open: przy niedostępności dodatkowej kontroli zwracane jest fallback: true. To nie dowód bezpieczeństwa hasła; lokalna polityka nadal obowiązuje.
- CodeQL zachowuje pełny SARIF, regułę oraz surowe liczniki high/critical. Jawna opcja bramki akceptuje najwyżej jedno przeglądnięte trafienie: konkretną regułę, ścieżkę, linię 34 i SHA-256 wszystkich bajtów pliku. Inne poważne wyniki, duplikaty i niepoprawne wejście nadal blokują.
- [Manifest](../../scripts/security/codeql-reviewed-finding.json) wygasa po 2026-12-15 UTC. Odcisk źródła: 74b53285ee125ef0e5be187700a69f854f457282fbf8df9ec042138518891d0b. Zmiana źródła unieważnia dopasowanie; nie odnawiać odcisku ani terminu automatycznie. Reguła .gitattributes utrzymuje LF tylko w tym pliku, aby checkout Windows/Linux odpowiadał temu samemu blobowi.
- Domyślna bramka bez jawnego manifestu nadal blokuje to trafienie. Suppressions i baseline nie przyznają wyjątku. Zgodne trafienie jest jawnie liczone jako acceptedReviewedFalsePositives=1, a high pozostaje 1.

## Weryfikacja

- **111 plików / 1950 Vitest PASS**, zero nieudanych i pominiętych; pełny typecheck i lint PASS. W tym 35 nowych testów HIBP z atrapą fetch/Redisa.
- **67 testów narzędzi bezpieczeństwa PASS**: bramka, bezpieczna diagnostyka, metadane i izolowany spis audytu. Testy nowego wyjątku są uruchamiane także przez istniejące CI.
- Przegląd modułu i niezależny przegląd bramki/manifestu przez inne instancje AI: bez potwierdzonych usterek. To nie zewnętrzny pentest.
- Rzeczywisty natywny fetch Node z lokalnym serwerem 127.0.0.1: **5/5 PASS**, w tym oba timeouty około 3 s, nadmierne body i niedokończone HTTP 503; połączenia zamknięte. Bez żądań do prawdziwego HIBP.
- Izolowana kompilacja Next.js webpack **compile PASS**. Bez plików .env i sekretów; syntetyczne ustawienia. Odcisk modułu w kopii jest zgodny z manifestem. Nie jest to pełne generowanie stron ani odbiór GoTrue.
- Pobrano oryginalny SARIF z GitHuba, analiza 1780828655, commit próbnego połączenia PR 83df938. Jego indeksowane artefakty są zgodne z matcherem. Oryginał nadal blokuje. Lokalna kopia z jawnym przestawieniem linii 43 → 34 potwierdza dopasowanie parsera; drugi wynik ponownie blokuje. **Ta kontrola parsera nie jest nowym przebiegiem CodeQL i nie była publikowana.**

Lokalne dowody: faktflow-hibp-validation-KhhbUn, faktflow-hibp-compile-c0GBIP, faktflow-hibp-sarif-verification-SBmx7u oraz faktflow-hibp-native-fetch-review.mjs w katalogu tymczasowym operatora. Nie zawierają danych produkcyjnych; nie są częścią repo.

## Zapis i skan sekretów

Kod i testy zapisano w commicie 0d45b7f15722d58ef763d35500e17696bcac8030. Skan Gitleaks kopii 10 przygotowanych plików: brak trafień. Pełna historia do tego commitu: 233 commity / 9,87 MB, brak trafień. Nie dodano wyjątków skanera sekretów. SHA-256 faktycznego bloba Git potwierdzono jako identyczne z manifestem i kopią kompilacji.

## Co pozostaje

Nowy commit musi przejść rzeczywiste CI/Security. GitHub prowadzi także osobny alert CodeQL #1; lokalny manifest nie zamyka go w GitHubie. Rozliczyć wyłącznie ten alert jako false positive po potwierdzeniu zgodnego źródła; nie wyłączać CodeQL ani innych alertów. W tej sesji nie zmieniano jeszcze stanu alertu.

Zmiana nie usuwa historycznych kluczy Redis. Dotychczasowy kod ustawiał TTL 24 h; ich faktycznego stanu ani wygaszenia na serwerze nie sprawdzano. Po wdrożeniu nowy kod przestaje je tworzyć i wykorzystywać. Koszt: brak cache zwiększa liczbę zapytań HIBP przy operacjach na hasłach; nie dodano ponowień.

Odbiór GoTrue/MFA, nonce, SRH/Valkey, RLS i pełne recovery pozostają zgodne z [listą odbioru poprzedniego pakietu](FAZA-03-ONBOARDING-I-HASLO.md#odbiór-przed-wydaniem). Nie wykonano SQL, czyszczenia Redisa, wdrożenia, restartów ani rotacji. Zmiana nie wymaga nowej migracji ani klucza.

Źródła: [protokół i padding HIBP](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange), [znaczenie reguły CodeQL](https://codeql.github.com/codeql-query-help/javascript/js-insufficient-password-hash/).
