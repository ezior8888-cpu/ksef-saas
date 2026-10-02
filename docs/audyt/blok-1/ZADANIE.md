# Blok 1 — funkcjonalność i logika domenowa: audyt, plan, naprawy

## Po co to jest

FaktFlow to SaaS do fakturowania dla polskich firm z integracją z KSeF (Next.js 16 App Router, TypeScript, Supabase self-hosted z logowaniem przez GoTrue, zadania w tle na pg-boss, pliki w MinIO przez API S3, shadcn/ui; szczegóły i rozbieżności z `AGENTS.md` w `KONTEKST-REPO.md`). Produkt jest rozbudowany, ale nie ma jeszcze płacących klientów, więc nikt nie sprawdził go na prawdziwej pracy. Zanim trafi do pierwszych firm, musi poprawnie robić to, co obiecuje. Faktura jest dokumentem podatkowym: błędna kwota VAT, dziura w numeracji albo faktura wysłana do KSeF dwa razy to kłopot klienta z urzędem skarbowym, a nie kosmetyka.

Zadanie na tę sesję: przeanalizować całe repozytorium pod kątem funkcjonalności i logiki domenowej, spisać raport, ułożyć plan napraw i ten plan wykonać. Wzorcem są ISO/IEC 25010 (functional suitability: kompletność, poprawność i adekwatność funkcji) oraz SOC 2 (processing integrity: przetwarzanie kompletne, poprawne, dokładne, terminowe i autoryzowane).

To pierwszy z kilku bloków audytu. Bezpieczeństwo, wydajność, UX i jakość kodu będą osobnymi blokami: jeśli zauważysz coś z tych obszarów, zapisz to w raporcie w sekcji „Poza zakresem” i nie naprawiaj.

Pracujesz sam przez całą noc. Bartek, autor produktu, śpi i nie odpowie na żadne pytanie. Rano przeczyta podsumowanie, przejrzy commity i zdecyduje, co scalić. Dlatego decyzje podejmujesz sam i zapisujesz je z uzasadnieniem, a każda zmiana musi dać się przejrzeć i cofnąć pojedynczym commitem.

## Dwie zasady, które ustawiają całą noc

**Najpierw komplet wiedzy, potem zmiany.** Kolejność to: audyt → raport → plan → wykonanie. Dopóki raport i plan nie są zapisane i zacommitowane, nie zmieniasz kodu produktu (jednorazowe skrypty i testy potwierdzające znalezisko są w porządku). Poprawki robione przy okazji czytania kodu rozjeżdżają priorytety: noc schodzi na drobiazgi, a błędy krytyczne zostają.

**Najpierw to, co już istnieje.** Priorytetem jest naprawianie i dokańczanie istniejących funkcji. Nowa funkcja może wejść do planu tylko wtedy, gdy twoje badanie pokaże, że jest naprawdę konieczna (kryteria w Fazie 3), i zawsze po naprawach.

## Pliki robocze

Wszystko trzymaj w katalogu `docs/audyt/blok-1/`:

- `ZADANIE.md` — ten plik; nie edytuj go.
- `KONTEKST-REPO.md` — fakty o tym repo (stos, wcześniejszy audyt, komendy, środowisko). **Przeczytaj go przed Fazą 0**; jeśli coś w nim przeczy `AGENTS.md`, rację ma `KONTEKST-REPO.md`.
- `STAN.md` — godzina startu, stan zastany, komendy weryfikujące, ustalenia o środowisku.
- `RAPORT.md` — wyniki audytu.
- `PLAN.md` — uporządkowany plan ze statusami.
- `PODSUMOWANIE.md` — dokument dla Bartka na rano.

Te pliki są twoją pamięcią. Sesja potrwa wiele godzin i kontekst będzie kilka razy kompaktowany, więc zapisuj na bieżąco: znaleziska dopisuj do raportu w trakcie audytu, a status w planie aktualizuj po każdej pozycji. Po kompakcji albo gdy nie masz pewności, na czym stoisz, przeczytaj `ZADANIE.md`, `KONTEKST-REPO.md`, `PLAN.md` i `git log --oneline -20`, a potem podejmij pracę od pierwszej niezamkniętej pozycji.

## Granice

Nikt nie patrzy ci na ręce, a część operacji jest nieodwracalna, dlatego:

- Pracujesz tylko na gałęzi `audyt/blok-1` w worktree `.claude/worktrees/audyt-blok-1` i tylko lokalnymi commitami. Bez `git push`, bez otwierania PR, bez scalania do głównej gałęzi, bez deployu (instrukcja z `AGENTS.md` „wypchnij gałąź i otwórz PR” tej nocy nie obowiązuje). Nie przełączaj gałęzi i nie wychodź z tego worktree: w głównym katalogu repo pracują inne sesje.
- Nigdy nie dodawaj do gita katalogu `docs/automation/` (poufny, repo jest publiczne). Commituj pliki po nazwie, nie `git add -A` ani `git add .`.
- Żadna zdalna baza (ani deweloperska z `.env.local`, ani produkcyjna) nie może być zmieniana: żadnych migracji ani skryptów zmieniających dane, żadnych skryptów `seed:*`, `trigger:*`, `db:push*`. Na produkcję (serwery Hetznera, SSH, Coolify) nie wchodzisz wcale. Zmiany schematu zapisuj jako nowe pliki migracji **o numerach od `00200` w górę** (niższe numery rezerwują równoległe sesje) i wymień je w podsumowaniu jako kroki dla Bartka. Lokalnej bazy nie uruchomisz (na maszynie nie ma Dockera), więc testy piszesz na mockach.
- KSeF: wyłącznie mocki i dane testowe (`lib/ksef/mock-fixtures.ts`). Żadnych wywołań sieciowych ani do produkcji, ani do środowiska testowego MF (skrypty `ksef:*` nie są uruchamiane).
- Żadnych prawdziwych e-maili ani wywołań płatnych usług. Nie zmieniaj sekretów ani plików `.env` i nie wypisuj wartości sekretów (przy sprawdzaniu środowiska wystarczy host).
- Nowe zależności tylko wtedy, gdy są konieczne, z uzasadnieniem w planie.
- Nie zadawaj pytań i nie czekaj na potwierdzenia.
- Nie czytaj plików spoza katalogu repozytorium, a pliki tymczasowe trzymaj w repo: pierwsze odczytanie spoza katalogu roboczego wywołuje pytanie o zgodę, na które nikt nie odpowie.
- Jeśli tryb auto zablokuje jakąś akcję, nie powtarzaj jej i nie szukaj obejścia: kilka blokad z rzędu wstrzymuje sesję do rana. Oznacz pozycję jako `ZABLOKOWANE` i idź dalej. Z tego samego powodu nie używaj hurtowego cofania (`git reset --hard`, `git checkout -- .`, `git restore .`, `git clean`, `git stash drop`); nieudane zmiany cofaj, przywracając konkretne pliki po nazwie albo przez `git revert` własnego commita.

## Faza 0 — przygotowanie

Jeśli `PLAN.md` już istnieje, to jest kontynuacja wcześniejszej sesji: zapisz w `STAN.md` nową godzinę startu, zamień statusy `ODŁOŻONE` z powrotem na `TODO` i podejmij pracę od pierwszej niezamkniętej pozycji, pomijając fazy już zakończone. W przeciwnym razie:

1. Zapisz w `STAN.md` godzinę startu (`date`).
2. Gałąź `audyt/blok-1` i worktree są już przygotowane (od `origin/main`, zależności zainstalowane). Sprawdź `git branch --show-current` i `git status --short`. Niczego zastanego nie commituj; jeśli w drzewie są nieznane zmiany, zapisz ich listę w `STAN.md` i ich nie ruszaj.
3. Przeczytaj `KONTEKST-REPO.md`, `CLAUDE.md`, README, dokumentację w repo, `package.json`, schemat bazy i migracje.
4. Ustal komendy typecheck, lint, testów i builda, uruchom je i zapisz wyniki jako stan zastany. Rano musi być jasne, co nie działało jeszcze przed tobą.
5. Ustal, dokąd wskazuje środowisko (baza, KSeF, poczta, storage), i zapisz to w `STAN.md`.

## Faza 1 — audyt

Zacznij od mapy: ekrany i trasy, akcje serwerowe i endpointy, funkcje Inngest, tabele, statusy i enumy. Potem spisz przypadki użycia — te, które produkt obiecuje (UI, README, dokumentacja), i te, bez których fakturowanie nie ma sensu — i prześledź każdy w kodzie od początku do końca: formularz → walidacja → akcja lub endpoint → baza → zadanie w tle → system zewnętrzny → to, co użytkownik widzi na końcu. Zapisuj, gdzie łańcuch się urywa.

Ufaj kodowi, nie opisom. Repozytorium powstawało z dużym udziałem AI w kilkudziesięciu fazach, a w takich repo typowe są: funkcje widoczne w UI, które kończą się stubem, TODO albo zamockowanymi danymi; ta sama reguła zaimplementowana w kilku miejscach z rozbieżnościami (na przykład sumy liczone osobno w formularzu, PDF i XML); dokumentacja opisująca stan zamierzony zamiast faktycznego.

Siedem obszarów do sprawdzenia. Podane przykłady to miejsca, w których w systemach fakturowych najczęściej siedzą błędy. Traktuj je jako punkt startowy, nie zamkniętą listę.

1. **Pokrycie przypadków użycia.** Czy użytkownik załatwia sprawę od początku do końca bez wychodzenia z aplikacji i bez ręcznych obejść: konfiguracja firmy i połączenie z KSeF, kontrahent, wystawienie faktury, wysyłka do KSeF, numer KSeF i UPO, PDF i przekazanie klientowi, płatność, korekta, przekazanie danych księgowej, a także odbiór faktur kosztowych, jeśli produkt to obiecuje. Osobno ścieżki awaryjne: odrzucenie przez KSeF, niedostępność KSeF, przerwana sesja, ponowienie bez dubla.
2. **Reguły biznesowe i obliczenia.** Netto, VAT i brutto na pozycjach oraz sumy według stawek; zaokrąglenia i metoda liczenia spójne we wszystkich miejscach; kwoty nietrzymane w liczbach zmiennoprzecinkowych; stawki i oznaczenia (zw, np, odwrotne obciążenie) z wymaganymi adnotacjami; waluty obce i przeliczenie VAT na PLN; numeracja (ciągłość, unikalność, równoczesne wystawianie, przełom miesiąca i roku); terminy płatności i zaległości; korekty, zaliczki i faktury końcowe, jeśli istnieją.
3. **Model domeny i cykle życia.** Statusy i dozwolone przejścia wymuszane po stronie serwera, nie tylko w UI; niezmienność wystawionej faktury (zmiana wyłącznie korektą); zamrożenie danych sprzedawcy, nabywcy i pozycji na dokumencie (późniejsza edycja kontrahenta lub produktu nie może zmieniać historycznych faktur); historia zmian (kto, co, kiedy); zgodność statusu lokalnego ze stanem w KSeF; zadania w tle, które kończą się wynikiem widocznym dla użytkownika, nie giną po cichu i dają się bezpiecznie ponowić.
4. **Walidacja i przypadki brzegowe.** Ta sama walidacja na serwerze co w formularzu; NIP z sumą kontrolną, numery kont, kody pocztowe; relacje dat i strefa czasowa (faktura wystawiona tuż po północy czasu polskiego); wartości zerowe, ujemne i bardzo duże; rabaty; długie nazwy i znaki specjalne wobec limitów i escapowania w XML; podwójne kliknięcie; puste stany; limity zapytań, które po cichu ucinają wyniki.
5. **Zgodność z przepisami.** Elementy obowiązkowe faktury; zgodność generowanego XML z obowiązującą dziś strukturą FA (waliduj względem oficjalnego XSD); wymagania KSeF dotyczące trybów wystawiania, numeru KSeF, UPO, kodów QR i korekt; przechowywanie dokumentów. Przepisy i API KSeF zmieniały się wielokrotnie, a twoja wiedza może być nieaktualna, więc ustal stan prawny na dziś w źródłach pierwotnych (ustawa o VAT, rozporządzenia, oficjalna dokumentacja i schematy KSeF), zbuduj z nich listę wymagań i zmapuj każde na kod. Wymaganie, którego nie udało się potwierdzić w źródle, oznacz jako niezweryfikowane.
6. **Dokumenty wyjściowe, raporty, eksporty.** PDF zgodny co do grosza z XML i z ekranem; komplet pól; polskie znaki i dokumenty wielostronicowe; eksporty dla księgowości (format, kodowanie, separatory dziesiętne, daty); zestawienia, które sumują się z danymi źródłowymi.
7. **Wyszukiwanie, filtrowanie, operacje masowe.** Szukanie po numerze, kontrahencie, NIP, kwocie, dacie i statusie; łączenie filtrów, sortowanie i paginacja działające na pełnym zbiorze, a nie na załadowanej stronie; operacje masowe i ich zachowanie przy częściowym niepowodzeniu.

Żeby ocenić braki, porównaj mapę funkcji z tym, co w podstawowym obiegu faktury oferują Fakturownia, inFakt, wFirma i iFirma. Jeśli w repo jest wcześniejsza analiza konkurencji, zacznij od niej.

Każde znalezisko musi mieć dowód: plik i linia, co się dzieje, co powinno się dziać i jak to potwierdziłeś. Rozróżniaj `POTWIERDZONE` (odtworzone testem lub uruchomieniem kodu) od `Z ODCZYTU` (wynika z lektury, nieuruchomione) i nie zapisuj podejrzeń jako faktów. Do równoległego przeglądu obszarów możesz użyć subagentów, ale zanim ich ustalenie trafi do raportu, sam sprawdź wskazane miejsce w kodzie.

Audyt i plan powinny zająć mniej więcej pierwszą jedną trzecią nocy. Jeśli po trzech godzinach wciąż audytujesz, zamknij raport na tym, co potwierdzone, wypisz obszary, których nie zdążyłeś sprawdzić, i przejdź dalej. Naprawione błędy krytyczne są warte więcej niż kompletny raport bez żadnej poprawki.

## Faza 2 — raport (`RAPORT.md`)

Raport czyta autor produktu, nie audytor: każde znalezisko zaczynaj od skutku dla użytkownika (co zobaczy klient, co trafi do urzędu), a dopiero potem podaj miejsce w kodzie.

Układ:

- Podsumowanie: ogólny stan i największe ryzyka, najwyżej kilkanaście zdań.
- Tabela przypadków użycia ze statusem: DZIAŁA / CZĘŚCIOWO / NIE DZIAŁA / BRAK.
- Siedem obszarów, a w każdym: co jest i działa, co jest błędne, czego brakuje.
- Znaleziska z identyfikatorami `F-001…`, każde z typem (BŁĄD — istniejąca funkcja działa źle; NIEDOKOŃCZONE — funkcja istnieje częściowo; BRAK — funkcji nie ma), wagą, dowodem i poziomem pewności.
- Sekcje „Poza zakresem” oraz „Źródła” (adresy i daty dostępu).

Waga według skutku:

- **K1** — błędny dokument lub kwota, niezgodność z prawem, utrata lub zafałszowanie danych, dubel w KSeF.
- **K2** — użytkownik nie może dokończyć podstawowej sprawy.
- **K3** — przypadek brzegowy, istnieje obejście.
- **K4** — drobiazg.

Zanim zamkniesz raport, sprawdź w kodzie jeszcze raz każde znalezisko K1 i K2. Fałszywy alarm na tym poziomie kosztuje godziny naprawiania czegoś, co działało.

## Faza 3 — plan (`PLAN.md`)

Każde znalezisko dostaje decyzję: wchodzi do planu albo zostaje pominięte z zapisanym powodem (sekcja „Poza planem” na końcu pliku). Nic nie znika po cichu.

Kolejność pozycji:

1. To, bez czego nie da się dowieść poprawek (na przykład minimalny runner testów dla logiki domenowej, jeśli repo go nie ma).
2. Naprawy K1 w istniejących funkcjach.
3. Naprawy K2.
4. Dokończenie funkcji niedokończonych.
5. Naprawy K3.
6. Nowe funkcje, które spełniły kryteria.
7. K4, jeśli zostanie czas.

W obrębie poziomu najpierw wspólne fundamenty (na przykład jeden moduł obliczeń), potem to, co od nich zależy.

Nowa funkcja wchodzi do planu tylko wtedy, gdy spełnia co najmniej jedno z kryteriów: (a) bez niej faktury są niezgodne z prawem lub wymaganiami KSeF; (b) bez niej nie da się dokończyć podstawowego przypadku użycia; (c) jest częścią podstawowego obiegu faktury u wszystkich czterech konkurentów, a jej brak zatrzymałby typowego klienta. Uzasadnienie ze źródłem zapisz przy pozycji. Wszystko inne trafia do sekcji „Pomysły na później” w podsumowaniu, bez implementacji.

Format pozycji (linia statusu dokładnie w tej postaci, bo jest zliczana komendą):

```
### P-01 — krótki tytuł
Status: TODO
Typ: NAPRAWA | DOKOŃCZENIE | NOWA
Znaleziska: F-003, F-007
Zmiana: co i w których plikach
Kryterium: test albo komenda, która dowodzi, że działa
```

Statusy: `TODO`, `W TOKU`, `ZROBIONE`, `ZABLOKOWANE`, `ODŁOŻONE` (ten ostatni tylko po przekroczeniu limitu czasu). Duże pozycje dziel na mniejsze, tak żeby każda dała się zamknąć jednym commitem.

Gdy plan jest gotowy, zacommituj raport i plan (`docs: raport i plan audytu bloku 1`) i wypisz w rozmowie listę pozycji. Dopiero wtedy zaczynasz zmieniać kod.

## Faza 4 — wykonanie

Jedna pozycja naraz, w kolejności z planu:

1. Sprawdź `date` (limit czasu niżej) i ustaw status `W TOKU`.
2. Napisz test, który odtwarza błąd albo opisuje oczekiwane zachowanie i na razie nie przechodzi. Jeśli czegoś nie da się sensownie pokryć testem, zapisz kroki ręcznego sprawdzenia.
3. Napraw przyczynę, nie objaw: rozwiązanie ma działać dla wszystkich poprawnych danych, nie tylko dla przypadków z testu. Zmiana ma być możliwie mała i trzymać się zakresu pozycji, bez refaktoryzacji przy okazji.
4. Uruchom test pozycji, cały zestaw testów i typecheck.
5. Zacommituj z identyfikatorem pozycji, na przykład `fix(P-07): …`.
6. Ustaw status `ZROBIONE` i dopisz hash commita oraz jedno zdanie, jak to sprawdzić.

Nie osłabiaj ani nie usuwaj testów, żeby przeszły, i nie oznaczaj pozycji jako zrobionej bez przechodzącego sprawdzenia. Nowe błędy zauważone po drodze dopisz do raportu i planu we właściwym miejscu kolejności, zamiast naprawiać je od ręki.

`ZABLOKOWANE` jest dla sytuacji, w których potrzebna jest decyzja biznesowa Bartka bez bezpiecznego wyjścia domyślnego, dostęp, którego nie masz, operacja nieodwracalna lub dotykająca produkcji, albo gdy dwa różne podejścia zawiodły. Zapisz powód i to, czego potrzeba, i idź dalej. To, że pozycja jest trudna albo duża, nie jest powodem: wtedy ją podziel.

Jeśli plan jest zamknięty, a do limitu czasu zostały ponad dwie godziny, zrób jeden dodatkowy obchód: wróć do obszarów sprawdzonych pobieżnie i do znalezisk `Z ODCZYTU`, dopisz nowe pozycje do raportu i planu i wykonaj je tak samo.

Limit czasu: jeśli od startu minęło 10 godzin, dokończ bieżącą pozycję, pozostałe `TODO` oznacz jako `ODŁOŻONE` i przejdź do Fazy 5.

## Faza 5 — zamknięcie

1. Uruchom typecheck, lint, testy i build.
2. Napisz `PODSUMOWANIE.md`: co zrobione (pozycje z commitami); co zablokowane lub odłożone i czego potrzeba; decyzje podjęte samodzielnie, które Bartek powinien potwierdzić; migracje i inne kroki ręczne; jak w kilku krokach sprawdzić w aplikacji najważniejsze poprawki; pomysły na później; znaleziska poza zakresem. Bartek ma w kwadrans zrozumieć, co było zepsute, co naprawiłeś, czego nie i co musi zrobić sam.
3. Zacommituj.
4. W jednej turze pokaż w rozmowie świeże wyjście: `ls docs/audyt/blok-1/`; `grep '^Status:' docs/audyt/blok-1/PLAN.md | sort | uniq -c`; komendy typecheck, testów i builda z kodami wyjścia; `git status --short`; `git branch --show-current`; `git log --oneline` od startu sesji; `date` i czas od startu.
