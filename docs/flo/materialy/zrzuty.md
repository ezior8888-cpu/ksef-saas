# Zrzuty do bazy wiedzy

Do sześciu artykułów z `content/help/flo-*.mdx`. Każdy zrzut ma pokazywać
JEDNĄ rzecz, o której mówi artykuł — nie cały ekran „przy okazji”.

| Plik | Do artykułu | Co ma być widać |
|---|---|---|
| `wątek.png` | `flo-czym-jest` | dashboard z wątkiem: trzy karty, prawa kolumna, pole rozmowy |
| `podglad-zablokowany.png` | `flo-dlaczego-pyta` | szary przycisk „Wyślij wiadomość” i zdanie „Najpierw otwórz podgląd” |
| `podglad-otwarty.png` | `flo-dlaczego-pyta` | ta sama karta z rozwiniętą treścią wiadomości i aktywnym przyciskiem |
| `pasek-cofniecia.png` | `flo-cofanie` | karta z paskiem „Zrobiłem to za Ciebie. Możesz cofnąć — zostały 8 minut” |
| `wyciszone.png` | `flo-wyciszanie` | Ustawienia → Flo, sekcja „Wyciszone sprawy” z przyciskiem przywrócenia |
| `dlaczego-to-widze.png` | `flo-dlaczego-to-widze` | rozwinięta sekcja z odnośnikami do faktury i kontrahenta |
| `pusty-watek.png` | `flo-cisza` | stan pusty: jedno zdanie, zero zachęt |
| `paczka-potwierdzenie.png` | — (materiał sprzedażowy) | „Wysyłam do anna@biuro.pl — zgadza się?” |

## Jak je zrobić

1. Zaloguj się na konto demonstracyjne, zasiej sprawy helperem
   `e2e/helpers/flo-seed.ts`.
2. Szerokość okna 1280 px, motyw jasny (domyślny) — artykuły pomocy ogląda się
   głównie na komputerze.
3. Kadruj do samej karty albo sekcji, nie do całego pulpitu.
4. Zapisz do `docs/flo/materialy/zrzuty/` i podlinkuj w artykułach.

## Ostrzeżenie

Zrzuty starzeją się szybciej niż tekst. Jeżeli zmienia się układ karty,
najpierw sprawdź, które zrzuty przestały być prawdą — nieaktualny obrazek
w bazie wiedzy myli bardziej niż jego brak.
