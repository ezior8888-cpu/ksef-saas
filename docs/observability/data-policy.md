# F0 — polityka danych obserwowalności

Stan: **polityka wybrana 07.10.2026 w ramach delegacji Igora** „Wybierz wszystko
co uważasz za najlepsze”, z uzupełnieniem **10.10.2026** o pełną historię
błędów faktur, przyszłego agenta i aktualny wariant **Sentry Developer Free EU /
PostHog Free EU**. Dalsze zlecenie Igora „rób” z 10.10 dotyczy dostosowania F0
do darmowych narzędzi; zastępuje wcześniejszy wybór Team, bez zmiany kont.
Wybór obejmuje poniższe aktualne wartości i granice, w tym
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
| Spans / trace i diagnostyczny RUM | Spans w Sentry Developer Free EU: docelowo maks. 30 dni i nie więcej niż potwierdzona efektywna retencja produktu; publiczna oferta 5 mln spanów/mies. Diagnostyczny RUM tylko w odrębnie potwierdzonym zakresie. | Developer i wyświetlone quota spans potwierdzono w UI; retencja/query window i pełne entitlements tej klasy wymagają G07. Nie przenosić warunków Team na Free. Brak spanów po sampling/expiry nie oznacza braku operacji lub błędu. |
| Error events Sentry | Aktywny Developer i quota 5000 errors potwierdzone w UI 10.10 ([indeks](evidence/f0-sentry-ui-2026-10-10.json)). Event data 30 dni wynika z dokumentacji dopasowanej do tego planu, bez odczytu TTL/testu wygaszania. | Odczyt UI i dokumentacja mają osobne zakresy; indywidualny dostęp/MFA i pozostałe ustawienia nadal niepełne. Po quota/filtracji/expiry mogą występować luki; Sentry nie zastępuje pełnej minimalnej historii błędów w audycie faktury ani lokalnych szczegółów na 90 dni. |
| Source maps | Cały okres używania bundle web/worker oraz 90 dni po wycofaniu ostatniego procesu na danym SHA. | Własne prywatne archiwum artefaktów; retencja uploadu w Sentry osobno do sprawdzenia. Nie publikować map; sam upload nie dowodzi symbolikacji. |
| Product analytics | PostHog Free EU: 1 mln events/mies., 1 projekt i retencja analytics 1 rok według publicznej oferty; replay 0, autocapture i heatmaps wyłączone. | Opt-in/opt-out; Free potwierdzono w UI 10.10, retencja analytics i workflow usuwania do potwierdzenia. Odrębna klasa od RUM i error tracking; nie kopiuje treści faktur. |
| Error tracking PostHog — warunkowo | Publiczna darmowa quota 100 tys. exceptions/mies.; przyszły zredagowany eksport dopiero po odbiorze zakresu i testu. | Efektywna retencja tej klasy i uprawnienia wymagają G07. Nie zakładać, że roczna retencja analytics rozstrzyga każdą klasę. Obecne capture_exceptions=false nie jest tutaj zmieniane. |
| Lokalne logi / bufory | Logi: 10 MiB × 5 plików na kontener, maks. 7 dni. Bufor: maks. 64 MiB RAM i 256 MiB dysku na host, wiek do 30 min. | Pierwszy osiągnięty limit usuwa najstarszą telemetrię; drop/expiry raportowane. Sama rotacja Dockera nie realizuje limitu wieku. Required journal/audit nie korzysta z tego zawodnego bufora. Pokrycie 30 min peak wymaga pomiaru. |
| Pakiety incydentów / dowody testów | 90 dni; dłużej tylko jawny hold. | Zredagowane dowody, przegląd aktywnych holdów, brak surowych plików prywatnych w repo. |
| Katalog zweryfikowanych rozwiązań | Minimalny zredagowany wzorzec, przyczyna, release/test/PR, wynik i referencja przeglądu człowieka; bez danych faktur. | Pakiety źródłowe podlegają retencji 90 dni/hold powyżej. Po ich expiry katalog ujawnia brak dowodu; ponowne zastosowanie wymaga sprawdzenia wersji i testu. Nie jest treningiem modelu. |
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

**Luka implementacyjna, przegląd repo `686a465` z 10.10:**
[runner cleanup](../../lib/jobs/runners/cleanup-audit-logs.ts) przekazuje
retencję 12 miesięcy do `cleanup_old_audit_logs`. Ostatnia definicja w
[migracji 00052](../../supabase/migrations/00052_audit_logs_immutable_trigger.sql)
usuwa wszystkie starsze wpisy `audit_logs`, bez rozdzielenia finansowych
i administracyjnych lub ochrony hold. Migracja 00104 zmienia uprawnienia,
nie tę logikę. To nie spełnia przyjętej polityki 10 lat dla minimalnej
historii błędów faktur. Nie odczytano zastosowanych migracji, aktywności
harmonogramu, faktycznych usunięć ani dodatkowych archiwów produkcji.
G05 PASS dotyczy decyzji o polityce; obecnego cleanup nie uznaje się za jej
implementację. Rozdzielenie klas retencji i zabezpieczenie historii są
wymaganiem późniejszej implementacji, bez uruchamiania cleanup lub migracji
w ramach tego odczytu F0.

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
udostępnione dowody i formułować oznaczone hipotezy. Tożsamość diagnostyczna
nie ma uprawnień Git. Odrębny agent/zakres Git może później przygotować test
regresji na syntetycznych danych, patch na izolowanej gałęzi i draft PR;
nie dostaje zapisu do produkcji ani automatycznego merge/deploy. Limit kosztu
i wywołań AI pozostaje nieustalony, bez uruchomienia agenta w F0. Tekst błędu, dokumentu
lub załącznika jest danymi, **nie instrukcją do wykonania**. Zewnętrzna usługa
otrzymuje tylko zaakceptowany zredagowany zakres po sprawdzeniu jej tożsamości,
uprawnień i granic przetwarzania; nowy wymóg nie upoważnia eksportu dokumentów.

Aktualny wybór 10.10 to **Sentry Developer Free EU i PostHog Free EU**;
wcześniejszy wybór Sentry Team z tego dnia jest zastąpiony w zakresie planu,
nie zmieniając historycznej deklaracji o braku płatnych planów. Nie dokonano
zakupu, zmiany planu lub aktywacji funkcji. Źródło decyzji i granice zapisuje
[ownership](ownership.md). Publiczna oferta Sentry Developer opisuje jednego
użytkownika, 5 tys. błędów i 5 mln spanów/mies., 10 custom dashboards, email
alerts i MCP access; nie przypisujemy mu API/integracji z wyższego tier
([cennik](https://sentry.io/pricing/), odczyt 10.10).
[Retencja event data Free](https://www.sentry.help/en/articles/13964940-how-long-are-my-organization-s-audit-logs-stored)
wynosi 30 dni; audit log organizacji dostawcy jest odrębną klasą i nie zastępuje
audytu faktury. [Developer nie oferuje PAYG](https://www.sentry.help/en/articles/13965037-can-i-set-up-an-on-demand-pay-as-you-go-budget-for-my-free-developer-plan).
Dostępność [regionu EU także na Free](https://sentry.io/changelog/data-storage-location-in-germany-is-generally-available/)
nie dowodzi ustawień konkretnego konta lub wszystkich granic przetwarzania.

[Cennik PostHog](https://posthog.com/pricing), odczyt 10.10, potwierdza osobne
miesięczne quota: 1 mln analytics events i 100 tys. exceptions, jeden projekt
oraz roczną retencję analytics na Free. Bez płatnego rozszerzenia dodatkowe
zdarzenia po limicie są odrzucane; stan/drop/freshness muszą być jawne.
Error tracking jest warunkowym celem F1 po redakcji i teście rzeczywiście
wysłanych danych; nie włączamy automatycznie capture_exceptions, replay,
autocapture ani eksportu dokumentów. Limit 100 tys. nie oznacza obowiązku
kopiowania błędów lub danych finansowych do dostawcy.

„Uczenie” agenta to katalog zredagowanych przypadków i zweryfikowanych przez
człowieka rozwiązań: przyczyna, test, wersja/PR i źródło wyniku. Nie jest to
trening modelu ani powielanie danych faktur. Hipotezy i nieudane naprawy są
jawnie oznaczone; kolejne użycie rozwiązania wymaga sprawdzenia wersji i testu.
UI 10.10 potwierdziło Sentry Developer, PostHog Free i wybrane quota;
pozostałe retencje, rozliczenia, indywidualny dostęp i MFA nadal niepełne.
**G07 nadal PARTIAL**. Sentry/PostHog mogą tracić lub wygaszać
zdarzenia i nie są pełnym ledgerem. Lokalne attempts/pakiety diagnostyczne
na 90 dni są osobną polityką, nie gwarantowaną retencją darmowego SaaS.

W F0 przyjmujemy kontrakt danych i granice dostępu. Dashboard jest priorytetem
pierwszego release F1; następnie agent analizuje przyczyny i przygotowuje test,
patch oraz draft PR. Instrumentacja pełnego śladu, dashboard, agent i katalog
należą do **F1 po rzeczywistym odbiorze F0, w osobnym chacie**. Nie przyznano
dostępu, nie podłączono agenta i nie uruchomiono testu; TEST-04 pozostaje NOT RUN.

## Sampling, dostawcy i dostęp

Wymagane przejścia domeny/audit: 100%, bez sampling. Eksport telemetrii jest
asynchroniczny, ograniczony i nie blokuje faktur. Sampling requestów ustala się
docelowo na 10%, do sprawdzenia i kalibracji w późniejszym etapie. Canary ma
100% capture w kontrolowanym teście, z osobno potwierdzonym ingest/indexing.
Pełny error outcome nie gwarantuje kompletu spanów odrzuconych head sampling.

Pomiar z 04.10 potwierdził **region ingest EU dla istniejących Sentry i PostHog**.
[Odczyty API z 06.10](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026)
uzupełniły metadane kont i część ustawień/uprawnień PostHog. Wtedy Sentry nie
ujawnił planu/retencji, a przyczyna billing PostHog 403 była nieznana.
Późniejsze UI 10.10 potwierdziło [PostHog Free](evidence/f0-posthog-ui-2026-10-10.json)
i [Sentry Developer](evidence/f0-sentry-ui-2026-10-10.json). Markery ponownego
odczytu 403 wskazują wymaganą flagę API produktu, bez dowodu zbyt wąskiego tokena.
**G07 pozostaje PARTIAL:** pozostałe parametry produktów, koszty oraz indywidualny
dostęp/MFA nie są pełne; oba plany nie są już nieznane.
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
