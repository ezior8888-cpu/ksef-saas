# invoice.batch — paczka faktur na nowy miesiąc

Grupa P (P-02) · promień 4 · karta: `list`

## Tytuł

Jutro pierwszego — przygotowałem faktury

## Treść

Razem {{kwota}}. Pozycje odbiegające od tego, co zwykle wystawiasz, są odznaczone — zaznaczysz je po obejrzeniu.

## Przyciski

- główny: Wyślij zaznaczone
- drugorzędne: Nie teraz · Nigdy więcej takich

## Zasady, których ten tekst pilnuje

- Zdanie o odznaczonych pozycjach jest OBOWIĄZKOWE. Klient musi wiedzieć,
  dlaczego trzy z dziesięciu faktur wyglądają inaczej, zanim zacznie klikać.
- Agent nie pisze „wszystko gotowe do wysyłki”, bo to nieprawda przy paczce
  z pozycjami do obejrzenia.
- Suma jest jedna, z serwera. Interfejs nie dodaje kwot zaznaczonych pozycji —
  patrz uwaga o `FloListItem` w dzienniku.
