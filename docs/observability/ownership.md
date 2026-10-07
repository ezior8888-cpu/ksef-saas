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

## Aktualne decyzje — przegląd kontynuacji 04.10.2026

W pakiecie opublikowanym w [PR #225](https://github.com/ezior8888-cpu/ksef-saas/pull/225)
na `6399ff9df0b2dc0874e4411983d3543c7dee5f70`, jego dyskusji oraz wcześniejszych
czatach F0 nie znaleziono nowych zatwierdzeń Bartosza. Ostatnie odczytane
wcześniejsze zlecenie Igora dotyczyło włączenia pomiaru i publikacji pakietu,
przy zachowaniu otwartego F0. Obecna kontynuacja wymaga domykania decyzji i
brakujących dowodów, bez czynności operacyjnych i bez rozpoczęcia F1.
To granica sprawdzonych źródeł, nie twierdzenie, że decyzje nie
istnieją w innych miejscach. D01–D10 i nieprzyjęte role pozostają PENDING.

**Aktualizacja 06.10.2026:** Igor przekazał informacje o dostępie oraz
podtrzymał brak staging, pełnego dumpa DB off-host i kopii MinIO. Są zapisane jako
[deklaracje](runtime-inventory.md#deklaracje-przekazane-06102026), osobno od
pomiaru z 04.10. Według deklaracji odczyt Coolify przez istniejący dostęp
SSH nie wymaga osobnego tokenu API. Na etapie tej wiadomości prywatny plik
inventory nie był jeszcze dostarczony. Później wskazano go i zweryfikowano
lokalnie; nie oznacza to uzyskania uwierzytelnionego odczytu runtime.
Podane identyfikatory kont nie potwierdzają planów ani retencji.
Wiadomość nie zatwierdza proponowanych kontraktów, polityki danych,
budżetów lub ról, nie rozstrzyga D01–D10 i nie jest odbiorem F0.

**Odczyty techniczne 06.10.2026:** [pomiar API i próba SSH](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026)
oraz [bezpieczny indeks](evidence/f0-2026-10-06.json) są osobnymi źródłami.
API Hetznera potwierdza VM, przypisane reguły zapory i siedem obrazów backupu
dysku DB; API Sentry/PostHog daje częściowe dowody metadanych EU i ustawień.
Nie potwierdzono pełnego zakresu backupu DB/MinIO ani restore, planów/kosztów
i wszystkich produktów. SSH nie dostarczył odczytu runtime. Właściciel klucza
odblokowuje go lokalnie; haseł kluczy nie przekazuje się w czacie. Zaufane
klucze hostów wymagają niezależnej weryfikacji, bez wyłączania jej kontroli.
Odczyt ustawień replay nie zatwierdza polityki danych i nie dowodzi aktywnego
nagrywania w aplikacji. G02/G07 mają częściowe dowody; G03/G09 pozostają FAIL,
G04/G05/G06/G08 PENDING. Nie przyjęto nowych ról, decyzji ani odbioru F0;
nie zmieniono serwerów lub ustawień dostawców i nie rozpoczęto F1.

[C-22](../koordynacja/CLAUDE-DO-CODEXA.md) przekazuje prośbę Bartosza o kontekst
centrum dowodzenia. Sekcja 11 [briefu](../koordynacja/CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md)
zawiera osobne propozycje D1–D7. W odpowiedziach używamy oznaczeń **F0-D01…D10**
oraz **C22-D1…D7**, zachowując dotychczasowe ID w tych dokumentach. Przyjęcie
jednego zestawu nie zatwierdza drugiego. Rekomendacja Datadog EU także nie
jest potwierdzonym wyborem właściciela ani dowodem dostępności produktów.

Aktualny zakres kontynuacji obejmuje dokumentację i lokalne poprawki pakietu.
Nie obejmuje migracji, wdrożeń, restore ani zmian serwerów. Wskazanie w briefie,
że jego fazy 0–2 mogą się rozpocząć, nie uchyla zakazu rozpoczęcia F1 przed
odbiorem F0. Numeracja faz briefu i etapów observability ma oddzielne znaczenie.

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
| D08 / G07 | Zapewnić odczyt planów/produktów i limitów Sentry/PostHog w EU. Potwierdzony region ingest nie zamyka odbioru planów ani docelowej organizacji Datadog. | PENDING — Bartosz; częściowy odczyt kont wykonano 06.10; dowody planów/kosztów i pozostałych produktów nadal niepełne. |
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

## Karta odpowiedzi i odbioru

Odpowiedzi można przekazać partiami. Najpierw potrzebne są F0-D01/D02/D03/D08
oraz wskazanie osób przyjmujących G04/G05/G06/G08: zasady dowodów, backup,
staging, produkty i odpowiedzialność. Pozostałe decyzje domykają zastrzeżenia
runtime i kolejkę utrzymania. Ta kolejność jest propozycją organizacji pracy,
nie poleceniem wykonania zmian.

Każda odpowiedź powinna zawierać:

- **ID i rozstrzygnięcie:** przyjęte, odrzucone albo do wyjaśnienia, z konkretną
  treścią wyboru; sama odpowiedź „OK” bez zakresu nie zmienia bramki.
- **Kto i kiedy:** osoba podejmująca decyzję, data i czas UTC, źródło odpowiedzi.
- **Materiał:** commit/wersja dokumentu, przyjęte wartości, wyjątki i warunki.
- **Wykonanie i przegląd:** osoba przyjmująca zadanie, reviewer, termin lub
  jawny brak terminu; wskazanie osoby jest propozycją do jej przyjęcia.
- **Dowód:** prywatna referencja i bezpieczny publiczny wyciąg zgodny z D01;
  bez adresów, loginów, nazw zasobów, danych kontaktowych i sekretów.
- **Skutek:** powiązana bramka, zależny etap oraz osobny zakres czynności
  operacyjnych. Zgoda na rozwiązanie nie jest dowodem jego wykonania.

Nie dopisano fikcyjnych odpowiedzi ani dat akceptacji. Lista potrzebnych
odczytów i artefaktów jest w [planie odbioru](acceptance-plan.md#brakujące-dowody-do-odbioru).
Zamknięcie F0 wymaga osobnego zapisu odbioru wszystkich F0-G01–G09 ze źródłami
i datą, przez przyjętego odbiorcę. Publikacja kolejnego commita, zielone testy
kolektora i decyzja o późniejszych pracach nie zastępują tego zapisu.

## Pierwsza partia pytań do Bartosza — 07.10.2026

Nie wymagają znajomości wewnętrznych oznaczeń decyzji. Brak staging i pełnych
kopii, lokalizacje usług, dane dostępu oraz granica publikacji bieżącego
pakietu są już zapisane. Pytania dotyczą pozostałych decyzji i dowodów:

1. Czy używanie KSeF TEST przez aplikację produkcyjną jest celowym wyborem?
   Chodzi o intencję konfiguracji z historycznego pomiaru, bez jej zmiany.
2. Kto przyjmie odpowiedzialność za pełne kopie bazy i plików, a kto sprawdzi
   ich kompletność? Jaką retencję i termin proponujesz Igorowi do zatwierdzenia?
   Obecne backupy dysku DB nie pokrywają całego wymaganego zakresu dowodowego.
3. Kto przyjmie przygotowanie osobnego stagingu i sprawdzenie jego izolacji?
   Jaki termin można zaproponować? Uzgodnienie odpowiedzialności nie uruchamia
   prac na serwerach w tej kontynuacji.
4. Czy możesz dostarczyć prywatny, datowany odczyt aktywnych planów i kosztów
   Sentry/PostHog oraz retencji Sentry i brakujących uprawnień produktów?
   Ceny publiczne i metadane już sprawdzono; API nie ujawniło aktywnych planów.
   Hasła, klucze prywatne i wartości tokenów nie są potrzebne w odpowiedzi.
5. Kto rzeczywiście odbiera alarmy, w jakich godzinach i czy ma zastępstwo?
   Kto ma przyjąć końcowy odbiór F0? Kontakt operacyjny nie oznacza dyżuru.

To pierwsza partia, nie zastępstwo całego rejestru. Kontrakty biznesowe,
politykę danych, budżet narzutu i zakres docelowych produktów zatwierdza Igor
lub wskazany właściciel po przyjęciu roli; Bartosz dostarcza ograniczenia
techniczne i przyjmuje własny zakres. Odpowiedzi nie zostały jeszcze udzielone.
Pytania nie są poleceniami zmian serwerów, testu telefonu ani rozpoczęcia F1.
