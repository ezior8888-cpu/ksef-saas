# Plan wdrożenia szablonu Finora w FaktFlow

> **„Kontynuuj plan Finora”** — sesja czyta ten plik od góry, robi checklistę
> startową (sekcja 0) i pracuje od wiersza „Następny krok” w dzienniku
> (sekcja 12). Po każdym etapie dopisuje wiersz w dzienniku i aktualizuje
> „Następny krok”. Ten plik jest jedynym źródłem prawdy o przenosinach na
> Finorę.

Audyt: 17.10.2026, sesja lokalna z przeglądarką (każda strona demo Finory
otwarta i spisana) + odczyt kodu `main` @ `1ded2147`.

---

## 0. Start sesji — checklista

1. `git fetch origin && git log --oneline -1 origin/main`. Gałąź etapu zawsze
   od świeżego `origin/main`: `claude/finora-eN-<temat>`.
2. **Kod Finory.** Szablon jest płatny (79 $, shadcn/studio, licencja
   pozwala na płatny SaaS i open source jako część produktu, NIE pozwala
   udostępniać samego szablonu osobno). Bartosz trzyma go w PRYWATNYM repo
   (krok 0.1). Sesja klonuje je obok, NIGDY do katalogu repo aplikacji:
   `gh repo clone <właściciel>/faktflow-finora-src ../finora-src`.
   Brak dostępu = STOP i prośba do Bartosza. Bez kodu nie zgadujemy wyglądu
   ze zrzutów.
3. Demo do porównań (zawsze dostępne):
   `https://shadcn-nextjs-finora-app-template.vercel.app` (np. `/dashboard/finance`).
4. Budżet chmury: **103 $ kredytów**. Po każdym etapie wpisz w dziennik
   szacunek zużycia. Gdy zostaje < 12 $, nie zaczynaj nowego etapu — dokończ
   bieżący, wypchnij, zapisz „Następny krok” i stop. Dalej jadą sesje lokalne.
5. Sesja w chmurze NIE ma `.agents/infra.env` ani SSH: **nie wgrywa migracji
   i nie wdraża**. W opisie PR pisze „Do wgrania: 00NNN, przed wdrożeniem”.
   Numer migracji z rejestru w `docs/koordynacja/CLAUDE-DO-CODEXA.md`
   (wiersz „następny wolny”; 17.10 było to **00151**) — w tym samym PR
   dopisz wiersz do rejestru.
6. Przed każdym PR: `pnpm run ci && pnpm build`. Scalanie i wdrożenie robi
   Bartosz (AGENTS.md, „Scalanie PR”).

### 0.1. Krok 0 dla Bartosza (jednorazowo, przed pierwszą sesją)

1. Kup Finorę (79 $): `https://shadcnstudio.com/templates/admin-dashboard/finora`.
2. Utwórz prywatne repo `faktflow-finora-src`, wrzuć rozpakowany szablon
   bez zmian, nadaj dostęp kontu, na którym działa sesja w chmurze.
3. Wpisz właściciela repo w punkt 2 checklisty wyżej.

---

## 1. Decyzje, które już zapadły (nie otwieraj ich ponownie)

| # | Decyzja |
|---|---|
| D1 | Jedyny szablon to **Finora**. NexaCRM porzucona — nie bierz z niej niczego. |
| D2 | Kolorystyka: **jasny motyw, niebieski akcent** — gotowy wariant z panelu personalizacji Finory (zrzut od Bartosza: niebieskie słupki, białe karty, biały pasek boczny). Ciemny motyw zostaje jako drugi. Panelu personalizacji klient NIE dostaje. |
| D3 | Układ stron bierzemy z Finory **prawie bez zmian**. Zmieniamy treść, dane i podpisy, nie siatkę. Każdy dolar za szablon ma pracować. |
| D4 | **FLO**: miejsce i forma przyjdą z projektu Claude Design. Do tego czasu obecne komponenty FLO stoją w wyznaczonym slocie u góry pulpitu bez zmian. `components/flo/*`, `app/(dashboard)/flo/*`, `content/flo/*` należą do Masła — NIE edytuj ich. `lib/flo/*` należy do toru silnika — też nie. |
| D5 | Strona sprzedażowa (landing) — poza zakresem. |
| D6 | Nowe funkcje podpatrzone u konkurencji, które pasują do ekranów Finory, robimy (sekcja 8). Bez kombinowania: najprostsza poprawna wersja. |

---

## 2. Audyt aplikacji — fakty z kodu (stan `main` 17.10.2026)

### 2.1. Stos i zgodność z Finorą

| | FaktFlow | Finora (strona produktu) |
|---|---|---|
| Framework | Next.js 16.3, App Router, React 19.2 | Next.js 16 App Router |
| UI | shadcn/ui, styl `radix-nova`, pakiet `radix-ui`, Tailwind v4 | shadcn/ui + Tailwind v4 |
| Formularze | React Hook Form + Zod | React Hook Form + Zod |
| Motywy | `next-themes`, jasny/ciemny | jasny/ciemny/systemowy |
| Wykresy | **brak biblioteki** — wykres sprzedaży to ręczny SVG (`components/dashboard/sales-chart-card.tsx`) | wykresy shadcn (sprawdź w `../finora-src`: najpewniej `recharts` + `components/ui/chart.tsx`) |
| Ikony | `lucide-react`, ale menu używa nazw Material Symbols (`'description'`, `'receipt_long'` w `lib/dashboard-nav-config.ts`) | sprawdź w kodzie (lucide albo tabler) |
| Komponenty `components/ui` | 19 (badge, button, card, checkbox, dialog, dropdown-menu, empty-state, input, label, select, separator, sheet, skeleton, sonner, table, tabs, textarea, tooltip, drawn-video) | znacznie więcej (sidebar, chart, command, avatar, progress, popover, calendar…) |
| Motyw | `app/globals.css` — 1642 linie, własne tokeny `--ff-*`, efekty „glass” (`components/glass-card.tsx`) | zmienne shadcn + presety |

**Wniosek:** przenosimy kod, nie odtwarzamy go. Zależności Finory (wykresy,
`cmdk`, ikony, `date-fns`, `react-day-picker` itd.) **dodajemy bez dyskusji** —
to nie są „inne biblioteki UI” w rozumieniu AGENTS.md, tylko części shadcn.

**Pułapka stylu:** jeśli `../finora-src/components.json` ma inny `style` niż
nasz `radix-nova`, bierzemy komponenty `components/ui/*` Finory w całości
(nadpisujemy nasze 19) — inaczej przyciski i karty rozjadą się o piksele.
Sprawdź, czy nadpisany komponent nie zmienia API używanego w naszym kodzie
(`pnpm typecheck` to złapie).

### 2.2. Obecne trasy i to, co na nich stoi

| Trasa | Co jest | Logika, którą zostawiamy |
|---|---|---|
| `/dashboard` | ekran FLO (`components/flo/flo-screen`, `flo-composer`, `scheduled-panel`, `flo-welcome`) + `MonthlyFiguresCard` | `lib/dashboard/monthly-figures.ts` (`getMonthlyFigures`, `getSalesSeries`) |
| `/przeplywy` | `MonthlyFiguresCard`, `SalesChartCard`, `VatSummaryCard`, `CashFlowDashboard` (z szacunkiem podatku) | `lib/dashboard/monthly-figures.ts`, `lib/dashboard/tax-estimate.ts` (`estimateIncomeTaxThisYear`), `lib/accounting/read-complete-pages.ts`, `lib/invoices/settled-advances.ts`, `lib/exports/currency-guard.ts`, `lib/expenses/ksef-currency-review.ts`, `lib/expenses/ksef-environment.ts`, `lib/ksef/claim-environment.ts` |
| `/invoices` | lista | `lib/invoices/list-query.ts`, `components/invoices/batch-pdf-download`, `invoice-row-types` |
| `/invoices/[id]` | szczegóły | `components/invoices/invoice-detail-view` + polityki KSeF (`ksef-send-policy`, duplikaty, ponowienia) |
| `/invoices/new` (+ `regular`, `advance`, `correction`, `final`) | formularze | `components/invoices/invoice-type-selector` i formularze w `components/invoices/*` |
| `/payments/overdue` | przeterminowane + przypomnienia | `components/reminders/overdue-dashboard`, `lib/reminders/*`, `lib/invoices/amount-due.ts` |
| `/inbox` | faktury kosztowe z KSeF | `components/dashboard/responsive-table` |
| `/expenses`, `/expenses/[id]` | wydatki | `components/expenses/expenses-list`, `capture-button`, `lib/expenses/month.ts` |
| `/contractors` | kontrahenci | `responsive-table`, `bulk-validate-button`, `vat-status-badge`, `contractor-reminder-toggle`, `contractor-row-actions` |
| `/reports`, `/reports/kpir`, `/reports/exports` | raporty | `components/expenses/kpir-view`, `lib/exports/*` |
| `/import-danych` | import | `lib/import/*` |
| `/settings/*` | account, accountant, audit, billing, flo, ksef, notifications, reminders, security, team + strona główna (profil firmy, zwolnienie z VAT, metoda kasowa, usunięcie konta) | formularze w `components/settings/*` |
| `/flo`, `/flo/wrapped` | `/flo` przekierowuje na `/dashboard`; podsumowanie roku | **nie ruszać** (D4) |
| `(auth)` | login, rejestracja, reset hasła, MFA | akcje w `app/(auth)/*/actions.ts` |

Menu: `lib/dashboard-nav-config.ts` (sekcje „Dane”, „Księgowość”, dolny
pasek na telefonie: Flo / Faktury / Nowa / Miesiąc / Więcej). Szkielet:
`app/(dashboard)/layout.tsx` (`Sidebar`, `BottomNav`, `DashboardOrgHeader`,
`ThemeToggle`, `KsefHealthBanner`, `DashboardVerificationBannerSlot`,
`WelcomeModal`, `IdleWatcher`, `InstallPrompt`, `SupportWidget`).

### 2.3. Dane, z których zasilamy wykresy (schemat z `types/database.ts`)

| Źródło | Kolumny, które nas interesują |
|---|---|
| `invoices` | `direction` (**`'outgoing'` = sprzedaż, `'incoming'` = koszt z KSeF**), `invoice_kind`, `invoice_type`, `issue_date`, `sale_date`, `payment_due_date`, `days_to_payment`, `net_total`, `vat_total`, `gross_total`, `currency`, `paid_amount`, `paid_at`, `payment_status` (`unpaid`/`partial`/`paid`/`overdue`), `ksef_status`, `ksef_number`, `ksef_environment`, `ksef_accepted_at`, `buyer_nip`, `buyer_data`, `seller_nip`, `seller_data`, `internal_number`, `parent_invoice_id`, `reminders_paused`, `origin` |
| `invoice_line_items` | `invoice_id`, `name`, `quantity`, `unit`, `unit_price_net`, `net_amount`, `vat_rate`, `vat_amount`, `gross_amount`, `kpir_category` |
| `products` | `name`, `unit`, `default_price_net`, `default_vat_rate`, `gtu_code`, `category`, `use_count`, `last_used_at` |
| `contractors` | `name`, `nip`, `email`, `phone`, `vat_status`, **`payment_terms_days_avg`**, **`late_payment_count`**, `last_used_at`, `reminder_excluded` |
| `expenses` | `issue_date`, `seller_name`, `seller_nip`, `document_type`, `document_number`, `net_amount`, `vat_amount`, `gross_amount`, `vat_deductible_amount`, `category_label`, `kpir_column`, `is_reviewed`, `is_deductible`, `source` (`ocr_photo`/`ksef_inbox`/`manual`/`import`), `ksef_invoice_id` |
| `payments` | `invoice_id`, `amount`, `payment_date`, `payment_method`, `bank_payer_name`, `bank_payer_account`, `bank_import_id`, `is_auto_matched`, `match_confidence`, `match_method`, `is_confirmed` |
| `payment_imports` | **gotowy schemat pod wyciągi bankowe, bez interfejsu**: `account_iban`, `bank_name`, `booking_date`, `transaction_date`, `amount`, `currency`, `counterparty_name`, `counterparty_account`, `counterparty_nip`, `title`, `is_matched`, `matched_payment_id`, `ignored`, `provider` |
| `payment_reminders` | `invoice_id`, `stage` (`stage_1`–`stage_4`), `channel` (`email`/`sms`/`both`), `status` (`pending`/`sent`/`failed`/`cancelled`), `scheduled_for`, `sent_at`, `opened_at`, `clicked_at`, `days_overdue_at_send` |
| `reminder_settings` | progi etapów, godzina wysyłki, nadawca |
| `kpir_entries` | `entry_date`, `category`, `net_amount`, `vat_amount` |
| widok `invoices_overdue` | `amount_due`, `days_overdue`, `buyer_name`, `buyer_nip`, `payment_due_date`, `reminders_sent_count` |
| mat. widok `mv_tenant_monthly_stats` | `year_month`, `direction`, `invoice_count`, `total_net`, `total_vat`, `total_gross`, `total_paid`, `paid_count`, `unpaid_count`, `accepted_count`, `rejected_count` |
| mat. widok `mv_tenant_dashboard_summary` | `current_month_count/gross/net/vat/accepted`, `prev_month_count`, `unpaid_amount`, `unpaid_count` |

### 2.4. Zasady liczenia — ŁAMANIE ICH TO BŁĄD KRYTYCZNY

1. **Kierunek:** `direction` ma tylko `'outgoing'` i `'incoming'`. Nigdy
   `'issued'` (ten błąd zerował kiedyś wszystkie kafelki pulpitu).
2. **Proweniencja:** kwoty sprzedaży i VAT liczymy WYŁĄCZNIE z faktur
   przyjętych w aktywnym środowisku KSeF — tak jak robią to
   `getMonthlyFigures`/`getSalesSeries` i strona `/przeplywy`. Szkice mają
   osobny licznik. Nowe agregaty składaj z tych funkcji albo z ich filtrów
   1:1 — nie pisz „gołego” `sum(gross_total)`.
3. **Widoki `mv_*`:** zanim użyjesz, sprawdź w migracji, czy filtrują tak
   samo jak `getSalesSeries` (środowisko, status KSeF, zaliczki). Jeśli nie —
   używaj funkcji, nie widoków.
4. **Zaliczki i faktury końcowe:** `lib/invoices/settled-advances.ts` —
   faktura końcowa nie dubluje sprzedaży zaliczki.
5. **Korekty:** `lib/invoices/correction-amount-change.ts` — korekta zmienia
   kwotę o różnicę, nie dodaje drugiej faktury.
6. **Waluty:** `lib/exports/currency-guard.ts` i
   `lib/expenses/ksef-currency-review.ts` — nie sumuj EUR z PLN.
7. **Paginacja:** sumy po wielu wierszach zawsze przez
   `lib/accounting/read-complete-pages.ts`. PostgREST ucina wynik po 1000
   wierszy — „goły” select da za małą sumę bez żadnego błędu.
8. **Kwota do zapłaty:** `lib/invoices/amount-due.ts` (uwzględnia częściowe
   wpłaty).
9. **RLS:** strony i akcje używają klienta z sesji (`lib/supabase/server.ts`),
   nie `service_role`.
10. **Daty i liczby:** `lib/format/pl.ts`, `lib/format/warsaw-date.ts`,
    `lib/i18n/plural.ts`. Miesiąc liczony w strefie `Europe/Warsaw`.

Każda nowa funkcja agregująca dostaje test Vitest z danymi brzegowymi:
korekta, zaliczka z fakturą końcową, faktura w EUR, szkic, faktura
z innego środowiska KSeF, > 1000 wierszy (protokół napraw, AGENTS.md pkt 2).

---

## 3. Audyt Finory — strona po stronie (co jest w demo)

Werdykty: **BIERZEMY** = strona wchodzi prawie 1:1; **CZĘŚCIOWO** = bierzemy
wskazane karty; **ODPADA** = nie wchodzi, ewentualnie pojedynczy komponent.

| Strona Finory | Zawartość (tytuły kart z demo) | Werdykt → u nas |
|---|---|---|
| Szkielet | pasek boczny z grupami, nagłówek: wyszukiwarka „Type to search…”, paleta poleceń, dzwonek, przełącznik motywu, ustawienia/personalizacja, avatar; stopka | **BIERZEMY** (bez panelu personalizacji i bez „Buy Now”) |
| `/dashboard/finance` | Finance (roczny wykres słupkowy, 2 serie), Report (Monthly Avg; Total Profit / Income / Expense; View Report), kafel Total Orders (+22%, „Last 4 months”), kafel Total Profit (−16%, „Last One year”), Total Revenue (mini‑słupki), Impression (linia, +24%), Total visitors (Desktop/Tablet/Mobile), Top Products by Sales, Top Products by Volume, tabela użytkowników (filtry Role/Plan/Status, paginacja) | **BIERZEMY** → Pulpit (P1) |
| `/dashboard/cash-flow` | Cash Flow (Weekly/Monthly/Yearly), Savings goal (pierścień), Received this month, Expense this month, Top Cash Flow Sources, Upcoming Bills, Recent Activity, tabela Counterparty/Category/Amount/Status/Actions z filtrami | **BIERZEMY** → Przepływy (P2) |
| `/dashboard/net-worth` | Net Worth, Assets vs Liabilities, Liquidity Snapshot, Asset Allocation, Top Holdings, Liabilities, Net Worth Growth Rate, Debt Payoff Progress, tabela aktywów | **CZĘŚCIOWO** → 2 karty do Przepływów (P2) |
| `/transactions` | 4 kafle (Money In, Money Out, Net, Recurring), tabela Date/Merchant/Group/Category/Account/Method/Amount/Status/Actions, filtry grup/kategorii/statusów, „+ Add Transaction” | **BIERZEMY** → Wydatki (P8) i Skrzynka KSeF (P9) |
| `/money-management/monthly-analytics` | kafle (Total spent, dzienna średnia, vs poprzedni miesiąc, top kategoria), Spend Trend, Spend by Category, Top Categories, Recent Expenses, Spending Streaks, Income vs Expense, Subscriptions, Daily Spend (kalendarz kropek), wybór miesiąca | **BIERZEMY dwa razy** → Analiza kosztów (P10) i Analiza sprzedaży (P11) |
| `/money-management/budget` | Budget by Category, Budgeted vs Actual, Needs Attention, Upcoming Bills, Total Budget Used, Ideal/Actual Pace, Budget Adherence History | **ODPADA** (mikrofirmy nie budżetują; „Upcoming Bills” mamy z Cash Flow) |
| `/accounts` | kafle (saldo, liczba kont, portfele, zmiana), karty rachunków | **CZĘŚCIOWO, później** → Rachunki bankowe (P12, po imporcie wyciągów) |
| `/cards` | karty płatnicze | **ODPADA** |
| `/investments/*` (equities, F&O, crypto, mutual funds, bonds) | portfele, alokacje, Top Gainers/Losers, holdingi | **ODPADA**; bierzemy 2 komponenty: wykres kołowy alokacji i listy Gainers/Losers → Analiza sprzedaży (P11) |
| `/insurance-premiums`, `/emis` | ubezpieczenia, raty kredytów | **ODPADA** |
| `/invoices/list` | kafle (Clients, Invoices, Paid, Unpaid), tabela #/Status/Client/Total/Issued Date/Due/Balance/Actions, „Show 10”, „Create Invoice”, wyszukiwarka, filtr statusu | **BIERZEMY** → Faktury (P3) |
| `/invoices/view/[id]` | dokument (logo, sprzedawca, Invoice To, Bill To, pozycje Item/Description/Hours/Qty/Total, Salesperson, Subtotal/Discount/Tax/Total, Note) + prawa kolumna: Send Invoice / Download / Print | **BIERZEMY** → Podgląd faktury (P4) |
| `/invoices/create` | formularz wyglądający jak faktura + prawa kolumna Send Invoice / Save | **BIERZEMY wygląd** → Wystaw fakturę (P5) |
| `/invoices/recurring` | tabela ID/Client/Frequency/Next Run/Amount/Status/Actions, „+ New Recurring Invoice” | **BIERZEMY** → Faktury cykliczne (P6, **nowa funkcja**) |
| `/invoices/reminders` | tabela ID/Invoice/Client/Due Date/Remind On/Status/Actions, „+ New Reminder” | **BIERZEMY** → Przypomnienia (P7) |
| `/settings` | zakładki w lewej kolumnie: General, Profile, Security, Notifications, Connected Accounts, Privacy & Data | **BIERZEMY układ** → Ustawienia (P14) |
| `/login`, `/register`, `/forgot-password` | formularz po lewej (Google, Facebook, e‑mail), po prawej animowane tło ze znakami + karta z hasłem | **BIERZEMY** → (auth) (P15) |
| Landing Page | osobny szablon strony sprzedażowej | poza zakresem (D5) |

---

## 4. Docelowa mapa aplikacji

**Zasada: obecne adresy URL zostają** (zakładki, maile z linkami, PWA).
Nowe strony dostają nowe adresy.

```
PULPIT
  Pulpit                     /dashboard              ← Finance        (FLO w slocie, D4)
  Przepływy                  /przeplywy              ← Cash Flow (+2 karty Net Worth)
SPRZEDAŻ
  Faktury                    /invoices               ← Invoice List
  Wystaw fakturę             /invoices/new           ← Create Invoice
  Faktury cykliczne   NOWE   /invoices/recurring     ← Recurring Invoices
  Przypomnienia              /payments/overdue       ← Invoice Reminders
  Kontrahenci                /contractors            ← tabela z Invoice List
KOSZTY
  Wydatki                    /expenses               ← Transactions
  Skrzynka KSeF              /inbox                  ← Transactions
ANALIZY
  Analiza sprzedaży   NOWE   /analizy/sprzedaz       ← Monthly Analytics
  Analiza kosztów     NOWE   /analizy/koszty         ← Monthly Analytics
KSIĘGOWOŚĆ
  KPiR                       /reports/kpir           ← tabela z Transactions
  Eksport                    /reports/exports        ← karty z Settings/Accounts
  Import danych              /import-danych          (styl kart, bez zmian logiki)
BANK (etap późniejszy)
  Rachunki            NOWE   /bank                   ← Accounts
  Operacje bankowe    NOWE   /bank/operacje          ← Transactions
──────
Ustawienia                   /settings/*             ← Settings
```

Telefon: zostaje nasz dolny pasek (`components/dashboard/bottom-nav.tsx`,
pozycje bez zmian: Flo / Faktury / Nowa / Miesiąc / Więcej), przestylowany
tokenami Finory. Pasek boczny Finory na telefonie otwiera się jako szuflada
z „Więcej”.

Nawigację zmieniasz w jednym miejscu: `lib/dashboard-nav-config.ts`
(sekcje + ikony; nazwy Material Symbols zamień na ikony z biblioteki
Finory). `isActiveNavPath` dopisz dla `/analizy/*` i `/bank/*`.

---

## 5. Strona po stronie: karty, podpisy i dane

Konwencja: **[Finora] → [u nas, po polsku] · dane · uwagi**. Pusty stan
każdej karty: komunikat z §7.3, nigdy pusty wykres z osiami.

### P0. Szkielet (każdy ekran)

- Pasek boczny Finory z grupami z §4; logo FaktFlow (`components/brand/brand-wordmark`).
- Nagłówek: przycisk zwijania menu · **paleta poleceń** w miejscu „Type to
  search…” („Szukaj lub przejdź… ⌘K”, §8 N4) · dzwonek (powiadomienia:
  podłącz to, co dziś pokazuje `DashboardOrgHeader`; jeśli nie ma listy
  powiadomień — ukryj dzwonek, nie atrapa) · przełącznik motywu (nasz
  `ThemeToggle`) · avatar z menu: Profil, Ustawienia, Przełącz firmę
  (`components/dashboard/org-switcher.tsx`), Wyloguj (`signOut`).
- Wyrzucamy: panel personalizacji, „Buy Now”, linki stopki do shadcn/studio.
  Stopka: „© FaktFlow · Regulamin · Polityka prywatności · Pomoc”.
- Banery (`KsefHealthBanner`, weryfikacja, brak firmy) zostają nad treścią
  strony, w stylu `Alert` Finory.
- Wszystko z `layout.tsx` (IdleWatcher, InstallPrompt, SupportWidget,
  AnalyticsIdentify, prefetch) zostaje.

### P1. Pulpit `/dashboard` ← Finance

Siatka Finory bez zmian. Slot FLO: pełna szerokość nad siatką, w środku
obecne komponenty FLO bez modyfikacji (D4).

| Karta Finory | U nas | Dane |
|---|---|---|
| Finance („Yearly report overview”, słupki 2 serie) | **Przychody i koszty** · „Ostatnie 12 miesięcy” | sprzedaż netto: `getSalesSeries` (rozszerz okno do 12 mies., nie pisz drugiego zapytania); koszty netto: `expenses.net_amount` po `issue_date` przez `readCompletePages`, z tym samym filtrem środowiska co `/przeplywy` |
| Report („Monthly Avg.”, Total Profit / Income / Expense, „View Report”) | **Ten miesiąc** · „Średnio miesięcznie: X zł” · Zysk / Przychody / Koszty · przycisk **„Zobacz przepływy”** → `/przeplywy` | `getMonthlyFigures` + koszty miesiąca jak wyżej |
| Kafel Total Orders (+22%, „Last 4 months”) | **Faktury w tym miesiącu** · % vs poprzedni · plakietka „Ten miesiąc” | liczba z `getMonthlyFigures` (albo `mv_tenant_dashboard_summary.current_month_count` / `prev_month_count` po sprawdzeniu §2.4 pkt 3) |
| Kafel Total Profit (−16%, „Last One year”) | **Należności** · „X faktur nieopłaconych” | suma `amount-due` z faktur `outgoing` nieopłaconych |
| Total Revenue (mini‑słupki, %) | **Przychód netto** · mini‑słupki 6 mies. · % vs poprzedni | `getSalesSeries` |
| Impression (linia, „Last year”, +24%) | **VAT za miesiąc** · linia 6 mies. | te same liczby co `VatSummaryCard` (należny − naliczony), bez nowej logiki |
| Total visitors (Desktop/Tablet/Mobile + słupki) | **Jak płacą klienci** · „Ostatnie 90 dni” · W terminie / Po terminie / Nieopłacone (%) | `outgoing`, `payment_status` + `paid_at` vs `payment_due_date`; przycisk „Szczegóły” → `/payments/overdue` |
| Top Products by Sales | **Najlepiej sprzedające się** · nazwa, j.m. lub GTU, kwota netto | `invoice_line_items` z faktur `outgoing` z §2.4 pkt 2, `group by name`, 12 mies., top 5 |
| Top Products by Volume (ilość + plakietka %) | **Najwięksi klienci** · nazwa, NIP, kwota netto, plakietka % zmiany | faktury `outgoing` po `buyer_nip`, 12 mies. vs poprzednie 12 |
| Tabela użytkowników (filtry Role/Plan/Status) | **Ostatnie faktury** · Kontrahent / Numer / Brutto / Termin / Płatność / KSeF · filtry „Status płatności”, „Status KSeF”, „Rodzaj” · 5 wierszy + „Wszystkie faktury” | `lib/invoices/list-query.ts` |

`MonthlyFiguresCard` i obecny SVG wykres znikają z pulpitu — ich liczby
pokazują karty wyżej.

### P2. Przepływy `/przeplywy` ← Cash Flow (+ 2 karty z Net Worth)

| Karta Finory | U nas | Dane |
|---|---|---|
| Cash Flow (Weekly/Monthly/Yearly, wpływy/wypływy) | **Wpływy i wydatki** · przełącznik Tydzień / Miesiąc / Rok · nagłówki „Wpłynęło” i „Wydano” | wpływy: `payments.amount` po `payment_date` (gdy brak wierszy — `invoices.paid_amount` po `paid_at`, faktury `outgoing`); wydatki: `expenses.gross_amount` po `issue_date` |
| Savings goal (pierścień 68%, „$6.8k of $10k”) | **Odłóż na podatek** · w środku kwota · podpis „szacunek PIT od 1 stycznia” | `estimateIncomeTaxThisYear` — **już liczone na tej stronie**, przenosimy z `CashFlowDashboard`; pierścień = szacunek / przychód od początku roku. Etykieta zachowuje obecne zastrzeżenie, gdy dane nie obejmują całego roku |
| Received this month (+% vs last month) | **Wpłynęło w tym miesiącu** | jak wpływy wyżej |
| Expense this month | **Wydano w tym miesiącu** | jak wydatki wyżej |
| Top Cash Flow Sources (lista z +/− i paskami) | **Skąd i dokąd płyną pieniądze** · top 5: klienci (+), dostawcy (−) | wpływy po kontrahencie, wydatki po `seller_nip` |
| Upcoming Bills („Next 30 days”, „Due in X days”) | **Nadchodzące płatności** · „Najbliższe 30 dni” · „za X dni” | faktury `incoming` z `payment_status` ≠ `paid` i `payment_due_date` w ciągu 30 dni (faktury kosztowe z KSeF trafiają do `invoices` jako `incoming` — `lib/jobs/runners/inbox-polling.ts`) |
| Recent Activity | **Ostatnie operacje** | ostatnie `payments` + `expenses`, 5 pozycji |
| Tabela Counterparty/Category/Amount/Status/Actions | **Wszystkie operacje** · Kontrahent / Kategoria / Kwota / Status · filtry „Kategoria”, „Status” | jak wyżej, paginacja Finory |
| Net Worth → Assets vs Liabilities | **Należności i zobowiązania** · „Ile Ci są winni / ile Ty jesteś winien” | należności: `amount-due` z `outgoing` nieopłaconych; zobowiązania: `incoming` nieopłacone |
| Net Worth → Liquidity Snapshot | **Płynność** · „Należności pokrywają zobowiązania w X%” | iloraz dwóch liczb wyżej |
| — (zostaje nasze) | **Podsumowanie VAT** w ramce karty „Report” | `VatSummaryCard` — sama treść bez zmian |

### P3. Faktury `/invoices` ← Invoice List

- Kafle: Clients / Invoices / Paid / Unpaid → **Kontrahenci** / **Faktury
  w tym miesiącu** / **Opłacone** (kwota) / **Do zapłaty** (kwota).
- Pasek: „Show 10” → „Pokaż 10” · „Create Invoice” → **„Wystaw fakturę”**
  (→ `/invoices/new`) · „Search by ID or client” → „Szukaj po numerze lub
  kontrahencie” · filtr statusu „All” → „Wszystkie” + **„Status KSeF”**,
  **„Rodzaj”** (VAT / zaliczkowa / korygująca / końcowa).
- Kolumny: `#` → **Numer** (`internal_number`) · Status (ikona) → **Płatność**
  (ikona wg `payment_status`) + plakietka **KSeF** (`ksef_status`) · Client
  (avatar + nazwa + e‑mail) → **Nabywca** (inicjały firmy + nazwa + NIP; nie
  zdjęcia) · Total → **Brutto** · Issued Date → **Wystawiona** · Due →
  **Termin** · Balance → **Do zapłaty** (`amount-due`; 0 = plakietka
  „Opłacona”) · Actions → **Podgląd, PDF, ⋯** (w menu: Korekta, Oznacz jako
  zapłaconą, Duplikuj, „Ustaw jako cykliczną” (N1)).
- **Kosz z akcji Finory: tylko dla szkiców.** Faktury wysłanej do KSeF nie
  usuwamy nigdy.
- Zaznaczanie wierszy + „Pobierz PDF zaznaczonych” (`batch-pdf-download`).
- Dane: `lib/invoices/list-query.ts` (filtry i paginacja na serwerze).

### P4. Podgląd faktury `/invoices/[id]` ← View Invoice

- Lewa kolumna = dokument w układzie Finory, treść jak polska faktura:
  logo + dane sprzedawcy · **Faktura VAT nr …** · Data wystawienia, Data
  sprzedaży, Termin płatności · **Nabywca** (nazwa, adres, NIP) zamiast
  „Invoice To” · „Bill To” → **Płatność** (do zapłaty, forma, rachunek, MPP
  jeśli jest) — SWIFT tylko dla walut obcych · pozycje: **Lp. / Nazwa /
  Ilość / J.m. / Cena netto / VAT / Netto / Brutto** · podsumowanie per
  stawka VAT, Razem netto / VAT / **Brutto** · „Note” → **Uwagi** ·
  **Numer KSeF** i kod QR (jeśli faktura je ma) · „Salesperson” wylatuje.
- Prawa kolumna: Send Invoice / Download / Print → **Wyślij e‑mailem /
  Pobierz PDF / Drukuj**, a pod nimi istniejące akcje i panel statusu KSeF
  z `invoice-detail-view` (wysyłka do KSeF, UPO, ponowienie, duplikat,
  korekta, oznacz jako zapłaconą, przypomnienia wstrzymane). **Logiki
  i zasad zgody nie zmieniamy** — przenosimy JSX.

### P5. Wystaw fakturę `/invoices/new/*` ← Create Invoice

- Formularz wygląda jak dokument (układ Finory): u góry sprzedawca + „Faktura
  nr (nadawany automatycznie)” + daty; niżej **Nabywca** (wyszukiwarka
  kontrahenta + NIP z GUS — istniejące); pozycje w wierszach jak w Finorze;
  podsumowanie po prawej na dole.
- Pola i walidacja zostają NASZE (RHF + Zod, GTU, MPP, VAT per pozycja,
  waluta/NBP, zaliczki, korekty, faktura końcowa). „Hours” → **Ilość + J.m.**,
  „Cost” → **Cena netto**, „Salesperson”, SWIFT, „Discount %” (jeśli go nie
  obsługujemy) — wylatują.
- Prawa kolumna: Send Invoice / Save → **„Wystaw i wyślij do KSeF”**
  (główny), **„Zapisz szkic”**, **„Podgląd”**.
- To najbardziej ryzykowny ekran — robi się go po stronach tylko do odczytu
  (E9). Każdy z 4 rodzajów (`regular`, `advance`, `correction`, `final`)
  musi przejść istniejące testy.

### P6. Faktury cykliczne `/invoices/recurring` ← Recurring Invoices — NOWE (N1)

- Kolumny: ID → **Szablon** (nazwa) · Client → **Kontrahent** · Frequency →
  **Częstotliwość** (co tydzień / co miesiąc / co kwartał / co rok) · Next
  Run → **Następne wystawienie** · Amount → **Kwota brutto** · Status →
  **Aktywna / Wstrzymana** · Actions → **Wstrzymaj/Wznów, Edytuj, Usuń**.
- „+ New Recurring Invoice” → **„+ Nowa faktura cykliczna”** (tworzy się
  z istniejącej faktury: wybór faktury-wzoru + częstotliwość + dzień).

### P7. Przypomnienia `/payments/overdue` ← Invoice Reminders

- Nad tabelą kafle w stylu P3: **Po terminie** (kwota), **Faktur po
  terminie**, **Przypomnień wysłanych w miesiącu**, **Otwartych** (`opened_at`).
- Kolumny: ID → (bez) · Invoice → **Faktura** · Client → **Kontrahent** · Due
  Date → **Termin płatności** · Remind On → **Przypomnienie** (`scheduled_for`
  + etap 1–4) · + **Kanał** (e‑mail/SMS) · Status → **Zaplanowane / Wysłane /
  Nieudane / Anulowane** · Actions → **Wyślij teraz, Wstrzymaj, Wezwanie do
  zapłaty (PDF)** (`lib/reminders/pdf-demand-letter.ts`).
- „+ New Reminder” → **„+ Zaplanuj przypomnienie”**.
- Dane: `invoices_overdue`, `payment_reminders`, logika i zabezpieczenia
  z `components/reminders/overdue-dashboard` i `lib/reminders/*` bez zmian.

### P8. Wydatki `/expenses` ← Transactions

- Kafle: Money In / Money Out / Net / Recurring → **Wydatki w miesiącu**
  (brutto) / **VAT do odliczenia** (`vat_deductible_amount`) / **Do opisania**
  (liczba `is_reviewed = false`) / **Stałe koszty** (N3).
- Kolumny: Date → **Data** · Merchant → **Sprzedawca** (nazwa + NIP) · Group →
  **Źródło** (KSeF / Zdjęcie / Ręcznie / Import) · Category → **Kategoria**
  (`category_label`) · Account → **Kolumna KPiR** (`kpir_column`) · Method →
  **Dokument** (rodzaj + numer) · Amount → **Brutto** · Status → **Opisany /
  Do opisania** · Actions → **Szczegóły, ⋯**.
- Filtry „All groups / categories / statuses” → **„Wszystkie źródła /
  kategorie / statusy”**. „+ Add Transaction” → **„+ Dodaj wydatek”**
  (istniejący `capture-button`, z aparatem na telefonie).

### P9. Skrzynka KSeF `/inbox` ← Transactions (ten sam komponent tabeli)

- Kafle: **Nowe faktury** (nieopisane), **Do zapłaty** (kwota `incoming`
  nieopłaconych), **Termin w 7 dni**, **Ostatnie pobranie z KSeF**.
- Kolumny: **Data wystawienia · Sprzedawca (NIP) · Numer · Numer KSeF ·
  Brutto · Termin płatności · Status** (Nowa / Opisana / Zapłacona) · Akcje.

### P10. Analiza kosztów `/analizy/koszty` ← Monthly Analytics — NOWE

| Karta Finory | U nas | Dane |
|---|---|---|
| Wybór miesiąca („October 2026”) | **„Październik 2026”** (nazwy miesięcy po polsku) | — |
| 4 kafle (Total spent, Avg daily, vs last month, top category) | **Wydano** / **Średnio dziennie** / **vs poprzedni miesiąc** / **Największa kategoria** | `expenses` w miesiącu |
| Spend Trend | **Trend wydatków** (dzień po dniu, ten vs poprzedni miesiąc) | `expenses` po `issue_date` |
| Spend by Category | **Wydatki według kategorii** | `category_label` |
| Top Categories (paski) | **Największe kategorie** | j.w. |
| Recent Expenses | **Ostatnie wydatki** | 5 ostatnich |
| Spending Streaks | **ODPADA** (gra dla osób prywatnych) | — |
| Income vs Expense | **Przychody a koszty** · Przychody / Koszty / Wynik | jak P1 |
| Subscriptions | **Stałe koszty** · dostawca, średnia kwota, „zwykle około X dnia miesiąca” | N3 |
| Daily Spend (kalendarz kropek) | **Kalendarz wydatków** | suma `expenses` na dzień |

### P11. Analiza sprzedaży `/analizy/sprzedaz` ← Monthly Analytics (drugi raz) — NOWE

Ten sam układ co P10, dane sprzedaży (faktury `outgoing` wg §2.4):

| Karta Finory | U nas |
|---|---|
| 4 kafle | **Sprzedano** / **Średnio na fakturę** / **vs poprzedni miesiąc** / **Najlepszy klient** |
| Spend Trend | **Trend sprzedaży** |
| Spend by Category | **Sprzedaż według produktów** (`invoice_line_items.name`, top 6 + „Pozostałe”) |
| Top Categories | **Najlepsze produkty i usługi** |
| Recent Expenses | **Ostatnie faktury** |
| Income vs Expense | **Przychody a koszty** |
| Subscriptions | **Stali klienci** — fakturowani w ≥ 3 z ostatnich 4 miesięcy; przy każdym przycisk **„Zrób fakturę cykliczną”** → N1 |
| Daily Spend | **Kalendarz sprzedaży** |
| + Asset Allocation (z inwestycji) | **Udział klientów w przychodach** (wykres kołowy, top 5 + „Pozostali”); gdy jeden klient > 50% — podpis „Uwaga: jeden klient to ponad połowa przychodu” |
| + Top Gainers / Top Losers (z inwestycji) | **Klienci: rośnie / spada** — zmiana sprzedaży 3 mies. vs poprzednie 3 |

### P12. Bank `/bank`, `/bank/operacje` ← Accounts + Transactions — NOWE (N5, etap późniejszy)

- `/bank` (układ Accounts): kafle **Wpływy w miesiącu / Wypływy / Rachunki /
  Niedopasowane operacje**; karty rachunków (`account_iban`, `bank_name`,
  liczba operacji, data ostatniego importu). „Add Account” → **„Importuj
  wyciąg”**.
- `/bank/operacje` (układ Transactions): **Data · Kontrahent · Tytuł ·
  Rachunek · Kwota · Dopasowanie** (Dopasowano do FV … / Do sprawdzenia /
  Pominięte) · Akcje: **Potwierdź, Zmień fakturę, Pomiń**.
- Salda Finory wylatują — wyciąg nie daje pewnego salda.

### P13. Kontrahenci, KPiR, Eksport, Import

- **Kontrahenci** — tabela i kafle z P3: **Kontrahenci / Aktywni (90 dni) /
  Z zaległościami / Status VAT do sprawdzenia**; kolumny **Nazwa · NIP ·
  Status VAT · Należności · Śr. czas zapłaty** (`payment_terms_days_avg`) ·
  **Spóźnienia** (`late_payment_count`) · Przypomnienia (przełącznik) · Akcje.
  Logika z obecnej strony bez zmian.
- **KPiR** — tabela Transactions: **Lp. · Data · Nr dowodu · Kontrahent ·
  Opis · Kolumna · Kwota**; logika `kpir-view` bez zmian.
- **Eksport** i **Import danych** — karty z ikonami w stylu Accounts; logika
  bez zmian.

### P14. Ustawienia `/settings/*` ← Settings

Układ Finory: zakładki w lewej kolumnie, treść po prawej, sekcje jak w jej
„General” (etykieta + opis po lewej, kontrolka po prawej).

| Finora | U nas (istniejąca trasa) |
|---|---|
| General | **Firma** (`/settings`: profil firmy, zwolnienie z VAT, metoda kasowa) |
| Profile | **Konto** (`/settings/account`) |
| Security | **Bezpieczeństwo** (`/settings/security`, MFA) |
| Notifications | **Powiadomienia** (`/settings/notifications`) |
| Connected Accounts | **KSeF** (`/settings/ksef`) + logowanie Google |
| — | **Przypomnienia** (`/settings/reminders`), **Księgowa** (`/settings/accountant`), **Zespół** (`/settings/team`), **Abonament** (`/settings/billing`), **FLO** (`/settings/flo` — tylko ramka, treść Masła), **Dziennik zdarzeń** (`/settings/audit`) |
| Privacy & Data | **Prywatność i dane** (eksport danych, usunięcie konta — `components/settings/delete-account`) |

Wylatują z General: język, waluta, strefa czasowa, pierwszy dzień tygodnia
(zawsze PL / PLN / Europe/Warsaw / poniedziałek).

### P15. Logowanie `(auth)` ← Login / Register / Forgot Password

- Lewa połowa: formularz Finory. „Login with Google” → **„Zaloguj przez
  Google”**; Facebook wylatuje; „Or continue with Email” → **„lub e‑mailem”**;
  „Remember me” → **„Zapamiętaj mnie”**; „Forgot Password?” → **„Nie pamiętasz
  hasła?”**; „New on our platform? Create an account” → **„Nie masz konta?
  Załóż je”**.
- Prawa połowa: animowane tło Finory zostaje; karta z hasłem →
  **„Faktury w KSeF bez stresu. FLO pilnuje terminów, płatności i VAT‑u za
  Ciebie.”** (treść do akceptacji Masła).
- Akcje serwerowe, MFA, Google OAuth, reset hasła — nasze, bez zmian. Ekran
  MFA i potwierdzenia maila w tym samym stylu karty.

---

## 6. Słownik tłumaczeń (EN z Finory → PL)

| EN | PL | EN | PL |
|---|---|---|---|
| Dashboard | Pulpit | Finance | Przychody i koszty |
| Cash Flow | Przepływy | Report | Ten miesiąc |
| Transactions | Wydatki / Operacje | Monthly Analytics | Analiza |
| Invoices / Invoice List | Faktury | Create Invoice | Wystaw fakturę |
| View Invoice | Podgląd faktury | Recurring Invoices | Faktury cykliczne |
| Invoice Reminders | Przypomnienia | Send Invoice | Wyślij e‑mailem |
| Download / Print | Pobierz PDF / Drukuj | Save | Zapisz szkic |
| Invoice To / Bill To | Nabywca / Płatność | Item / Qty / Price | Nazwa / Ilość / Cena netto |
| Subtotal / Tax / Total | Razem netto / VAT / Razem brutto | Discount | Rabat |
| Balance / Total Due | Do zapłaty | Paid / Unpaid | Opłacona / Nieopłacona |
| Issued Date / Due Date | Wystawiona / Termin płatności | Client(s) | Kontrahent(ci) |
| Merchant | Sprzedawca | Counterparty | Kontrahent |
| Category / Group | Kategoria / Źródło | Status / Actions | Status / Akcje |
| Upcoming Bills | Nadchodzące płatności | Recent Activity | Ostatnie operacje |
| Top Cash Flow Sources | Skąd i dokąd płyną pieniądze | Savings goal | Odłóż na podatek |
| Received / Expense this month | Wpłynęło / Wydano w tym miesiącu | Income vs Expense | Przychody a koszty |
| Spend Trend | Trend wydatków | Spend by Category | Wydatki według kategorii |
| Top Categories | Największe kategorie | Subscriptions | Stałe koszty |
| Daily Spend | Kalendarz wydatków | Frequency / Next Run | Częstotliwość / Następne wystawienie |
| Monthly / Quarterly / Yearly | Co miesiąc / Co kwartał / Co rok | Weekly / Monthly / Yearly (przełącznik) | Tydzień / Miesiąc / Rok |
| Show 10 / Showing 1 to 10 of 25 entries | Pokaż 10 / Pozycje 1–10 z 25 | Previous / Next | Poprzednia / Następna |
| Search… / Type to search… | Szukaj… / Szukaj lub przejdź… ⌘K | All | Wszystkie |
| Details / View Report | Szczegóły / Zobacz przepływy | Settings / Profile / Security | Ustawienia / Konto / Bezpieczeństwo |
| Notifications / Connected Accounts | Powiadomienia / KSeF i połączenia | Privacy & Data | Prywatność i dane |
| Welcome Back / Login / Sign up | Witaj ponownie / Zaloguj się / Załóż konto | Last month / vs last month | Poprzedni miesiąc / vs poprzedni miesiąc |
| Light / Dark / System | Jasny / Ciemny / Systemowy | Log out | Wyloguj |

---

## 7. Formaty, długość tekstów, puste stany

### 7.1. Format liczb i dat
- Kwoty: `1 234,56 zł` (spacja nierozdzielająca) — helpery z `lib/format/pl.ts`.
  Osie wykresów: „12 tys.”, „1,2 mln”. Nigdy `$` ani `K`.
- Daty: `17.10.2026`; miesiące słownie po polsku („październik 2026”);
  strefa `Europe/Warsaw` (`lib/format/warsaw-date.ts`).
- Liczebniki: `lib/i18n/plural.ts` (1 faktura / 2 faktury / 5 faktur).
- Procent zmiany: „+12%” zielony, „−8%” czerwony (minus typograficzny).

### 7.2. Długość tekstów
Polskie podpisy są o 20–40% dłuższe. Każdą kartę sprawdź na 375 px i 1440 px;
ucinamy wielokropkiem z `title`, nie łamiemy siatki.

### 7.3. Puste stany (zamiast pustych wykresów)
- Brak danych w ogóle: „Pokażemy to, gdy wystawisz pierwszą fakturę” +
  przycisk „Wystaw fakturę”.
- Za mało danych na trend (< 2 mies.): wartość liczbowa bez wykresu
  + „Wykres pojawi się po drugim miesiącu”.
- Koszty bez KSeF: „Podłącz KSeF, a faktury kosztowe pobierzemy same”
  → `/settings/ksef`.

---

## 8. Nowe funkcje (podpatrzone u konkurencji, pasują do ekranów Finory)

Kolejność = opłacalność. Każda to osobny PR z testami.

### N1. Faktury cykliczne (inFakt, wFirma, Fakturownia mają; my nie)
- Migracja `00151_recurring_invoices` (sprawdź numer w rejestrze!): tabela
  `recurring_invoices` (`id`, `tenant_id`, `template_invoice_id` → invoices,
  `name`, `frequency` (`weekly`/`monthly`/`quarterly`/`yearly`),
  `day_of_month` 1–28, `next_run_date`, `active`, `last_invoice_id`,
  `created_by`, znaczniki czasu) + RLS jak w innych tabelach tenanta
  (`public.get_current_tenant_id()`), indeks `(active, next_run_date)`.
  Addytywna → „przed wdrożeniem”.
- Job pg-boss (`lib/jobs/runners/recurring-invoices.ts` + rejestracja
  w `lib/jobs/handlers/`), cron codziennie 06:00 Europe/Warsaw: dla każdej
  aktywnej pozycji z `next_run_date <= dziś` tworzy **SZKIC** faktury przez
  istniejącą ścieżkę duplikowania (znajdź akcję „Duplikuj”/kopiowanie;
  jeśli jej nie ma — kopiuj nagłówek i pozycje faktury‑wzoru z nowymi
  datami), przesuwa `next_run_date`, wysyła powiadomienie „Szkic faktury
  cyklicznej dla X czeka na zatwierdzenie”.
- **Idempotencja:** unikalny klucz `(recurring_id, okres)` w UPDATE
  z warunkiem `next_run_date = <stara wartość>` — ponowienie joba nie
  utworzy drugiego szkicu (AGENTS.md, protokół pkt 5).
- **Wysyłka do KSeF zostaje kliknięciem człowieka** (zasada zgody). Auto‑
  wysyłka = osobna decyzja Bartosza, nie w tym planie.
- Licznik cronów w teście rejestru zmienia się świadomie (+1, z komentarzem).
- UI: P6 + przycisk „Ustaw jako cykliczną” w P3/P4 + „Zrób fakturę
  cykliczną” w P11.

### N2. Analiza sprzedaży i kosztów
P10 i P11 — bez nowych tabel. Agregaty w `lib/analytics-finance/*.ts`
(czyste funkcje + test) zasilane przez istniejące zapytania i
`readCompletePages`. Jeśli strona robi > 3 zapytania po pełnej historii —
dopiero wtedy RPC w migracji.

### N3. Stałe koszty i stali klienci
Funkcja czysta: dostawca (`seller_nip`) z wydatkami w ≥ 3 z ostatnich 4
miesięcy = stały koszt (średnia kwota, typowy dzień). To samo dla nabywców
(`buyer_nip`) = stały klient. Zasila P8, P10, P11.

### N4. Paleta poleceń ⌘K (Finora ma komponent)
Pozycje: wszystkie trasy z §4 + akcje („Wystaw fakturę”, „Dodaj wydatek”,
„Importuj wyciąg”) + wyszukiwanie faktur (numer, nabywca) i kontrahentów
(nazwa, NIP) przez istniejące zapytania listy, z opóźnieniem 250 ms.

### N5. Import wyciągu bankowego + automatyczne parowanie (inFakt, wFirma, iFirma mają)
- **Schemat już jest** (`payment_imports`, `payments.bank_*`,
  `is_auto_matched`, `match_confidence`, `match_method`, `is_confirmed`) —
  brakuje parsera i ekranu. Sprawdź najpierw, czy jakaś migracja/RPC już
  ustawia `invoices.paid_amount`/`payment_status` z `payments` (wyzwalacz) —
  jeśli tak, używaj go.
- Parsery w `lib/import/bank/`: CSV mBank, PKO BP, ING, Santander, Pekao,
  Millennium + MT940. Każdy z plikiem przykładowym (zanonimizowanym)
  w testach.
- Parowanie: kwota = `amount-due` ORAZ (numer faktury w tytule LUB NIP/
  rachunek kontrahenta) → `is_auto_matched = true`, `match_confidence = 1`;
  sama kwota → „Do sprawdzenia” (`is_confirmed = false`), nic się nie
  oznacza bez kliknięcia.
- UI: P12. To duży etap — **w chmurze tylko jeśli zostaje budżet**, inaczej
  pierwszy etap lokalny.

### N6. Do decyzji Bartosza (NIE robić bez zgody)
- Licznik limitu zwolnienia z VAT (200 tys. zł) jako kafel w Przepływach dla
  firm zwolnionych (`lib/invoices/vat-exemption.ts`) — grupa podatkowa FLO
  czeka na prawnika; sam licznik to fakt, ale decyzja należy do Bartosza.
- Link do zapłaty na fakturze (BLIK / przelew online) — wymaga Stripe
  Connect i weryfikacji firm; poza budżetem tego planu.

### Czego NIE robimy
Budżety, karty płatnicze, inwestycje, ubezpieczenia, raty, „Spending
Streaks”, panel personalizacji motywu dla klienta, cokolwiek z NexaCRM.

---

## 9. Etapy, kolejność i budżet (103 $)

Jeden etap = jedna gałąź `claude/finora-eN-<temat>` od `origin/main` = jeden
PR. Szacunki są orientacyjne — po każdym etapie wpisz rzeczywiste zużycie.

| Etap | Zakres | Gotowe, gdy | ~$ |
|---|---|---|---|
| **E0** | Plan: sklonuj `../finora-src`, spisz w §10 „Inwentarz Finory” (plik komponentu → karta z §5, zależności z `package.json`, `components.json`, preset niebieski: dokładne zmienne CSS, font). Popraw ten plan, jeśli kod przeczy audytowi. PR tylko z dokumentem. | §10 wypełniony, decyzje E1 jasne | 4 |
| **E1** | Fundament: zależności Finory, `components/ui/*` Finory (wg §2.1), `components/ui/chart.tsx`, font, **zmienne motywu z niebieskiego presetu** w `app/globals.css`; stare `--ff-*` jako aliasy nowych zmiennych (żeby nieprzerobione ekrany nie pękły); usunięcie martwych efektów „glass” tylko jeśli nic ich nie używa. | `pnpm run ci && pnpm build` zielone, wszystkie stare ekrany działają w nowych kolorach | 9 |
| **E2** | Szkielet P0 + nawigacja §4 + dolny pasek + N4 (⌘K). | menu, nagłówek, telefon, ⌘K działają; trasy bez zmian | 12 |
| **E3** | P3 Faktury + P4 Podgląd faktury. | lista i podgląd w układzie Finory, wszystkie akcje działają | 12 |
| **E4** | P1 Pulpit (z slotem FLO) + funkcje agregujące z testami. | karty z danymi, puste stany, testy §2.4 | 12 |
| **E5** | P2 Przepływy. | wszystkie karty z §P2, stare komponenty usunięte | 9 |
| **E6** | P8 Wydatki + P9 Skrzynka KSeF + N3. | tabele, kafle, filtry | 9 |
| **E7** | P10 + P11 Analizy (N2). | obie strony z danymi i testami | 10 |
| **E8** | P7 Przypomnienia + P13 Kontrahenci/KPiR/Eksport/Import. | układ Finory, logika bez zmian | 8 |
| **E9** | N1 Faktury cykliczne (migracja, job, P6, przyciski). | szkic powstaje raz na okres, test idempotencji | 10 |
| **E10** | P14 Ustawienia + P15 Logowanie. | wszystkie zakładki i ekrany auth | 7 |
| **Lokalnie** | P5 Wystaw fakturę (ryzyko!), N5 Bank (P12), poprawki z przeglądu wizualnego Bartosza/Masła. | — | — |
| | **Razem w chmurze** | | **~102** |

Gdy budżet topnieje szybciej: E9 i E10 przechodzą do sesji lokalnych,
kolejność reszty bez zmian. Jeśli zostanie zapas — P5 przed N5.

### Każdy PR etapu zawiera
1. Opis wg `.github/pull_request_template.md`: zakres, zrzuty (jeśli sesja
   może uruchomić stronę), tabela weryfikacji, migracje „Do wgrania: …”.
2. Testy nowych funkcji danych (§2.4), `pnpm run ci && pnpm build` zielone.
3. Wiersz w dzienniku (§12) i nowy „Następny krok”.

---

## 10. Inwentarz Finory (wypełnia E0)

| Karta / element (§5) | Plik w `../finora-src` | Zależności | Uwagi |
|---|---|---|---|
| _do uzupełnienia_ | | | |

Preset niebieski: _zmienne CSS do uzupełnienia_ · Font: _do uzupełnienia_ ·
Biblioteka wykresów: _do uzupełnienia_ · Ikony: _do uzupełnienia_ ·
`components.json` style: _do uzupełnienia_.

---

## 11. Pułapki znane z tego repo

- **`proxy.ts` przepuszcza tylko wymienione rozszerzenia plików.** Obrazki,
  fonty i ikony z Finory (`.webp`, `.svg`, `.woff2`…) muszą być we wzorcu,
  inaczej lecą na `/login` i znikają po cichu.
- Plik `'use server'` eksportuje tylko funkcje asynchroniczne — łapie to
  `pnpm build`, nie `pnpm typecheck`.
- Wyłącznie klasy Tailwind; żadnych `.module.css` ani CSS‑in‑JS (AGENTS.md).
  Style Finory przenosimy jako klasy i zmienne w `app/globals.css`.
- Server Components domyślnie; `"use client"` tylko dla wykresów, filtrów,
  ⌘K i przełączników.
- Dane przykładowe Finory (avatary ludzi, logo marek, kwoty w $) nie mogą
  zostać nigdzie w produkcji — grep `\$[0-9]` i `images/avatars` przed PR.
- Lokalnie bez bazy pulpit FLO ma atrapy tylko przy `isLocalDevEnv()`;
  nowe karty nie dostają atrap w produkcji — puste stany z §7.3.
- Nie edytuj `components/flo/*`, `app/(dashboard)/flo/*`, `content/flo/*`,
  `lib/flo/*` (D4).

---

## 12. Dziennik

| Data | Etap | PR | Zużycie $ | Stan | Uwagi |
|---|---|---|---|---|---|
| 17.10.2026 | Audyt | (ten dokument) | — | gotowe | audyt demo Finory (22 strony + auth + ustawienia) i kodu `main` @ `1ded2147` |

**Następny krok:** Bartosz wykonuje krok 0.1 (zakup + prywatne repo).
Potem sesja w chmurze: **E0**.
