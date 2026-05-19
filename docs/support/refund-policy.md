# Polityka zwrotów — wewnętrzna (Faza 30)

Wewnętrzny przewodnik obsługi zwrotów. Wiążąca wersja dla klienta jest
w regulaminie (`/legal/regulamin`) — ten dokument to instrukcja dla zespołu.

> Uwaga: ostateczne brzmienie polityki zwrotów ustala prawnik w Fazie 38
> (Legal Documents). Do tego czasu obowiązują poniższe zasady robocze.

## Zasady robocze

### Okres próbny

W trakcie trialu user nie płaci — nie ma czego zwracać. Jeśli płatność
ruszyła mimo trialu (błąd) — pełny zwrot, bezzwłocznie.

### Gwarancja satysfakcji

Marketing komunikuje gwarancję zwrotu (Faza 19 — „60-day money-back").
W praktyce: jeśli klient prosi o zwrot w rozsądnym czasie po pierwszej
płatności i nie wykorzystał intensywnie produktu — **zwracamy bez
przepytywania**. Koszt utrzymania dobrej opinii > koszt jednego abonamentu.

### Po dłuższym czasie

Zwroty za okresy już wykorzystane (np. „chcę zwrot za pół roku") —
co do zasady nie. Wyjątek: udokumentowana awaria po naszej stronie, która
uniemożliwiła korzystanie z produktu.

### Awaria po naszej stronie

Jeśli FaktFlow nie działał z naszej winy przez dłuższy czas (nie KSeF, nie
Vercel — nasz bug) — proporcjonalny zwrot lub przedłużenie subskrypcji,
do uzgodnienia z klientem.

## Jak wykonać zwrot

1. Zwroty wykonujemy w panelu admin (`/admin` → user → „Wystaw refund").
   Refund idzie przez Stripe.
2. Zwrot pełny — `stripe.refunds.create`. Partial obecnie nie obsługujemy
   w MVP (Faza 25 decyzja) — przy potrzebie zwrotu częściowego zrób to
   ręcznie w panelu Stripe.
3. Po zwrocie wyślij klientowi krótki mail z potwierdzeniem (FaktFlow
   wysyła `RefundIssued` automatycznie — sprawdź, czy doszło).

## Czego nie robimy

- Nie przeciągamy decyzji „muszę zapytać" — przy kwotach abonamentu
  decyzję podejmuje osoba obsługująca od ręki.
- Nie żądamy uzasadnienia zwrotu w okresie gwarancji.
- Nie blokujemy konta za poproszenie o zwrot.
