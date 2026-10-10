# F0 — polityka danych obserwowalności

Stan: **polityka wybrana 07.10.2026 w ramach delegacji Igora** „Wybierz wszystko
co uważasz za najlepsze”, z uzupełnieniem **10.10.2026** o pełną historię
błędów faktur, przyszły odczyt agenta i docelowy Sentry EU Team. Wybór
obejmuje poniższe aktualne wartości i granice, w tym
wcześniej przyjętą politykę kopii. Zastępuje propozycje z 04.10; nie jest
odczytem aktywnej konfiguracji. **G05: PASS dla przyjęcia polityki**, bez
zaliczenia jej implementacji, TEST-04 lub całego F0. Źródło delegacji i zakres
decyzji są w [ownership](ownership.md#wybory-na-podstawie-delegacji-igora--07102026).
Zapis decyzji nie zmienia aktywnej retencji, dostępu ani eksportu. Igor jest
właścicielem monitoringu, koordynacji i odbiorcą F0; rola nie oznacza odbioru.
Przyjęcie ról i decyzji zapisuje [rejestr](ownership.md). Kontrakty wyników są
w [contracts](contracts.md), pomiary w [inwentarzu](runtime-inventory.md),
a pełne scenariusze odbioru w [acceptance-plan](acceptance-plan.md).

## Klasy danych i granice eksportu

| Klasa | Dozwolona treść / lokalizacja | Granica eksportu |
|---|---|---|
| Dane domenowe i dokumenty | Faktury, XML/PDF/UPO, zdjęcia, płatności i treść support/OCR w obecnej chronionej bazie/storage z tenant scope. | Bez eksportu do telemetrii, telefonu, baggage i pakietu diagnozy AI. |
| Minimalny journal / wymagany audit | Referencje źródła i aktora, przejście, bezpieczny reason, czasy i korelacja; własna chroniona baza z RLS/ACL. | SaaS dostaje zatwierdzony indeks lub link, nie kopię pełnej historii finansowej. |
| Próby / kroki techniczne | Stały step key, outcome, dependency, czasy, wersja, zredagowany error i trace references. | Allowlist bez payloadu, surowego SDK response i `Error.cause`. |
| Minimalna historia błędów faktur | Wszystkie zarejestrowane błędy i późniejsze przejścia recovery, referencje faktury/intencji/próby, etap, bezpieczny kod/klasa, czasy i env we własnej chronionej bazie. | Bez samplingu; widok operatora i ograniczony odczyt diagnostyczny kontrolują tenant na serwerze. Brak dokumentów lub pełnej historii finansowej w pakiecie AI. |
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

## Wybrana retencja i limity

Poniższe wartości są docelową decyzją projektową, nie opinią o ustawowych
terminach ani dowodem ustawień dostawcy. Terminy miesięczne/roczne są
kalendarzowe. Aktywne wartości, rozdzielczość, kwoty i ograniczenia kont
sprawdza G07; implementacja musi ujawniać odstępstwa. Zgodność publikowanego
kodu i wdrożonych bundle z tą polityką pozostaje do osobnego sprawdzenia.

| Klasa | Wartość wybrana | Usuwanie / wyjątek / wymagany dowód |
|---|---|---|
| Dokumenty fakturowe i dane domenowe | 10 lat według instrukcji projektu; poza zakresem skracania przez observability. | Istniejący workflow domenowy. Ten dokument nie jest oceną ustawowych terminów ani nowym mechanizmem DELETE. |
| Minimalny indeks/historia operacji | 13 miesięcy online we własnej chronionej bazie. | Otwarte reconciliation nie wygasa automatycznie. Po usunięciu szczegółów pozostaje odczyt autorytatywnej domeny; dłuższy hold wymaga powodu i właściciela. |
| Wymagany audit finansowy / minimalna historia błędów faktur | 10 lat kalendarzowych we własnej chronionej bazie, również minimalny wpis każdego zarejestrowanego błędu faktury i późniejszego recovery; audit dostępu/admin 13 miesięcy. | Minimalne referencje i przejścia, bez kopiowania payloadu. Historia zmian bez nadpisywania wpisów; TTL respektuje otwarte sprawy i hold. To polityka projektu, nie nowe twierdzenie o obowiązku prawnym. |
| Attempts / steps | 90 dni online. | Usunięcie szczegółów nie usuwa minimalnego wyniku, wpisu błędu faktury i przejść recovery w audycie; otwarte sprawy mogą mieć jawny hold. |
| Metryki / SLO | 13 miesięcy trendu z jawną agregacją rozdzielczości. | Dowód tier, rozdzielczości i expiry; agregat nie zastępuje pełnej historii operacji. |
| Logi | Początkowo lokalne zredagowane logi do 7 dni, dodatkowo ograniczone rozmiarem poniżej; wybrane pakiety incydentów 90 dni. Centralny eksport logów poza wybranym zakresem. | Zastępuje propozycję 30 dni centralnych logów; nie zakłada darmowej wyszukiwarki logów. Przedłużenie tylko jako prywatny pakiet incydentu z właścicielem, powodem i terminem. |
| Spans / trace i diagnostyczny RUM | Spans docelowo do 30 dni w wybranym 10.10 Sentry EU Team; diagnostyczny RUM do 30 dni tylko w odrębnie potwierdzonym zakresie produktu. | Aktywny plan, retencja i limity wymagają G07 przed aktywacją. Brak spanów po sampling/expiry nie oznacza braku operacji lub błędu. |
| Error events Sentry | Docelowa historia błędów do 90 dni w wybranym 10.10 Sentry EU Team; aktywny plan i quota pozostają niezweryfikowane. | Publiczna oferta i wybór planu nie są odczytem konta. Sentry nie zastępuje pełnej minimalnej historii błędów w audycie faktury. |
| Source maps | Cały okres używania bundle web/worker oraz 90 dni po wycofaniu ostatniego procesu na danym SHA. | Własne prywatne archiwum artefaktów; retencja uploadu w Sentry osobno do sprawdzenia. Nie publikować map; sam upload nie dowodzi symbolikacji. |
| Product analytics | Jeden rok według wybranego PostHog Free EU; replay 0, autocapture i heatmaps wyłączone. | Odrębna klasa od 30-dniowego RUM. Opt-in/opt-out; aktualna roczna retencja konta i workflow usuwania do potwierdzenia. |
| Lokalne logi / bufory | Logi: 10 MiB × 5 plików na kontener, maks. 7 dni. Bufor: maks. 64 MiB RAM i 256 MiB dysku na host, wiek do 30 min. | Pierwszy osiągnięty limit usuwa najstarszą telemetrię; drop/expiry raportowane. Sama rotacja Dockera nie realizuje limitu wieku. Required journal/audit nie korzysta z tego zawodnego bufora. Pokrycie 30 min peak wymaga pomiaru. |
| Pakiety incydentów / dowody testów | 90 dni; dłużej tylko jawny hold. | Zredagowane dowody, przegląd aktywnych holdów, brak surowych plików prywatnych w repo. |
| Kopie zapasowe | Docelowo przyjęte w odpowiedzi przekazanej 07.10: codzienny pełny pg_dump DB i kopie obu MinIO; 7 dziennych / 4 tygodniowe / 12 miesięcznych; comiesięczny test restore. Igor koordynuje; wcześniej wskazano Bartosza jako wykonawcę operatorskiego. | Szyfrowany zewnętrzny cel EU poza hostami źródłowymi. Codex przegląda dostępne dowody. Brak dowodu wdrożenia, sukcesu pełnej kopii i restore; G09 FAIL, TEST-07 NOT RUN. Snapshot JSON i obrazy dysku DB nie dowodzą całego zakresu. Restore ponownie stosuje TTL/hold i ACL. |

Po zatwierdzeniu rejestr każdej klasy wskazuje właściciela, region/lokalizację,
aktywną retencję, wyjątek, sposób delete, harmonogram i ostatnią kontrolę.
Docelowy dump obejmuje całą DB, w tym auth/storage; obiekty obejmują MinIO
aplikacji i odrębne MinIO Supabase Storage. Do odbioru nadal potrzebny jest
manifest wykazujący role/auth, metadane i obiekty storage oraz stan operacji,
artefakt/hash, sukces UTC i prywatny dowód pokrycia przyjętej retencji.
Comiesięczny test restore jest przyjętym celem, a nie wykonanym testem.
W tej kontynuacji F0 nie wykonano backupu, cleanup ani odtworzenia.

Kontrola TTL i zadań usuwania: docelowo codziennie, z wynikiem i licznikiem
błędów. Hold ma Igora jako właściciela, powód, zakres i przegląd co 30 dni;
nie ma automatycznego wygaśnięcia nierozwiązanej sprawy. Usunięcie historii
analytics/RUM po przyjętym żądaniu: do 30 dni, z jawnym wynikiem i uwzględnieniem
holdów oraz retencji kopii. Cofnięcie consent od razu zatrzymuje dalszy eksport;
nie dowodzi usunięcia już zebranej historii. Po restore stosuje się ponownie
ACL, TTL, hold i rejestr zrealizowanych żądań.

## Historia błędów i odczyt diagnostyczny — 10.10.2026

Nowe wymaganie Igora dotyczy wewnętrznej historii **wszystkich zarejestrowanych
błędów faktur**, także sprzed POST, przy retry, odzyskanych oraz związanych
z otwartymi operacjami. Minimalny wpis należy do istniejącej klasy audytu
faktury na 10 lat, bez samplingu; nie jest to nowa ocena obowiązku prawnego.
Bieżący wynik i recovery nie nadpisują wcześniejszej porażki. Szczegóły prób
wygasają po 90 dniach według powyższej polityki, journal operacji/SLI po
13 miesiącach; minimalna historia błędów pozostaje dostępna z własnego audytu.
Widok ujawnia pokrycie okresu/etapów, świeżość i braki: utraconych lub nigdy
niezapisanych zdarzeń nie uznaje się za odtworzone.

Przyszły agent deweloperski korzysta z osobnej tożsamości i ograniczonego
interfejsu **tylko do odczytu zredagowanej diagnostyki**. Serwer wyznacza
dopuszczony zakres tenantów z uprawnień tej tożsamości i sprawdza własność
każdej wskazanej faktury/próby przed odczytem. ID z żądania i pseudonim nie
ustanawiają uprawnień. Odczyt obejmujący wiele tenantów wymaga jawnego zakresu
operatora platformy; wewnętrzny charakter panelu nie znosi izolacji.
Odczyty są audytowane w klasie dostępu/admin: tożsamość, czas, zakres,
bezpieczna referencja, wynik, bez kopiowania pobranych payloadów.

Allowlist diagnostyczna obejmuje bezpieczny kod/klasę/etap, czas, env/release,
stan próby, wynik późniejszy, kompletność oraz kontrolowane referencje do
dowodu. Poza własnym systemem referencje są pseudonimowe, mapowanie zostaje
lokalnie. Pakiet nie zawiera XML/PDF/UPO, NIP, nazw, kwot, danych kontaktowych,
credentials, surowych odpowiedzi SDK lub `Error.cause`. Agent nie dostaje
service-role, bezpośredniego SQL/SSH ani akcji operatora; może analizować
udostępnione dowody i formułować oznaczone hipotezy. Tekst błędu, dokumentu
lub załącznika jest danymi, **nie instrukcją do wykonania**. Zewnętrzna usługa
otrzymuje tylko zaakceptowany zredagowany zakres po sprawdzeniu jej tożsamości,
uprawnień i granic przetwarzania; nowy wymóg nie upoważnia eksportu dokumentów.

Sentry EU Team jest nowym wyborem docelowym z 10.10: historia błędów do 90 dni,
spans do 30 dni. Zastępuje wybór Developer i 30-dniowych error events z 07.10,
bez zmiany historycznej deklaracji o braku płatnych planów. Źródła i zakres
wyboru opisuje [ownership](ownership.md). Aktywny plan, quota, retencje,
rozliczenia i konfiguracja nie zostały tu zweryfikowane; G07 nadal PARTIAL.
Sentry może filtrować, tracić lub wygaszać zdarzenia i nie jest pełnym ledgerem.

W F0 przyjmujemy kontrakt danych i granice dostępu. Dashboard, instrumentacja
pełnego śladu, podłączenie i test autoryzacji agenta należą do **F1 po
rzeczywistym odbiorze F0**. Nie przyznano dostępu, nie podłączono agenta i nie
uruchomiono testu; TEST-04 pozostaje NOT RUN.

## Sampling, dostawcy i dostęp

Wymagane przejścia domeny/audit: 100%, bez sampling. Eksport telemetrii jest
asynchroniczny, ograniczony i nie blokuje faktur. Sampling requestów ustala się
docelowo na 10%, do sprawdzenia i kalibracji w późniejszym etapie. Canary ma
100% capture w kontrolowanym teście, z osobno potwierdzonym ingest/indexing.
Pełny error outcome nie gwarantuje kompletu spanów odrzuconych head sampling.

Pomiar z 04.10 potwierdził **region ingest EU dla istniejących Sentry i PostHog**.
[Odczyty API z 06.10](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026)
uzupełniły metadane kont i część ustawień/uprawnień PostHog. Sentry nie ujawnił
aktywnego planu ani retencji, a billing PostHog zwrócił 403 o nieustalonej
przyczynie. **G07 pozostaje PARTIAL, z brakującymi dowodami planów i kosztów**;
nie jest już uzasadnione opisywanie wszystkich metadanych jako niedostępnych.
Region intake nie potwierdza regionu każdej dodatkowej funkcji, wszystkich
subprocessors. Datadog jest jawnie poza wybranym obecnym zakresem; EU1 nie
jest potwierdzonym kontem. Wybrana polityka nie zmienia odczytanych retencji
produktów; wymagane pozostają dowody aktywnych kosztów i uprawnień.
W odpowiedzi przekazanej 07.10 zadeklarowano brak płatnych planów Sentry/PostHog.
Nie potwierdza to konkretnego planu Free, retencji Sentry, kompletu uprawnień
ani zerowego kosztu; deklaracja i metadane API pozostają osobnymi źródłami.

Oddzielne klucze/env i role z minimalnymi uprawnieniami. Eksport telemetrii nie
dostaje Supabase service-role. DBM: read-only i normalized SQL bez bind values;
plany/komentarze objęte redakcją. Diagnoza AI: read-only i zredagowany zakres
incydentu. SSO/MFA i audyt dostępu wymagają odbioru. [Role](ownership.md)
mają wskazane zakresy: według najnowszej wiadomości Igora z 07.10 monitoring,
koordynacja i odbiór F0 należą do Igora, a Codex dokumentuje, zbiera i przegląda
dowody w dostępnym, autoryzowanym zakresie. Wcześniejsza deklaracja Bartosza
dotycząca kopii i staging pozostaje zakresem przyszłych koniecznych czynności
operatorskich. Same role nie zatwierdzały G04/G05/G06; późniejsza delegacja
przyjmuje ich konkretne wartości, bez odbioru wykonania. Plany kont sprawdzamy
w miarę możliwości
samodzielnie, bez automatycznego zlecania nowych pytań Bartoszowi.

Historyczna deklaracja pierwszych odpowiedzi 07.10: krytyczne Slack/Telegram;
raport codzienny email/Telegram
o 06:00. Wcześniej przekazano odbieranie alarmów przez Bartosza 08:00–22:00
w miarę możliwości, bez formalnego dyżuru i zastępcy. Igor doprecyzował
strefę obu godzin jako Europe/Warsaw, a następnie przyjął monitoring
i koordynację; wcześniejsze godziny nie ustanawiają dyżuru Igora.
Nie odczytano konfiguracji ani działania kanałów, coverage i lifecycle.
Późniejszy delegowany wybór wskazuje Igora jako docelowego głównego odbiorcę,
Telegram/email dla krytycznych i Slack roboczo; **G08 PARTIAL**, bez
potwierdzonego routingu lub dyżuru. Dane raportów podlegają powyższej allowlist.

## Odbiór prywatności

[Przegląd kodu z 07.10](runtime-inventory.md#przegląd-kodu-i-ci--07102026)
potwierdza wyłączenia replay/autocapture/heatmaps i consent gate w PostHog
oraz wspólne opcje redakcji Sentry na `84b75ea`. Jest to deklaracja kodu,
osobna od ustawień konta i stanu produkcji. Nie zatwierdza polityki,
nie potwierdza wdrożonego bundle ani skuteczności redakcji i nie zalicza TEST-04.

Na izolowanym staging przygotować dwa syntetyczne tenanty, NIP `1234567890`
i canary przypominające token, kwotę, XML, email, presigned URL oraz prompt.
Sprawdzić stdout, log/trace/error, SQL/DBM, RUM/URL, alert i pakiet AI. Weryfikować
faktycznie wysłane dane, nie tylko zamaskowany widok. Zakazanych canary nie ma
w eksporcie, a tenant A i anon nie czytają operacji B. **TEST-04: NOT RUN**;
staging nie istnieje, więc aktywny odbiór nie został rozpoczęty.

Wybrane terminy, audit/source maps i limity są przyjętą polityką, a nie jej
implementacją. `tenant_ref` domyślnie pomijamy w SaaS; product analytics/RUM
wymagają opt-in i zaprzestania eksportu po cofnięciu zgody. Obecny kod `identify`
wysyła pseudonimowe UUID: zgodność tej ścieżki z nową granicą eksportu wymaga
osobnego przeglądu/zmiany, bez automatycznego uznania wdrożenia za zgodne.
Uprawnienia kont, retencje produktów i redakcja w ruchu nadal wymagają dowodów;
TEST-04 pozostaje NOT RUN. Docelowa polityka kopii 7/4/12 jest przyjęta, ale
wykonanie i izolowany restore nie zostały odebrane.
