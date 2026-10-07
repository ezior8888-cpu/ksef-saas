# FaktFlow — pakiet F0

Pomiar 04.10.2026 wykonano wyłącznie odczytowo w oknie 11:03–11:22 UTC. F0 pozostaje otwarty: pełne kopie poza hostem i staging są niezaliczone, dowody planów i uprawnień do produktów są niepełne, a kontrakty, prywatność, budżety i role czekają na decyzje.

- [Inwentaryzacja i pochodzenie dowodów](runtime-inventory.md)
- [Kontrakty wyniku i korelacji](contracts.md)
- [Polityka danych](data-policy.md)
- [Bramki i plan odbioru](acceptance-plan.md)
- [Role i dziesięć decyzji Bartosza](ownership.md)
- [Bezpieczne podsumowanie pomiaru z 04.10](evidence/f0-2026-10-04.json)
- [Bezpieczny indeks odczytów z 06.10](evidence/f0-2026-10-06.json)
- [Kolektor tylko do odczytu](../../scripts/ops/collect-runtime-inventory.mjs)
- [Przykład staging](../../ops/observability/environments/staging.example.yaml) / [production](../../ops/observability/environments/production.example.yaml)

Publiczny pakiet zawiera uzgodnione podsumowania i propozycje. Pełny raport operatora, sekcja `raw`, identyfikatory infrastruktury i szczegóły konfiguracji pozostają w prywatnym, ignorowanym `.agents/`. Kolektor nie został użyty do pomiaru z 04.10; operator wykonał go własnymi skryptami. Próba kolektora z 06.10 nie potwierdziła runtime.

Dokumenty nie zmieniają aplikacji, serwerów ani ustawień usług. Publikacja gałęzi/PR nie oznacza zaliczenia F0, zgody na wdrożenie ani rozpoczęcia F1.

Kontynuacja 04.10.2026 zaczyna się od [aktualnych decyzji i karty odpowiedzi](ownership.md#aktualne-decyzje--przegląd-kontynuacji-04102026)
oraz [brakujących dowodów per bramka](acceptance-plan.md#brakujące-dowody-do-odbioru).
Przegląd repo i dyskusji PR nie dostarczył nowych zatwierdzeń Bartosza ani
nowego pomiaru infrastruktury. F0-D01…D10 i propozycje C22-D1…D7 są osobnymi
rejestrami; różnice proponowanych SLI wymagają uzgodnienia przed przyjęciem G04.

Aktualizacja 06.10.2026: [deklaracje przekazane przez Igora](runtime-inventory.md#deklaracje-przekazane-06102026)
podtrzymują **G03 FAIL** (brak staging) i **G09 FAIL** (brak pełnego dumpa DB
off-host i kopii MinIO). Osobno wykonano [odczyty API dostawców i próbę SSH](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026).
API potwierdza trzy działające maszyny w DE, przypisane reguły zapory,
siedem dostępnych obrazów backupu dysku DB oraz część metadanych Sentry/PostHog
w EU. Obrazy dysku nie dowodzą spełnienia zakresu G09 ani restore; ustawienia
replay nie dowodzą faktycznego nagrywania przez SDK. G02/G07 mają częściowe
dowody; plany, koszty i pozostałe uprawnienia nadal są niezweryfikowane.
Runtime kontenerów nie został odczytany: aktualny SHA/health i wersje Node/MinIO
pozostają nieznane. F0 i decyzje pozostają otwarte; nie wykonano zmian
serwerów ani ustawień dostawców i nie rozpoczęto F1.
