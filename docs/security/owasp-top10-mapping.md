# OWASP Top 10 (2021) — kontrole i granice weryfikacji FaktFlow

Aktualizacja 2026-09-10 po naprawach audytu wycieków. Ta mapa wskazuje kontrole w kodzie i brakujące dowody. Nie jest certyfikatem ani deklaracją pełnego pokrycia OWASP. Nie potwierdza wdrożenia.

Źródła: [dziennik napraw](DZIENNIK-NAPRAW-ASTRA.md), [rejestr ustaleń](audyt/REJESTR-USTALEN.md), [historyczny raport](audyt/RAPORT.md). Poprzednia wersja mapy zawierała nieaktualne założenia o Vercelu, liczbie podatności oraz kompletności kontroli.

## A01 — kontrola dostępu

RLS i członkostwo organizacji pozostają podstawą izolacji. Odczyt i podpisywanie obiektów storage wymagają teraz pasującego prefiksu tenantId, także gdy ścieżka pochodzi z własnego rekordu. Portal księgowego i cache PDF mają testy izolacji.

**Otwarte:** istniejące poprawki 00068 (widok invoices_overdue) i 00069 (grants/RPC) wymagają obsługi właściciela. Nie wykonywano migracji ani aktualnego testu produkcyjnych uprawnień. Brak FORCE RLS nie jest samodzielnym dowodem wycieku; istotna jest rzeczywista rola i definicje obiektów.

## A02 — kryptografia

Kod szyfruje poświadczenia KSeF, hashuje kody odzyskiwania i weryfikuje podpisy webhooków. Nowy kod GDPR zapisuje SHA-256 losowego tokenu anulowania, zamiast tekstu jawnego.

**Zależność:** schema GDPR opisana w [propozycji dla właściciela](PROPOZYCJE-SCHEMATU-GDPR.md); nie ma nowych plików migracji ani deklaracji zgodności starej bazy z nowym kodem. TLS/klucze na Hetznerze wymagają odrębnej kontroli konfiguracji.

## A03 — wstrzykiwanie danych

Supabase/PostgREST i walidacja domenowa, escaping React oraz lokalna walidacja FA(3) przez xmllint-wasm ograniczają typowe wejścia. Schematy XSD są ładowane lokalnie, bez sieci. Testy XML: 66/66.

CSP jest egzekwowana; produkcja nie dopuszcza unsafe-eval. Inline bootstrap Next pozostaje dozwolony, więc nie jest to kompletna ochrona przed XSS. Nie twierdzimy, że sam escaping lub parametryzacja potwierdzają wszystkie ścieżki aplikacji.

## A04 — projekt mechanizmów bezpieczeństwa

Rate limiting, Turnstile, MFA, ponowne uwierzytelnienie wrażliwych operacji i opóźnienie GDPR istnieją w kodzie. Brak sekretu Turnstile poza lokalnym developmentem zwraca błąd konfiguracji.

Cykl GDPR wymaga atomowego przejęcia zadania, rozstrzygnięcia wyścigu z anulowaniem oraz ograniczenia aktywnych żądań na użytkownika. Szczegóły i testy w dzienniku; zmiany schematu pozostają zależnością właściciela. Retencja i trwała kolejka usuwania obiektów pozostają otwarte.

## A05 — konfiguracja

Poprawiono CSP, wyłączono X-Powered-By i ograniczono testowy odbiorca maila/debug KSeF do development/test bez markera produkcji. Cztery wskazane route’y zwracają stały komunikat i errorId.

**Granice:** aplikacja działa na Hetzner/Coolify. Nie zakładać domyślnych zabezpieczeń, directory listing ani atestacji Vercel. Konfiguracja reverse proxy, CDN, MinIO i egress nie była ponownie sprawdzana w tej sesji.

## A06 — zależności

Skan 2026-09-10 aktualnego lockfile: produkcyjne zależności **0 zgłoszeń**; pełny audit **1 średnia** w developerskim adm-zip przez inngest-cli. Next.js/@next/mdx/eslint-config-next 16.3.4, @xmldom/xmldom 0.9.12, Vitest 4.1.11 i poprawki pośrednie.

Dla adm-zip nie ma wydanej poprawki według zweryfikowanego doradztwa. Instalować wyłącznie zaufane wydania w prywatnym katalogu bez podstawionych symlinków. To nie jest formalna akceptacja ryzyka. Inngest pozostaje dostępną ścieżką rollbacku jobów. Wynik audytu jest przypisany do daty i lockfile, nie do wszystkich możliwych błędów kodu.

## A07 — uwierzytelnianie

Supabase Auth, MFA, rate limit i walidacja hasła pozostają w kodzie. Link anulowania GDPR nie wykonuje mutacji podczas GET; potrzebne jest świadome potwierdzenie POST. Pełnego E2E logowania przez prawdziwego dostawcę nie uruchamiano.

## A08 — integralność

Lockfile wersjonowany; podpisy webhooków sprawdzane, Resend kontroluje również świeżość timestampu. Testy zwykłego CI są oddzielone od RLS i nie otrzymują sekretów bazy. RLS wymaga osobnego zestawu RLS_TEST_SUPABASE_*.

Nie zakładać podpisania artefaktów lub SRI na podstawie hostingu. Integralność audit_logs nadal zależy od poprawnych uprawnień RPC — patrz istniejąca 00069.

## A09 — logi i monitorowanie

Wspólna polityka Sentry dla przeglądarki, Node i Edge filtruje błędy, requesty, transakcje, spany i breadcrumbs. Automatyczny eksport console oraz breadcrumbs DOM wyłączony. Debug/info ograniczone do development/test.

Nie dołączać dowolnego XML, OCR ani danych kontrahenta do wyjątków. Filtr wzorców nie jest pełnym rozpoznawaniem danych osobowych. Wcześniejsze logi i nagrania nie są usuwane wskutek zmiany kodu.

## A10 — żądania serwera do sieci

Adresy usług i generowane podpisy storage podlegają konfiguracji i walidacji. Własny serwer ma odrębną powierzchnię dostępu do sieci wewnętrznej; nie zakładać braku SSRF na podstawie dawnego środowiska Vercel. W tej sesji nie kontrolowano produkcyjnego firewalla ani wszystkich możliwych przekierowań dostawców.

## Dalsza weryfikacja

Właściciel powinien ocenić wymagane schema GDPR, istniejące 00068/00069, politykę retencji i usuwania plików, dokumentację przetwarzających oraz rzeczywistą konfigurację serwera. Przekazanie zmian do przeglądu nie stanowi zgody na wdrożenie. Instrukcja wznowienia i wyniki testów są w dzienniku napraw.
