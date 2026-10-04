# F0 — plan odbioru i status bramek

Stan: 04.10.2026, po pomiarze 11:03–11:22 UTC przekazanym przez Igora.
Pomiar był wyłącznie odczytem. W tym oknie inna sesja wdrożyła produkcję;
końcowy odczyt web/worker z 11:21 UTC jest stanem zmierzonym, a nie dowodem
wdrożenia wykonanego przez F0. Źródła i bezpieczne ustalenia są w
[inwentarzu](runtime-inventory.md) oraz [wyciągu dowodów](evidence/f0-2026-10-04.json).
Surowe załączniki pozostają prywatne.

**F0 jest niezamknięty.** Staging i pełne kopie zapasowe są niezaliczone;
produkty EU są zablokowane; kontrakty, polityka danych, budżety i role czekają
na decyzje. Dokument jest samodzielnym planem. TEST-01…TEST-07 poniżej są
lokalnymi identyfikatorami przyszłych testów; nie odsyłają do innych raportów.

Statusy: `PASS` wymaga dowodu pełnego kryterium; `PARTIAL` to niepełny dowód;
`FAIL` stwierdzone niespełnienie; `BLOCKED` brak dostępu do sprawdzenia;
`PENDING` nierozstrzygnięta decyzja; `NOT RUN` niewykonany test. Operator
określił odczyt runtime jako „PASS z zastrzeżeniami”; w szerszych kryteriach
F0-G01/F0-G02 mapujemy go na PARTIAL. Nie zmieniamy warunku bramki po pomiarze.
Biblioteka, przykład konfiguracji i zdrowy HTTP nie są odbiorem funkcji.

## Bramki F0-G01–F0-G09

| ID | Warunek odbioru | Stan po pomiarze i ograniczenie |
|---|---|---|
| F0-G01 | Inwentarz env/usług ze źródłem, timestamp i punktem odczytu; rzeczywisty SHA web/worker, wersje i tożsamość obrazów; lokalizacja MinIO. | **PARTIAL.** Web/worker healthy na `ae87bdde93a636fcb2c48aef737e57a80a3315a7` o 11:21 UTC. MinIO aplikacji na ops-1 jest odrębne od MinIO Supabase na db-1; Redis 7.2 i SRH są lokalnie na app-1. Dokładna wersja Node i binarnego MinIO pozostaje PENDING. Lokalne image ID nie są digestami registry; brak dowodu digestu registry nie został uzupełniony domysłem. |
| F0-G02 | Health/restart/startup, limity, routing, log rotation, zegary oraz zakres read-only dołączone do inventory; konfiguracja kontroli dostępu udokumentowana prywatnie. | **PARTIAL.** Pomiar zasobów i usług jest przekazany prywatnie; kompletność części konfiguracji infrastruktury i niezależnego monitoringu pozostaje do odrębnego potwierdzenia. Healthy nie dowodzi skutku jobów ani ciągłości dyżuru. |
| F0-G03 | Działający staging z osobną DB/kolejką/storage i kluczami, syntetycznymi danymi, KSeF TEST, Stripe test oraz kontrolowanymi odbiorcami. Web i worker bez dostępu do produkcyjnych efektów. | **FAIL — staging nie istnieje.** Konfiguracja GitHub `security-staging`, approval i workflow nie zastępują środowiska. Fault injection i aktywne PoC są zablokowane. |
| F0-G04 | Zatwierdzone wyniki, korelacja, deadline, kwalifikacja populacji i klasy plików z [contracts](contracts.md). | **PENDING.** Dokument jest propozycją; TEST-01/TEST-02 pozostają NOT RUN. |
| F0-G05 | Zatwierdzone klasy danych, retencja, audit/source maps/holds/delete, tenant_ref, consent i uprawnienia z [data-policy](data-policy.md). | **PENDING.** Dostarczenie pomiaru nie zatwierdza nowego eksportu danych. TEST-04 NOT RUN. |
| F0-G06 | Przyjęty budżet narzutu, limity zasobów i metoda OFF/ON; baseline i klasy obciążenia określone. | **PENDING.** Pomiary zasobów nie zastępują decyzji o budżecie instrumentacji. Baseline/TEST-05 NOT RUN. |
| F0-G07 | Dowód regionu istniejących usług oraz, osobno, rzeczywistego konta docelowego, planów/produktów, retencji/ingest/API, kosztów i uprawnień. | **PASS dla regionu ingest istniejących Sentry/PostHog; BLOCKED dla planów i produktów przez brak dostępu.** Region docelowej organizacji Datadog oraz jej funkcje nie są potwierdzone. Bramka jako całość pozostaje niezamknięta. |
| F0-G08 | Przyjęte role, realny dyżurny, godziny i coverage gaps; odbiorca oraz okno testu telefonu; decyzja o niezależnym lifecycle alarmu. | **PENDING.** Igor jest zlecającym, Bartosz kontaktem operacyjnym; żadna z tych informacji nie potwierdza dyżuru. TEST-06 NOT RUN. |
| F0-G09 | Pełna kopia bazy i wymaganych obiektów poza hostem źródłowym; harmonogram, ostatni artifact/hash, retencja i procedura izolowanego restore obejmująca auth/storage oraz stan operacji. | **FAIL.** Brak pełnego `pg_dump` off-host i kopii MinIO aplikacji. Ograniczony snapshot JSON schematu `public` na innym hoście nie spełnia tego zakresu. Izolowany restore/TEST-07 NOT RUN. |

Wyjście F0 wymaga wszystkich bramek oraz zamknięcia zastrzeżeń potrzebnych do
następnego etapu. Zapis dokumentów i publikacja kolektora nie zmieniają statusu
na COMPLETE. Samodzielne planowanie pozostaje możliwe; F1 i czynności operacyjne
wymagają osobnego uzgodnienia zakresu po rozstrzygnięciu blokad.

## Brakujące dowody do odbioru

Przegląd dokumentacji 04.10.2026 nie jest nowym pomiarem serwerów. Poniższa
lista precyzuje materiał potrzebny według istniejących warunków bramek;
nie zmienia ich statusów ani nie obniża kryteriów. Wykonawca i reviewer
każdego dowodu są **PENDING** do przyjęcia ról w [ownership](ownership.md).
Bartosz jest kontaktem do uzgodnienia zakresu, co nie przypisuje mu
automatycznie wszystkich zadań ani dyżuru.

- **G01 — runtime:** datowane odczyty dokładnej wersji Node w web i worker
  oraz binarki MinIO aplikacji; prywatne powiązanie procesów, SHA i lokalnych
  Image ID. Przy lokalnym buildzie brak registry digestu zapisujemy jako
  ograniczenie pochodzenia, bez tworzenia fikcyjnego digestu. Nowy odczyt
  dostaje własne okno i release, nie zastępuje pomiaru z 11:03–11:22 UTC.
- **G02 — infrastruktura i monitoring:** prywatny przegląd kompletności
  routingu/ACL, reguł zapory Hetznera i konfiguracji monitorów Uptime Kuma
  oraz używanych niezależnych checków: zakres, interwał, warunek awarii,
  świeżość, kanał i luki. Publicznie tylko wynik i bezpieczna referencja.
  Brak dostępu do panelu oznacza brak dowodu, nie brak konfiguracji.
- **G03 — staging:** dowód istniejących i działających web/worker oraz
  oddzielnej DB, kolejek, storage, kluczy i odbiorców; syntetyczne dane,
  KSeF TEST i Stripe test. Operator wykazuje izolację od produkcyjnych
  efektów. Utworzenie środowiska jest osobnym zadaniem; YAML i puste
  `security-staging` nadal nie zaliczają bramki.
- **G04 — kontrakty:** datowane przyjęcie konkretnej wersji wyników,
  korelacji, kwalifikacji populacji i deadline. Trzeba rozstrzygnąć klasy
  plików import/eksport, terminy Flo, harmonogramy/grace oraz różnice z SLI
  C-22 opisane w [contracts](contracts.md#uzgodnienie-z-c-22-przed-przyjęciem-g04).
  F0-D07 osobno potwierdza intencję `KSEF_ENV=test` produkcyjnej aplikacji.
- **G05 — dane:** przyjęcie polityki dla każdej klasy, w tym terminów
  audit/source maps, hold/delete, tenant_ref, consent i RBAC. Otwarte wartości
  mają pozostać jawne; pomiar intake EU nie zatwierdza nowych eksportów.
- **G06 — narzut:** przyjęte wartości budżetu, limity, obrazy i klasy
  obciążenia oraz metoda OFF/ON i plan baseline. Odczyt zasobów z G02 nie
  jest porównaniem narzutu. Wykonanie TEST-05 następuje w osobnym odbiorze.
- **G07 — konta i produkty:** datowany prywatny odczyt rzeczywistego konta,
  organizacji, regionów, aktywnych planów i wymaganych produktów; retencje,
  limity ingest/API, koszty i uprawnienia. Sentry/PostHog i wybrany docelowy
  dostawca mają osobne dowody. Datadog EU, DBM/APM/RUM/On-Call pozostają
  niezweryfikowane; publiczna oferta lub region endpointu nie dowodzą
  uprawnień konkretnego konta. Niewybrany produkt nie znika z warunku G07
  bez jawnego uzgodnienia zakresu przez odbiorcę.
- **G08 — role i alarmy:** datowane przyjęcie osób, zakresów, godzin,
  zastępstwa lub jego braku i coverage gaps; realny odbiorca, okno TEST-06
  oraz decyzja o niezależnym lifecycle ACK/expiry/recovery. Prywatne dane
  kontaktowe zostają poza repo. Test telefonu nadal NOT RUN.
- **G09 — backup:** dowód rzeczywistej pełnej kopii DB poza hostem źródłowym
  i kopii wymaganych obiektów; ostatni sukces UTC, artefakt/hash, zakres,
  harmonogram i przyjęta retencja. Manifest ma wyjaśniać pokrycie ról/auth,
  danych aplikacji, stanu operacji i powiązań storage, rozróżniając MinIO
  aplikacji oraz Supabase Storage. Dołączona procedura izolowanego restore
  obejmuje ACL i blokadę produkcyjnych efektów. Snapshot `public` i sam
  plan transportu off-host nie wystarczają. Backupy/snapshoty Hetznera
  nadal są nieodczytane.

Karta dowodu zawiera bramkę, rodzaj źródła (**pomiar**, **decyzja** lub
**deklaracja**), wykonawcę/reviewera, UTC odczytu, środowisko i wersję materiału,
oczekiwany zakres, wynik, ograniczenia oraz prywatną referencję z bezpiecznym
wyciągiem. Status zmienia się dopiero po sprawdzeniu pełnego kryterium.
Historyczny JSON z 04.10 pozostaje zapisem historycznego pomiaru.

## Granica odbioru F0 i późniejszych testów

Warunki wyjścia F0 są w tabeli F0-G01–G09. G04/G05/G06/G08 wymagają przyjętych
decyzji i przygotowania odbioru; TEST-01…TEST-06 weryfikują późniejszą
implementację. Ich NOT RUN nie oznacza akceptacji ani nie uzasadnia
rozpoczynania F1 dla domknięcia dokumentacji. Czternaście dni baseline jest
warunkiem kalibracji SLO, nie automatycznym warunkiem zakończenia samego F0.

G09 wymaga istniejących kopii i procedury restore. Wykonanie TEST-07 jest
osobną czynnością; w tej kontynuacji obowiązuje zakaz restore. Jeżeli odbiorca
wymaga wyniku TEST-07 przed akceptacją F0, zapisuje to jako dodatkowy otwarty
warunek do osobno upoważnionego wykonania. Nie oznaczamy testu jako PASS.
F1 może rozpocząć się dopiero po jawnym odbiorze F0 i uzgodnieniu jego zakresu.

## Proponowany budżet instrumentacji — F0-G06

Wartości startowe do decyzji, bez gwarancji i bez wykonanego testu. Mierzyć te
same obrazy, limity i syntetyczną populację, oddzielnie web, worker i collector.
Porównać OFF/ON po warm-up w co najmniej trzech porównywalnych przebiegach na
idle, normal i peak. Kontrola liczby operacji/outcomes zapobiega pozornej
poprawie przez pomijanie pracy. p95/p99 wymagają próbki, nie średniej percentyli.

| Efekt / zasób | Proponowany limit i metoda |
|---|---|
| CPU aplikacji | Przyrost CPU-sekund na tę samą zakończoną pracę ≤5% przy normal/peak; także core-seconds i narzut idle, bez dzielenia przez bliską zeru bazę. |
| RAM aplikacji | Przyrost szczytowego RSS ≤128 MiB na web/worker; łączny RSS ≤80% rzeczywistego limitu kontenera. Heap/RSS/OOM osobno. |
| Latency CRUD | Przyrost p95 ≤większa z 5% baseline lub 25 ms; p99 ≤większa z 10% lub 50 ms. Upload/stream osobno. |
| Job execution | Przyrost p95 ≤większa z 5% lub 100 ms; queue wait osobno. Deadline kontraktowe nadal obowiązują. |
| Agent/Collector | Limit z wolnych zasobów po G02; propozycja maks. 0,25 CPU i 256 MiB na host, do potwierdzenia w PoC. Osobny limit od aplikacji. |
| Bufor intake | Cel 30 min przy zmierzonym peak bytes/s ×1,5; wcześniej obliczyć dysk, ograniczyć kolejkę i pokazać refused/drop/lag per signal. Bez gwarancji przeżycia utraty hosta. |
| Wynik domenowy | Zero dodatkowych podwójnych efektów, błędów domenowych, OOM i synchronicznej zależności od SaaS; spadek coverage nie poprawia wyniku testu. |

Jeżeli rzeczywiste zasoby nie mieszczą celu, zmienić i zatwierdzić budżet przed
testem. Profilowanie wymaga osobnego OFF/ON i odbioru.

## Kolejność przyszłego odbioru

1. Rozstrzygnąć decyzje F0 i potwierdzić izolację staging. Dane wyłącznie
   syntetyczne, NIP `1234567890`; bez kopii dokumentów produkcyjnych.
2. Po zgodzie na następny etap: TEST-01 request/job/error w rzeczywistych
   obrazach, jeden provider spanów i source map zgodny z SHA.
3. TEST-02…TEST-05: korelacja, integracje, redakcja i narzut; każda rodzina
   kontraktu ma happy path, partial/failure, retry/replay i brak postępu.
4. Po ustaleniu odbiorcy: TEST-06 fizycznego telefonu i niezależnego kanału.
   TEST-07 izolowanego restore wymaga pełnego backupu. Co najmniej 14 dni
   reprezentatywnego baseline przed kalibracją SLO; czas bez ruchu nie wystarcza.

Awaria KSeF/Stripe w testach pochodzi z mocka lub sandboxa. Unknown po możliwym
efekcie wymaga uzgodnienia; alarm nie wykonuje replay/refund. Powyższy plan
nie jest poleceniem migracji, wdrożenia, wysłania realnego alertu ani restore.

## Rejestr testów — wszystkie NOT RUN

| ID | Scenariusze | Wymagany rezultat |
|---|---|---|
| TEST-01 — runtime/SDK | Request, pg-boss, startup/error/source maps i różne wersje web/worker. | Jeden provider, brak podwójnych spanów, działające source maps i jawny rzeczywisty SHA każdego procesu. |
| TEST-02 — wynik/korelacja | Stabilna intencja, retry/redelivery, odrzucenie nieobsługiwanego envelope, dedup/outbox, partial/unknown, deadline i historia bez trace. | Populacja nie rośnie przez replay, brak podwójnego efektu; outcome zgodny z domeną. |
| TEST-03 — integracje | PostgREST/pg, normalized SQL, exportery i harmonogramy. | Jawny zakres korelacji i luk; query error nie staje się zerem, brak postępu jest widoczny. |
| TEST-04 — prywatność/RBAC | Canary w stdout/log/trace/error/SQL/RUM/alert/AI; tenant A/B i anon; dowód produktów i planów. | Zakazane dane nie są wysyłane, izolacja działa, uprawnienia i entitlements potwierdzone. |
| TEST-05 — narzut/utrata | OFF/ON, bounded buffer, awaria intake i błąd auth. | Przyjęty budżet zachowany; lag/refused/drop jawne; błąd auth odróżniony od no-data. |
| TEST-06 — telefon | Fizyczne urządzenie, ACK/expiry/recovery, brak ACK, DND/blokada, fallback i awaria głównego monitoringu. | Odbiór i realny lifecycle potwierdzone; no-data nie jest recovery, coverage gap nie jest ukryty. |
| TEST-07 — restore | Pełna kopia bazy/storage na izolowany cel, role/auth i stan operacji; odtworzenie bez zewnętrznych efektów. | Dane i referencje spójne, RLS/dedup działają, brak produkcyjnych maili/płatności/KSeF i powtórzenia efektów. |

Karta wykonania zawiera: ID, wykonawcę/reviewera, env/KSeF env, SHA web/worker,
rewizję konfiguracji i obrazy, UTC start/stop, izolację, dane syntetyczne,
oczekiwany/obserwowany wynik, źródło, bezpieczne dowody, status, cleanup/rollback
i zamknięcie testowego incydentu. Publiczna karta nie zawiera danych prywatnych.
PASS odnosi się wyłącznie do konkretnej karty i zakresu.
