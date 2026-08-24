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
