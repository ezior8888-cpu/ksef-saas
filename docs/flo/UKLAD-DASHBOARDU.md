# Układ dashboardu po przebudowie — mapa dla obu torów

**Data:** 30 sierpnia 2026
**Napisał:** tor silnika (Bartosz)
**Dla kogo:** Masło i każdy model AI, który siada do `components/flo/*`,
`app/(dashboard)/flo/*` albo `app/(dashboard)/dashboard/_components/flo-*`.

---

## Po co ta zmiana

Plan budowy agenta FLO powstał na podstawie **zdjęcia prototypu**, nie stanu
aplikacji. Oba pliki planu mówią w wielu miejscach „układ z makiety”, „blok
z makiety”, „wygląda jak makieta” — i milcząco zakładają, że interfejs już tak
wygląda. **Nie wyglądał.** Do 29 sierpnia 2026 panel był ciemny (`#0d1117`),
akcent zielony (`#34d399`), a dashboard to były cztery karty KPI, podsumowanie
VAT i wykres — jednokolumnowo, bez miejsca na agenta.

Tor B miał więc kroki opisane słowami „jak w makiecie” i nie miał czego
dopasować. Ta przebudowa zdejmuje tę przeszkodę: stawia **ramę** z prototypu
i zostawia w niej **puste, otypowane gniazda** na to, co należy do toru B.

Nic z kroków 3–16 planu Masła nie zostało zrobione za niego.

---

## Co się zmieniło

| Obszar | Było | Jest |
|---|---|---|
| Motyw domyślny | ciemny (klasa `dark` zaszyta w `app/layout.tsx`) | **jasny**; ciemny pod przełącznikiem w nagłówku |
| Akcent panelu | emerald `#34d399` | **niebieski `#2563eb`** |
| Paleta jasna | nadpisywała ~25 z 94 tokenów — karty i tekst zostawały ciemne, czyli motyw jasny był **realnie zepsuty** | pełny komplet tokenów w bazie `.ff-dashboard`; ciemny to nadpisanie w `html.dark .ff-dashboard` |
| Dashboard | 4 karty KPI + podsumowanie VAT + wykres SVG, jedna kolumna | **kolumna agenta + prawa szyna z liczbami miesiąca** |
| Podsumowanie VAT i wykres | na dashboardzie | przeniesione na `/przeplywy` |
| Tytuł strony | `<h1>` w treści | dla `/dashboard` w pasku nagłówka; inne trasy bez zmian |

---

## Kto czego dotyka

Mapa własności z części IV.2 planu obowiązuje dalej, z **jedną zmianą**:

- **`app/globals.css` przechodzi do Bartosza.** Motywu nie da się odwrócić bez
  tego pliku. Zmiana jest jawna, opisana tutaj, w `DZIENNIK-BARTOSZ.md`
  i w części VIII planu Masła.
- **`lib/dashboard-nav-config.ts` dalej należy do Masła i NIE BYŁ RUSZANY.**
  Nawigacja już jest 1:1 z prototypem. Pozycja „FLO” to nadal jego krok 2.

Nadal wyłącznie Masła, nietknięte: `components/flo/*`, `app/(dashboard)/flo/*`,
`app/(dashboard)/settings/flo/*`, `content/flo/*`, `e2e/flo-*.spec.ts`,
`docs/flo/DZIENNIK-MASLO.md`.

---

## Dashboard JEST ekranem agenta

**Decyzja właściciela produktu z 30.08.2026, po południu.** Agent nie ma
osobnego ekranu — mieszka w dashboardzie, dokładnie jak na sierpniowej
makiecie. Wcześniej tego samego dnia było inaczej (dashboard pokazywał skrót,
pełny wątek stał na `/flo`); ten akapit jest nadrzędny.

| Trasa | Co się dzieje |
|---|---|
| `/dashboard` | wątek agenta w głównej kolumnie, prawa szyna: liczby miesiąca → „Zatwierdzone — czeka na wykonanie" → „Co Flo zrobił" |
| `/flo` | **przekierowanie na `/dashboard`**, z zachowaniem parametrów zapytania |

`/flo` NIE zostało skasowane i nie wolno go kasować bez przejścia po
wszystkich odsyłaczach. Prowadzi tam osiem miejsc w kodzie: `actionUrls`
powiadomień push (`/flo#<id>`, `/flo?undo=<id>`), ścieżka paragonu
(`app/share-target/route.ts` → `/flo?paragon=`), cztery `revalidatePath('/flo')`
w akcjach serwerowych i stare zakładki. **Parametry zapytania muszą przeżyć
przekierowanie** — `?undo=` uruchamia cofnięcie, `?paragon=` pokazuje pasek
przetwarzania zdjęcia; zgubienie ich zamienia działającą ścieżkę w pustą
stronę bez śladu błędu.

Pozycja „Flo" zniknęła z menu: dashboard jest tym ekranem, a druga pozycja
prowadziłaby do tego samego miejsca przez przekierowanie.

### Kto czym jest w tej kompozycji

`app/(dashboard)/dashboard/page.tsx` (Bartosz) pobiera dane i składa ekran.
Nie zna wnętrza wątku. Renderuje `FloScreen` (Masło) i wstrzykuje kartę
z liczbami miesiąca przez **gniazdo `aside`** — prop dodany do `FloScreen`
30.08.2026, zmiana przez DODANIE, bez propa ekran zachowuje się jak wcześniej.

Nagłówek agenta jest wyłączony (`showHeader={false}`): panel ma własny pasek
tytułu, a dwa nagłówki jeden nad drugim to szum.

Pięć komponentów przeniesionych z `app/(dashboard)/flo/_components/` do
`components/flo/` (`flo-screen`, `flo-header`, `flo-composer`,
`flo-history-panel`, `flo-photo-banner`) — czyste `git mv`, zero zmian
w logice. Powód: były prywatne dla trasy, która stała się przekierowaniem.

`dashboard/_components/flo-card.tsx` (skrót agenta) **nie jest już nigdzie
montowany** — dashboard pokazuje pełny wątek. Plik zostaje, bo należy do
Masła i to jego decyzja, czy go skasować.

### Odporność na awarię silnika

Odczyt agenta (`listProposals` + `listScheduled`) jest w `try/catch`, a nie
za samą granicą błędu. Powód sprawdzony na żywo: pobranie dzieje się na
poziomie strony, więc rzucony wyjątek przewraca cały render, **zanim granica
zdąży się zamontować** — brak tabel FLO w bazie deweloperskiej wygasił w ten
sposób cały dashboard razem z liczbami miesiąca.

Przy awarii zwracamy `ok: false`, a NIE pustą listę. Pusta lista znaczy „nie
masz nic do zrobienia" i byłaby kłamstwem w chwili, gdy agent nie odpowiada —
cisza jest stanem zabronionym (własność W5).

`components/dashboard/section-error-boundary.tsx` zostaje jako druga warstwa,
na błędy powstające przy renderze.

Motyw: cały interfejs agenta stoi na tokenach `--ff-*`, bez ani jednego
zaszytego koloru i bez wariantów `dark:` (sprawdzone plik po pliku).
Biały motyw obejmuje go bez pracy po stronie toru B.

## Czego z makiety NIE WOLNO przepisać

Zdjęcie prototypu jest starsze niż część ustaleń i niesie trzy rzeczy, które
zostały **odrzucone**. Model AI kopiujący makietę „bo tak wygląda” wprowadzi
je z powrotem.

1. **Znacznik „TRYB 3”.** Poziomy autonomii zostały odrzucone przez właściciela
   produktu — część II.3 obu planów. Każdy klient dostaje identyczne zachowanie
   agenta. Żadnych trybów, poziomów, suwaka „jak bardzo samodzielny”.
2. **Podpis „Pracuje sam · informuje”.** To jest ta sama koncepcja innymi
   słowami. Zamiast tego: co agent robi, po ludzku — „Robi sam to, co da się
   cofnąć. Pyta przed każdą wysyłką.”
3. **„1 zadania dziś”.** Błąd odmiany przez liczebnik. Liczniki idą przez
   `countLabel(n, FLO_FORMS.zadanie)` z `components/flo/format.ts`, nigdy
   przez sklejanie napisu z liczbą.

Do tego jedna zmiana nazwy: panel z makiety **„CO FLO ZROBI DALEJ” nazywa się
„Zatwierdzone — czeka na wykonanie”**. Trafia tam wyłącznie to, na co człowiek
już kliknął, a każda pozycja niesie ślad tego kliknięcia (`approvedAtLabel`).
Przy pierwszej reklamacji „ja tego nie wysyłałem” to jest jedyny dowód, jaki
klient zobaczy. Przycisk „Wstrzymaj” jest hamulcem na coś, na co klient się
już zgodził — **nigdy mechanizmem zgody**.

---

## Odstępstwa od makiety po stronie ramy

- **Baner „Organizacja niezweryfikowana” został w layoucie**, nad obiema
  kolumnami, zamiast w prawej szynie. Powód: pilnuje WSZYSTKICH stron panelu,
  a w szynie zniknąłby z faktur, wydatków i skrzynki.
- **Wykres sprzedaży i podsumowanie VAT są na `/przeplywy`**, nie pod agentem.
  Dashboard przestał być zestawieniem.
- **Pozycja „Flo” w menu jest** — dodał ją Masło w swoim kroku 2, w swoim
  pliku `lib/dashboard-nav-config.ts`. Tor silnika tego pliku nie dotykał.

---

## Naprawa, która wyszła przy okazji

Stary dashboard filtrował faktury po `direction = 'issued'`. Kolumna
`invoices.direction` dopuszcza **wyłącznie `'outgoing' | 'incoming'`**
(`00001_initial_schema.sql:54`; migracja `00044_phase21_performance.sql:18`
ostrzega o tym wprost). Wszystkie cztery karty KPI pokazywały więc **zero**,
niezależnie od tego, ile faktur miał klient.

Nowe liczby idą przez `lib/dashboard/monthly-figures.ts` z poprawnym
`'outgoing'` i jawnym `tenantId` z `getPageContext()`.

**Ten sam błąd siedzi w dziewięciu innych plikach** (`lib/exports/*`,
`lib/admin/metrics.ts`, `lib/observability/business-metrics.ts`,
`lib/ksef/history-fetcher.ts` i dalej) — nie był w zakresie tej roboty
i czeka jako osobne zadanie.

---

## Gdzie co leży teraz

```
app/globals.css                              paleta (Bartosz od 30.08.2026)
lib/theme/theme.ts                           domyślny motyw = jasny
lib/dashboard-page-title.ts                  tytuł strony w pasku nagłówka
lib/dashboard/monthly-figures.ts             liczby miesiąca + seria wykresu
app/(dashboard)/layout.tsx                   shell: sidebar, nagłówek, banery
app/(dashboard)/_components/
  dashboard-page-heading.tsx                 tytuł w nagłówku
  dashboard-verification-banner.tsx          baner braku certyfikatu
app/(dashboard)/dashboard/page.tsx           RAMA: karta agenta + szyna
components/dashboard/vat-summary-card.tsx    przeniesione na /przeplywy
components/dashboard/sales-chart-card.tsx    przeniesione na /przeplywy

--- poniżej wszystko należy do Masła ---
app/(dashboard)/dashboard/_components/flo-card.tsx
app/(dashboard)/flo/                         ekran agenta z makiety
app/(dashboard)/settings/flo/                ustawienia agenta
components/flo/                              karty, warianty, podglądy
content/flo/                                 treści 32 rodzajów spraw
lib/i18n/plural.ts                           odmiana przez liczebnik
e2e/tests/flo-*.spec.ts                      testy przeglądarkowe
```
