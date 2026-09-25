# 06 — Skuteczność maskowania przed modelem

Wygenerowane przez `scripts/security/audit-redaction.ts`. **Nie edytuj ręcznie.**

Data: 2026-09-09

Test puszcza realistyczne dane z polskiej faktury przez `redactForModel`
i sprawdza, czy wrażliwy fragment zniknął. „Przeciek" = został.

Przypadków: 17. Przecieków: **1**.

| Przeciek? | Co | Wejście | Po maskowaniu |
|---|---|---|---|
| ✅ nie | NIP ciągiem (10 cyfr) | `Kontrahent NIP 1234567890 zalega` | `Kontrahent NIP [nip] zalega` |
| ✅ nie | NIP z myślnikami | `Kontrahent NIP 123-456-78-90 zalega` | `Kontrahent NIP [nip] zalega` |
| ✅ nie | NIP ze spacjami | `NIP 123 456 78 90` | `NIP [nip]` |
| ✅ nie | NIP z prefiksem PL | `PL1234567890` | `[nip]` |
| ✅ nie | IBAN polski | `Przelew na PL61109010140000071219812874` | `Przelew na [konto]` |
| ✅ nie | IBAN polski w grupach | `konto PL61 1090 1014 0000 0712 1981 2874` | `konto [konto]` |
| ✅ nie | IBAN niemiecki | `IBAN DE89370400440532013000` | `IBAN [konto]` |
| ✅ nie | IBAN brytyjski (litery w środku) | `GB29NWBK60161331926819` | `[konto]` |
| ✅ nie | e-mail | `napisz do jan.kowalski@firma.pl w sprawie` | `napisz do [email] w sprawie` |
| ✅ nie | telefon +48 | `tel +48 500 600 700` | `tel [telefon]` |
| ✅ nie | telefon ciągiem | `dzwoń 500600700` | `dzwoń [telefon]` |
| ✅ nie | PESEL | `PESEL 90010112345` | `PESEL [pesel]` |
| ✅ nie | kod pocztowy | `wyślij na 00-950 Warszawa` | `wyślij [konto]` |
| ✅ nie | adres z ul. | `ul. Marszałkowska 12/34, Warszawa` | `[adres], Warszawa` |
| ✅ nie | adres bez prefiksu | `Marszałkowska 12/34, 00-950` | `[adres], [kod]` |
| 🔴 TAK | nazwisko osoby fizycznej | `faktura dla Jana Kowalskiego` | `faktura dla Jana Kowalskiego` |
| ✅ nie | numer konta 26 cyfr ciągiem | `konto 61109010140000071219812874` | `konto [konto]` |

## Jak czytać

Helper maskowania wychwytuje wiele typowych identyfikatorów
(NIP także z separatorami, IBAN z literami, e-mail, telefon, PESEL, adres).
Pozostały tekst pokazuje ograniczenia regexów: nie są one gwarancją
anonimizacji dowolnych nazwisk i opisów.

**Granica wysyłki FLO została zmieniona:** `generateCopy` przyjmuje w `hints`
wyłącznie kody ze stałego słownika `FLO_HINTS`. Wolny tekst, także nazwiska
nierozpoznane przez regex, jest odrzucany przed budową promptu. Model dostaje
nazwy placeholderów wyłącznie z szablonu; wartości pozostają lokalnie.

Tabela mierzy skuteczność pomocniczych regexów, NIE potwierdza transferu
pozostałego tekstu do modelu. Granicę wysyłki testuje osobno
`tests/unit/flo-privacy.test.ts` na rzeczywistym `generateCopy` z atrapą modelu.
