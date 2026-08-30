# payment.chase — ponaglenie o płatność

Grupa K (K-02) · promień 4 · karta: `preview` (podgląd `message`)

## Tytuł

{{kontrahent}} — {{kwota}}, {{dni}} po terminie

## Treść

Faktura {{numer}} na {{kwota}} minęła termin {{dni}} temu. Napisałem wiadomość — przeczytaj ją i zdecyduj. Sam jej nie wyślę.

## Warianty tonu wiadomości do kontrahenta

Ton dobiera silnik na podstawie historii płatności, ale ostatnie słowo ma
klient: treść jest edytowalna w podglądzie i wysyłamy dokładnie to, co w niej
zostanie.

### :soft — pierwszy raz po terminie, kontrahent zwykle płaci

Temat: Przypomnienie o płatności — faktura {{numer}}

Treść:

Dzień dobry,

przypominam o fakturze {{numer}} na kwotę {{kwota}}, której termin płatności minął {{dni}} temu.

Jeśli płatność już wyszła, proszę potraktować tę wiadomość jako nieaktualną.

Pozdrawiam
{{nadawca}}

### :firm — kolejny raz, opóźnienie się powtarza

Temat: Faktura {{numer}} — brak płatności po terminie

Treść:

Dzień dobry,

faktura {{numer}} na kwotę {{kwota}} pozostaje nieopłacona {{dni}} po terminie. To kolejna płatność po czasie w naszej współpracy.

Proszę o informację, kiedy mogę spodziewać się przelewu.

Jeśli płatność już wyszła, proszę potraktować tę wiadomość jako nieaktualną.

Pozdrawiam
{{nadawca}}

### :demand — wezwanie do zapłaty przed krokiem prawnym

Temat: Wezwanie do zapłaty — faktura {{numer}}

Treść:

Dzień dobry,

wzywam do zapłaty faktury {{numer}} na kwotę {{kwota}}, wymagalnej od {{terminPlatnosci}}.

Brak wpłaty w terminie {{terminWezwania}} oznacza skierowanie sprawy na drogę postępowania sądowego wraz z odsetkami ustawowymi za opóźnienie w transakcjach handlowych.

Jeśli płatność już wyszła, proszę potraktować tę wiadomość jako nieaktualną.

Pozdrawiam
{{nadawca}}

## Przyciski

- główny: Wyślij wiadomość
- drugorzędne: Poczekaj tydzień · Odpuść temu klientowi

## Zasady, których ten tekst pilnuje

- KAŻDY z trzech tonów kończy się zdaniem „jeśli płatność już wyszła, proszę
  potraktować tę wiadomość jako nieaktualną”. Przelewy księgują się z
  opóźnieniem i to zdanie jest jedyną rzeczą, która ratuje relację, gdy agent
  ponagli kogoś, kto właśnie zapłacił.
- Ton `:demand` nie grozi niczym, czego nie da się zrobić. Odsetki ustawowe
  za opóźnienie w transakcjach handlowych to konkretna podstawa, nie straszak.
- Agent nigdy nie pisze „ignorujesz nasze wiadomości” ani niczego, co ocenia
  kontrahenta. Ocena jest w danych, nie w liście.
- „Odpuść temu klientowi” zamiast „nigdy więcej takich” — przy ponagleniach
  wyciszenie prawie zawsze dotyczy jednego kontrahenta, nie całego rodzaju.
