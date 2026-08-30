# ksef.outage — awaria po stronie Ministerstwa

Grupa X (X-04) · promień 1 · karta: `info`

## Tytuł

KSeF nie odpowiada od {{godzina}}

## Treść

Twoje faktury czekają w kolejce i wyślę je, gdy tylko system wróci. Nic nie przepadło i nie musisz nic robić.

## Warianty

### :confirmed — Ministerstwo potwierdziło awarię

Tytuł: Ministerstwo potwierdziło awarię KSeF

Treść: Awaria zgłoszona przez Ministerstwo o {{godzina}}. Twoje faktury czekają w kolejce — wyślę je automatycznie po powrocie systemu. Termin wystawienia liczy się od daty na dokumencie, nie od wysyłki.

### :neutral — nie wiemy, po czyjej stronie leży problem

Tytuł: Nie mam teraz połączenia z KSeF

Treść: Nie umiem powiedzieć, czy to po stronie Ministerstwa, czy naszej. Faktury czekają w kolejce i próbuję dalej. Odezwę się, gdy się uda albo gdy będę wiedział więcej.

## Przyciski

- główny: Pokaż kolejkę
- drugorzędne: Ukryj

## Zasady, których ten tekst pilnuje

- NIGDY NIE ZRZUCAMY WINY BEZ DOWODU. Wariant `:confirmed` wolno użyć tylko
  przy oficjalnym komunikacie Ministerstwa; w każdym innym przypadku idzie
  `:neutral` i agent mówi wprost, że nie wie.
- Pierwsze zdanie po tytule zawsze mówi, że nic nie przepadło. Klient w
  trakcie awarii rejestru państwowego potrzebuje najpierw tego.
- Żadnych żartów z Ministerstwa. To jest narzędzie do pracy, nie komentarz
  polityczny.
