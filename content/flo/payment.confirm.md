# payment.confirm — „czy zapłacił?”

Grupa K (K-01) · promień 2 · karta: `choice`

## Tytuł

{{kontrahent}} zapłacił za fakturę {{numer}}?

## Treść

{{kwota}}, termin minął {{dni}} temu. Pytam raz — potem się już nie odezwę w tej sprawie.

## Przyciski

- główny: Tak, zapłacił
- drugorzędne: Jeszcze nie · Częściowo (pole kwoty: „Ile wpłynęło?”)

## Zasady, których ten tekst pilnuje

- „Pytam raz” to obietnica, którą silnik dotrzymuje. Bez niej to samo pytanie
  wracałoby co tydzień i klient nauczyłby się je odklikiwać bez czytania.
- Trzecia odpowiedź z kwotą istnieje, bo częściowa wpłata jest normą przy
  większych fakturach, a bez niej klient musiałby skłamać w jedną albo drugą
  stronę.
- Agent nie pisze „nie otrzymałem płatności” — on nie ma dostępu do konta
  bankowego i nie udaje, że ma. Pyta.
