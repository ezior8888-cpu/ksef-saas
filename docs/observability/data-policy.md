# F0 — polityka danych obserwowalności

Stan: **propozycja do zatwierdzenia**, 04.10.2026. F0-G05 pozostaje **PENDING**.
Dokument nie zmienia retencji, dostępu ani eksportu. Igor jest zlecającym F0;
przyjęcie ról i decyzji zapisuje [rejestr](ownership.md). Kontrakty wyników są
w [contracts](contracts.md), pomiary w [inwentarzu](runtime-inventory.md),
a pełne scenariusze odbioru w [acceptance-plan](acceptance-plan.md).

## Klasy danych i granice eksportu

| Klasa | Dozwolona treść / lokalizacja | Granica eksportu |
|---|---|---|
| Dane domenowe i dokumenty | Faktury, XML/PDF/UPO, zdjęcia, płatności i treść support/OCR w obecnej chronionej bazie/storage z tenant scope. | Bez eksportu do telemetrii, telefonu, baggage i pakietu diagnozy AI. |
| Minimalny journal / wymagany audit | Referencje źródła i aktora, przejście, bezpieczny reason, czasy i korelacja; własna chroniona baza z RLS/ACL. | SaaS dostaje zatwierdzony indeks lub link, nie kopię pełnej historii finansowej. |
| Próby / kroki techniczne | Stały step key, outcome, dependency, czasy, wersja, zredagowany error i trace references. | Allowlist bez payloadu, surowego SDK response i `Error.cause`. |
| Metryki / SLI | Liczba, duration, age, coverage, freshness i query success. | Stałe wymiary service/env/type/route/queue/outcome/dependency/region. Bez UUID, tenant, NIP, email, IP, kwot, URL query i tekstu błędu. |
| Logi / trace / błędy | Route template, bezpieczny kod/stack, service/env/release, korelacja i ograniczone attributes. | Redakcja przed stdout/eksportem. Bez raw request/response, cookies, auth headers, certyfikatów, sekretów, presigned URL i SQL bind values. |
| RUM / produkt | Web Vitals, route transitions, fatal UI/fetch failures, browser/version/release i uzgodniony pseudonimowy ID. | Zgodnie z consent; bez pól formularzy i autocapture finansów. Session Replay wyłączony do osobnego odbioru. Trace propagation tylko do własnych originów na allowlist, bez baggage. |
| Alarm / pakiet incydentu | Env, service, severity, onset, freshness, agregat wpływu, bezpieczny link i zredagowany dowód. | Bez dokumentów, kwot, NIP, danych kontaktowych klientów, promptów i odpowiedzi. Link wymaga uwierzytelnienia odbiorcy. |
| Inwentarz / konfiguracja | Publicznie wyłącznie uzgodniony alias usługi, bezpieczna informacja o wersji i statusie oraz odwołanie do dowodu. Pełne odczyty w prywatnym inventory. | Żadnych sekretów, credentials w URL, dumpów env, prywatnych kont, nazw kontenerów lub zasobów, adresów, portów i szczegółów kontroli dostępu. Samo zamaskowanie IP nie czyni dowodu publicznym. |

Zewnętrzny `tenant_ref`, jeżeli potrzebny, jest HMAC/UUID według zaakceptowanego
adaptera; klucz i mapowanie pozostają we własnym systemie. Pseudonimizacja nie
zastępuje ograniczeń dostępu. Domyślnie tenant jest pomijany w SaaS do decyzji
i **TEST-04**. Identyfikatory operation/trace służą korelacji, nie autoryzacji.

## Publikacja dowodów F0

Źródłowy inwentarz i surowy JSON dostarczony przez Igora są **prywatne**.
Nie wolno ich kopiować do repo, PR, logu CI ani publicznego artefaktu. Dowody
pozostają poza gitem i mają dostęp ograniczony do uprawnionych osób. Publiczny
[inwentarz](runtime-inventory.md) i [wyciąg dowodów](evidence/f0-2026-10-04.json)
zawierają jedynie uzgodnione ustalenia, statusy oraz zakres pomiaru.

Odczyt z 04.10.2026, 11:03–11:22 UTC, nie zmieniał serwerów. Jego zaliczenie
jako źródła faktów nie zatwierdza proponowanych retencji, ról ani konfiguracji.
Rekomendacje zawarte w załącznikach są materiałem do decyzji właściciela.

## Retencja proponowana

Poniższe wartości są propozycjami polityki, nie aktywnymi zmiennymi env ani
potwierdzeniem możliwości zakupionego planu. Implementacja ma raportować
rzeczywiste wartości i umożliwiać jawne wyjątki.

| Klasa | Wartość do zatwierdzenia | Usuwanie / wyjątek / wymagany dowód |
|---|---|---|
| Dokumenty fakturowe i dane domenowe | 10 lat według instrukcji projektu; poza zakresem skracania przez observability. | Istniejący workflow domenowy. Ten dokument nie jest oceną ustawowych terminów ani nowym mechanizmem DELETE. |
| Minimalny indeks/historia operacji | 13 miesięcy online. | Otwarte reconciliation nie wygasa automatycznie. Po usunięciu szczegółów pozostaje odczyt autorytatywnej domeny; dłuższy hold wymaga powodu i właściciela. |
| Wymagany audit | Osobna klasa; termin PENDING, powiązany z polityką domeny/audytu. | Nie kopiować 13 miesięcy journal ani 30 dni logów na audit. Przed implementacją potwierdzić immutable policy i deletion exceptions. |
| Attempts / steps | 90 dni online. | Usunięcie szczegółów nie usuwa minimalnego wyniku i przejść; otwarte sprawy mogą mieć jawny hold. |
| Metryki / SLO | 13 miesięcy trendu z jawną agregacją rozdzielczości. | Dowód tier, rozdzielczości i expiry; agregat nie zastępuje pełnej historii operacji. |
| Logi | 30 dni searchable; wybrane zredagowane incydenty do 90 dni. | Przedłużenie z owner, powodem i terminem; archiwum i deletion policy osobno. |
| Trace | Zwykły ruch 15 dni; istotne business/error/slow do 30 dni. | Dowód retention produktu. Brak trace po sampling/expiry nie oznacza braku operacji. |
| Error events / source maps | Okres wspieranych release i diagnostyki; liczba dni PENDING. | Zachować mapy aktywnego web/worker bundle po wdrożeniu nowej wersji; dostęp prywatny. |
| RUM | 30 dni diagnostycznych; replay 0. | Consent/opt-out i usuwanie ID; replay wymaga osobnej decyzji i odbioru. |
| Lokalne logi / bufory | Limity bytes/age PENDING; proponowane okno bufora 30 min. | Docker rotation i collector queue osobno; expiry/drop jawny. Bufor nie gwarantuje trwałości po utracie hosta. |
| Pakiety incydentów / dowody testów | 90 dni; dłużej tylko jawny hold. | Zredagowane dowody, przegląd aktywnych holdów, brak surowych plików prywatnych w repo. |
| Kopie zapasowe | Harmonogram, zakres, retencja i izolowany restore PENDING. | Pomiar potwierdził brak pełnej kopii `pg_dump` off-host i kopii storage aplikacji. Ograniczony snapshot JSON na innym hoście nie spełnia pełnego backupu. Restore ponownie stosuje TTL/hold i ACL. |

Po zatwierdzeniu rejestr każdej klasy wskazuje właściciela, region/lokalizację,
aktywną retencję, wyjątek, sposób delete, harmonogram i ostatnią kontrolę.
W F0 nie wykonano cleanup ani odtworzenia.

## Sampling, dostawcy i dostęp

Wymagane przejścia domeny/audit: 100%, bez sampling. Eksport telemetrii jest
asynchroniczny, ograniczony i nie blokuje faktur. Sampling requestów ustala się
po baseline; 10–20% jest propozycją. Canary ma pełny capture/ingest/indexing.
Pełny error outcome nie gwarantuje kompletu spanów odrzuconych head sampling.

Pomiar potwierdził **region ingest EU dla istniejących Sentry i PostHog**.
Dostępność planów, produktów i limitów jest **BLOCKED** przez brak dostępu do
paneli. Nie potwierdza to regionu każdej dodatkowej funkcji, wszystkich
subprocessors ani docelowej organizacji Datadog. EU1 pozostaje propozycją
lokalizacji Datadog. F0-G07 wymaga osobnego dowodu rzeczywistego konta,
produktów, retencji, kosztów i uprawnień.

Oddzielne klucze/env i role z minimalnymi uprawnieniami. Eksport telemetrii nie
dostaje Supabase service-role. DBM: read-only i normalized SQL bez bind values;
plany/komentarze objęte redakcją. Diagnoza AI: read-only i zredagowany zakres
incydentu. SSO/MFA i audyt dostępu wymagają odbioru. [Role](ownership.md)
pozostają propozycją.

## Odbiór prywatności

Na izolowanym staging przygotować dwa syntetyczne tenanty, NIP `1234567890`
i canary przypominające token, kwotę, XML, email, presigned URL oraz prompt.
Sprawdzić stdout, log/trace/error, SQL/DBM, RUM/URL, alert i pakiet AI. Weryfikować
faktycznie wysłane dane, nie tylko zamaskowany widok. Zakazanych canary nie ma
w eksporcie, a tenant A i anon nie czytają operacji B. **TEST-04: NOT RUN**;
staging nie istnieje, więc aktywny odbiór nie został rozpoczęty.

PENDING: wszystkie proponowane terminy, audit/source maps, rotation/bufory,
backup retention, tenant_ref, consent, zakres produktów i uprawnienia.
