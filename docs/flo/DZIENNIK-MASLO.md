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
