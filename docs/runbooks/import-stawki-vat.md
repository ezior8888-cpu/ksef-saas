# Stawki VAT faktur z importu historii KSeF (W9)

Plan „zero zgubionych faktur”, sesja C5a. Kod: `lib/xml/fa3-p12.ts` (jedno
odwzorowanie), `lib/import/fa3-parser.ts` (import), `lib/exports/jpk-fa-generator.ts`
(`JpkDocumentNotSupportedError`), `lib/exports/jpk-fa-readiness.ts` (paczka Co-Pilot).

## Co import zapisuje jako stawkę pozycji

| P_12 w pliku FA(3) | `invoice_line_items.vat_rate` | JPK |
|---|---|---|
| `23`, `8`, `5`, `zw`, `oo` | to samo | wykazuje |
| `0 KR` | `0` | wykazuje (P_13_6 / K_13) |
| `np I` | `np` | wykazuje (P_13_5 / K_11) |
| `np II` | `np_ii` | wykazuje (P_13_5 + P_18 / K_11 + K_12) |
| `0 WDT`, `0 EX`, `22`, `7`, `4`, `3` | **ten sam kod, dosłownie** | **odmawia** z numerem faktury |
| brak P_12 | stawka z nagłówka, gdy jednoznaczna (jedna niezerowa suma; 23/22 i 8/7 z proporcji podatku; bez sum przy `P_19 = 1` — `zw`) | jak wyżej |
| brak P_12 bez jednoznacznej sumy, kod spoza FA(3) | `nieznana` | **odmawia** z numerem faktury |
| gołe `0` / `np` (pliki FA(2)) | wariant z jedynej niezerowej sumy rodziny (P_13_6_1/2/3, P_13_8/9), inaczej `nieznana` | jak wyżej |

Dlaczego dosłownie, a nie „0” albo „23”: WDT i eksport mają w JPK_V7M własne
pola (K_21, K_22), a „22” → „23” zmieniłoby wyliczony podatek. Lepiej, żeby
plik nie powstał, niż żeby sprzedaż trafiła do złego pola albo wypadła.

Zaimportowane **korekty, zaliczki i ROZ** import zapisuje jako zwykłe
(`invoice_kind = regular`, rodzaj z pliku w `invoice_type`), bo nie zna ich
powiązań. JPK też ich odmawia z numerem dokumentu.

## Co widzi klient

- **Import:** pierwsze ostrzeżenie w raporcie — numer faktury, numer KSeF,
  kod stawki i miesiąc, za który JPK nie powstanie w FaktFlow. Faktura jest
  zapisana i liczy się do KPiR i CSV.
- **Eksport JPK_FA / JPK_V7M:** zadanie kończy się od razu (bez ponowień)
  powodem „JPK wstrzymany: faktura … ma stawkę VAT „0 WDT” (…) … przygotuj JPK
  za ten okres z księgową (KPiR i CSV działają)”. Portal księgowej: 422 z tym
  samym tekstem.
- **Paczka Co-Pilot:** zamiast JPK_FA dostaje CSV (jak przy korekcie w okresie).
- **Karta faktury:** stawka z opisem, np. „0 WDT (wewnątrzwspólnotowa dostawa
  towarów, 0%)”.

## Co robi operator

1. Lista dokumentów: `./scripts/ops/kontrola-faktur-ksef.sh`, sekcja 8.
2. **Nie przepisujesz stawek faktur przyjętych w KSeF** — to treść
   wystawionego dokumentu (00119/00132), a stawka FaktFlow nie wyraża WDT ani
   eksportu.
3. Klientowi: JPK za ten okres przygotowuje księgowa (z KPiR/CSV FaktFlow i
   faktur w KSeF). Wiersze ze **starym surowym kodem** (`0 KR`, `np I`,
   `np II` — import sprzed W9) to co innego: da się je znormalizować migracją
   z licznikiem, **za zgodą Bartosza** (na produkcji 05.10.2026: 0 takich
   wierszy, 0 faktur z importu).
4. Rozszerzenie stawek FaktFlow o WDT / eksport (z polami K_21 / K_22) zwolni
   te dokumenty — osobna sesja (ustalenie W9-g w dzienniku planu).

## Czego ta sesja nie zmienia

Data sprzedaży (P_6) i adnotacje (MPP, metoda kasowa, podstawa zwolnienia)
z pliku dalej giną przy imporcie — **C5b**, warunek zapisu oryginału z KSeF
po decyzji klienta (D-A4-1b-3, PR C).
