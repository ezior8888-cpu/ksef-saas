# accountant.delivery — potwierdzenie doręczenia do księgowej

Grupa B (B-01, domknięcie) · promień 1 · karta: `info`

## Tytuł

Paczka za {{miesiac}} dotarła do {{adres}}

## Treść

Doręczona {{data}} o {{godzina}}. Jeśli księgowa jej nie widzi, sprawdźcie folder ze spamem — plik zostaje w archiwum przez cały okres przechowywania.

## Warianty

### :bounced — wiadomość się odbiła

Tytuł: Paczka za {{miesiac}} nie dotarła

Treść: Serwer odbiorcy odrzucił wiadomość: {{powod}}. Paczka jest bezpieczna w archiwum — popraw adres i wyślę ją ponownie.

## Przyciski

- główny (`:bounced`): Popraw adres
- główny (doręczona): Pokaż paczkę
- drugorzędne: Ukryj

## Zasady, których ten tekst pilnuje

- DOMKNIĘCIE PĘTLI. Agent, który zgłasza wysyłkę, ale nie mówi, czy dotarła,
  zostawia klienta w niepewności przy najważniejszej paczce w miesiącu.
- Przy odbiciu najpierw pada „paczka jest bezpieczna”, dopiero potem powód.
- Powód odrzucenia cytujemy z serwera, nie tłumaczymy go na własne słowa.
