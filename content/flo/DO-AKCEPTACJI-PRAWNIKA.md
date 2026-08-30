# Teksty do akceptacji prawnika

Lista tekstów agenta, które dotykają obszarów regulowanych. Żaden z nich nie
może trafić do klienta bez potwierdzenia brzmienia.

Powód wspólny: doradztwo podatkowe jest zawodem regulowanym, a agent działa
w produkcie kierowanym do osób bez księgowej pod ręką. Zdanie, które dla nas
jest informacją, dla klienta bywa poradą.

## Do akceptacji

| Plik | Rodzaj | Ryzyko |
|---|---|---|
| `tax.deadline.md` | T-01 termin podatkowy | podanie kwoty do zapłaty przy deklaracji |
| `tax.limit.md` | T-02 limity | prognoza przekroczenia progu i jej skutki |
| `tax.relief.md` | T-03 ulgi | sugestia, że ulga przysługuje |
| `tax.setaside.md` | T-05 odkładanie na podatek | kwota do odłożenia brana za wyliczenie podatku |
| `tax.simulate.md` | T-04 symulacja formy | ZABLOKOWANE — porównanie form opodatkowania |
| `payment.interest.md` | K-05 odsetki | wyliczenie odsetek ustawowych i podstawa prawna |
| `payment.chase.md` (ton `:demand`) | K-02 wezwanie | zapowiedź drogi sądowej |
| `contractor.foreign.md` | P-09 zagranica | stawka VAT przy transakcji wewnątrzwspólnotowej |
| `contractor.check.md` | P-08 biała lista | wpływ statusu kontrahenta na odliczenie VAT |

## Pytania do prawnika

1. Czy zdanie „to nie jest deklaracja podatkowa” wystarczy jako zastrzeżenie
   przy podawaniu kwoty z wyliczenia, czy potrzebna jest pełniejsza formuła?
2. Czy przy T-03 sformułowanie „może kwalifikować się do” jest bezpieczne,
   czy trzeba wprost napisać, że agent nie ocenia prawa do ulgi?
3. Czy ton `:demand` przy ponagleniu (zapowiedź postępowania sądowego) może
   pochodzić od nas jako narzędzia, skoro nadawcą jest klient?
4. Czy przy odsetkach wolno podać konkretną stawkę i podstawę, czy należy
   ograniczyć się do wskazania, że odsetki przysługują?
5. Czy wyliczenie „odłóż tyle na podatek” wymaga zastrzeżenia, że nie
   uwzględnia składki zdrowotnej i ulg?

## Zasada do czasu odpowiedzi

Do momentu akceptacji obowiązuje brzmienie z plików w tym katalogu, a funkcja
T-04 pozostaje wyłączona. Zmiana któregokolwiek z tych tekstów bez ponownej
akceptacji jest cofnięciem decyzji, której nie podejmował tor interfejsu.
