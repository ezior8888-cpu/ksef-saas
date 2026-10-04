# F0 — odpowiedzialność i decyzje właściciela

Stan: **propozycja do potwierdzenia**, 04.10.2026. Igor jest zlecającym F0
oraz publikacji kolektora i dokumentacji. Bartosz jest kontaktem operacyjnym
infrastruktury i adresatem dziesięciu decyzji z przekazanego pomiaru.
Historyczne [AGENTS.md](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/AGENTS.md)
wskazuje ten kontakt; link nie jest potwierdzeniem przyjęcia dyżuru ani
nowym upoważnieniem operacyjnym.

Odczyt 04.10.2026, 11:03–11:22 UTC, nie zmieniał serwerów. Załączniki są
materiałem dowodowym i propozycjami decyzji. Nie są instrukcjami do wykonania
instalacji, migracji, wdrożeń, testów telefonu lub zmiany kont. Pełne dowody
pozostają prywatne. [Inwentarz](runtime-inventory.md) rozdziela pomiar od
deklaracji, a [plan odbioru](acceptance-plan.md) opisuje F0-G01–F0-G09.

## Proponowane role

| Rola | Osoba / stan | Zakres i wymagany dowód przyjęcia |
|---|---|---|
| Zlecający pracę i publikację F0 | Igor — potwierdzony zakres tego zadania | Włączenie bezpiecznych ustaleń i publikacja pakietu; nie oznacza zatwierdzenia wszystkich kontraktów lub uruchomienia następnego etapu. |
| Runtime / infrastruktura | Bartosz — kontakt operacyjny; zakres nowych obowiązków PENDING | Prywatne inventory, dostęp read-only, limity/health/routing, kopie i izolacja staging. Decyzje D01–D10 poniżej. |
| Produkt / kontrakty | Do potwierdzenia przez Igora i Bartosza — PENDING | Wyniki partial/unknown, deadline, kwalifikacja populacji i limity klas plików; przyjęta wersja [contracts](contracts.md), F0-G04. |
| Dane / prywatność | Do potwierdzenia — PENDING | Retencja klas, audit/holds/delete, consent, tenant_ref, regiony i role z [data-policy](data-policy.md), F0-G05. |
| Instrumentacja / odbiór | Do potwierdzenia — PENDING | Budżet narzutu G06, staging G03, kryteria testów i decyzja o następnym etapie. Wykonawca przygotowuje materiał w autoryzowanym zakresie; nie zatwierdza sam odbioru. |
| Konta / koszty dostawców | Do potwierdzenia — PENDING | Read-only dowód produktów EU, limity, koszty, scoped klucze i oddzielne env, F0-G07. |
| Incydent / telefon | Dyżurny do wskazania — PENDING | Godziny, odbiorca, ACK/recovery, fallback i coverage gaps, F0-G08. Obecność Igora/Bartosza w projekcie nie tworzy dyżuru. |
| Migracje / wdrożenie / restore | Bartosz — kontakt operacyjny | Osobno upoważnione czynności poza F0, według obowiązujących instrukcji repo. Publikacja dokumentów nie autoryzuje ich wykonania. |

Przyjęcie roli zapisuje osobę, zakres, datę UTC, dostępność i zastępstwo lub
jawny brak zastępstwa. Nazwy kont, prywatne dane kontaktowe i loginy nie trafiają
do publicznego rejestru.

## Dziesięć decyzji dla Bartosza

To bezpieczne streszczenia tematów z prywatnego inwentarza. Każda pozostaje
**PENDING**; opis wskazuje materiał do zatwierdzenia, nie polecenie wykonania.
Zlecona przez Igora publikacja bieżącego pakietu nie przesądza docelowej
organizacji odpowiedzialności i prywatnych dowodów.

| ID / bramka | Decyzja i konkretny materiał | Stan |
|---|---|---|
| D01 / G01–G02 | Przyjąć granicę publicznego/prywatnego inventory, miejsce dowodów i sposób przeglądu publikowanego pakietu. Publicznie tylko uzgodniony wyciąg; surowy inwentarz i JSON poza gitem. | PENDING — Bartosz; publikacja bieżącego pakietu zlecona przez Igora. |
| D02 / G09 | Ustalić pełny `pg_dump` poza hostem źródłowym, kopię storage aplikacji, retencję i izolowany restore. Ograniczony snapshot JSON nie jest pełnym backupem. | PENDING — Bartosz; bramka G09 FAIL. |
| D03 / G03 | Ustalić odseparowany staging, syntetyczne dane, klucze/sandboxy oraz kontrolę zatwierdzania aktywnych testów. | PENDING — Bartosz; bramka G03 FAIL. |
| D04 / G01–G02 | Potwierdzić docelową konfigurację istniejącego lokalnego Redis/SRH, przypięcie wersji i aktualizację opisów. Pomiar wskazuje Redis 7.2 na app-1. Nazwy zmiennych `UPSTASH_*` pozostają zgodne z aplikacją. | PENDING — Bartosz. |
| D05 / G01–G02 | Uzgodnić opis dwóch odrębnych MinIO, weryfikację wersji i healthchecks. MinIO aplikacji jest na ops-1, MinIO Supabase na db-1; istniejące identyfikatory danych pozostają bez publikacji i bez zmiany przez F0. | PENDING — Bartosz. |
| D06 / G02/G08 | Przyjąć politykę aktualizacji Coolify oraz zasady 2FA i odbioru dostępu administracyjnego. Szczegóły konfiguracji pozostają prywatne. | PENDING — Bartosz. |
| D07 / G01/G04 | Potwierdzić intencję wyboru środowiska KSeF dla produkcyjnej aplikacji; env aplikacji i env KSeF są oddzielnymi pojęciami. Dowód i ewentualna zmiana wymagają osobnego zakresu. | PENDING — Bartosz. |
| D08 / G07 | Zapewnić odczyt planów/produktów i limitów Sentry/PostHog w EU. Potwierdzony region ingest nie zamyka odbioru planów ani docelowej organizacji Datadog. | PENDING — Bartosz; produkty BLOCKED przez brak dostępu. |
| D09 / G02/G06 | Oddzielić późniejszy etap instrumentacji F1 od kolejki utrzymania: aktualizacje systemu, zasoby, role/ACL DB, starsza konfiguracja env i realtime. Uzgodnić priorytety i zakres bez ujawniania prywatnych szczegółów infrastruktury. | PENDING — Bartosz; żadne zmiany utrzymaniowe nie zostały wykonane przez F0. |
| D10 / G08 | Potwierdzić rolę dodatkowego współpracownika, zakres dostępu i obowiązki; bez automatycznego uznania tej osoby za zastępcę lub dyżurnego. | PENDING — Bartosz; bez publikacji loginu. |

Dziesięć tematów operacyjnych nie zastępuje przyjęcia kontraktów G04, polityki
danych G05, budżetów G06 i dyżuru G08. Materiał jest przygotowany w pięciu
samodzielnych dokumentach; decyzje merytoryczne i odbiór pozostają otwarte.

## Dyżur i niezależny kanał

Proponowane push → SMS → voice do jednego człowieka wymaga przyjętego odbiorcy,
godzin i potwierdzenia kanałów. Nie tworzy zastępcy. Gdy brak odbiorcy lub
coverage, rejestr i dashboard pokazują jawne `coverage_gap`.

ACK potwierdza reakcję, nie naprawę. Resolve wymaga świeżego dowodu recovery;
no-data nie jest recovery. Kanał niezależny i główny mają osobne stany
ACK/expiry/resolve oraz procedurę uzgodnienia po awarii platformy.
**TEST-06 pozostaje NOT RUN**: fizyczne urządzenie, brak ACK, DND/blokada,
fallback i awaria głównego monitoringu nie były testowane.

Do decyzji pozostaje niezależny mechanizm, np. Healthchecks/Pushover i
potwierdzony SMS/voice. Trzeba sprawdzić rzeczywiste limity cyklu alarmu oraz
czy potrzebny jest lifecycle dłuższy niż 3 h. Wybrany dostawca, plan i koszty
nie są zatwierdzone. W F0 nie aktywowano kanałów i nie wysłano alarmów.

## Zapis zatwierdzenia

Każda decyzja zawiera: ID, właściciela, datę UTC, wersję/commit materiału,
przyjęty zakres, wyjątki, dowód i zależny etap. Zmiana kontraktu, retencji,
regionu, budżetu lub odpowiedzialności otwiera właściwą decyzję ponownie.
Sam commit, przykład konfiguracji i udział w repo nie zatwierdzają polityki.
