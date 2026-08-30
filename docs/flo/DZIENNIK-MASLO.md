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
