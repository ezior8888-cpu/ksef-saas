# Dziennik — Masło (tor B: twarz)

Zasada: dopisujemy na końcu, nigdy nie edytujemy cudzych wpisów.
Ten plik należy do Masła. Dziennik Bartosza: `DZIENNIK-BARTOSZ.md`.

## 2026-08-24 · Krok 1 — helpery interfejsu (odmiana i czas)

Zrobione:
- `components/flo/format.ts` — `plural`, `countLabel`, `FLO_FORMS`,
  `timeLeft`, `clockLabel`, `dayGroupLabel`, stała `FLO_TZ`.
- `tests/unit/flo-ui-format.test.ts` — 14 testów.

Decyzje:
- Odmiana przez liczebnik ma JEDNO miejsce w całym torze B. Reguła: 1 →
  forma pierwsza; końcówka 2–4 poza nastolatkami 12–14 → forma druga;
  reszta, łącznie z zerem → forma trzecia.
- Czasownik odmienia się nie tylko przez liczbę, ale i przez RODZAJ.
  Pierwsza wersja pisała „został 1 minuta” — złapane własnym testem przy
  pisaniu asercji. Teraz: „została 1 minuta”, ale „został 1 dzień”.
- W tym pliku NIE MA i nie będzie formatowania kwot. Kwoty przychodzą
  z serwera jako gotowe napisy. Jeżeli kiedyś zabraknie napisu, to brakuje
  go w kontrakcie `FloProposalView`, a nie tutaj.
- Wyjątek od zasady „interfejs nie liczy”: CZAS. Serwer nie przyśle napisu
  „zostały 4 minuty”, bo ten zmienia się co sekundę na ekranie klienta.
  Odliczanie do `expiresAt` i `undoableUntil` liczy interfejs — i tylko to.
- Granica doby liczona JAWNIE w strefie `Europe/Warsaw`
  (`Intl.DateTimeFormat`), nie w strefie serwera. Kontenery chodzą w UTC:
  zdarzenie o 00:30 czasu polskiego to dla serwera 22:30 dnia poprzedniego,
  więc nagłówek pokazałby „WCZORAJ” nad czymś, co dla klienta stało się dziś
  w nocy. To ten sam błąd, który tor silnika złapał u siebie w kroku 10.
- `timeLeft` przyjmuje `now` jako parametr: test ma być powtarzalny, a lista
  kart trzyma jeden wspólny zegar (jeden interwał na listę, nie na kartę).
- Zły znacznik czasu z serwera wygasza kartę, ale nie wywala listy.

Weryfikacja:
- `npx vitest run tests/unit/flo-ui-format.test.ts` — 14/14 zielone, tak samo
  przy `TZ=UTC` (przypadek kontenera produkcyjnego).
- `pnpm typecheck` — czysto, zero błędów w całym repozytorium.
- `npx eslint components/flo/format.ts tests/unit/flo-ui-format.test.ts` — czysto.

Uwagi dla Bartosza:
- `tests/unit/flo-architecture.test.ts` PADA NA WINDOWS — 4 z 8 testów.
  Powód: `relative(ROOT, ...)` zwraca `lib\ksef\submit.ts` z odwrotnymi
  ukośnikami, a listy `KNOWN_UNGATED` i `OUTBOUND` używają zwykłych.
  Nic z mojego kroku tego nie dotyka — rzecz jest w Twoim pliku i widać ją
  wyłącznie poza Linuksem. Poprawka to jedna linijka przy każdym
  `relative(...)`: `.split(sep).join('/')`. Nie ruszam, bo to Twój tor.
  Reszta zestawu: 175 testów zielonych.

Następny krok: 2

## 2026-08-30 · Krok 2 — szkielet ekranu agenta `/flo`

UWAGA O NUMERACJI: część IV planu (lista kroków toru B) nie dotarła do sesji —
wklejka planu urwała się dwa razy w tym samym miejscu, na II.3. Zakres tego
kroku jest więc moją interpretacją tego, czego brakuje między helperami
(krok 1) a kartą bazową (krok 3, tak nazwany przez Bartosza w jego dzienniku).
Jeżeli plan mówi co innego — numer do przestawienia, kod zostaje.

Zrobione:
- `components/flo/timeline.ts` — `groupByDay`, `sortByUrgency`,
  `countTodayTasks` (czysta logika osi, bez Reacta).
- `app/(dashboard)/flo/page.tsx` — trasa `/flo` na atrapach.
- `app/(dashboard)/flo/_components/` — `flo-screen`, `flo-header`,
  `flo-timeline`, `flo-card-slot`, `flo-side-panel`, `flo-composer`.
- `tests/unit/flo-ui-timeline.test.ts` — 9 testów.
- `tests/unit/flo-ui-screen.test.tsx` — 5 testów dymnych (render do napisu).

Decyzje:
- Oś idzie CHRONOLOGICZNIE, najnowsze na dole, a nie po ważności. Klient
  wraca do ekranu kilka razy dziennie i szuka miejsca, w którym skończył —
  sortowanie po `priority` przestawiałoby mu karty pod ręką przy każdym
  odświeżeniu. `priority` zostaje do powiadomień i skrótów (`sortByUrgency`).
- Cały szkielet jest serwerowy. Stan wjedzie dopiero z kartą (krok 3) i jako
  wyspy klienckie w środku, nie jako `"use client"` na całym ekranie.
- Karta jest na razie MIEJSCEM, nie kartą: tytuł, treść, dowody, godzina.
  Świadomie bez przycisków — martwy przycisk „Wyślij do KSeF” jest gorszy
  niż jego brak.
- Pole rozmowy stoi, ale jest wyłączone i mówi o tym wprost. Ekran bez niego
  kłamałby o tym, czym FLO ma być; ekran z polem, które połyka tekst,
  kłamałby mocniej.
- Panel prawy pokazuje `approvedAtLabel` przy KAŻDEJ pozycji — to jest ten
  ślad zgody z inwariantu `FloScheduledView`, i test dymny tego pilnuje.
- Nagłówek: „Pracuje sam · informuje” i odznaka „N zadań dziś”. Żadnego
  „TRYB 3” z sierpniowej makiety; osobny test sprawdza, że nie wróciło.
- Paleta z `app/globals.css` (`--ff-*`), a nie jasne kolory z makiety —
  dashboard jest ciemny i ekran ma do niego pasować. Układ za makietą,
  barwy za aplikacją.
- Trasy NIE dodałem do menu bocznego (`lib/dashboard-nav-config.ts`):
  dopóki na ekranie są atrapy, wchodzi się na niego adresem. Nagłówek ma
  o tym uczciwą plakietkę „Dane przykładowe”.

Weryfikacja:
- `npx vitest run tests/unit/` — 189 testów zielonych; moje trzy pliki 28/28.
- `pnpm typecheck` — czysto. eslint na `components/flo` i `app/(dashboard)/flo`
  — czysto.
- Ekranu nie da się otworzyć w dev-serwerze z tego worktree: nie ma tu
  `.env.local`, a `/flo` siedzi za bramką auth. Zamiast tego wyrenderowałem
  go do statycznego HTML-a na komplecie 12 atrap i obejrzałem — komplet kart
  się rysuje, długie tytuły i nazwa kontrahenta bez spacji łamią się
  poprawnie. Ten zrzut nie wchodzi do repozytorium.

Uwagi dla Bartosza:
- `lib/flo/fixtures.ts` nie ma atrap historii („co FLO zrobił”). Na razie
  jest tam pusty stan; jak dorobisz `FloHistoryView` albo powiesz, że to ma
  być ta sama struktura co `FloScheduledView`, podepnę.
- Windowsowy błąd w `tests/unit/flo-architecture.test.ts` z kroku 1 nadal
  jest — 4 z 8 testów czerwone przy każdym `vitest run tests/unit/`.

Następny krok: 3 (karta bazowa)

### Sprostowanie do kroków 1–2 (po dociągnięciu `main`)

Pracowałem na gałęzi odbitej od starszego `main` i widziałem tor A na kroku 10.
Po rebase okazało się, że tor A jest domknięty (krok 56) i wdrożony na
produkcję, a windowsowy błąd w `tests/unit/flo-architecture.test.ts`, który
zgłosiłem w kroku 1, jest już naprawiony przez Bartosza. Cały zestaw: 53 pliki,
965 testów, wszystko zielone.

Co z tego wynika dla toru B: `app/actions/flo.ts` ma komplet akcji
(`listProposals`, `listScheduled`, `approveProposal`, `dismissProposal`,
`undoAction`, `cancelScheduled`, `getPrefs`, `savePrefs`). Ekran z kroku 2
zostaje na atrapach — podmiana to dwie linijki w `page.tsx` — ale karta
z kroku 3 może od razu wpinać się w prawdziwe akcje, bez czekania na cokolwiek.

## 2026-08-30 · Kroki 1–3 uzgodnione z planem + karta bazowa

Dostałem wreszcie pełny plan (części II.3–V). Dwie rzeczy z niego wynikły od
razu: moje wcześniejsze kroki miały inne numery, niż myślałem, i jeden krok
zrobiłem odwrotnie, niż plan każe.

CO POPRAWIŁEM WSTECZ:
- Odmiana przez liczebnik przeniesiona do `lib/i18n/plural.ts` — plan wskazuje
  tę ścieżkę w mapie własności (IV.2). `components/flo/format.ts` zostaje przy
  czasie i tylko przepuszcza `plural`/`countLabel` dalej.
- KROK 2 z planu to „miejsce dla FLO w nawigacji”, a ja go świadomie pominąłem
  (myślałem, że `lib/dashboard-nav-config.ts` jest wspólny — jest MÓJ, plan
  mówi to wprost). Dodane: pozycja „Flo” nad Dashboardem, ikona `assistant`,
  trasa `/flo`. `isActiveNavPath` obsługuje ją gałęzią domyślną, bez zmian.
- To, co zrobiłem jako „krok 2” (wątek z osią zdarzeń), jest w planie KROKIEM
  4. Zostaje — brakuje mu jeszcze mikrofonu i aparatu przy polu rozmowy,
  dorobię je, wracając po numer 4.
- Kolejność w wątku ODWRÓCONA na zgodną z planem: wewnątrz dnia najpierw
  priorytet, potem czas. Wcześniej sortowałem czysto chronologicznie i tak to
  uzasadniłem w kroku 2 — plan mówi inaczej i plan wygrywa. Dni nadal idą
  chronologicznie, więc układ z makiety („WCZORAJ”, potem „DZIŚ”) zostaje.
- Moje testy jednostkowe przeniesione z `tests/unit/flo-ui-*` na
  `tests/unit/ui-flo-*`. Wzorzec `tests/unit/flo-*` należy do Bartosza (IV.2);
  nazwy nie kolidowały, ale mapa własności ma być czytelna, a nie „prawie”.

KROK 3 — KARTA BAZOWA:
- `components/flo/proposal-card.tsx` — `FloProposalCard` przyjmuje
  `FloProposalView`, rysuje nagłówek (godzina + odliczanie), `title`, `body`
  i przyciski z `primary` oraz `secondary`. Rozgałęzienie przez
  `switch (view.variant)` z sześcioma jawnymi gałęziami; wszystkie prowadzą
  na razie do wyglądu `info`, zgodnie z planem.
- `app/(dashboard)/flo/_components/flo-card-slot.tsx` skasowany — zastąpiła go
  prawdziwa karta.
- `tests/unit/ui-flo-card.test.tsx` — 8 testów.

Decyzje:
- Brak `default` w switchu jest celowy: siódmy wariant ma zatrzymać
  kompilację, a nie wywalić ekran klientowi.
- `useNow` zwraca `null` przed zamontowaniem i dopiero potem tyka. Gdyby czas
  brał się z `new Date()` w trakcie renderu, serwer i przeglądarka policzyłyby
  go w dwóch różnych sekundach i React zgłosiłby rozjazd hydratacji na każdej
  karcie. Skutek uboczny: odliczania nie widać na statycznym zrzucie.
- Zegar tyka co sekundę, gdy do terminu jest mniej niż godzina, i co minutę
  w pozostałych przypadkach. Napis „zostały 4 minuty” musi się zmieniać,
  „zostało 6 dni” nie musi.
- Wygasła karta gaśnie i dostaje spokojne zdanie zamiast przycisków. Żadnej
  czerwieni — to ta sama zasada co przy odpowiedzi `stale` z kroku 19.
- Blokada przycisku przy `requiresPreview` jest już w karcie bazowej, mimo że
  podgląd dochodzi w kroku 7. Nie chcę, żeby ta blokada powstawała później
  przy okazji — to jedyna rzecz między klientem a wysyłką, której nie obejrzał.
- Bez wpiętej obsługi (`onAction`) przyciski są WYŁĄCZONE. Wpięcie akcji
  serwerowych plan umieszcza przy wariantach i w krokach 16–19.

Weryfikacja:
- `npx vitest run tests/unit/` — 54 pliki, 973 testy, wszystko zielone
  (moje cztery pliki: 36 testów).
- `pnpm typecheck` czysto, eslint na wszystkich dotkniętych plikach czysto.
- Ekran wyrenderowany do statycznego HTML-a na komplecie 12 atrap i obejrzany.
  Nadal nie da się go otworzyć w dev-serwerze z tego worktree: brak
  `.env.local`, a `/flo` jest za bramką auth.

Uwagi dla Bartosza: brak.

Następny krok: 4 (wątek `/flo` — domknięcie: mikrofon i aparat przy polu
rozmowy, stany puste), potem blok 1 (warianty 5–10).

## 2026-08-30 · Krok 4 — wątek `/flo`

Zrobione:
- `components/flo/thread.tsx` — `FloThread`: podział na dni, godzina w lewej
  kolumnie osi, stan pusty.
- `components/flo/proposal-card.tsx` — nowy props `showTime`.
- `app/(dashboard)/flo/_components/flo-composer.tsx` — mikrofon i aparat.
- `app/(dashboard)/flo/_components/flo-screen.tsx` — przepięty na `FloThread`.
- `app/(dashboard)/flo/_components/flo-timeline.tsx` — skasowany, jego robotę
  przejął komponent współdzielony z `components/flo/`.
- `tests/unit/ui-flo-thread.test.tsx` — 4 testy; plus jeden dopisany do testu
  ekranu (mikrofon i aparat).

Decyzje:
- Godzina wróciła z karty do OSI. Wątek jest osią czasu i to on ma prawo
  pisać godzinę w marginesie; ta sama karta na dashboardzie (krok 15) nie ma
  osi, w którą mogłaby ją wpisać, więc tam pokazuje ją u siebie. Stąd
  `showTime`, domyślnie włączone — wątek jest wyjątkiem, nie regułą.
- W wąskim oknie margines z godziną znika (`hidden sm:block`), żeby karta
  miała pełną szerokość. Godzina nie jest wtedy zgubiona — wraca do karty
  dopiero w kroku 24 (widok mobilny), tam się tym zajmę na poważnie.
- Stan pusty ma JEDNO zdanie i żadnej zachęty. Test sprawdza wprost, że nie
  ma tam słów „skonfiguruj”, „ustaw”, „dodaj”, „zacznij”, „uzupełnij” — cisza
  jest dobrą wiadomością i klient nie ma wychodzić z tego ekranu z poczuciem,
  że czegoś zaniedbał.
- Mikrofon i aparat są wyłączone i mówią to w `aria-label`
  („jeszcze nieczynne”), a nie tylko wyglądem. Czytnik ekranu ma dostać tę
  samą informację co oko.

Weryfikacja:
- `npx vitest run tests/unit/` — 55 plików, 978 testów, wszystko zielone.
- `pnpm typecheck` czysto, eslint czysto.
- Zrzut statyczny na komplecie atrap obejrzany: nagłówki dni, godziny
  w marginesie, pas rozmowy z dwoma ikonami.

Czego w wątku NADAL nie ma (i gdzie to jest w planie): dowody „dlaczego to
widzę” (krok 17), pasek cofnięcia (18), wpięcie akcji serwerowych (16 i 19),
szkielety ładowania (20).

Uwagi dla Bartosza: brak.

Następny krok: 5 (wariant `info`) — początek bloku 1, sześć wariantów karty.

## 2026-08-30 · Kroki 5–10 — sześć wariantów karty (BLOK 1)

Zrobione:
- `components/flo/gating.ts` — `primaryLock`, `canSelectItem`, `isValueValid`,
  `FloCardState`. Czyste reguły blokowania akcji głównej.
- `components/flo/card-chrome.tsx` — skorupa karty (nagłówek, odliczanie,
  stan po wygaśnięciu) i wspólne przyciski.
- `components/flo/card-preview.tsx` — rozwijany podgląd z czterema rodzajami
  zawartości. Do dopracowania w krokach 11–14.
- `components/flo/variants/` — `info-card`, `single-card`, `preview-card`,
  `choice-card`, `list-card`, `input-card`.
- `components/flo/proposal-card.tsx` — sam wybór wariantu, bez `default`.
- `tests/unit/ui-flo-gating.test.ts` (18) i `ui-flo-variants.test.tsx` (17).

DLACZEGO REGUŁY BLOKOWANIA SĄ W OSOBNYM PLIKU:
to jedyne miejsce w moim torze, którego złamanie kosztuje klienta pieniądze —
fakturę wysłaną do rejestru państwowego bez obejrzenia, wiadomość u obcej
firmy, paczkę dokumentów na zły adres. Jako czysta funkcja mają test bez
przeglądarki i nie da się ich zgubić przy przebudowie wyglądu. Sprawdziłem, że
test nie jest pusty: po tymczasowym wyłączeniu `primaryLock` padło 10 testów
reguł i 3 renderowe. Po przywróceniu — 35 zielonych.

Krok po kroku:
- 5 `info`: żadnego przycisku w kolorze wezwania do działania. Karta, która
  melduje dobrą wiadomość, nie ma prawa krzyczeć tak samo jak ta, która czeka
  na decyzję o wysłaniu pieniędzy w świat. „Pokaż fakturę” i „Ukryj” są
  równorzędne i ciche.
- 6 `single`: przycisk główny wyraźny, odmowa dyskretna obok. Odmowa ma być
  łatwa do znalezienia, ale nie ma konkurować wzrokowo ze zgodą.
- 7 `preview`: przycisk zablokowany do czasu otwarcia podglądu. Raz obejrzany
  podgląd zostaje obejrzany — zamknięcie panelu nie zamyka przycisku, bo
  człowiek już wie, co zatwierdza. Etykiety z `primary.label` nie ruszam.
- 8 `choice`: trzecia odpowiedź z polem kwoty rozwija się W MIEJSCU, nie na
  osobnym ekranie. Kwota jedzie do serwera jako napis, dokładnie tak, jak ją
  wpisano — interfejs sprawdza tylko kształt, nie przelicza.
- 9 `list`: pozycja odstająca ma WYŁĄCZONE pole wyboru do czasu rozwinięcia
  jej wiersza. Silnik pilnuje tego po swojej stronie, interfejs po swojej —
  między klientem a hurtową wysyłką na złą kwotę mają stać dwie niezależne
  blokady, nie jedna.
- 10 `input`: przy adresie e-mail samo wpisanie nie wystarcza. Musi jeszcze
  paść zdanie „Wysyłam do anna@biuro.pl — zgadza się?” i potwierdzenie.
  Literówka w adresie to komplet dokumentów firmy u obcej osoby.

DWIE RZECZY DO USTALENIA — UWAGI DLA BARTOSZA:
1. SUMA ZAZNACZONYCH w wariancie `list`. Plan ją przewiduje (krok 9), ale
   kontrakt przysyła kwoty jako gotowe napisy, a interfejsowi nie wolno
   liczyć pieniędzy. Nie sumuję ich po cichu przez parsowanie napisów —
   pokazuję liczbę pozycji („Zaznaczone: 7 pozycji z 10”). Żeby była suma,
   potrzebne jest pole od silnika; sam wybór jest dowolny, więc chyba
   najprościej: `FloListItem.amountMinor: number` i suma liczona po stronie
   serwera przy zatwierdzeniu, a w interfejsie wyłącznie do wyświetlenia.
2. PODGLĄD POZYCJI LISTY. Plan mówi „zaznaczenie możliwe dopiero po otwarciu
   podglądu TEJ POZYCJI”, ale `FloListItem` nie ma własnego podglądu, a
   atrapa `fx-list-batch` nie ma nawet podglądu na poziomie karty. Zrobiłem
   rozwijany wiersz z tym, co jest w pozycji — to spełnia sens reguły
   (człowiek musi na nią spojrzeć), ale gdyby doszło `FloListItem.preview`
   albo `href`, wyglądałoby to poważniej.

Weryfikacja:
- `npx vitest run tests/unit/` — 57 plików, 1013 testów, wszystko zielone.
- `pnpm typecheck` czysto, eslint czysto.
- Zrzut statyczny wszystkich sześciu wariantów obejrzany.

Czego w kartach nadal nie ma: dowodów „dlaczego to widzę” (krok 17), paska
cofnięcia (18), wpiętych akcji serwerowych (16 i 19), dopracowanych podglądów
(11–14).

Następny krok: 11 (podgląd faktury) — blok 2.

## 2026-08-30 · Kroki 11–14 — cztery podglądy (BLOK 2)

Zrobione:
- `components/flo/preview-invoice.tsx` — układ i kolumny jak w podglądzie
  faktury wystawianej ręcznie (`components/invoices/invoice-detail-view.tsx`).
- `components/flo/preview-message.tsx` — adresat, temat, treść w polu
  edytowalnym.
- `components/flo/preview-diff.tsx` — tabela „było → jest”.
- `components/flo/preview-file.tsx` — nazwa, rozmiar, pobranie.
- `components/flo/card-preview.tsx` — rozgałęzienie na cztery komponenty,
  bez `default`.
- `components/flo/gating.ts` — `approveInputFor`: co dokładnie leci na serwer
  razem z kliknięciem.
- `tests/unit/ui-flo-previews.test.tsx` (11) + 5 testów `approveInputFor`
  dopisanych do `ui-flo-gating.test.ts`.

Decyzje:
- Faktura ma TE SAME kolumny i nagłówki co dokument, który klient zna
  z ręcznego wystawiania. Ma go poznać bez czytania, a nie zastanawiać się,
  czy „faktura od FLO” to to samo co jego faktura.
- Treść wiadomości jest sterowana Z KARTY, nie trzymana w panelu podglądu.
  Zwinięcie podglądu odmontowuje pole; gdyby treść siedziała w nim, poprawka
  zniknęłaby razem z nim, a klient miałby prawo sądzić, że została zapamiętana.
- `approveInputFor` jest osobną czystą funkcją z tego samego powodu co
  `primaryLock`: to granica między tym, co człowiek widział, a tym, co idzie
  na serwer. Nietknięta treść NIE jedzie — serwer wysyła wtedy swoją wersję
  i nie musi porównywać dwóch napisów, żeby stwierdzić, że są identyczne.
- W różnicy zmienione pole ma znacznik przy nazwie, nie tylko inny kolor.
  Kolor jest nośnikiem tylko dla tych, którzy go rozróżniają.
- Plik: świadomie BEZ atrybutu `download`. Przy adresie podpisanym czasowo
  przeglądarka zapisałaby plik pod nazwą wyciągniętą z adresu, a nie tą,
  którą nadał serwer. Adres bierzemy z ładunku przy każdym renderze i nigdzie
  go nie zapamiętujemy, więc odświeżenie ekranu daje świeży link; gdyby
  trafił się przeterminowany, klient zobaczy odpowiedź serwera, a nie ciszę.

UWAGI DLA BARTOSZA:
- TRZY WARIANTY TONU wiadomości (plan, krok 12: „zakładki, gdy serwer je
  przyśle”) nie mają miejsca w kontrakcie — `FloPreview` typu `message` ma
  jedno `bodyText`. Nie wymyślam pola za Ciebie. Gdyby miało powstać,
  najmniej inwazyjnie: `tones?: { label: string; bodyText: string }[]`
  obok `bodyText`, a interfejs pokaże zakładki tylko wtedy, gdy przyjdą.
- Przypominam dwie sprawy z bloku 1: suma zaznaczonych w wariancie `list`
  i podgląd pojedynczej pozycji (`FloListItem.preview`).

Weryfikacja:
- `npx vitest run tests/unit/` — 58 plików, 1029 testów, wszystko zielone.
- `pnpm typecheck` czysto, eslint czysto.
- Cztery podglądy wyrenderowane do statycznego HTML-a i obejrzane.

Następny krok: 15 (karta FLO na dashboardzie) — blok 3.

## 2026-08-30 · Kroki 15–21 — reszta interfejsu agenta (BLOK 3)

TO JEST KROK, W KTÓRYM KARTY PRZESTAŁY BYĆ MAKIETĄ. `/flo` czyta prawdziwe
propozycje przez `listProposals`, a kliknięcia wołają `approveProposal`,
`dismissProposal`, `undoAction` i `cancelScheduled`. Atrapy zostają tam, gdzie
ich miejsce: w testach.

Zrobione:
- `components/flo/thread-client.tsx` — kontroler wątku: woła akcje, trzyma
  stan wykonywania, pokazuje odpowiedzi serwera.
- `components/flo/thread.tsx` — sam układ, przyjmuje zachowanie przez
  `cardProps`; jedna kopia układu dla atrap i dla prawdziwych danych.
- `components/flo/evidence.tsx` — „dlaczego to widzę” (17).
- `components/flo/undo-bar.tsx` — pasek cofnięcia z odliczaniem (18).
- `components/flo/scheduled-panel.tsx` — panel zatwierdzonych z „Wstrzymaj” (16).
- `components/flo/kind-labels.ts` — nazwy 32 rodzajów spraw po ludzku.
- `app/(dashboard)/dashboard/_components/flo-card.tsx` + wpięcie w dashboard (15).
- `app/(dashboard)/flo/loading.tsx` — szkielet ładowania (20).
- `app/(dashboard)/settings/flo/` — ustawienia agenta (21).
- `tests/unit/ui-flo-settings.test.tsx` (6) + przepisany `ui-flo-screen` (8).

Decyzje:
- ODMOWA NIE JEST AWARIĄ (19). `stale`, `expired` i `blocked` lądują jako
  spokojne zdanie pod kartą, w ramce w kolorze tła. Zero czerwieni, zero
  słowa „błąd”. Bezpiecznik, który zadziałał, to dobra wiadomość.
- CISZA JEST STANEM ZABRONIONYM (W5). Gdy akcja się wywali — zerwana sieć,
  błąd serwera — klient dostaje zdanie „nic nie poszło dalej, spróbuj za
  chwilę”. Nigdy przycisku, który po prostu nic nie robi.
- Karta w trakcie wykonywania ma WSZYSTKIE przyciski wyłączone. Żeton zgody
  po stronie silnika i tak jest jednorazowy, ale klient nie ma powodu tego
  sprawdzać podwójnym kliknięciem.
- „Pokaż fakturę” (intent `open`) prowadzi do pierwszego dowodu. Akcja nie ma
  własnego adresu, a `evidence` jest dokładnie po to.
- Panel nazywa się „ZATWIERDZONE — CZEKA NA WYKONANIE”, nie „co Flo zrobi
  dalej” jak na makiecie. Pierwsze mówi prawdę: nic tu nie trafia bez
  kliknięcia. Pozycja bez `approvedAtLabel` dostaje zamiast daty zdanie
  „brak śladu zatwierdzenia — zgłoś to nam”, zamiast udawać, że wszystko gra.
- Na dashboardzie zamiast „TRYB 3” stoi zdanie: „Robi sam to, co da się
  cofnąć. Pyta przed każdą wysyłką”. Numer poziomu i tak u wszystkich jest
  ten sam, więc lepiej powiedzieć, co agent robi.
- Ustawienia zapisują się od razu, bez przycisku „Zapisz” — każde jest
  osobnym przełącznikiem, a przycisk tworzyłby stan „zmienione, ale
  niezapisane”, w którym nie wiadomo, czy cisza nocna już działa. Gdy zapis
  padnie, przełącznik wraca na starą wartość i mówimy o tym wprost.
- Szkielet ładowania ma kształt docelowego ekranu, żeby nic nie podskoczyło.
  Żadnego kręcącego się kółka — ono mówi tylko tyle, że czekamy.
- Test ustawień pilnuje, że NIE MA tam słów „tryb”, „poziom”, „autonomia”,
  „suwak” ani „automatyczn”. Za pół roku nikt nie będzie pamiętał, dlaczego
  ich tam nie ma.

Przy okazji: kafelek „Wkurzacz Dłużników” w `/settings` obiecywał
„automatyczne przypomnienia o płatnościach”. Po zmianie z kroku 6 Bartosza to
nieprawda — poprawione na „Ponaglenia, które Flo przygotowuje do Twojej zgody”.
Sam ekran `/settings/reminders` przepiszę w kroku 26.

UWAGI DLA BARTOSZA:
- HISTORIA („co Flo zrobił”) nie ma odczytu w akcjach — `listScheduled` opisuje
  kolejkę, nie przeszłość. Zostawiłem stan pusty zamiast wymyślać listę, która
  nie zgadzałaby się z rzeczywistością. Przydałoby się `listHistory()`
  zwracające wykonane propozycje z godziną i autorem kliknięcia.
- `listScheduled` ustawia `whenLabel: 'zaraz'` na sztywno. W panelu wygląda to
  tak, jakby wszystko miało pójść w tej samej chwili.
- `FLO_KIND_LABELS` jest `Record<FloProposalKind, string>` — złapało mi to
  `accountant.delivery`, którego dołożyłeś. Kompilacja padnie przy każdym
  nowym rodzaju bez opisu i to jest zamierzone.

Weryfikacja:
- `npx vitest run tests/unit/` — 59 plików, 1037 testów, wszystko zielone.
- `pnpm typecheck` czysto, eslint czysto.
- Ekran i ustawienia wyrenderowane do statycznego HTML-a i obejrzane.
- CZEGO NIE ZWERYFIKOWAŁEM: kliknięć na żywo. Z tego worktree nie odpalę
  aplikacji (brak `.env.local`, trasy za bramką auth), więc wpięcie akcji jest
  sprawdzone kompilacją, testami renderu i lekturą kontraktu — ale ani jedno
  kliknięcie nie przeszło przez prawdziwy serwer. To jest do zrobienia na
  środowisku z bazą, zanim uznamy blok 3 za domknięty.

Następny krok: 22 (ścieżka paragonu z telefonu) — blok 4.

## 2026-08-30 · Kroki 22–24 — telefon (BLOK 4)

Zrobione:
- `app/share-target/route.ts` — udostępnione zdjęcie ląduje w `/flo?paragon=…`,
  nie w `/expenses?ocr_pending=…`.
- `app/(dashboard)/flo/_components/flo-photo-banner.tsx` — stan „mam, czytam,
  zaraz pokażę” z odpytywaniem co 15 s i progiem trzech minut.
- `app/sw.ts` — przyciski akcji w powiadomieniu, `renotify` przy `tag`,
  kierowanie kliknięcia po `event.action`.
- `components/flo/thread-client.tsx` — cofnięcie prosto z powiadomienia
  (`/flo?undo=<id>`), wykonywane raz.
- `components/flo/thread.tsx` — kotwice kart (`id`), żeby powiadomienie
  prowadziło do konkretnej sprawy.
- Kciuk i wąski ekran: przyciski karty mają 36 px wysokości, podglądy
  przewijają się w poziomie, kolumna z godzinami znika poniżej `sm`.
- `tests/unit/ui-flo-photo.test.tsx` — 5 testów.

Decyzje:
- ZDJĘCIE PROWADZI DO WĄTKU, nie do Wydatków. Klient udostępnia paragon
  i ma zobaczyć gotowy koszt tam, gdzie agent mówi wszystko inne — plan
  nazywa to „od zdjęcia do kosztu bez wchodzenia w menu”. Zmieniło to
  zachowanie istniejącej ścieżki i jest to świadome.
- Po trzech minutach pasek mówi, że trwa to dłużej niż zwykle, I ŻE ZDJĘCIE
  JEST BEZPIECZNE W ARCHIWUM. Klient, który usłyszy samo „nie wyszło”,
  wyrzuca paragon i po miesiącu nie ma czego odtwarzać. Prawdziwą kartę
  z diagnozą przysyła silnik (`findStuckOcrJobs`), pasek to tylko stan
  przejściowy.
- PRZYCISK W POWIADOMIENIU NICZEGO NIE WYSYŁA. Otwiera aplikację na właściwej
  karcie — zgoda na wysyłkę zapada po obejrzeniu podglądu, a nie na ekranie
  blokady telefonu. Jedyny wyjątek to „cofnij”: cofnięcie odwraca czynność
  agenta, więc kliknięcie w powiadomienie wystarczy za decyzję.
- `tag` = klucz sprawy, plus `renotify`. Dwa zdarzenia tej samej sprawy
  podmieniają jedno powiadomienie zamiast mnożyć osiem o jednej fakturze.

BŁĄD, KTÓRY ZŁAPAŁEM PO DRODZE: po włożeniu wątku w `Suspense` z
`fallback={null}` test ekranu przestał widzieć karty — wyspa kliencka wywalała
się po cichu (brakowało atrapy `useSearchParams`), a pusty wątek wyglądał
dokładnie jak „nic nie masz do zrobienia”. To jest najgorszy możliwy fałszywy
komunikat w tym produkcie. Zastępnik pokazuje teraz „Zbieram Twoje sprawy…”,
więc awaria wyspy nie udaje ciszy.

UWAGI DLA BARTOSZA:
- `PushPayload` w `lib/push/sender.ts` nie ma pól `actions` ani `actionUrls`.
  Service worker już je obsługuje (czyta surowy JSON), ale żeby przyciski się
  pojawiły, wysyłka musi je dołożyć. Proponowany kształt dla propozycji:
  `actions: [{ action: 'open', title: '<primary.label>' }]` i
  `actionUrls: { open: '/flo#<id>' }`; dla czynności zrobionej samodzielnie:
  `actions: [{ action: 'undo', title: 'Cofnij' }]` i
  `actionUrls: { undo: '/flo?undo=<id>' }`. Plus `tag` = klucz tematu.
- Ścieżka `/share-target` prowadzi teraz do `/flo`. Jeśli któreś zadanie
  zakłada, że po OCR klient jest w `/expenses`, to założenie się zmieniło.

Weryfikacja:
- `npx vitest run tests/unit/` — 60 plików, 1042 testy, wszystko zielone.
- `pnpm typecheck` czysto, eslint czysto (dwa świadome wyłączenia reguły
  `set-state-in-effect` z uzasadnieniem w kodzie).
- Wątek wyrenderowany na szerokości 375 px i obejrzany.
- CZEGO NIE ZWERYFIKOWAŁEM: prawdziwego telefonu. Blokada z `BUG-008`
  (`lib/supabase/middleware.ts:159`) nadal przekierowuje telefony na
  `/mobile`, więc ani ścieżki paragonu, ani powiadomień nie da się dziś
  przeklikać na urządzeniu. Wszystko jest zbudowane tak, żeby zadziałało po
  zdjęciu blokady — ale to jest deklaracja, nie dowód.

Następny krok: 25 (treści grupy W) — blok 5, czyli to, co agent MÓWI.

## 2026-08-30 · Kroki 25–31 — treści agenta (BLOK 5)

Zrobione:
- `content/flo/<kind>.md` — 32 pliki, po jednym na każdy rodzaj propozycji
  z kontraktu. Tytuł, treść, warianty, etykiety przycisków i zasada, której
  dany tekst pilnuje.
- `content/flo/GLOS.md` — głos agenta na piśmie: cztery reguły tonu z parami
  „źle / dobrze”, tabela „czego nigdy nie piszemy”, lista zdań obowiązkowych.
- `content/flo/DO-AKCEPTACJI-PRAWNIKA.md` — dziewięć tekstów z obszarów
  regulowanych plus pięć pytań do prawnika.
- `tests/unit/ui-flo-content.test.ts` — 13 testów pilnujących reguł tonu.
- `components/reminders/reminder-settings-form.tsx` — ekran ponagleń nie
  obiecuje już automatu (dług z kroku 6 Bartosza).

DLACZEGO TE PLIKI MAJĄ TEST:
tekst bez testu jest notatką. Reguły z części II.5 pilnuje teraz kod:
- ani jednej cyfry w tekście agenta — liczby wchodzą wyłącznie przez
  `{{placeholder}}`, dokładnie jak w `lib/flo/copy.ts`;
- zero wykrzykników;
- każdy z trzech tonów ponaglenia zawiera zdanie „jeśli płatność już wyszła,
  proszę potraktować tę wiadomość jako nieaktualną”;
- w grupie T nie pada „musisz”, „powinieneś” ani „zapłać”;
- `tax.deadline` mówi wprost „to nie jest deklaracja podatkowa”;
- `invoice.draft` nigdy nie zarzuca zapomnienia;
- `invoice.raise` ma etykietę „Pokaż treść”, nie „Wyślij”.
Sprawdzone, że test gryzie: po wpisaniu do jednego pliku „Licząc 19% od tej
faktury. Musisz to odłożyć.” padły trzy testy naraz.

Decyzje redakcyjne warte zapamiętania:
- `expense.missing` mówi WYŁĄCZNIE o dokumencie. Nigdy „dodaj koszt” — agent
  zauważa brak papieru, a nie podpowiada, co wpisać w księgę.
- `payment.chase` ma trzy tony (miękki, stanowczy, wezwanie) i wszystkie
  kończą się tym samym zdaniem ratunkowym. Przelewy księgują się z
  opóźnieniem; bez tego zdania agent obraża klienta, który właśnie zapłacił.
- `ksef.outage` ma wariant `:neutral` na wypadek, gdy nie wiemy, po czyjej
  stronie leży awaria. Zrzucanie winy na Ministerstwo bez komunikatu jest
  zarzutem, nie diagnozą.
- `invoice.raise` — w wiadomości do kontrahenta ZERO uzasadnień typu
  „inflacja”. Klient dopisze je sam; my nie wkładamy mu w usta argumentów,
  których nie sprawdziliśmy.
- `tax.simulate` nie ma treści i mieć nie będzie do opinii prawnej. Nawet
  zdanie „przy ryczałcie wyszłoby mniej” jest rekomendacją, jeśli stoi obok
  konkretnej kwoty.
- `milestone.money` liczy faktury OPŁACONE, nie wystawione. Faktura, za którą
  nikt nie zapłacił, nie jest osiągnięciem.
- `wrapped.ready` ma wyjście „nie chcę tego oglądać” w pierwszym zdaniu. Dla
  firmy po słabym roku podsumowanie jest przykrością, nie zabawą.

UWAGI DLA BARTOSZA:
- Teksty w `lib/flo/copy.ts` są Twoje i celowo ich nie ruszałem. Pliki
  z `content/flo/` są źródłem redakcyjnym: nazwy placeholderów wzięte z
  Twoich szablonów, więc przeniesienie brzmienia to podmiana napisów, bez
  zmian w kodzie. Gdzie dołożyłem nowy placeholder (np. `{{kolumna}}`,
  `{{numerKsef}}`, `{{zrodlo}}`, `{{stawka}}`), trzeba go najpierw policzyć
  po Twojej stronie — inaczej `renderTemplate` słusznie rzuci wyjątkiem.
- `payment.chase` potrzebuje wariantów `:soft`, `:firm`, `:demand`, a
  `ksef.outage` — `:confirmed` i `:neutral`. Dziś `FLO_TEMPLATE_VARIANTS` ma
  tylko warianty `expense.review`.
- Ostatnie miejsce w aplikacji, gdzie ustawienie nadal znaczy „wyślij samo”,
  to Co-Pilot Księgowego (`/settings/accountant`). Tekstu nie zmieniałem, bo
  opisuje prawdziwe zachowanie — zamyka to Twój krok 41 (B-01).

Weryfikacja:
- `npx vitest run tests/unit/` — 61 plików, 1055 testów, wszystko zielone.
- `pnpm typecheck` czysto, eslint czysto.

Następny krok: 32 (testy przeglądarkowe podstawowych ścieżek) — blok 6.

## 2026-08-30 · Kroki 32–34 — sprawdzanie (BLOK 6)

Zrobione:
- `e2e/helpers/flo-seed.ts` — sianie propozycji wprost do bazy plus sprzątanie.
- `e2e/tests/flo-basic.spec.ts` — 6 testów podstawowych ścieżek.
- `e2e/tests/flo-critical.spec.ts` — 4 testy funkcji promienia 4.
- `e2e/tests/flo-a11y.spec.ts` — 5 testów dostępności (axe + klawiatura).
- Poprawki dostępności w kodzie agenta (10 plików).

Poprawki dostępności — co konkretnie:
- KONTRAST. Wszystkie napisy niosące treść przeniesione z `--ff-text-faint`
  (#5b6472) na `--ff-text-muted` (#8a94a3). Pierwszy daje na tle karty około
  3:1, czyli poniżej progu AA dla drobnego tekstu — a siedziały w nim powody
  blokady i ślady zatwierdzenia, czyli rzeczy najważniejsze.
- WIDOCZNE SKUPIENIE. Przyciski karty dostały pierścień `focus-visible`
  w kolorze akcentu. Wcześniej nie miały żadnego — obsługa klawiaturą była
  możliwa, ale niewidzialna.
- POWÓD BLOKADY DLA CZYTNIKA EKRANU. Przycisk zablokowany ma
  `aria-describedby` wskazujące zdanie z powodem. Bez tego czytnik mówił
  „przycisk niedostępny” i nic więcej — a cała informacja jest właśnie
  w powodzie.
- POZYCJA ODSTAJĄCA W PACZCE tłumaczy się w `aria-label`: „…— najpierw
  obejrzyj tę pozycję”. Samo wyszarzenie to informacja wyłącznie wzrokowa.
- MNIEJ RUCHU. Szkielety ładowania mają `motion-reduce:animate-none`.

Decyzje przy testach:
- Propozycje wsiewam WPROST DO BAZY, nie przez silnik. Testy interfejsu mają
  sprawdzać, co widzi i może kliknąć człowiek, a nie trafność wykrywania
  spraw — ta ma własne testy po stronie Bartosza. Przy okazji da się ustawić
  stan, którego silnik nie wyprodukuje na żądanie: propozycję z nieaktualnym
  odciskiem danych, czyli przypadek z kroku 19.
- Test ponaglenia sprawdza rzecz, o którą najłatwiej się potknąć przy
  przebudowie: zwinięcie podglądu NIE kasuje poprawionej treści i NIE zamyka
  z powrotem przycisku.
- Test klawiatury sprawdza nie tylko to, że skupienie DOCHODZI do przycisku,
  ale że jest WIDOCZNE (czyta `outline` i `box-shadow`). Focus bez obwódki
  przechodzi każdy automat i nie da się z nim pracować.
- Testy agenta są POMIJANE na projektach mobilnych. Telefony nadal lądują na
  `/mobile` (BUG-008), więc na tych projektach sprawdzałyby wyłącznie
  działanie przekierowania. Pominięcie ma powód wpisany w kod.

CZEGO NIE ZWERYFIKOWAŁEM — I TO JEST ISTOTNE:
tych testów NIE URUCHOMIŁEM. Playwright potrzebuje działającej aplikacji
i bazy, a w tym worktree nie ma `.env.local`. Sprawdziłem tyle, ile się dało
bez uruchomienia: `pnpm typecheck` czysto, eslint czysto,
`npx playwright test --list` wykrywa wszystkie 15 testów w trzech plikach.
To znaczy, że są poprawne składniowo i typowo — NIE znaczy, że przechodzą.
Pierwsze uruchomienie na środowisku z bazą prawie na pewno wymaga korekt
w selektorach; traktujcie te pliki jako gotowy szkielet do dopięcia, nie jako
zielony zestaw.

Uwagi dla Bartosza:
- `e2e/helpers/flo-seed.ts` wstawia wiersze do `flo_proposals` i sprząta
  `flo_approvals`. Jeśli dojdzie tabela, do której trafia ślad wykonania,
  dopisz ją do `cleanupProposals`, żeby testy nie zostawiały śmieci.
- `undoableUntil` siedzi w `payload`, nie w kolumnie — zapisałem to w helperze,
  bo szukałem tego przez chwilę.

Weryfikacja:
- `npx vitest run tests/unit/` — 61 plików, 1055 testów, wszystko zielone.
- `pnpm typecheck` czysto, eslint czysto na całym `e2e/` i `components/flo/`.

Następny krok: 35 (panel trybu cichego) — blok 7.

## 2026-08-30 · PODSUMOWANIE DLA BARTOSZA — tor B po bloku 6

Bartek, w skrócie: **interfejs agenta jest gotowy od kroku 0 do 34**. Wszystko
siedzi w `main` (ostatni commit `7fafee2`). Poniżej stan i lista rzeczy, które
wiszą po Twojej stronie — zebrane w jedno miejsce, bo rozsypały się po
sześciu wpisach.

### Co jest zrobione

| Blok | Kroki | Co z tego masz |
|---|---|---|
| 0 | 1–4 | `lib/i18n/plural.ts`, pozycja „Flo” w menu nad Dashboardem, karta bazowa, wątek `/flo` |
| 1 | 5–10 | sześć wariantów karty — Twoje 32 rodzaje propozycji renderują się bez ani jednej linijki po mojej stronie |
| 2 | 11–14 | cztery podglądy: faktura, wiadomość z edycją, różnica „było → jest”, plik |
| 3 | 15–21 | wpięte `approveProposal`, `dismissProposal`, `undoAction`, `cancelScheduled`, `getPrefs`, `savePrefs`; dowody, pasek cofnięcia, karta na dashboardzie, ustawienia |
| 4 | 22–24 | paragon z telefonu ląduje w wątku, powiadomienia z przyciskiem akcji, wąski ekran |
| 5 | 25–31 | `content/flo/` — 32 pliki treści, `GLOS.md`, lista dla prawnika |
| 6 | 32–34 | `e2e/flo-*.spec.ts` (15 testów) i dostępność |

Stan zestawu: `pnpm typecheck` czysto, eslint bez błędów, 1055 testów
jednostkowych zielonych, `next build` przechodzi (`/flo` i `/settings/flo`
w tabeli tras).

### Czego potrzebuję od Ciebie (12 rzeczy, od najważniejszej)

1. **`listHistory()`** — panel „co Flo zrobił” stoi pusty. `listScheduled`
   opisuje kolejkę, nie przeszłość, a historii nie wymyślam.
2. **`listScheduled` ma `whenLabel: 'zaraz'` na sztywno** — w panelu wygląda
   to, jakby wszystko miało pójść w tej samej sekundzie.
3. **`PushPayload` bez `actions` i `actionUrls`.** Service worker już je
   obsługuje. Dla propozycji: `actions: [{ action: 'open', title: <primary.label> }]`,
   `actionUrls: { open: '/flo#<id>' }`. Dla czynności zrobionej samodzielnie:
   `actions: [{ action: 'undo', title: 'Cofnij' }]`,
   `actionUrls: { undo: '/flo?undo=<id>' }`. Plus `tag` = klucz tematu, bo bez
   niego klient dostaje osiem powiadomień o jednej fakturze.
4. **Warianty szablonów**: `payment.chase:soft|:firm|:demand` oraz
   `ksef.outage:confirmed|:neutral`. Treści leżą gotowe w `content/flo/`.
5. **Nowe placeholdery w treściach** (`{{kolumna}}`, `{{numerKsef}}`,
   `{{zrodlo}}`, `{{stawka}}`, `{{dataStawki}}`, `{{terminWezwania}}`,
   `{{nadawca}}`, `{{liczbaFaktur}}`, `{{liczbaPoTerminie}}`). Bez policzenia
   ich po Twojej stronie `renderTemplate` słusznie rzuci wyjątkiem.
6. **Suma zaznaczonych w wariancie `list`.** Plan ją przewiduje, ale kwoty są
   napisami, a interfejsowi nie wolno liczyć pieniędzy. Pokazuję liczbę
   pozycji. Jeśli ma być suma — potrzebne pole liczbowe w `FloListItem`.
7. **`FloListItem.preview` albo `href`** — plan chce podglądu POJEDYNCZEJ
   pozycji, a kontrakt go nie ma. Na razie rozwijam wiersz z tym, co jest.
8. **`FloPreview` typu `message` bez wariantów tonu.** Jeśli mają być
   zakładki: `tones?: { label, bodyText }[]` obok `bodyText`.
9. **`/share-target` prowadzi teraz do `/flo?paragon=<job>`**, nie do
   `/expenses?ocr_pending=…`. Jeśli któreś zadanie zakładało `/expenses`, to
   założenie się zmieniło.
10. **B-01 Co-Pilot Księgowego** to ostatnie miejsce w aplikacji, gdzie
    ustawienie znaczy „wyślij samo”. Tekstu nie zmieniałem, bo opisuje
    prawdziwe zachowanie — zamyka to Twój krok 41.
11. **`e2e/helpers/flo-seed.ts`** czyści `flo_proposals` i `flo_approvals`.
    Jeśli dojdzie tabela ze śladem wykonania, dopisz ją, żeby testy nie
    zostawiały śmieci.
12. **BUG-008** — telefony nadal lecą na `/mobile`, więc mobilne projekty
    Playwrighta pomijają testy agenta, a ścieżki paragonu i powiadomień nie
    da się dziś przeklikać na urządzeniu.

### Dwie rzeczy, których NIE zweryfikowałem

- **Ani jedno kliknięcie nie przeszło przez prawdziwy serwer.** W worktree nie
  ma `.env.local`, a `/flo` jest za bramką auth. Wpięcie akcji jest sprawdzone
  kompilacją, testami renderu i lekturą kontraktu — nie klikaniem.
- **Testów e2e nie uruchomiłem** (brak bazy). `playwright test --list` je
  widzi, typy i lint są czyste, ale pierwszy przebieg pewnie wymaga korekt
  w selektorach.

### Produkcja

`main` ma wszystko, ale **produkcja tego nie ma**. Sprawdzone twardo:
`https://www.faktflow.pl/sw.js` nie zawiera `actionUrls`, czyli działa tam
build sprzed bloku 4. Wdrożenia nie ruszam — to nie moja działka.

## 2026-08-30 · Kroki 35–36 — panel operatora i baza wiedzy (BLOK 7)

Zrobione:
- `app/admin/flo/page.tsx` — panel trybu cichego: sześć wskaźników, trafność
  per funkcja z werdyktem, stan kanarka, koszt modelu, lista funkcji
  wyłączonych z powodem.
- `app/admin/_components/admin-nav.tsx` — pozycja w menu operatora.
- `content/help/flo-*.mdx` — sześć artykułów bazy wiedzy.
- `lib/help/articles.ts` — nowa kategoria „Agent Flo”.
- `tests/unit/ui-flo-help.test.ts` — 4 testy.

Decyzje:
- Panel odpowiada na JEDNO pytanie: która funkcja jest gotowa wyjść z ukrycia.
  Wszystko inne na tym ekranie służy temu pytaniu.
- Liczby liczy silnik (`metrics.ts`, `shadow.ts`, `rollout.ts`). Panel ich nie
  przelicza — układa je tak, żeby dało się podjąć decyzję bez wchodzenia do
  bazy.
- ŚWIADOMIE BEZ PRZEŁĄCZNIKA „włącz funkcję” dla blokad z `lib/flo/flags.ts`.
  Tam siedzą rzeczy czekające na opinię prawnika — odsłonięcie funkcji
  podatkowej jednym kliknięciem w panelu jest dokładnie tym, czego ta blokada
  ma nie dopuścić. Włączenie wymaga commita z uzasadnieniem, tak jak
  zaprojektował to Bartosz.
- Kurs dolara do przeliczenia kosztu bierzemy ze zmiennej `FLO_USD_PLN`,
  a nie z kodu. Metryka po kursie sprzed roku myli bardziej, niż pomaga.
- Artykuły dostały WŁASNĄ kategorię w bazie wiedzy. Sześć tekstów o agencie
  w „Pierwszych krokach” przykryłoby wszystko inne.
- Treść artykułów trzyma ten sam głos co karty: bez wykrzykników, z listą
  rzeczy, których agent nigdy nie zrobi, i ze zdaniem o tym, że cisza jest
  dobrą wiadomością.

Uwagi dla Bartosza:
- `flo_kind_flags` (00066) ma `setKindForTenant`, więc przełącznik per konto
  da się zrobić. Nie wstawiłem go, bo panel bez pola „powód” (wymaganego
  przez Twoją funkcję) byłby połowiczny — zrobię, gdy powiesz, że to
  potrzebne przed alfą.
- Panel czyta `flo_shadow` i `flo_usage`, czyli tabele bez polityki SELECT.
  Działa, bo `/admin` chodzi na kliencie administracyjnym — ale gdyby kiedyś
  przeszedł na klienta użytkownika, ekran zgaśnie.

Następny krok: 37 (Wrapped) — blok 8.

## 2026-08-30 · Kroki 37–40 — Wrapped, progi, strona główna, materiały (BLOKI 8–9)

Zrobione:
- `app/(dashboard)/flo/wrapped/page.tsx` + `data.ts` — trasa podsumowania roku
  i odczyt danych dla `buildWrapped`.
- `components/flo/wrapped/share-image.ts` — obraz 9:16 budowany z SVG.
- `components/flo/wrapped/wrapped-deck.tsx` — sekwencja ekranów.
- `components/flo/wrapped/milestone-share.tsx` + gałąź w `info-card.tsx` —
  próg pieniężny z obrazem do zapisania (krok 38).
- `components/flo/flo-screen.tsx` — licznik spraw wraca nad wątek, gdy
  dashboard chowa nagłówek (domknięcie kroku 39).
- `app/(dashboard)/dashboard/_components/flo-card.tsx` — SKASOWANY.
- `docs/flo/materialy/` — README, trzy scenariusze nagrań, lista zrzutów.
- `tests/unit/ui-flo-wrapped.test.tsx` — 12 testów.

Decyzje:
- SILNIK MIAŁ `buildWrapped`, ALE NIKT GO NIE KARMIŁ. Dopisałem odczyt
  w folderze trasy, nie w `lib/flo/` — to jest zapytanie do tabeli faktur na
  potrzeby jednego ekranu, a `lib/flo/*` należy do toru silnika. Gdyby doszła
  akcja `getWrapped()`, ten plik znika i zostaje jedno wywołanie.
- ZAPIS OBRAZU NIE ZALEŻY OD ANIMACJI. Obraz powstaje z opisu SVG, nie ze
  zrzutu ekranu — działa tak samo na telefonie, który animacji nie odtworzył,
  i przy włączonym „ogranicz ruch”. Plan wymagał tego wprost.
- PODGLĄD RYSUJE TEN SAM NAPIS SVG, KTÓRY IDZIE NA PŁÓTNO. Nie ma dwóch
  ścieżek, które mogłyby się rozjechać — a to jest ekran, po którym ludzie
  wrzucają obraz do sieci i nie mogą się dowiedzieć po fakcie, że była na nim
  nazwa klienta.
- ZAPIS ZABLOKOWANY DO CZASU OBEJRZENIA PODGLĄDU. Ta sama zasada, co przy
  wysyłce: nie zapisujemy w ciemno czegoś, co zaraz trafi do sieci.
- Dwie wersje (`masked`, `revealed`) budowane na serwerze i przełączane
  w przeglądarce. Natychmiastowe, a klient widzi w podglądzie dokładnie to,
  co zapisze.
- Kwoty da się ukryć osobnym przełącznikiem — można pochwalić się rokiem bez
  pokazywania, ile się zarabia.
- PRÓG PIENIĘŻNY to jedyna karta z rozgałęzieniem po rodzaju w interfejsie.
  Świadomy wyjątek: alternatywą byłoby pole w kontrakcie, którego nie użyłaby
  żadna inna funkcja.
- `useCallback` przy zapisie USUNIĘTY — kompilator Reacta odmawiał
  optymalizacji całego komponentu, bo ręczna lista zależności (`screen?.key`)
  była węższa niż wywnioskowana. Kompilator zapamiętuje to sam.

Krok 39 — co zostało po przebudowie Bartosza:
Dashboard jest już ekranem agenta, a `/flo` przekierowuje (zrobił to tor
silnika 30.08). Z mojej strony zostały dwie rzeczy i obie są zrobione: licznik
spraw wrócił nad wątek (bez niego znikał razem z ukrytym nagłówkiem), a martwy
skrót agenta na dashboardzie skasowany.

Krok 40 — CZEGO NIE MA:
nagrań i zrzutów. Nie da się ich zrobić bez działającej aplikacji z danymi,
a w tym worktree nie ma `.env.local` i wszystkie trasy agenta są za bramką
logowania. Zamiast udawać, że materiały istnieją, zostawiłem scenariusze na
tyle dokładne, że nagranie jest odtworzeniem instrukcji: ujęcie po ujęciu,
z napisami na ekran i listą rzeczy, których nie wolno pokazać. Do tego lista
ośmiu zrzutów przypisanych do konkretnych artykułów pomocy.

Weryfikacja:
- `npx vitest run tests/unit/` — 1071 testów, wszystko zielone.
- `pnpm typecheck` czysto, `npx eslint .` — 0 błędów (28 zastanych ostrzeżeń
  poza moimi katalogami).

STAN TORU B: kroki 0–40 zrobione. Lista kontrolna z części VI.2 planu jest
zamknięta.

---

# DOMKNIĘCIE TORU B — 30 sierpnia 2026

Interfejs agenta jest skończony w zakresie, który opisuje plan. Ten wpis jest
punktem wyjścia dla następnej sesji: co jest, czego nie ma i co wisi po czyjej
stronie. Nie trzeba czytać całego dziennika.

## Lista kontrolna z części VI.2

```
BLOK 0  [x]0  [x]1  [x]2  [x]3  [x]4
BLOK 1  [x]5  [x]6  [x]7  [x]8  [x]9  [x]10
BLOK 2  [x]11 [x]12 [x]13 [x]14
BLOK 3  [x]15 [x]16 [x]17 [x]18 [x]19 [x]20 [x]21
BLOK 4  [x]22 [x]23 [x]24
BLOK 5  [x]25 [x]26 [x]27 [x]28 [x]29 [x]30 [x]31
BLOK 6  [x]32 [x]33 [x]34
BLOK 7  [x]35 [x]36
BLOK 8  [x]37 [x]38
BLOK 9  [x]39 [x]40*
```

`*` krok 40: scenariusze i lista zrzutów gotowe, same nagrania i pliki PNG do
zrobienia przez człowieka przy działającej aplikacji.

## Gdzie co leży

| Obszar | Pliki |
|---|---|
| Odmiana przez liczebnik | `lib/i18n/plural.ts` |
| Czas, strefa, odliczanie | `components/flo/format.ts` |
| Oś czasu wątku | `components/flo/timeline.ts`, `thread.tsx`, `thread-client.tsx` |
| Karta i sześć wariantów | `components/flo/proposal-card.tsx`, `card-chrome.tsx`, `variants/*` |
| Reguły blokowania akcji | `components/flo/gating.ts` |
| Cztery podglądy | `components/flo/preview-*.tsx`, `card-preview.tsx` |
| Dowody, cofanie, kolejka | `evidence.tsx`, `undo-bar.tsx`, `scheduled-panel.tsx` |
| Ekran agenta | `components/flo/flo-screen.tsx` (montowany przez dashboard) |
| Ustawienia | `app/(dashboard)/settings/flo/*` |
| Panel operatora | `app/admin/flo/page.tsx` |
| Podsumowanie roku | `app/(dashboard)/flo/wrapped/*`, `components/flo/wrapped/*` |
| Treści agenta | `content/flo/*.md` (32 rodzaje + GLOS + lista dla prawnika) |
| Baza wiedzy | `content/help/flo-*.mdx` |
| Testy | `tests/unit/ui-flo-*.{ts,tsx}`, `e2e/tests/flo-*.spec.ts` |

## Czego NIE zweryfikowałem — trzy rzeczy, w tej kolejności

1. **Ani jedno kliknięcie nie przeszło przez prawdziwy serwer.** Worktree nie
   ma `.env.local`, a trasy agenta są za bramką logowania. Wpięcie akcji jest
   sprawdzone kompilacją, testami renderu i lekturą kontraktu. Ktoś musi wejść
   na dashboard z prawdziwą bazą i przeklikać po jednej propozycji każdego
   wariantu. To jest zadanie numer jeden przed alfą.
2. **Testów przeglądarkowych nie uruchomiłem.** `playwright test --list` widzi
   wszystkie 15, typy i lint są czyste — ale pierwszy przebieg prawie na pewno
   wymaga korekt w selektorach. Traktować jako szkielet do dopięcia.
3. **Telefonu nie da się dziś sprawdzić.** BUG-008 w
   `lib/supabase/middleware.ts` przekierowuje telefony na `/mobile`, więc ani
   ścieżka paragonu, ani powiadomienia nie przeszły przez urządzenie.

## Co wisi po stronie silnika

Kolejność od najbardziej blokującej:

1. `listHistory()` — panel „Co Flo zrobił” stoi pusty, bo `listScheduled`
   opisuje kolejkę, nie przeszłość.
2. `listScheduled` ma `whenLabel: 'zaraz'` wpisane na sztywno.
3. `PushPayload` bez `actions` i `actionUrls` — service worker już je obsługuje,
   ale bez wysłania przyciski w powiadomieniu się nie pojawią.
4. Warianty szablonów: `payment.chase:soft|:firm|:demand`,
   `ksef.outage:confirmed|:neutral`. Treści leżą gotowe w `content/flo/`.
5. Nowe placeholdery z treści (`{{kolumna}}`, `{{numerKsef}}`, `{{zrodlo}}`,
   `{{stawka}}`, `{{dataStawki}}`, `{{terminWezwania}}`, `{{nadawca}}`,
   `{{liczbaFaktur}}`, `{{liczbaPoTerminie}}`) muszą zostać policzone.
6. Suma zaznaczonych w wariancie `list` — potrzebne pole liczbowe
   w `FloListItem`, bo interfejs nie parsuje kwot z napisów.
7. `FloListItem.preview` albo `href` — podgląd pojedynczej pozycji paczki.
8. `FloPreview` typu `message` bez wariantów tonu (`tones`).
9. `getWrapped()` — dziś odczyt danych podsumowania roku leży w folderze trasy
   (`app/(dashboard)/flo/wrapped/data.ts`) i chętnie go stamtąd zabiorę.
10. B-01 Co-Pilot Księgowego — ostatnie miejsce, gdzie ustawienie znaczy
    „wyślij samo”.
11. Przełącznik funkcji per konto w panelu operatora: `setKindForTenant`
    istnieje, ale wymaga pola „powód”. Dorobię, gdy to będzie potrzebne.

## Sprawy poza kodem

- **Prawnik.** Dziewięć tekstów czeka w `content/flo/DO-AKCEPTACJI-PRAWNIKA.md`
  wraz z pięcioma pytaniami. Grupa T i `tax.simulate` nie wychodzą do klientów
  przed odpowiedzią — i tak są wyłączone w `lib/flo/flags.ts`.
- **Produkcja.** Sprawdzone twardo 30.08: `https://www.faktflow.pl/sw.js` nie
  zawiera `actionUrls`, czyli działa tam build sprzed bloku 4. Wdrożenia nie
  ruszam — komendy leżą w `AGENTS.md`, sekcja „Wdrożenie produkcji”.
- **Dostęp SSH.** Klucz `hetzner_faktflow_ed25519` z WSL jest odrzucany przez
  wszystkie trzy serwery (`Permission denied (publickey)`). Ktokolwiek będzie
  wdrażał, musi mieć działający dostęp albo poprosić kolegę.

## Stan zestawu na dziś

`pnpm typecheck` czysto · `npx eslint .` zero błędów (28 zastanych ostrzeżeń
poza katalogami toru B) · 1071 testów jednostkowych zielonych · `next build`
przechodzi.
