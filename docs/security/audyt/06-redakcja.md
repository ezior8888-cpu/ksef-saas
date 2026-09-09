# 06 — Skuteczność maskowania przed modelem

Wygenerowane przez `scripts/security/audit-redaction.ts`. **Nie edytuj ręcznie.**

Data: 2026-09-09

Test puszcza realistyczne dane z polskiej faktury przez `redactForModel`
i sprawdza, czy wrażliwy fragment zniknął. „Przeciek" = został.

Przypadków: 17. Przecieków: **5**.

| Przeciek? | Co | Wejście | Po maskowaniu |
|---|---|---|---|
| ✅ nie | NIP ciągiem (10 cyfr) | `Kontrahent NIP 1234563218 zalega` | `Kontrahent NIP [liczba] zalega` |
| 🔴 TAK | NIP z myślnikami | `Kontrahent NIP 123-456-32-18 zalega` | `Kontrahent NIP 123-456-32-18 zalega` |
| 🔴 TAK | NIP ze spacjami | `NIP 123 456 32 18` | `NIP 123 456 32 18` |
| ✅ nie | NIP z prefiksem PL | `PL1234563218` | `[konto]` |
| ✅ nie | IBAN polski | `Przelew na PL61109010140000071219812874` | `Przelew na [konto]` |
| ✅ nie | IBAN polski w grupach | `konto PL61 1090 1014 0000 0712 1981 2874` | `konto [konto]` |
| ✅ nie | IBAN niemiecki | `IBAN DE89370400440532013000` | `IBAN [konto]` |
| 🔴 TAK | IBAN brytyjski (litery w środku) | `GB29NWBK60161331926819` | `GB29NWBK60161331926819` |
| ✅ nie | e-mail | `napisz do jan.kowalski@firma.pl w sprawie` | `napisz do [email] w sprawie` |
| ✅ nie | telefon +48 | `tel +48 500 600 700` | `tel [telefon]` |
| ✅ nie | telefon ciągiem | `dzwoń 500600700` | `dzwoń [telefon]` |
| ✅ nie | PESEL | `PESEL 90010112345` | `PESEL [pesel]` |
| ✅ nie | kod pocztowy | `wyślij na 00-950 Warszawa` | `wyślij na [kod] Warszawa` |
| ✅ nie | adres z ul. | `ul. Marszałkowska 12/34, Warszawa` | `[adres], Warszawa` |
| 🔴 TAK | adres bez prefiksu | `Marszałkowska 12/34, 00-950` | `Marszałkowska 12/34, [kod]` |
| 🔴 TAK | nazwisko osoby fizycznej | `faktura dla Jana Kowalskiego` | `faktura dla Jana Kowalskiego` |
| ✅ nie | numer konta 26 cyfr ciągiem | `konto 61109010140000071219812874` | `konto [konto]` |

## Jak czytać

Maskowanie w FLO jest OBOWIĄZKOWE i wychwytuje najczęstsze kształty
(NIP ciągiem, IBAN cyfrowy, e-mail, telefon, PESEL, kod pocztowy).
Przecieki powyżej to kształty, których regex nie obejmuje — każdy wymaga
decyzji: czy to realna droga wypływu danych kontrahenta do modelu.

Uwaga o zakresie: `redactForModel` czyści `input.hints` — czyli tekst
kontekstowy budowany z danych dokumentu. Kwoty i wartości pól model
dostaje jako placeholdery, nie wartości (osobny mechanizm). Przeciek tutaj
ma znaczenie tylko wtedy, gdy dana trafia do `hints`.
