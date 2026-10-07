# F0 — odpowiedzialność i decyzje właściciela

Stan: **część decyzji zapisana, F0 nadal otwarte**, 07.10.2026. Igor jest
zlecającym, właścicielem monitoringu oraz odbiorcą F0. Codex wykonuje pracę
techniczną w autoryzowanym zakresie. Bartosz pozostaje kontaktem operatorskim;
jego udział ograniczamy do koniecznych czynności wymagających jego dostępu.
Wcześniejszy zakres kopii/staging i zadeklarowany odbiór alarmów są opisane
poniżej, osobno od aktualnej koordynacji pracy.
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

## Decyzje i deklaracje przekazane 07.10.2026

Źródło: odpowiedzi przekazane przez Igora na pięć pytań do Bartosza oraz
doprecyzowanie Igora, że godziny dotyczą **Europe/Warsaw**. Materiałem
odniesienia jest pakiet `4a0113a`. Data dotyczy otrzymania odpowiedzi;
nie znamy odrębnego czasu UTC podjęcia decyzji. Nie wykonano nowego pomiaru.

- **KSeF TEST — decyzja:** celowe użycie przez aplikację produkcyjną.
  Według deklaracji produkt jest przed startem i nie ma prawdziwych klientów.
  Przełączenie TEST → PROD jest osobnym zadaniem go-live F1 (W15/S13) z
  [planu faktur](../koordynacja/PLAN-ZERO-ZGUBIONYCH-FAKTUR.md#blok-f--go-live-m4-m8).
  To osobna numeracja od F1 observability. Żadnego z tych zadań nie rozpoczęto.
- **Pełne kopie — decyzja o zakresie i odpowiedzialności:** wdraża i odpowiada
  Bartosz. Codzienny pełny `pg_dump`, w tym schematy auth i storage, oraz kopie
  obu MinIO (aplikacji i Supabase); zaszyfrowany zapis na zewnętrzny cel w UE
  poza hostami źródłowymi. Retencja: **7 kopii dziennych, 4 tygodniowe,
  12 miesięcznych**. Raz w miesiącu próbne odtworzenie. Termin uruchomienia,
  konkretny cel, reviewer i dowody wykonania nie zostały wskazane w pierwotnej
  odpowiedzi. Późniejsze ustalenie przypisuje przegląd dostępnych dowodów Codexowi.
- **Staging — decyzja o zakresie i odpowiedzialności:** przygotowuje Bartosz,
  **do 31.10.2026**, po kopiach i przed Closed Alpha. Osobne DB, kolejka,
  storage i klucze; KSeF TEST oraz Stripe test. W pierwotnej odpowiedzi nie
  wskazano reviewera; późniejsze ustalenie przypisuje dostępny przegląd Codexowi.
  Dowody uruchomienia i rzeczywistej izolacji pozostają otwarte.
- **Sentry/PostHog — deklaracja:** brak płatnych planów. Nie przypisujemy
  konkretnej nazwy darmowego planu ani kosztu 0; retencje, limity i brakujące
  uprawnienia nadal wymagają dowodów. Odczyty API z 06.10 pozostają osobnym źródłem.
- **Alarmy — zadeklarowany odbiorca i organizacja:** krytyczne przez Slack
  i Telegram; codzienny raport o **06:00 Europe/Warsaw** przez email i Telegram.
  Odbiera Bartosz w miarę możliwości **08:00–22:00 Europe/Warsaw**. Formalnego
  dyżuru i zastępstwa nie ma; dostępność w tym oknie nie jest gwarantowana.
  To jawna luka G08. Prywatne oznaczenia kanałów i bota pozostają poza gitem.

Przyjęty zakres kopii/staging nie jest dowodem wykonania; **G03/G09 nadal FAIL**.
G08 pozostaje PENDING z zapisanym odbiorcą alarmów i jawną luką. Nie zatwierdzono
całych G04/G05/G06/G07 ani
odbioru F0. Comiesięczny restore jest uzgodnioną przyszłą czynnością operatora;
nie uruchamiamy go w tej kontynuacji, podobnie jak zmian serwerów lub F1.

**Dalsza decyzja Igora z 07.10 — aktualna organizacja pracy:** Igor przejmuje
całość prowadzenia monitoringu FaktFlow i odpowiedzialność za domykanie F0,
w tym decyzję o jego formalnym odbiorze. Codex sam przygotowuje dokumentację,
sprawdza dostępne źródła i zbiera dowody; do Igora kieruje tylko decyzje lub
braki, których nie może rozstrzygnąć sam. Bartosz nie jest domyślnym adresatem
pytań ani osobą zatwierdzającą każdy element F0. Jego wcześniejsze wskazanie
jako wykonawcy kopii/staging pozostaje kontekstem operatorskim; dalszy zakres
koniecznych czynności uzgadnia Igor. Nie jest to zgoda na zmiany serwerów.

Ta decyzja nie zmienia automatycznie konfiguracji odbiorców alarmów:
zadeklarowany odbiór przez Bartosza pozostaje opisem otrzymanej informacji,
bez dowodu przekierowania do Igora. Własność monitoringu nie ustanawia
formalnego dyżuru ani nie usuwa luki G08. Przyjęcie roli odbiorcy F0 nie jest
jeszcze odbiorem wyników; wszystkie bramki nadal wymagają własnych dowodów.

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

## Role i odpowiedzialność

| Rola | Osoba / stan | Zakres i wymagany dowód przyjęcia |
|---|---|---|
| Właściciel monitoringu, koordynacja i publikacja F0 | Igor — wskazany 07.10 | Prowadzenie całości monitoringu i domykanie decyzji; przyjęcie roli nie zatwierdza automatycznie kontraktów ani następnego etapu. |
| Przygotowanie i techniczna weryfikacja F0 | Codex — zakres obecnego zadania | Dokumentacja, odczyty dostępnych źródeł i ocena dowodów; samodzielna praca bez zmian serwerów, migracji, wdrożeń, restore lub F1. |
| Runtime / infrastruktura | Igor — koordynacja; Bartosz — konieczny kontakt operatorski | Wcześniej wskazano Bartosza jako wykonawcę kopii/staging; dalsze czynności operatorskie uzgadnia Igor. Codex zbiera dostępne dowody i wskazuje braki; aktualny zakres nie pozwala na realizację serwerową. |
| Produkt / kontrakty | Igor — właściciel decyzji; wartości G04 PENDING | Wyniki partial/unknown, deadline, kwalifikacja populacji i limity klas plików; przyjęta wersja [contracts](contracts.md), F0-G04. |
| Dane / prywatność | Igor — właściciel decyzji; pozostałe wartości G05 PENDING | Retencja backupów zapisana; pozostałe retencje, audit/holds/delete, consent, tenant_ref, regiony i uprawnienia z [data-policy](data-policy.md) nadal do rozstrzygnięcia. |
| Budżet i warunki odbioru | Igor — właściciel decyzji; G06 PENDING | Codex przygotowuje materiał i ograniczenia budżetu; wykonawca nie zatwierdza sam odbioru. |
| Konta / koszty dostawców | Igor — właściciel; Codex — dostępne odczyty | Dowody produktów EU, aktywne limity, koszty i uprawnienia; deklaracja o braku płatnych planów nie zamyka G07. |
| Incydent / telefon | Bartosz — zadeklarowany odbiorca; formalnego dyżuru/zastępstwa brak | Best effort 08:00–22:00 Europe/Warsaw, Slack/Telegram i raport email/Telegram o 06:00. G08 PENDING: jawna luka, brak dowodu doręczeń, lifecycle i niezależności kanału. |
| Formalny odbiór F0 / przegląd kopii i staging | Igor — odbiór; Codex — przegląd dostępnych dowodów | Decyzja Igora po sprawdzeniu pełnych kryteriów. Faktyczna kompletność kopii i izolacja wymagają dowodów, których sam przegląd dokumentów nie dostarcza. |
| Migracje / wdrożenie / restore | Bartosz — kontakt operacyjny | Osobno upoważnione czynności poza F0, według obowiązujących instrukcji repo. Publikacja dokumentów nie autoryzuje ich wykonania. |

Przyjęcie roli zapisuje osobę, zakres, datę UTC, dostępność i zastępstwo lub
jawny brak zastępstwa. Nazwy kont, prywatne dane kontaktowe i loginy nie trafiają
do publicznego rejestru.

## Dziesięć decyzji F0

To bezpieczne streszczenia tematów z prywatnego inwentarza, uzupełnione
odpowiedziami z 07.10. Stany rozdzielają uzgodnienie zakresu od wykonania;
opis wskazuje materiał do zatwierdzenia, nie polecenie wykonania.
Zlecona przez Igora publikacja bieżącego pakietu nie przesądza docelowej
organizacji odpowiedzialności i prywatnych dowodów.

| ID / bramka | Decyzja i konkretny materiał | Stan |
|---|---|---|
| D01 / G01–G02 | Publicznie uzgodniony wyciąg; pełne odczyty i surowe odpowiedzi poza gitem, przegląd przez Codex, odbiór przez Igora. | GRANICA I ORGANIZACJA BIEŻĄCEGO PAKIETU USTALONE przez Igora; dowody nadal pozostają prywatne. |
| D02 / G09 | Pełny codzienny `pg_dump` z auth/storage i kopie obu MinIO, szyfrowanie, zewnętrzny cel UE, 7 dziennych/4 tygodniowe/12 miesięcznych kopii oraz comiesięczny izolowany restore. | ZAKRES ZAPISANY 07.10 — Igor koordynuje, Codex przegląda dostępne dowody; Bartosz był wskazany jako wykonawca operatorski. Cel, termin i dowody wykonania otwarte. G09 FAIL. |
| D03 / G03 | Staging z własną DB/kolejką/storage/kluczami, KSeF TEST i Stripe test; syntetyczne dane i kontrola aktywnych testów według kryteriów G03. | ZAKRES ZAPISANY 07.10 — Igor koordynuje, Codex przegląda dowody; Bartosz był wskazany jako wykonawca operatorski. Do 31.10, po kopiach i przed Closed Alpha. Dowód izolacji otwarty; G03 FAIL. |
| D04 / G01–G02 | Potwierdzić docelową konfigurację istniejącego lokalnego Redis/SRH, przypięcie wersji i aktualizację opisów. Pomiar wskazuje Redis 7.2 na app-1. Nazwy zmiennych `UPSTASH_*` pozostają zgodne z aplikacją. | PENDING — Igor; Codex zbiera dowody, operator tylko w koniecznym zakresie. |
| D05 / G01–G02 | Uzgodnić opis dwóch odrębnych MinIO, weryfikację wersji i healthchecks. MinIO aplikacji jest na ops-1, MinIO Supabase na db-1; istniejące identyfikatory danych pozostają bez publikacji i bez zmiany przez F0. | PENDING — Igor; Codex zbiera dowody. |
| D06 / G02/G08 | Przyjąć politykę aktualizacji Coolify oraz zasady 2FA i odbioru dostępu administracyjnego. Szczegóły konfiguracji pozostają prywatne. | PENDING — Igor; konieczne ograniczenia dostępu sprawdza operator. |
| D07 / G01/G04 | KSeF TEST w aplikacji produkcyjnej jest celowy na etapie przed startem; TEST → PROD pozostaje osobnym zadaniem go-live W15/S13. | INTENCJA ROZSTRZYGNIĘTA 07.10; bez przełączenia środowiska i bez odbioru całego G04. |
| D08 / G07 | Osobne dowody planów/produktów i limitów Sentry/PostHog w EU oraz docelowej organizacji Datadog. | CZĘŚCIOWO — API 06.10 i deklaracja 07.10 o braku płatnych planów. Dokładne plany, koszty i brakujące uprawnienia niezweryfikowane. |
| D09 / G02/G06 | Oddzielić późniejszy etap instrumentacji F1 od kolejki utrzymania: aktualizacje systemu, zasoby, role/ACL DB, starsza konfiguracja env i realtime. Uzgodnić priorytety i zakres bez ujawniania prywatnych szczegółów infrastruktury. | PENDING — Igor; żadne zmiany utrzymaniowe nie zostały wykonane przez F0. |
| D10 / G08 | Potwierdzić rolę dodatkowego współpracownika, zakres dostępu i obowiązki; bez automatycznego uznania tej osoby za zastępcę lub dyżurnego. | PENDING — Igor; zastępstwa według deklaracji nie ma, bez publikacji loginu. |

Dziesięć tematów operacyjnych nie zastępuje przyjęcia kontraktów G04, polityki
danych G05, budżetów G06 i dyżuru G08. Materiał jest przygotowany w pięciu
samodzielnych dokumentach; decyzje merytoryczne i odbiór pozostają otwarte.

## Dyżur i niezależny kanał

Odpowiedź z 07.10 wskazuje Bartosza jako odbiorcę alarmów krytycznych Slack
i Telegram oraz raportu email/Telegram o 06:00 Europe/Warsaw. Dostępność
08:00–22:00 Europe/Warsaw jest best effort, bez formalnego dyżuru i zastępcy.
Nie potwierdzono doręczeń, kanału niezależnego ani gwarantowanego coverage.
G08 pozostaje PENDING, a rejestr pokazuje jawne `coverage_gap`.

ACK potwierdza reakcję, nie naprawę. Resolve wymaga świeżego dowodu recovery;
no-data nie jest recovery. Kanał niezależny i główny mają osobne stany
ACK/expiry/resolve oraz procedurę uzgodnienia po awarii platformy.
**TEST-06 pozostaje NOT RUN**: fizyczne urządzenie, brak ACK, DND/blokada,
fallback i awaria głównego monitoringu nie były testowane.

Push → SMS → voice i Healthchecks/Pushover były propozycjami, nie opisem
odebranej konfiguracji. Nie zastępują zadeklarowanych kanałów bez nowej
decyzji. Niezależność alarmu, fallback, koszty i rzeczywisty lifecycle nadal
wymagają uzgodnienia i dowodów. W F0 nie aktywowano kanałów ani nie wysłano alarmów.

## Zapis zatwierdzenia

Każda decyzja zawiera: ID, właściciela, datę UTC, wersję/commit materiału,
przyjęty zakres, wyjątki, dowód i zależny etap. Zmiana kontraktu, retencji,
regionu, budżetu lub odpowiedzialności otwiera właściwą decyzję ponownie.
Sam commit, przykład konfiguracji i udział w repo nie zatwierdzają polityki.

## Karta odpowiedzi i odbioru

Odpowiedzi można przekazać partiami. Zakres kopii/staging, intencję KSeF TEST,
deklarację planów i odbiór alarmów zapisano 07.10. Pozostają dowody wykonania,
przegląd ich kompletności oraz przyjęcie pozostałych G04/G05/G06/G08 przez Igora.
Pozostałe decyzje domykają zastrzeżenia
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
pakietu są już zapisane. **Odpowiedzi otrzymano 07.10 i zapisano
[powyżej](#decyzje-i-deklaracje-przekazane-07102026).** Poniżej pozostaje
historyczna treść pytań; nie prosimy ponownie o udzielone odpowiedzi:

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
politykę danych, budżet narzutu i zakres docelowych produktów zatwierdza Igor;
Codex przygotowuje materiał samodzielnie, ograniczając udział Bartosza do
koniecznych czynności operatorskich. Odpowiedzi domykają wskazane zakresy,
bez automatycznego przyjęcia pozostałych ról lub całego F0.
Pytania nie są poleceniami zmian serwerów, testu telefonu ani rozpoczęcia F1.
