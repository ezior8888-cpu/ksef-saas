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
   rzeczywiste zużycie. Nie zaczynaj etapu, gdy zostaje mniej niż jego
   szacunek z §9 + 3 $ (i nigdy poniżej 12 $). Wtedy dokończ bieżący,
   wypchnij, zapisz „Następny krok” i stop. Dalej jadą sesje lokalne.
5. Sesja w chmurze NIE ma `.agents/infra.env` ani SSH: **nie wgrywa migracji
   i nie wdraża**. W opisie PR pisze „Do wgrania: 00NNN, przed wdrożeniem”.
   Numer migracji z rejestru w `docs/koordynacja/CLAUDE-DO-CODEXA.md`
   (wiersz „następny wolny”; 17.10 było to **00151**) — w tym samym PR
   dopisz wiersz do rejestru.
6. Przed każdym PR: `pnpm run ci && pnpm build`. Scalanie i wdrożenie robi
   Bartosz (AGENTS.md, „Scalanie PR”). W świeżym kontenerze najpierw
   `xmllint --version`. Jeśli go nie ma:
   `sudo apt-get update && sudo apt-get install -y libxml2-utils` (tak robi
   CI, `.github/workflows/ci.yml` 31–35). Bez niego pada test XSD w
   `pnpm test`, a Vitest w ogóle nie rusza. To nie jest błąd Twojej zmiany.

### 0.1. Krok 0 dla Bartosza (jednorazowo, przed pierwszą sesją)

1. Kup Finorę (79 $): `https://shadcnstudio.com/templates/admin-dashboard/finora`.
2. Utwórz prywatne repo `faktflow-finora-src`, wrzuć rozpakowany szablon
   bez zmian, nadaj dostęp kontu, na którym działa sesja w chmurze.
3. Wpisz właściciela repo w punkt 2 checklisty wyżej.
4. ~~Wybierz preset~~ — zrobione 17.10: Modern Minimal, Outfit, Light, Compact, SM, Inset, Default (D2).

---

## 1. Decyzje, które już zapadły (nie otwieraj ich ponownie)

| # | Decyzja |
|---|---|
| D1 | Jedyny szablon to **Finora**. NexaCRM porzucona — nie bierz z niej niczego. |
| D2 | **Konfiguracja Finory wybrana przez Bartosza 17.10.2026** (panel „Theme Customizer” w demo): **Theme Preset: Modern Minimal** (niebieski) · **Font: Outfit** · **Color Mode: Light** jako domyślny (Dark zostaje jako przełącznik użytkownika, System też) · **Content Layout: Compact** · **Scale: SM** · **Sidebar Variant: Inset** · **Sidebar Mode: Default**. E0 spisuje z `../finora-src` dokładne wartości tych ustawień (zmienne CSS presetu, font, klasy skali i układu) do §10, E1 ustawia je na stałe w kodzie. Panelu personalizacji klient NIE dostaje. |
| D3 | Układ stron bierzemy z Finory **prawie bez zmian**. Zmieniamy treść, dane i podpisy, nie siatkę. Każdy dolar za szablon ma pracować. |
| D4 | **FLO**: miejsce i forma przyjdą z projektu Claude Design. Do tego czasu obecne komponenty FLO stoją w wyznaczonym slocie u góry pulpitu bez zmian. `components/flo/*`, `app/(dashboard)/flo/*`, `content/flo/*`, `app/(dashboard)/settings/flo/*`, `e2e/tests/flo-*.spec.ts` należą do Masła — NIE edytuj ich. `lib/flo/*` należy do toru silnika — też nie. |
| D5 | Strona sprzedażowa (landing) — poza zakresem. |
| D6 | Nowe funkcje podpatrzone u konkurencji, które pasują do ekranów Finory, robimy (sekcja 8). Bez kombinowania: najprostsza poprawna wersja. |
| D7 | **Karty podatkowe na ekranach są dozwolone** (decyzja Bartosza 17.10.2026: „nie ma żadnych problemów z prawem”): licznik limitu zwolnienia z VAT, „Odłóż na podatek”, VAT należny. To liczniki faktów, nie porady. Wyłączniki `tax.*` w `lib/flo/flags.ts` dotyczą propozycji agenta FLO i zostają bez zmian (D4). Gdziekolwiek niżej karta podatkowa jest opisana jako „wstrzymana do opinii prawnika”, wygrywa D7. |

---

## 2. Audyt aplikacji — fakty z kodu (stan `main` 17.10.2026)

### 2.1. Stos i zgodność z Finorą

| | FaktFlow | Finora (strona produktu) |
|---|---|---|
| Framework | Next.js 16.3, App Router, React 19.2 | Next.js 16 App Router |
| UI | shadcn/ui, styl `radix-nova`, pakiet `radix-ui`, Tailwind v4 | shadcn/ui + Tailwind v4 |
| Formularze | React Hook Form + Zod | React Hook Form + Zod |
| Motywy | własny `lib/theme/theme.ts` (klasa `dark` na `<html>`, klucz `theme`, `THEME_BOOT_SCRIPT`, domyślnie jasny, bez trybu systemowego); `next-themes` jest w `package.json`, ale nieużywany | `next-themes` (`defaultTheme` system) + provider ustawień w ciasteczku |
| Wykresy | **brak biblioteki** — wykres sprzedaży to ręczny SVG (`components/dashboard/sales-chart-card.tsx`) | wykresy shadcn (sprawdź w `../finora-src`: najpewniej `recharts` + `components/ui/chart.tsx`) |
| Ikony | `lucide-react`, ale menu używa nazw Material Symbols (`'description'`, `'receipt_long'` w `lib/dashboard-nav-config.ts`) | **Remix Icon** (w demo każde `svg` ma klasę `remixicon`; pakiet potwierdza E0 w `../finora-src/package.json`) |
| Prymitywy | `radix-ui` (`asChild`) | **Base UI** (w demo `id='base-ui-…'`; `render` zamiast `asChild`), styl ostry: `rounded-none`, `text-xs`, `ring-1`, przycisk `h-8` |
| Komponenty `components/ui` | 19 (badge, button, card, checkbox, dialog, dropdown-menu, empty-state, input, label, select, separator, sheet, skeleton, sonner, table, tabs, textarea, tooltip, drawn-video) | znacznie więcej (sidebar, chart, command, avatar, progress, popover, calendar…) |
| Motyw | `app/globals.css` — 1642 linie, własne tokeny `--ff-*`, efekty „glass” (`components/glass-card.tsx`) | zmienne shadcn + presety |

**Wniosek:** przenosimy kod, nie odtwarzamy go. Zależności Finory (wykresy,
`cmdk`, ikony, `date-fns`, `react-day-picker` itd.) **dodajemy bez dyskusji** —
to nie są „inne biblioteki UI” w rozumieniu AGENTS.md, tylko części shadcn.

**Pułapka stylu.** Nadpisujemy tylko prymitywy shadcn o tej samej nazwie:
badge, button, card, checkbox, dialog, dropdown-menu, input, label, select,
separator, sheet, skeleton, table, tabs, textarea, tooltip. `empty-state.tsx`
i `drawn-video.tsx` są nasze i zostają (drawn-video to landing, D5).
`sonner.tsx` też zostaje (zob. Motyw w E1). Finora stoi na Base UI, więc
nadpisanie to migracja: `asChild` → `render` w 11 miejscach
(`grep -rn asChild app components`); zmiany API Select, DropdownMenu i Dialog
łapie `pnpm typecheck`. Do nowego `button.tsx` dopisz tymczasowe warianty
`glass` (wygląd `outline` Finory) i `glass-primary` (wygląd `default`), żeby
61 użyć w 31 plikach przeszło bez ręcznej przeróbki. Etapy ekranów zamieniają
je potem na warianty Finory. Rozmiary Finory zostają, ale przy
`[@media(pointer:coarse)]` przycisk ma co najmniej 44 px wysokości (dopisz to
do `buttonVariants`). `components/ui/sheet.tsx` podmieniasz tylko wtedy, gdy
`components/flo/flo-queue-sheet.tsx` działa BEZ edycji (`side='bottom'`,
`onOpenChange={setOpen}`). Sprawdź na 375 px, że kolejka Flo otwiera się od
dołu. Ostre rogi to wygląd Finory, nie błąd, więc nie dopisuj `rounded-*`.
Nowe zależności (`@remixicon/react`, `recharts`, Base UI, `cmdk` …) muszą
przejść `pnpm audit --prod --audit-level=high` (CI) i trafiają do
`experimental.optimizePackageImports` w `next.config.ts`. Sprawdź też, czy
`app/globals.css` nie nadpisuje komponentu po `data-slot` albo `[class*=…]`.
Te reguły wygrywają z klasami Finory.

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
| `/reports`, `/reports/kpir`, `/reports/exports` | raporty (`/reports` to przekierowanie na `/dashboard` i tak zostaje) | `components/expenses/kpir-view`, `lib/exports/*` |
| `/import-danych` | import | `lib/import/*` |
| `/settings/*` | account, accountant, audit, billing, flo, ksef, notifications, reminders, security, team + strona główna (profil firmy, zwolnienie z VAT, metoda kasowa, usunięcie konta) | formularze w `components/settings/*` |
| `/flo`, `/flo/wrapped` | `/flo` przekierowuje na `/dashboard`; podsumowanie roku | **nie ruszać** (D4) |
| `(auth)` | login, rejestracja, reset hasła, MFA | akcje w `app/(auth)/*/actions.ts` |
| `/expenses/[id]` | edycja wydatku (`ExpenseEditForm`, zdjęcie) | logika bez zmian; E6, karta Finory |
| `/onboarding/*` (4 ekrany), `/invite/[token]` | kreator firmy po rejestracji, zaproszenie | akcje w `app/actions/organizations.ts`; E10, styl karty P15 |
| `/accountant/[token]` | portal księgowej (oglądają go ludzie spoza firmy) | E8 obok Eksportu, tylko Card/Table Finory; `referrer: 'no-referrer'` z `app/accountant/layout.tsx` zostaje |
| `/auth/finish`, `/gdpr/cancel`, `/reset-password`, `/login/two-factor`, `/login/two-factor/setup` | ekrany auth spoza Finory | E10 |
| `app/(dashboard)/error.tsx`, `loading.tsx` | stany błędu i ładowania panelu | E2: `Skeleton` Finory w siatce kart; każda nowa strona z wykresami dostaje własny `Suspense` ze szkieletem |
| `not-found`, `global-error`, `/przerwa-techniczna` | rodzina landingu (`styles/zova.css`) | poza zakresem, jak D5 |
| `/admin/*` | panel operatora (tor C-22 Codexa) | poza zakresem; po E1 tylko sprawdzenie, że się renderuje |

Menu: `lib/dashboard-nav-config.ts` (sekcje „Dane”, „Księgowość”, dolny
pasek na telefonie: Flo / Faktury / Nowa / Miesiąc / Więcej). Szkielet:
`app/(dashboard)/layout.tsx` (`Sidebar`, `BottomNav`, `DashboardOrgHeader`,
`ThemeToggle`, `KsefHealthBanner`, `DashboardVerificationBannerSlot`,
`WelcomeModal`, `IdleWatcher`, `InstallPrompt`, `SupportWidget`,
`assertDashboardShellAccess`, `DashboardPageHeading`, `DashboardRouteFlags`,
`PrefetchDashboardRoutes`, `PrefetchExportsRoute`, `AnalyticsIdentify`).

### 2.3. Dane, z których zasilamy wykresy (schemat z `types/database.ts`)

| Źródło | Kolumny, które nas interesują |
|---|---|
| `invoices` | `direction` (**`'outgoing'` = sprzedaż, `'incoming'` = koszt z KSeF**), `invoice_kind`, `invoice_type`, `issue_date`, `sale_date`, `payment_due_date`, `days_to_payment`, `net_total`, `vat_total`, `gross_total`, `currency`, `paid_amount`, `paid_at`, `payment_status` (`unpaid`/`partial`/`paid`/`overdue`), `ksef_status`, `ksef_number`, `ksef_environment`, `ksef_accepted_at`, `buyer_nip`, `buyer_data`, `seller_nip`, `seller_data`, `internal_number`, `parent_invoice_id`, `reminders_paused`, `origin` |
| `invoice_line_items` | `invoice_id`, `name`, `quantity`, `unit`, `unit_price_net`, `net_amount`, `vat_rate`, `vat_amount`, `gross_amount`, `kpir_category` |
| `products` | `name`, `unit`, `default_price_net`, `default_vat_rate`, `gtu_code`, `category`, `use_count`, `last_used_at` |
| `contractors` | `name`, `nip`, `email`, `phone`, `vat_status`, `payment_terms_days_avg`, `late_payment_count` (nikt ich nie wypełnia, zawsze puste), `last_used_at`, `reminder_excluded` |
| `expenses` | `issue_date`, `seller_name`, `seller_nip`, `document_type`, `document_number`, `net_amount`, `vat_amount`, `gross_amount`, `vat_deductible_amount`, `category_label`, `kpir_column`, `is_reviewed`, `is_deductible`, `source` (`ocr_photo`/`ksef_inbox`/`manual`/`import`), `ksef_invoice_id` |
| `payments` | `invoice_id`, `amount`, `payment_date`, `payment_method`, `bank_payer_name`, `bank_payer_account`, `bank_import_id`, `is_auto_matched`, `match_confidence`, `match_method`, `is_confirmed`. **Rola `authenticated` nie ma do tej tabeli żadnych uprawnień (00074, `REVOKE ALL`): zapytanie z klienta sesji zwraca 42501, nie pustą listę.** Wpłaty zapisuje dziś wyłącznie potwierdzenie FLO (`lib/flo/functions/payment-confirm.ts`, klient administracyjny), proponowane tylko dla faktur sprzedaży po terminie. `payment_date` to dzień kliknięcia, nie dzień przelewu. `invoices.paid_amount` to suma `payments` liczona wyzwalaczem 00073, a `paid_at` to chwila, w której wyzwalacz zobaczył pełną wpłatę (00145). Żadne z nich nie jest osobnym źródłem. |
| `payment_imports` | **gotowy schemat pod wyciągi bankowe, bez interfejsu**: `account_iban`, `bank_name`, `booking_date`, `transaction_date`, `amount`, `currency`, `counterparty_name`, `counterparty_account`, `counterparty_nip`, `title`, `is_matched`, `matched_payment_id`, `ignored`, `provider`. **Rola `authenticated` nie ma do tej tabeli żadnych uprawnień (00074), tak jak do `payments`: zapytanie z klienta sesji zwraca 42501.** |
| `payment_reminders` | `invoice_id`, `stage` (`stage_1`–`stage_4`), `channel` (`email`/`sms`/`both`), `status` (`pending`/`sent`/`failed`/`cancelled`), `scheduled_for`, `sent_at`, `opened_at`, `clicked_at`, `days_overdue_at_send` |
| `reminder_settings` | progi etapów, godzina wysyłki, nadawca |
| `kpir_entries` | `entry_date`, `category`, `net_amount`, `vat_amount` |
| widok `invoices_overdue` | `amount_due`, `days_overdue`, `buyer_name`, `buyer_nip`, `payment_due_date`, `reminders_sent_count` |
| widoki `mv_tenant_monthly_stats`, `mv_tenant_dashboard_summary` | **NIE UŻYWAĆ:** od AUD-118 (02.10.2026) nikt ich nie odświeża (`RETIRED_CRON_QUEUES` w `lib/jobs/queues.ts`), mieszają kierunki, szkice i środowiska KSeF, nie podlegają RLS (00044) |

### 2.4. Zasady liczenia — ŁAMANIE ICH TO BŁĄD KRYTYCZNY

1. **Kierunek:** `direction` ma tylko `'outgoing'` i `'incoming'`. Nigdy
   `'issued'` (ten błąd zerował kiedyś wszystkie kafelki pulpitu).
2. **Proweniencja:** kwoty sprzedaży i VAT liczymy WYŁĄCZNIE z faktur
   przyjętych w aktywnym środowisku KSeF — tak jak robią to
   `getMonthlyFigures`/`getSalesSeries` i strona `/przeplywy`. Szkice mają
   osobny licznik. Nowe agregaty składaj z tych funkcji albo z ich filtrów
   1:1 — nie pisz „gołego” `sum(gross_total)`.
3. **Widoków `mv_*` nie używamy wcale** (§2.3). Liczby bierzemy
   z `getMonthlyFigures`, `getSalesSeries` i funkcji z pkt 11–13.
4. **Zaliczki i faktury końcowe:** `lib/invoices/settled-advances.ts` —
   faktura końcowa nie dubluje sprzedaży zaliczki.
5. **Korekty:** korekta to osobny wiersz w `invoices`
   (`invoice_kind='correction'`). Jej `net_total` / `vat_total` /
   `gross_total` to RÓŻNICA (00200), więc w sumach sprzedaży i VAT bierzemy ją
   bez zmian, w jej miesiącu. Nie jest osobną należnością (pkt 11). Jej
   pozycje to przy `before_after` stan PO, a przy korekcie kwotowej jedna
   sztuczna pozycja, więc do rankingów produktów korekt nie bierzemy
   (pkt 13).
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
    `getMonthlyFigures` i `getSalesSeries` liczą dziś miesiąc w strefie
    serwera (UTC). Przed E4 osobny mały PR według protokołu napraw: obie
    funkcje wyznaczają klucze miesięcy i granice okna z `todayInWarsaw(now)`
    (jak `/przeplywy`). Czerwony test przed naprawą: 1. dzień miesiąca,
    00:30 czasu polskiego. Wszystkie nowe agregaty biorą „dziś”
    z `todayInWarsaw`.
11. **Należności** liczy jedna funkcja `lib/dashboard/receivables.ts`. Tworzy
    ją E3, pierwszy etap, który jej potrzebuje; E4, E5 i E8 tylko ją
    importują. Warunki są te same co w `invoices_overdue` (00145) i na
    stronie `/payments/overdue`, ale bez warunku daty: `direction='outgoing'`,
    `origin='app'`, `ksef_status='accepted'`, `ksef_environment` = środowisko
    aktywne (przyjęta faktura bez środowiska oznacza błąd, jak
    w `getMonthlyFigures`), PLN, rodzaje VAT/UPR, ZAL, ROZ,
    `gross_total > 0`, bez faktur z dziećmi (`parent_invoice_id` /
    `advance_invoice_ids`), `payment_status` ∈ (`unpaid`, `partial`,
    `overdue`). Kwota przez `outstandingOf`, nie `amountDueOf`. Odczyt przez
    `readCompletePages`. Korekt, szkiców i importów nie liczymy nigdy. „Po
    terminie” liczymy z daty (`payment_due_date < dziś`, Europe/Warsaw),
    NIGDY z `payment_status = 'overdue'`, bo wyzwalacz ustawia go tylko przy
    zapisie wiersza. Każda karta z tą sumą ma podpis „Bez importów i faktur
    skorygowanych” (jak `/payments/overdue`). Test: szkic, import, korekta
    in minus, oryginał z korektą, ROZ z zaliczkami, inne środowisko, faktura
    po terminie ze statusem `unpaid`.
12. **Koszty** czytamy jedną drogą, tak jak `/przeplywy` i eksport
    (`fetchExpensesForExport` w `lib/exports/data-fetcher.ts`): `expenses`
    z `is_deductible = true` → `readCompletePages` →
    `filterExpensesForKsefEnvironment` → `assertKsefExpensesReadyForPln`.
    Kwota kosztu = `kpirCostAmount` (netto + VAT bez prawa do odliczenia).
    Kwota wypływu = `gross_amount` z TEGO SAMEGO zbioru. VAT do odliczenia
    = `vat_deductible_amount` tylko dla `document_type`
    z `VAT_DEDUCTIBLE_DOCUMENTS` (`lib/categorization/kpir-cost.ts`; ta sama
    reguła co w JPK_V7M). Faktura `incoming` i jej wydatek to jeden koszt
    (00121), więc nigdy nie sumuj obu. E4 wyciąga to do
    `lib/dashboard/costs.ts` z testem (paragon, koszt KSeF w EUR bez kursu,
    `is_deductible = false`, inne środowisko). P1, P2, P8, P10 i N3 tylko ją
    importują.
13. **Pozycje faktur (rankingi):** `invoice_line_items` złączone (`!inner`)
    z fakturami z pkt 2, czytane przez `readCompletePages`, **tylko
    `invoice_kind IN ('regular','final')`**. Zaliczki pomijamy, bo ich
    wartość jest w pozycjach ROZ albo czeka na ROZ. Korekty pomijamy. Podpis
    karty: „Bez korekt i nierozliczonych zaliczek”. Grupowanie po
    `lower(trim(name))` + `unit`. Test: zaliczka 1 000 zł + ROZ 3 000 zł na
    tę samą usługę daje 3 000 zł, nie 4 000 zł; korekta `before_after`
    10 → 9 szt. nie dodaje sprzedaży.
14. **Wpłaty:** stron nie zasilamy z `payments` ani `payment_imports`.
    Wpływy to `invoices.paid_amount` faktur sprzedaży z pkt 11 według
    `paid_at`, czyli dnia potwierdzenia, nie przelewu. Podpis karty:
    „według oznaczonych wpłat”. Gdy w okresie nie ma żadnej opłaconej
    faktury, pokazujemy pusty stan „Oznaczaj wpłaty, a pokażemy wpływy”,
    nigdy „0 zł”. Daty `paid_at` nie porównujemy z terminem płatności.
15. **Jedna karta = jedno źródło awarii.** Strażniki z pkt 2, 6 i 7 RZUCAJĄ
    wyjątek (faktura w EUR, przyjęta faktura bez środowiska, niepełna
    strona). Każda karta z danymi to osobny asynchroniczny Server Component,
    który sam pobiera dane. Owijamy go w `<Suspense>` i `SectionErrorBoundary`
    (`components/dashboard/section-error-boundary.tsx`) z komunikatem dla tej
    jednej karty: treść wyjątku, np. „Przyjęte faktury wymagają uzgodnienia
    środowiska KSeF”, i link do `/przeplywy`. Strona `/dashboard` nie woła na
    swoim poziomie żadnej funkcji z §2.4, więc slot FLO działa także wtedy,
    gdy padną wszystkie karty. To samo dotyczy `/przeplywy` i `/analizy/*`.

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
| `/dashboard/finance` | Finance (3 serie w stosie: profit/income/expense, 7 miesięcy, bez legendy), Report (Monthly Avg; Total Profit / Income / Expense; View Report), kafel Total Orders (+22%, „Last 4 months”), kafel Total Profit (−16%, „Last One year”), Total Revenue (mini‑słupki), Impression (linia, +24%), Total visitors (Desktop/Tablet/Mobile), Top Products by Sales, Top Products by Volume, tabela użytkowników (filtry Role/Plan/Status, paginacja) | **BIERZEMY** → Pulpit (P1) |
| `/dashboard/cash-flow` | Cash Flow (Weekly/Monthly/Yearly), Savings goal (pierścień), Income this month, Expense this month, Top Cash Flow Sources, Upcoming Bills, Recent Activity, tabela Counterparty/Category/Amount/Status/Actions z filtrami | **BIERZEMY** → Przepływy (P2) |
| `/dashboard/net-worth` | Net Worth, Assets vs Liabilities, Liquidity Snapshot, Asset Allocation, Top Holdings, Liabilities, Net Worth Growth Rate, Debt Payoff Progress, tabela aktywów | **CZĘŚCIOWO** → 2 karty do Przepływów (P2) |
| `/transactions` | 4 kafle (Money In, Money Out, Net, Upcoming), tabela Date/Merchant/Group/Category/Account/Method/Amount/Status/Actions, filtry grup/kategorii/statusów, „+ Add Transaction” | **BIERZEMY** → Wydatki (P8) i Skrzynka KSeF (P9) |
| `/money-management/monthly-analytics` | kafle (Total spent, dzienna średnia, vs poprzedni miesiąc, top kategoria), Spend Trend, Spend by Category, Top Categories, Recent Expenses, Spending Streaks, Income vs Expense, Subscriptions, Daily Spend (mapa ciepła, 180 dni), wybór miesiąca | **BIERZEMY dwa razy** → Analiza kosztów (P10) i Analiza sprzedaży (P11) |
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

Telefon i tablet: zostaje nasz dolny pasek
(`components/dashboard/bottom-nav.tsx`, pozycje bez zmian: Flo / Faktury /
Nowa / Miesiąc / Więcej), przestylowany tokenami Finory. **Jeden próg: `lg`
(1024 px).** W demo pasek boczny Finory zamienia się w szufladę dopiero
poniżej 1280 px (hook z `matchMedia('(max-width: 1279px)')`). Bez zmiany
między 1024 a 1279 px nie byłoby żadnej stałej nawigacji. W kodzie
z `../finora-src` ustaw próg hooka mobilnego na 1024 i klasę kontenera paska
na `lg:flex`. Dolny pasek zostaje `lg:hidden`. „Więcej” zostaje naszym
arkuszem z `bottom-nav.tsx`, przestylowanym na Finorę: sekcje
z `getDashboardMoreSections()`, Ustawienia, Pomoc (`OTWORZ_POMOC`)
i Wyloguj (`signOut`). To jedyne miejsce tych pozycji na telefonie. Poniżej
`lg` szuflada `Sidebar` Finory się nie montuje, a `SidebarTrigger` jest
ukryty, bo inaczej telefon dostaje dwa menu.

Nawigację zmieniasz w `lib/dashboard-nav-config.ts` (właściciel: §11).
**Zasada wpinania:** E2 wpina do menu i do ⌘K tylko trasy, które już istnieją
w `main`. Etap, który tworzy stronę (E7: `/analizy/*`, E9:
`/invoices/recurring`, Bank lokalnie), w tym samym PR dopisuje jej pozycję
w menu i w ⌘K. „Importuj wyciąg” wchodzi do ⌘K razem z N5.
W `isActiveNavPath` `/analizy/*` obsługuje już reguła ogólna. Zmieniasz trzy
rzeczy: `/invoices` NIE jest aktywne dla `/invoices/new/*` ani
`/invoices/recurring*`; `/invoices/new` jest aktywne także dla
`/invoices/new/*`; `/bank` jest aktywne tylko dla dokładnego adresu. Do tego
test Vitest na te przypadki. Strony z ciężkimi agregatami (`/analizy/*`,
`/bank/*`) wyłącz z `getDashboardPrefetchHrefs` i daj im `prefetch={false}`
w `NavRow` (pole `prefetch?: false` w `DashboardNavItem`).
Zmień typ `icon` w `DashboardNavItem` i `DashboardMobileTab` ze `string`
(ligatura) na komponent ikony Remix i renderuj `<Icon className='size-5' />`
w `Sidebar` i `BottomNav`. Material Symbols w pozostałych plikach zostaje do
etapu, który przerabia daną stronę, a we FLO na stałe (§11). Zmiana nazw
w menu oznacza, że ten sam PR poprawia nazwy ekranów w `content/help/*.mdx`,
skróty w `app/manifest.ts` i wpisy w `lib/support/contextual-help.ts`
(z nowymi trasami). Etykiety w `lib/flo/functions/*` („Przeterminowane”,
„Skrzynka odbiorcza”) zostają; wpisz je w opis PR jako zadanie dla toru
silnika.

---

## 5. Strona po stronie: karty, podpisy i dane

Konwencja: **[Finora] → [u nas, po polsku] · dane · uwagi**. Pusty stan
każdej karty: komunikat z §7.3, nigdy pusty wykres z osiami.

### P0. Szkielet (każdy ekran)

- Pasek boczny Finory z grupami z §4; logo FaktFlow (`components/brand/brand-wordmark`).
- Nagłówek: przycisk zwijania menu · **paleta poleceń** w miejscu „Type to
  search…” („Szukaj lub przejdź… ⌘K”, §8 N4) · **dzwonek usuwamy** w E2, bo
  w aplikacji nie ma listy powiadomień (`DashboardOrgHeader` to wyłącznie
  przełącznik firmy) · **przełącznik firmy** (`OrgSwitcher`, nazwa + NIP)
  stoi widocznie w nagłówku Finory, przed przełącznikiem motywu, a na
  telefonie jako pigułka z arkuszem, jak dziś. Aktywna firma musi być zawsze
  widoczna · przełącznik motywu (nasz `ThemeToggle`) · avatar z menu:
  Ustawienia, Przełącz firmę (otwiera ten sam przełącznik), Wyloguj
  (`signOut`). „Profil” wylatuje (P14). Telefon: ikona lupy w nagłówku
  otwiera paletę N4, bo Finora chowa tam przycisk „Type to search…”.
- Wyrzucamy: panel personalizacji, „Buy Now”, linki stopki do shadcn/studio.
  Stopka: „© FaktFlow · Regulamin · Polityka prywatności · Pomoc”.
- Banery (`KsefHealthBanner`, weryfikacja, brak firmy) zostają nad treścią
  strony, w stylu `Alert` Finory.
- Wszystko z `layout.tsx` (IdleWatcher, InstallPrompt, SupportWidget,
  AnalyticsIdentify, prefetch) zostaje.

### P1. Pulpit `/dashboard` ← Finance

Siatka Finory bez zmian.

**Slot FLO (od `lg`).** Pełna szerokość nad siatką, kontener o stałej
wysokości `h-[min(640px,70dvh)]` z `overflow-hidden`
w `app/(dashboard)/dashboard/page.tsx` (to nie jest plik FLO). W środku te
same trzy gałęzie co dziś (`!agent.ok` / brak propozycji / `FloScreen`),
z tymi samymi propsami. Wątek FLO przewija się w sobie, strona pod nim
normalnie. Szyna 320 px w `FloScreen` (Zatwierdzone, historia) zostaje.
Do `aside` trafia tylko `DashboardVerificationBanner` w wariancie `rail`.
`MonthlyFiguresCard` wylatuje, baner certyfikatu zostaje, więc zostaje też
reguła chowająca `.ff-shell-banner` od `lg`. Blokadę przewijania
(`DashboardRouteFlags` i reguły `html.ff-route-dashboard .ff-shell-scroll`
w `globals.css`) E4 ogranicza do `max-width: 1023.98px`. W gałęzi awarii
tekst „Liczby miesiąca obok są aktualne” zmień na „Liczby miesiąca są
w kartach poniżej”. Na 1440×900 górna krawędź pierwszego rzędu kart ma być
widoczna bez przewijania. **Poniżej `lg`** `/dashboard` zostaje
pełnoekranowym FLO jak dziś, z blokadą. Siatka Finance jest tam ukryta
(`hidden lg:grid`), a liczby miesiąca na telefonie są na `/przeplywy` (P2).
O innym miejscu siatki na telefonie decyduje Bartosz. Jeśli FLO wygląda źle
w tej wysokości, zgłoś to Masłu i nie ruszaj `components/flo/*`. Przed E4
przeczytaj `docs/flo/UKLAD-DASHBOARDU.md` i zaktualizuj go w tym samym PR.

Karty buduj według §2.4 pkt 15.

| Karta Finory | U nas | Dane |
|---|---|---|
| Finance („Yearly report overview”, 3 serie w stosie, bez legendy) | **Przychody i koszty** · „Ostatnie 12 miesięcy” | sprzedaż netto: `getSalesSeries` z nowymi parametrami opcjonalnymi `{ months = 6, withPrevYear = true }`, która zwraca też per miesiąc `net` i `vat` (`remainder(…, 'net' \| 'vat')`) z tych samych wierszy. Wywołanie bez parametrów zwraca dokładnie to co dziś (brutto, 6 mies. + rok wcześniej), więc `SalesChartCard` i jego testy się nie zmieniają. Pulpit woła `{ months: 12, withPrevYear: false }` i bierze `net`. Koszty: §2.4 pkt 12 (`kpirCostAmount`). Dwie serie OBOK SIEBIE, nie w stosie: w `BarChart` usuń `stackId` (to konfiguracja, nie siatka). Kolory `chart-1` (przychody) i `chart-5` (koszty), bo w niebieskich presetach `chart-3` i `chart-4` prawie się nie różnią. Dodaj `ChartLegend` z podpisami „Przychody netto” / „Koszty”. Przy 12 grupach `barSize` ≤ 10. Jeśli słupek wyjdzie węższy niż 6 px, pokaż 6 miesięcy i zmień podpis. Testy: wywołanie bez parametrów = dziś; okno przez przełom roku; ROZ z zaliczką sprzed okna; „Zysk” miesiąca na Pulpicie = „Dochód” tego miesiąca na `/przeplywy` dla tych samych danych |
| Report („Monthly Avg.”, Total Profit / Income / Expense, „View Report”) | **Ten miesiąc** · „Średnio miesięcznie: X zł” · Zysk / Przychody / Koszty · przycisk **„Zobacz przepływy”** → `/przeplywy` | `getMonthlyFigures` + koszty miesiąca z §2.4 pkt 12. Średnio miesięcznie = średnia `net` z 11 pełnych miesięcy, bez bieżącego |
| Kafel Total Orders (+22%, „Last 4 months”) | **Faktury** · % vs poprzedni · plakietka „Ten miesiąc” (okres niesie plakietka, jak „Last 4 months” u Finory) | `getMonthlyFigures().acceptedCount` / `prevAcceptedCount`; % tylko przy `hasPrevMonth = true`, inaczej podpis „Brak poprzedniego miesiąca” (`momCountPct` zwraca wtedy 0) |
| Kafel Total Profit (−16%, „Last One year”) | **Należności** · „X faktur nieopłaconych” | §2.4 pkt 11 |
| Total Revenue (mini‑słupki, w Finorze 5 × 2 serie, %) | **Przychód netto** · mini‑słupki 6 mies. · % vs poprzedni | `getSalesSeries(…).net`, ostatnie 6 z 12 miesięcy |
| Impression (linia, „Last year”, +24%) | **VAT należny** · linia, „6 mies.” | `getSalesSeries(…).vat`, czyli dokładnie ta liczba, którą `VatSummaryCard` pokazuje dla bieżącego miesiąca · stopka: termin VAT z `getMonthlyFigures`. Bez VAT naliczonego i bez „do zapłaty”. **Firma zwolniona podmiotowo** (`isSubjectiveVatExemption`) widzi w tym miejscu **Limit zwolnienia z VAT**: linia sprzedaży narastająco od 1 stycznia + pozioma linia limitu, kwota „X zł z 240 000 zł”, stopka z prognozą daty przekroczenia — dane jak w P2 („Savings goal”) |
| Total visitors (Desktop/Tablet/Mobile + słupki) | **Należności według terminu** · Przed terminem / Do 30 dni po terminie / Ponad 30 dni po terminie (% kwoty) · przycisk „Szczegóły” → `/payments/overdue` | §2.4 pkt 11. Podziału „zapłacone w terminie / po terminie” nie robimy, bo `paid_at` to dzień potwierdzenia, nie przelewu (§2.4 pkt 14) |
| Top Products by Sales | **Najlepiej sprzedające się** · nazwa, j.m., kwota netto | §2.4 pkt 13, 12 mies., top 5 (GTU wylatuje, bo pozycje go nie mają) |
| Top Products by Volume (ilość + plakietka %) | **Najwięksi klienci** · nazwa, NIP, kwota netto, plakietka % zmiany | faktury `outgoing` z §2.4 pkt 2 po `buyer_nip`, 12 mies. vs poprzednie 12. Klucz `buyer_nip`, a gdy go brak `buyer_data->>name`; nabywcy B2C (`is_b2c`) jako jedna pozycja „Konsumenci” |
| Tabela użytkowników (filtry Role/Plan/Status) | **Ostatnie faktury** · Kontrahent / Numer / Brutto / Termin / Płatność / KSeF · bez filtrów: 5 ostatnich wierszy + „Wszystkie faktury” | `lib/invoices/list-query.ts` |

`MonthlyFiguresCard` znika z Pulpitu. Szkice (`draftCount`) idą jako dopisek
„+ N szkiców poza KSeF” na kafel „Faktury”, a termin VAT (`vatDueLabel`,
`daysToVatDue`) jako stopka karty „VAT należny”. Wykresu SVG na Pulpicie nie
ma: `SalesChartCard` stoi na `/przeplywy`.

### P2. Przepływy `/przeplywy` ← Cash Flow (+ 2 karty z Net Worth)

| Karta Finory | U nas | Dane |
|---|---|---|
| Cash Flow (Weekly/Monthly/Yearly, wpływy/wypływy) | **Wpływy i wydatki** · przełącznik Tydzień / Miesiąc / Rok · nagłówki „Wpłynęło” i „Wydano” | wpływy: §2.4 pkt 14; wydatki: `gross_amount` z §2.4 pkt 12 |
| Savings goal (pierścień 68%, „$6.8k of $10k”) | **Firma zwolniona z VAT → „Limit zwolnienia z VAT”** · pierścień = % wykorzystanego limitu · w środku „X zł z 240 000 zł” · podpis z prognozą („przy obecnym tempie limit skończy się ok. 14.11”) · kolor wg progów 60/80/90/100%. **Płatnik VAT → „Odłóż na podatek”** · w środku kwota z `estimateIncomeTaxThisYear` z jej zastrzeżeniami („szacunek od 1 stycznia”, „19% liniowy”), pierścień jako pełny łuk bez procentu (nie znamy kwoty już odłożonej) | Limit: **gotowe czyste funkcje** `vatLimitState`, `proratedLimit` (limit proporcjonalny, gdy firma ruszyła w trakcie roku), `forecast`, `THRESHOLDS` z `lib/flo/functions/vat-limit.ts` — tylko IMPORT, plik zostaje nietknięty (D4); kwota limitu `vatExemptionLimit` z `lib/flo/tax-params.ts` (240 000 zł od 1.01.2026). Jeśli import ciągnie kod serwerowy FLO do komponentu klienta — licz na serwerze i podaj do karty gotowy wynik. Wejście: sprzedaż netto faktur `outgoing` wg §2.4 (środowisko, korekty, zaliczki) z datą sprzedaży, z bieżącego roku. Test: firma założona w trakcie roku, korekta in minus, przekroczenie 100%. „Odłóż na podatek”: `estimateIncomeTaxThisYear` — **już liczone na tej stronie**, przenosimy z `CashFlowDashboard` |
| Income this month (+% vs last month) | **Wpłynęło w tym miesiącu** | jak wpływy wyżej |
| Expense this month | **Wydano w tym miesiącu** | jak wydatki wyżej |
| Top Cash Flow Sources (lista z +/− i paskami) | **Skąd i dokąd płyną pieniądze** · top 5: klienci (+), dostawcy (−) | klienci (+): opłacone faktury po nabywcy (§2.4 pkt 14); dostawcy (−): wydatki z §2.4 pkt 12 po `seller_nip` |
| Upcoming Bills („Next 30 days”, „Due in X days”) | **Spodziewane wpływy** · „Najbliższe 30 dni” · „za X dni” | należności z §2.4 pkt 11 z `payment_due_date` od dziś do +30 dni (Europe/Warsaw), kwota `outstandingOf` |
| Recent Activity | **Ostatnie operacje** | ostatnie faktury z `paid_at` + ostatnie wydatki z §2.4 pkt 12, 5 pozycji |
| Tabela Counterparty/Category/Amount/Status/Actions | **Wszystkie operacje** · Kontrahent / Kategoria / Kwota / Status · filtry „Kategoria”, „Status” | jak wyżej, paginacja Finory |
| Net Worth → Assets vs Liabilities | **Należności** · „Przed terminem / po terminie” | dwie kwoty z §2.4 pkt 11 |
| Net Worth → Liquidity Snapshot | **Zaległości** · „Po terminie: X% należności” | iloraz dwóch liczb wyżej; przy zerowych należnościach pusty stan |
| — (zostaje nasze) | **Podsumowanie VAT** | `VatSummaryCard`, sama treść bez zmian |

**Układ:** rzędy Cash Flow zostają bez zmian. Przed tabelą „Wszystkie
operacje” dochodzi jeden rząd skopiowany z pierwszego rzędu strony Net Worth.
Po lewej karta szerokości karty Net Worth z **Podsumowaniem VAT**. Po prawej
kolumna z dwiema kartami połówkowej wysokości (jak Assets vs Liabilities
i Liquidity Snapshot): **Należności** u góry, **Zaległości** na dole.
**Faktury kosztowe z KSeF nie mają w bazie terminu płatności ani statusu
zapłaty** (`inbox-polling` zapisuje same metadane, a `payment_status` ma
domyślne `'unpaid'`). Dlatego kart „Nadchodzące płatności”, „Zobowiązania”
i „Płynność” nie budujemy (N7).

Poniżej `lg`, nad siatką Przepływów, stoją karty P1 „Ten miesiąc”
i „Przychody i koszty” (te same komponenty, `lg:hidden`). Na telefonie Pulpit
to sam FLO, a „Miesiąc” w dolnym pasku prowadzi tutaj. `MonthlyFiguresCard`
i `SalesChartCard` usuwasz w E5 dopiero wtedy, gdy ich liczby (przyjęte,
szkice, VAT należny, sprzedaż brutto, termin VAT) są w tych kartach.

### P3. Faktury `/invoices` ← Invoice List

- Kafle: Clients / Invoices / Paid / Unpaid → **Kontrahenci** / **Faktury
  w tym miesiącu** / **Opłacone** (kwota) / **Do zapłaty** (kwota,
  §2.4 pkt 11).
- Pasek: „Show 10” → „Pokaż 10” · „Create Invoice” → **„Wystaw fakturę”**
  (→ `/invoices/new`) · „Search by ID or client” → „Szukaj po numerze lub
  kontrahencie” · filtr statusu „All” → „Wszystkie” + **„Status KSeF”**,
  **„Rodzaj”** (VAT / zaliczkowa / korygująca / końcowa).
- Kolumny: ID → **Numer** (`internal_number`) · Status (ikona) → **Płatność**
  (ikona z `payment_status` i daty: opłacona; termin minął → po terminie;
  w pozostałych przypadkach nieopłacona) + plakietka **KSeF**
  (`ksef_status`) · Client (avatar + nazwa + podpis) → **Nabywca** (inicjały
  firmy + nazwa + NIP; nie zdjęcia) · Total → **Brutto** · Issued Date →
  **Wystawiona** · Due → **Termin** · Balance → **Do zapłaty**
  (`outstandingOf` z `lib/invoices/amount-due.ts`; 0 = plakietka
  „Opłacona”). Kolumna „Do zapłaty” i ikona płatności tylko dla faktur
  spełniających §2.4 pkt 11 (bez warunku statusu). Szkice, importy, korekty
  i faktury w walucie obcej dostają „—”, nigdy plakietkę „Opłacona”. ·
  Actions → **Podgląd, PDF, ⋯**. W menu: **Korekta** →
  `/invoices/new/correction?parentId=<id>`, tylko dla faktur, które formularz
  korekty przyjmuje (warunki z `new/correction/page.tsx`); **Pobierz XML**;
  **Usuń** tylko dla szkicu. „Oznacz jako zapłaconą” nie istnieje (N6).
  „Duplikuj” i „Ustaw jako cykliczną” dodaje E9 (N1).
- **Kosz z akcji Finory: tylko dla szkiców.** Faktury wysłanej do KSeF nie
  usuwamy nigdy.
- Zaznaczanie wierszy + „Pobierz PDF zaznaczonych” (`batch-pdf-download`).
- Dane: `lib/invoices/list-query.ts` (filtry i paginacja na serwerze).
  Rozszerz go (czyste funkcje + test w `tests/unit/lista-faktur-filtry.test.ts`,
  w PR E3) o parametry adresu: `platnosc` (`oplacone` / `nieoplacone` /
  `po_terminie`; ten ostatni z daty: `payment_due_date < dziś`
  w Europe/Warsaw i `payment_status <> 'paid'`), `rodzaj` (`invoice_kind`)
  i `na_stronie` (10/25/50, domyślnie 50, żeby stare linki działały).
  Obecne parametry (`q`, `status`, `od`, `do`, `strona`) się nie zmieniają.
  Filtry i „Pokaż 10” Finory sterują adresem przez `invoiceListHref`, nie
  stanem w przeglądarce.
- Telefon: karty jak dziś (§7.2).

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
  z `invoice-detail-view`. Istniejące akcje: Pobierz PDF, Wyślij e‑mailem
  (`EmailInvoiceButton`), Pobierz XML, wysyłka i usunięcie szkicu, UPO,
  decyzja o duplikacie KSeF (440), komunikat błędu KSeF; plus link Korekta
  jak w P3. „Drukuj” otwiera PDF z `/api/invoices/[id]/pdf` w nowej karcie.
  Dokumentem jest PDF, a `window.print()` wydrukowałby szkielet panelu. Kod
  QR w podglądzie generujesz z `lib/ksef/qr-codes.ts`. Telefon (poniżej
  `lg`): plakietka statusu KSeF i główna akcja („Wyślij do KSeF” albo
  „Pobierz UPO”) stoją NAD dokumentem (`order-first`), reszta prawej kolumny
  pod nim. **Logiki i zasad zgody nie zmieniamy** — przenosimy JSX.

### P5. Wystaw fakturę `/invoices/new/*` ← Create Invoice

- Formularz wygląda jak dokument (układ Finory): u góry sprzedawca +
  **Numer faktury** (podpowiedź z `suggestNextInvoiceNumberForTenant`, pole
  edytowalne, `id='internalNumber'` zostaje) + daty; niżej **Nabywca** (wyszukiwarka
  kontrahenta + NIP z GUS — istniejące); pozycje w wierszach jak w Finorze;
  podsumowanie po prawej na dole.
- Pola i walidacja zostają NASZE (RHF + Zod, GTU, MPP, VAT per pozycja,
  waluta/NBP, zaliczki, korekty, faktura końcowa). „Hours” → **Ilość + J.m.**,
  „Cost” → **Cena netto**, „Salesperson”, SWIFT, „Discount %” (jeśli go nie
  obsługujemy) — wylatują.
- Prawa kolumna: Send Invoice / Save → **„Wystaw i wyślij do KSeF”**
  (główny), **„Zapisz szkic”**, **„Podgląd”**.
- To najbardziej ryzykowny ekran — robi się go po stronach tylko do odczytu
  (sesja lokalna, §9). Każdy z 4 rodzajów (`regular`, `advance`, `correction`, `final`)
  musi przejść istniejące testy.

### P6. Faktury cykliczne `/invoices/recurring` ← Recurring Invoices — NOWE (N1)

- Kolumny: ID → **Szablon** (nazwa) · Client → **Kontrahent** · Frequency →
  **Częstotliwość** (co miesiąc / co kwartał / co rok) · Next Run →
  **Następne wystawienie** · Amount → **Kwota brutto wzoru** · Status →
  **Aktywna / Wstrzymana / Do wystawienia** · Actions: Generate now →
  **Wystaw teraz** (link z N1), Delete → **Usuń**, ⋯ → **Wstrzymaj/Wznów,
  Edytuj** (nazwa, częstotliwość, dzień, wzór; nigdy treść faktury‑wzoru).
- „+ New Recurring Invoice” → **„+ Nowa faktura cykliczna”** (tworzy się
  z istniejącej faktury: wybór faktury-wzoru spełniającej warunki z N1 +
  częstotliwość + dzień).
- Baner na `/invoices`: „N faktur cyklicznych czeka na wystawienie” (N1).

### P7. Przypomnienia `/payments/overdue` ← Invoice Reminders

- Wiersz = faktura po terminie (jak dziś z `invoices_overdue`, warunki
  z §2.4 pkt 11). Nad tabelą kafle w stylu P3: **Po terminie** (kwota),
  **Faktur po terminie**, **Przypomnień wysłanych w miesiącu**,
  **Wstrzymanych** (`reminders_paused = true`).
- Kolumny: ID → (bez) · Invoice → **Faktura** · Client → **Kontrahent** · Due
  Date → **Termin płatności** · Remind On → **Przypomnienie** (ostatni wpis
  z `payment_reminders` tej faktury: `scheduled_for` + etap 1–4) · Status →
  **Zaplanowane / Wysłane / Nieudane / Anulowane**. Kolumny „Kanał” nie ma,
  dopóki nie ma SMS. Actions → **Przygotuj przypomnienie** (istniejący
  podgląd i `ReminderConsentDialog`; zgoda zostaje) oraz **Wstrzymaj /
  Wznów** (`toggleInvoiceRemindersAction`). „Wyślij teraz” bez okna zgody,
  osobne „Wezwanie do zapłaty (PDF)” i planowanie na wybraną datę wylatują.
  PDF wezwania jest załącznikiem etapu (`lib/reminders/prepare-delivery.ts`),
  a terminy wyznacza `cron.reminder-scheduler`.
- „+ New Reminder” → **„Ustawienia przypomnień”** → `/settings/reminders`
  (tylko dla właściciela).
- Dane: `invoices_overdue`, `payment_reminders`, logika i zabezpieczenia
  z `components/reminders/overdue-dashboard` i `lib/reminders/*` bez zmian.

### P8. Wydatki `/expenses` ← Transactions

- Kafle: Money In / Money Out / Net / Upcoming → **Wydatki w miesiącu**
  (brutto) / **VAT do odliczenia** (`vat_deductible_amount`) / **Do opisania**
  (liczba `is_reviewed = false`) / **Stałe koszty** (N3). Kafle liczy osobne
  zapytanie z §2.4 pkt 12 dla miesiąca, nie lista (lista `/expenses` ma
  `limit(500)` i nie filtruje środowiska). „VAT do odliczenia” według reguły
  z §2.4 pkt 12.
- Telefon: karty jak dziś (§7.2).
- Kolumny: Date → **Data** · Merchant → **Sprzedawca** (nazwa + NIP) · Group →
  **Źródło** (KSeF / Zdjęcie / Ręcznie / Import) · Category → **Kategoria**
  (`category_label`) · Account → **Kolumna KPiR** (`kpir_column`) · Method →
  **Dokument** (rodzaj + numer) · Amount → **Brutto** · Status → **Opisany /
  Do opisania** · Actions → **Szczegóły, ⋯**.
- Filtry „All groups / categories / statuses” → **„Wszystkie źródła /
  kategorie / statusy”**. „+ Add Transaction” → **„+ Dodaj wydatek”**
  (istniejący `capture-button`, z aparatem na telefonie).

### P9. Skrzynka KSeF `/inbox` ← Transactions (ten sam komponent tabeli)

- Kafle: **Nowe faktury** (wydatek `is_reviewed = false`), **Faktury
  kosztowe w miesiącu** (brutto, §2.4 pkt 12), **Do opisania** (liczba),
  **Ostatnie pobranie z KSeF**.
- Kolumny: **Data wystawienia · Sprzedawca (NIP) · Numer · Numer KSeF ·
  Brutto · Status** (Nowa / Opisana) · Akcje. Kolumna „Termin płatności”
  wylatuje: termin i zapłata faktur kosztowych to N7.
- Telefon: karty jak dziś (§7.2).

### P10. Analiza kosztów `/analizy/koszty` ← Monthly Analytics — NOWE

| Karta Finory | U nas | Dane |
|---|---|---|
| Wybór miesiąca („October 2026”) | **„Październik 2026”** (nazwy miesięcy po polsku) | — |
| 4 kafle (Total spent, Avg daily, vs last month, top category) | **Wydano** / **Średnio dziennie** / **vs poprzedni miesiąc** / **Największa kategoria** | `expenses` w miesiącu (§2.4 pkt 12) |
| Spend Trend | **Trend wydatków**: 6 ostatnich miesięcy, jedna seria (jak w Finorze) | `expenses` po `issue_date` (§2.4 pkt 12) |
| Spend by Category | **Wydatki według kategorii** (top 5 + „Pozostałe”) | `category_label` |
| Top Categories (paski) | **Największe kategorie** | j.w. |
| Recent Expenses | **Ostatnie wydatki** | 5 ostatnich |
| Spending Streaks | **VAT z wydatków**: ten sam komponent (3 wiersze liczb): VAT naliczony w miesiącu / VAT do odliczenia (§2.4 pkt 12) / Dokumenty do opisania (`is_reviewed = false`). Siatka zostaje pełna. | §2.4 pkt 12 |
| Income vs Expense | **Przychody a koszty** · Przychody / Koszty / Wynik | jak P1 |
| Subscriptions | **Stałe koszty** · dostawca, średnia kwota, „zwykle około X dnia miesiąca” | N3 |
| Daily Spend (mapa ciepła, 180 dni) | **Kalendarz wydatków**: ostatnie 180 dni, mapa ciepła jak w Finorze, niezależnie od wybranego miesiąca | suma `expenses` na dzień |

### P11. Analiza sprzedaży `/analizy/sprzedaz` ← Monthly Analytics (drugi raz) — NOWE

Ten sam układ co P10, dane sprzedaży (faktury `outgoing` wg §2.4):

| Karta Finory | U nas |
|---|---|
| 4 kafle | **Sprzedano** / **Średnio na fakturę** / **vs poprzedni miesiąc** / **Najlepszy klient** |
| Spend Trend | **Trend sprzedaży**: 6 ostatnich miesięcy, jedna seria (jak w Finorze) |
| Spend by Category | **Sprzedaż według produktów** (§2.4 pkt 13, top 5 + „Pozostałe” w kolorze `muted-foreground`, jak w Finorze). „Pozostałe” = suma pozostałych pozycji, NIE sprzedaż ogółem minus top 5 |
| Top Categories | **Najlepsze produkty i usługi** |
| Recent Expenses | **Ostatnie faktury** |
| Spending Streaks | **Należności**: 3 wiersze: Do zapłaty / Po terminie / Najstarsza zaległość (dni), z §2.4 pkt 11 |
| Income vs Expense | **Przychody a koszty** |
| Subscriptions | **Stali klienci** — fakturowani w ≥ 3 z ostatnich 4 miesięcy; przy każdym przycisk **„Zrób fakturę cykliczną”** → N1 (przycisk dodaje E9) |
| Daily Spend | **Kalendarz sprzedaży**: ostatnie 180 dni, mapa ciepła jak w Finorze, niezależnie od wybranego miesiąca |
| + Asset Allocation (z inwestycji) | **Udział klientów w przychodach** (wykres kołowy, top 5 + „Pozostali”); gdy jeden klient > 50% — podpis „Uwaga: jeden klient to ponad połowa przychodu” |
| + Top Gainers / Top Losers (z inwestycji) | **Klienci: rośnie / spada** — zmiana sprzedaży 3 mies. vs poprzednie 3 |

Karty z inwestycji idą osobnym rzędem 3 × 1/3 pod siatką, jak rząd
Watchlist | Top Gainers | Top Losers na `/investments/equities`: **Udział
klientów w przychodach** | **Klienci: rośnie** | **Klienci: spada** (Top
Gainers i Top Losers to dwie osobne karty). Klient we wszystkich kartach
klientów (Najlepszy klient, Udział, rośnie / spada, Stali klienci): klucz
`buyer_nip`, a gdy go brak `buyer_data->>name`; nabywcy B2C (`is_b2c`) jako
jedna pozycja „Konsumenci”. Karty produktów mają podpis „Bez korekt
i nierozliczonych zaliczek” (§2.4 pkt 13).

### P12. Bank `/bank`, `/bank/operacje` ← Accounts + Transactions — NOWE (N5, etap późniejszy)

- `/bank` (układ Accounts): kafle **Wpływy w miesiącu / Wypływy / Rachunki /
  Niedopasowane operacje**; karty rachunków (`account_iban`, `bank_name`,
  liczba operacji, data ostatniego importu). „Add Account” → **„Importuj
  wyciąg”**.
- `/bank/operacje` (układ Transactions): **Data · Kontrahent · Tytuł ·
  Rachunek · Kwota · Dopasowanie** (Dopasowano do FV … / Do sprawdzenia /
  Pominięte) · Akcje: **Potwierdź, Zmień fakturę, Pomiń**.
- Salda Finory wylatują — wyciąg nie daje pewnego salda.
- Dostęp do danych (job z `service_role`, RPC `SECURITY DEFINER`),
  potwierdzenie przed zapisem wpłaty i duplikaty: N5. Baner na `/bank`
  i `/payments/overdue`: „Przypomnienia ruszą DD.MM HH:MM — sprawdź nowe
  wpłaty z wyciągu”.

### P13. Kontrahenci, KPiR, Eksport, Import

- **Kontrahenci** — tabela i kafle z P3: kafle **Kontrahenci / Aktywni
  (90 dni) / Z zaległościami / Status VAT do sprawdzenia**. „Aktywni
  (90 dni)” to kontrahenci z co najmniej jedną fakturą z §2.4 pkt 2
  w ostatnich 90 dniach (po `buyer_nip`), nie z `last_used_at`. „Z
  zaległościami” to liczba kontrahentów z fakturą po terminie z §2.4 pkt 11.
  Kolumny: **Nazwa · NIP · Status VAT · Należności** (§2.4 pkt 11, po
  `buyer_nip`) · **Po terminie** (liczba faktur kontrahenta po terminie,
  §2.4 pkt 11) · Przypomnienia (przełącznik) · Akcje. „Śr. czas zapłaty”
  i „Spóźnienia” wylatują: kolumny w bazie są puste (00023), a ocena
  terminowości konkretnego kontrahenta to K-03 (`payment.score`), wstrzymana
  do opinii prawnika. Logika z obecnej strony bez zmian. Telefon: karty jak
  dziś (§7.2).
- **KPiR** — tabela Transactions: **Lp. · Data · Nr dowodu · Kontrahent ·
  Opis · Kolumna · Kwota**; logika `kpir-view` bez zmian.
- **Eksport** i **Import danych** — karty z ikonami w stylu Accounts; logika
  bez zmian.

### P14. Ustawienia `/settings/*` ← Settings

Układ Finory (zakładki po lewej, treść po prawej, sekcje „etykieta + opis po
lewej, kontrolka po prawej”), ale zakładki to `<Link>`
w `app/(dashboard)/settings/layout.tsx`, aktywne według `usePathname()`,
a nie stan komponentu. Menu ☰ na telefonie też składa się z linków. Adresy
`/settings/*` się nie zmieniają, bo prowadzą do nich maile (`TrialEnding`,
`PaymentFailed`), powrót ze Stripe i FLO. Listę zakładek liczy layout na
serwerze z roli (`getPageContext`), tak jak dziś `settings/page.tsx`:
Przypomnienia tylko właściciel, Zespół i Abonament właściciel albo
administrator.

| Finora | U nas (istniejąca trasa) |
|---|---|
| General | **Firma** (`/settings`: profil firmy, zwolnienie z VAT, metoda kasowa) |
| Profile | wylatuje (nie mamy profilu użytkownika) |
| Security | **Bezpieczeństwo** (`/settings/security`, MFA) |
| Notifications | **Powiadomienia** (`/settings/notifications`) |
| Connected Accounts | **KSeF** (`/settings/ksef`) + logowanie Google |
| — | **Przypomnienia** (`/settings/reminders`), **Księgowa** (`/settings/accountant`), **Zespół** (`/settings/team`), **Abonament** (`/settings/billing`), **FLO** (`/settings/flo` — tylko ramka, treść Masła), **Dziennik zdarzeń** (`/settings/audit`) |
| Privacy & Data | **Konto i dane (RODO)** = `/settings/account` (dziś „Konto i firma”: eksport z art. 15, usunięcie konta, usunięcie firmy) |

Usunięcie firmy zostaje w jednym miejscu: `DeleteAccountSection` znika
z `/settings`.

Wylatują z General: język, waluta, strefa czasowa, początek roku obrotowego
(zawsze PL / PLN / Europe/Warsaw / rok kalendarzowy).

### P15. Logowanie `(auth)` ← Login / Register / Forgot Password

- Lewa połowa: formularz Finory. „Login with Google” → **„Zaloguj przez
  Google”**; Facebook wylatuje; „Or continue with Email” → **„lub e‑mailem”**;
  „Remember me” wylatuje: nie mamy tej funkcji, a `IdleWatcher` wylogowuje po
  60 min bezczynności; „Forgot Password?” → **„Nie pamiętasz hasła?”**; „New
  on our platform? Create an account” → **„Nie masz konta? Utwórz konto”**.
- Prawa połowa: animowane tło Finory zostaje; karta z hasłem →
  **„Faktury w KSeF bez stresu. FLO pilnuje terminów, płatności i VAT‑u za
  Ciebie.”** (treść do akceptacji Masła). Do komponentu tła przekaż kolory
  z presetu D2 (Finora ma na sztywno zieleń `#5ee9b5`/`#00bc7d`/`#009966` na
  czarnym) i zestaw znaków z „zł” na początku. Na telefonie prawa połowa jest
  ukryta, więc slogan stoi nad formularzem, w jednej linii.
- Akcje serwerowe, MFA, Google OAuth i reset hasła są nasze i się nie
  zmieniają. `TurnstileWidget` zostaje w formularzach logowania, rejestracji
  i resetu hasła, bo akcje go weryfikują. Układ karty Finory dostają: `login`,
  `register`, `forgot-password`, `reset-password` (dziś bez `AuthPageShell`),
  `login/two-factor`, `login/two-factor/setup`, `gdpr/cancel`. Ekranów 2FA
  i nowego hasła Finora nie ma, więc składasz je z jej Card i Input.
  `styles/zova.css` zostaje (landing, 404, przerwa techniczna).

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
| Upcoming Bills | Spodziewane wpływy | Recent Activity | Ostatnie operacje |
| Top Cash Flow Sources | Skąd i dokąd płyną pieniądze | Savings goal | Limit zwolnienia z VAT / Odłóż na podatek |
| Income / Expense this month | Wpłynęło / Wydano w tym miesiącu | Income vs Expense | Przychody a koszty |
| Spend Trend | Trend wydatków | Spend by Category | Wydatki według kategorii |
| Top Categories | Największe kategorie | Subscriptions | Stałe koszty |
| Daily Spend | Kalendarz wydatków | Frequency / Next Run | Częstotliwość / Następne wystawienie |
| Monthly / Quarterly / Yearly | Co miesiąc / Co kwartał / Co rok | Weekly / Monthly / Yearly (przełącznik) | Tydzień / Miesiąc / Rok |
| Show 10 / Showing 1 to 10 of 25 entries | Pokaż 10 / Pozycje 1–10 z 25 | Previous / Next | Poprzednia / Następna |
| Search… / Type to search… | Szukaj… / Szukaj lub przejdź… ⌘K | All | Wszystkie |
| Details / View Report | Szczegóły / Zobacz przepływy | Settings / Security | Ustawienia / Bezpieczeństwo |
| Notifications / Connected Accounts | Powiadomienia / KSeF i połączenia | Privacy & Data | Konto i dane (RODO) |
| Welcome Back / Login / Sign up | Witaj ponownie / Zaloguj się / Utwórz konto | Last month / vs last month | Poprzedni miesiąc / vs poprzedni miesiąc |
| Light / Dark | Jasny / Ciemny | Log out | Wyloguj |

---

## 7. Formaty, długość tekstów, puste stany

### 7.1. Format liczb i dat
- Kwoty: `12 345,67 zł` (spacja nierozdzielająca) przez `formatPlMoney`.
  Kwoty czterocyfrowe są bez spacji (`1234,56 zł`), bo tak działa polski
  CLDR; NIE zmieniaj tego. W małych kaflach Pulpitu i na osiach wykresów
  używasz nowego helpera `formatPlCompactMoney` w `lib/format/pl.ts`
  („45,6 tys. zł”, „1,2 mln zł”), z pełną kwotą w `title` i testem Vitest.
  Nigdy `$` ani `K`.
- Daty: `17.10.2026`; miesiące słownie po polsku („październik 2026”);
  strefa `Europe/Warsaw` (`lib/format/warsaw-date.ts`).
- Liczebniki: `lib/i18n/plural.ts` (1 faktura / 2 faktury / 5 faktur).
- Procent zmiany: „+12%” zielony, „−8%” czerwony (minus typograficzny).

### 7.2. Długość tekstów
Polskie podpisy są o 20–40% dłuższe. Każdą kartę sprawdź na 375 px, 768 px
(tablet) i 1440 px; ucinamy wielokropkiem z `title`, nie łamiemy siatki.

**Tabele na telefonie:** tabela Finory tylko od `lg`. Poniżej `lg` zostaje
nasz wzorzec kart (`components/dashboard/responsive-table.tsx`; na liście
faktur `SwipeableInvoiceRow` z `invoice-list.tsx`), przestylowany kartą
Finory. Przewijanie tabeli w bok na 375 px to błąd, nie wygląd szablonu.

Nazwy kontrahentów w listach kart 1/3: jedna linia, `truncate` + `title`,
forma prawna skrócona („spółka z ograniczoną odpowiedzialnością” → „sp.
z o.o.”, „spółka akcyjna” → „S.A.”), bo KSeF daje pełne formy.

### 7.3. Puste stany (zamiast pustych wykresów)
- Brak danych w ogóle: „Pokażemy to, gdy wystawisz pierwszą fakturę” +
  przycisk „Wystaw fakturę”.
- Za mało danych na trend (< 2 mies.): wartość liczbowa bez wykresu
  + „Wykres pojawi się po drugim miesiącu”.
- Koszty bez KSeF: „Podłącz KSeF, a faktury kosztowe pobierzemy same”
  → `/settings/ksef`.
- Na `/invoices`, `/inbox` i `/contractors` zostają dzisiejsze puste stany
  (np. „Brak faktur wystawionych” z linkami „Wystaw pierwszą fakturę”
  i „Importuj historię”), bo pilnuje ich `e2e/tests/04-empty-states.spec.ts`.

---

## 8. Nowe funkcje (podpatrzone u konkurencji, pasują do ekranów Finory)

Kolejność = opłacalność. Każda to osobny PR z testami.

### N1. Faktury cykliczne (inFakt, wFirma, Fakturownia mają; my nie)
- **Zasada:** bez człowieka nic nie tworzy faktury ani szkicu. Szkic
  z wczorajszą datą nie wyjdzie do KSeF (`issueDateNotTodayError`, edycji
  szkicu nie ma), a numer zapisany przy szkicu psuje ciągłość serii. Pozycja
  cykliczna tylko **przypomina** i **wypełnia formularz**.
- **Migracja `00151_recurring_invoices`** (numer z rejestru), addytywna, więc
  „przed wdrożeniem”. Tabela `recurring_invoices`: `id`, `tenant_id`,
  `template_invoice_id` z kluczem `FOREIGN KEY (tenant_id,
  template_invoice_id) REFERENCES public.invoices (tenant_id, id)` (wzór:
  00121), `name`, `frequency` (`monthly` / `quarterly` / `yearly`; bez
  `weekly`, bo nie pasuje do `day_of_month`), `day_of_month` 1–28,
  `next_run_date`, `active`, `created_by`, znaczniki czasu. Do tego
  `UNIQUE (tenant_id, id)` i indeks `(tenant_id, active, next_run_date)`.
  `ENABLE ROW LEVEL SECURITY`, polityki SELECT/INSERT/UPDATE/DELETE
  z `tenant_id = public.get_current_tenant_id()` (z `WITH CHECK`), jawne
  `REVOKE ALL … FROM PUBLIC, anon` i `GRANT` dla `authenticated`
  i `service_role` (wzór: 00150, 00061). W `invoices` dochodzą dwie kolumny
  NULL: `recurring_invoice_id` (FK złożony do `recurring_invoices (tenant_id,
  id)`) i `recurring_period` (np. '2026-11'), z unikalnym indeksem
  częściowym `(tenant_id, recurring_invoice_id, recurring_period) WHERE
  recurring_invoice_id IS NOT NULL`. Test `tests/rls-faktury-cykliczne.test.ts`
  (izolacja firm i unikalność okresu) dopisz do `include`
  w `vitest.rls.config.ts`. Bez tego job CI „RLS isolation” go nie
  uruchomi.
- **Wzór:** tylko faktura `direction='outgoing'`, `origin='app'`,
  `invoice_kind='regular'`, `invoice_type='VAT'`, `ksef_status='accepted'`,
  w PLN. Sprawdza to akcja, która tworzy pozycję.
- **Stan „Do wystawienia”** liczy się przy odczycie: `active AND
  next_run_date <= dziś` (Europe/Warsaw). Pokazuje go P6 i baner na
  `/invoices` („N faktur cyklicznych czeka na wystawienie”). W wersji 1 nie
  ma crona ani joba.
- **„Wystaw teraz”** (P6) otwiera `/invoices/new/regular?cykliczna=<id>`.
  Formularz wypełnia nowa akcja `prefillFromInvoiceAction(invoiceId)`, czyli
  uogólnienie `prefillFromLastInvoiceAction` na wskazaną fakturę. Zasady są
  te same: bez numeru i bez dat. Numer podpowiada
  `suggestNextInvoiceNumberForTenant`, data wystawienia to dziś, termin to
  dziś + `days_to_payment` wzoru. Klient może poprawić treść i klika „Wystaw
  i wyślij do KSeF”. Zasada zgody się nie zmienia.
- **Idempotencja (zajęcie okresu):** zapis faktury z parametrem `cykliczna`
  wpisuje `recurring_invoice_id` i `recurring_period` w tym samym INSERT
  (`insertInvoiceAndLines`). 23505 na tym indeksie (odróżnij go po nazwie od
  `uq_invoices_tenant_internal_number`) daje komunikat „Faktura za ten okres
  jest już wystawiona: FV …”. Po zapisie idzie `UPDATE recurring_invoices
  SET next_run_date = <następna> WHERE id = $1 AND next_run_date = <stara>`.
  Jeśli ten UPDATE się nie uda, następna próba trafi w 23505 i sama
  przesunie `next_run_date`. Testy: dwa równoległe zapisy, ponowienie po
  zapisie faktury, ponowienie po nieudanym UPDATE. W każdym przypadku
  powstaje jedna faktura na okres.
- **Duplikuj** (P3) to link `/invoices/new/regular?wzor=<id>`: ta sama akcja
  podkładu, bez pozycji cyklicznej.
- **N1b (opcjonalnie, osobny PR):** przypomnienie e‑mailem albo pushem
  o pozycji „Do wystawienia”. Wtedy: kolumna `notified_for date` w migracji
  tego PR; cron `cron.recurring-invoices` (`0 6 * * *`, `tz: TZ`)
  w `CRON_JOBS` w `lib/jobs/queues.ts`; rejestracja w istniejącej paczce
  `lib/jobs/handlers/package-b.ts` (worker i test rejestru widzą ją bez
  nowych importów). Liczby w testach zmieniasz świadomie, z komentarzem,
  licząc od `main` w chwili rozgałęzienia: `tests/unit/jobs-foundation.test.ts`
  27 → 28, `tests/unit/jobs-registry.test.ts` paczka B 17 → 18 i KOMPLET
  48 → 49. Pozycję zajmuje `UPDATE … SET notified_for = next_run_date WHERE
  id = $1 AND notified_for IS DISTINCT FROM next_run_date RETURNING id`.
  Wysyła tylko zwycięzca, więc ponowienie nie wyśle drugi raz. W opisie PR
  napisz Bartoszowi, że kontrola po wdrożeniu w AGENTS.md (plik
  z CODEOWNERS) zmienia się na „28/28 cronów”.
- **UI:** P6. Przyciski „Ustaw jako cykliczną” (P3/P4), „Duplikuj” (P3)
  i „Zrób fakturę cykliczną” (P11) dodaje dopiero E9.

### N2. Analiza sprzedaży i kosztów
P10 i P11 — bez nowych tabel. Agregaty w `lib/analytics-finance/*.ts`
(czyste funkcje + test) zasilane przez istniejące zapytania i
`readCompletePages`. Jeśli strona robi > 3 zapytania po pełnej historii —
dopiero wtedy RPC w migracji.

### N3. Stałe koszty i stali klienci
Funkcja czysta: dostawca (`seller_nip`) z wydatkami (§2.4 pkt 12) w ≥ 3
z ostatnich 4 miesięcy = stały koszt (średnia kwota, typowy dzień). To samo
dla nabywców (`buyer_nip`) = stały klient; klucz klienta: `buyer_nip`, a gdy
go brak `buyer_data->>name`, nabywcy B2C (`is_b2c`) jako jedna pozycja
„Konsumenci”. Zasila P8, P10, P11.

### N4. Paleta poleceń ⌘K (Finora ma komponent)
Pozycje: trasy generowane z `dashboardNavSections` (więc ⌘K nie wskaże
trasy, której nie ma) + akcje „Wystaw fakturę” i „Dodaj wydatek” („Importuj
wyciąg” dopiero z N5) + wyszukiwanie faktur (numer, nabywca) i kontrahentów
(nazwa, NIP) przez istniejące zapytania listy, z opóźnieniem 250 ms.

### N5. Import wyciągu bankowego + automatyczne parowanie (inFakt, wFirma, iFirma mają)
- **Wyzwalacz już jest:** `recalculate_invoice_paid_amount` (00073) liczy
  `paid_amount` z `payments`, a `update_invoice_payment_status` (00145)
  ustawia status. Liczą się wpłaty z `is_auto_matched = false OR
  is_confirmed = true`, więc domyślne wartości kolumn (oba FALSE) ZALICZAJĄ
  wpłatę. Dlatego kandydat „Do sprawdzenia” NIE trafia do `payments`.
  Zostaje w `payment_imports` (`is_matched = false`, propozycja faktury
  w nowej kolumnie albo liczona przy odczycie). Wiersz w `payments` powstaje
  dopiero po kliknięciu „Potwierdź” (pojedynczo albo „Potwierdź dopasowane
  (N)”), z `is_confirmed = true`, `bank_import_id` i `match_method`. Potem
  emitujemy `invoicePaymentReceived`, którego dziś nikt nie emituje.
- **Dostęp:** `authenticated` nie ma do `payments` ani `payment_imports`
  żadnych uprawnień (00074). Zapis wyciągu robi job pg-boss z
  `service_role`, z tenantem z `requireUserAndActiveOrg` w payloadzie.
  Odczyt P12, potwierdzenie i pominięcie idą przez RPC `SECURITY DEFINER`
  z `public.get_current_tenant_id()`, w migracji z rejestru, z testem
  w `tests/rls-*.test.ts` dopisanym do `vitest.rls.config.ts`.
- **Duplikaty:** `transaction_id` to identyfikator z pliku, a gdy go brak,
  SHA‑256 z (IBAN, data księgowania, kwota, rachunek kontrahenta, tytuł,
  numer kolejny identycznej operacji w pliku). `provider` to `'csv_mbank'`,
  `'mt940'` itd. (domyślne `'gocardless'` nie pasuje). Zapis `ON CONFLICT
  (tenant_id, provider, transaction_id) DO NOTHING` i komunikat „Pominięto
  N operacji zaimportowanych wcześniej”.
- Parsery w `lib/import/bank/`: CSV mBank, PKO BP, ING, Santander, Pekao,
  Millennium + MT940. Każdy z plikiem przykładowym (zanonimizowanym)
  w testach.
- **Parowanie** tylko przy dokładnie jednej kandydatce i tylko dla uznań
  (`amount > 0`). Kwota = `outstandingOf` ORAZ numer faktury w tytule daje
  „Dopasowano do FV …”, które czeka na „Potwierdź”. „Do sprawdzenia”
  dostają: sam NIP albo rachunek bez numeru, kilka faktur na tę samą kwotę
  (faktury cykliczne!), a także kwota mniejsza od `outstandingOf` z numerem
  w tytule (propozycja wpłaty częściowej).
- **Blokada przypomnień:** import bez poprawnego NIP-u kontrahenta wstrzymuje
  przypomnienia firmy na 48 h (`lib/reminders/delivery-safety.ts`). Baner na
  `/bank` i `/payments/overdue`: „Przypomnienia ruszą DD.MM HH:MM — sprawdź
  nowe wpłaty z wyciągu”.
- UI: P12. To duży etap — **w chmurze tylko jeśli zostaje budżet**, inaczej
  pierwszy etap lokalny.

### N6. Do decyzji Bartosza (NIE robić bez zgody)
- Link do zapłaty na fakturze (BLIK / przelew online) — wymaga Stripe
  Connect i weryfikacji firm; poza budżetem tego planu.
- **Ręczne oznaczenie wpłaty poza FLO.** 00074 celowo zamknęło klientowi
  `payments`, więc decyduje Bartosz. Technicznie: migracja z RPC
  `record_manual_payment(p_invoice_id, p_amount, p_payment_date)`
  `SECURITY DEFINER`, z tenantem z `public.get_current_tenant_id()`, kwotą
  ≤ `outstandingOf`, wierszem z `is_confirmed = true` i `match_method =
  'manual'`, oraz test w `tests/rls-*.test.ts`. Alternatywa: `GRANT SELECT ON
  public.payments TO authenticated` (polityka SELECT już jest), też tylko
  za zgodą Bartosza. Dopiero po tej decyzji „Oznacz jako zapłaconą” wraca do
  P3/P4.
- Saldo VAT (należny − naliczony) — dozwolone (D7), ale wymaga zgodności
  z JPK_V7 (odliczenia, metoda kasowa), więc to osobny etap lokalny po E10.
  „Odłóż na podatek” i limit zwolnienia z VAT są już w P1/P2 (D7).

### N7. Termin i zapłata faktur kosztowych (do decyzji Bartosza)
Najprościej: `inbox-backfill`, po pobraniu XML, czyta
`Platnosc/TerminPlatnosci` (parser jest w `lib/import/fa3-parser.ts`,
`parsePlatnosc`, do wyeksportowania) i zapisuje `payment_due_date`.
Oznaczanie zapłaty kosztów przychodzi razem z N5 albo z RPC z N6. Dopiero po
N7 wracają karty „Nadchodzące płatności”, „Zobowiązania” i „Płynność”.

### Czego NIE robimy
Budżety, karty płatnicze, inwestycje, ubezpieczenia, raty, „Spending
Streaks” jako gra (komponent zostaje z inną treścią), panel personalizacji
motywu dla klienta, cokolwiek z NexaCRM.

---

## 9. Etapy, kolejność i budżet (103 $)

Jeden etap = jedna gałąź `claude/finora-eN-<temat>` od `origin/main` = jeden
PR. Szacunki są orientacyjne — po każdym etapie wpisz rzeczywiste zużycie.
Tabela jest w kolejności wykonania (numery etapów się nie zmieniają).

| Etap | Zakres | Gotowe, gdy | ~$ |
|---|---|---|---|
| **E0** | Plan: sklonuj `../finora-src`, spisz w §10 „Inwentarz Finory” (plik komponentu → karta z §5, zależności z `package.json`, `components.json`, preset z D2: dokładne zmienne CSS, font, mono dla liczb, ikony, prymitywy). Popraw ten plan, jeśli kod przeczy audytowi. PR tylko z dokumentem. | §10 wypełniony, decyzje E1 jasne | 4 |
| **E1** | Fundament: zależności Finory, `components/ui/*` Finory (wg §2.1, migracja na Base UI), `components/ui/chart.tsx`, font, **zmienne motywu z presetu z D2** w `app/globals.css`; stare `--ff-*` jako aliasy nowych zmiennych NA STAŁE (§11); usunięcie martwych efektów „glass” tylko jeśli nic ich nie używa. Nadpisania w `globals.css`, motyw i font: „Dodatki do zakresu etapów” niżej. | `pnpm run ci && pnpm build` zielone, wszystkie stare ekrany działają w nowych kolorach; `/admin` i `/onboarding` renderują się bez błędów (lista sprawdzonych stron w PR); `/admin` nie przechodzi na układ Finory; `/dashboard` w obu motywach: żadna ikona FLO nie wyświetla się jako słowo, kolory wątku bez zmian | 13 |
| **E2** | Szkielet P0 + nawigacja §4 (wpina tylko trasy istniejące w `main`) + dolny pasek + N4 (⌘K) + `error.tsx` / `loading.tsx` panelu (§2.2). Etap stoi na E1 (stos, „Wdrożenia”). Dodatki: niżej. | menu, nagłówek, telefon, ⌘K działają; trasy bez zmian; nowy szkielet zachowuje klasy `ff-dashboard` (korzeń), `ff-shell-scroll` (kontener treści) i `ff-shell-banner` (baner weryfikacji) oraz `DashboardRouteFlags`; do E4 `/dashboard` działa po staremu; `/dashboard` w obu motywach: żadna ikona FLO nie wyświetla się jako słowo, kolory wątku bez zmian; pasek akcji formularzy faktur, „Dodaj wydatek”, bąbelek pomocy i baner PWA stoją poprawnie przy pasku rozwiniętym i zwiniętym | 12 |
| **Punkt kontrolny** | Po E1+E2 sesja lokalna: Bartosz albo Masło ogląda panel (zob. niżej). | decyzja „idź dalej” do E3 | — |
| **E3** | P3 Faktury + P4 Podgląd faktury + `lib/dashboard/receivables.ts` (§2.4 pkt 11) + rozszerzenie `lib/invoices/list-query.ts`. Dodatki: niżej. | lista i podgląd w układzie Finory, wszystkie akcje działają; testy `receivables` i `lista-faktur-filtry` | 12 |
| **E4** | P1 Pulpit (z slotem FLO) + funkcje agregujące z testami + `lib/dashboard/costs.ts` (§2.4 pkt 12) + rozszerzenie `getSalesSeries` (P1). Poprzedza go osobny mały PR strefy czasowej (§2.4 pkt 10). | karty z danymi, puste stany, testy §2.4; konto bez certyfikatu KSeF widzi ostrzeżenie na `/dashboard` przy 1440 px i 375 px; test: faktura w EUR wyłącza karty sprzedaży, a slot FLO się renderuje | 12 |
| **E5** | P2 Przepływy. | wszystkie karty z §P2, stare komponenty usunięte; żadna liczba z obecnego `/przeplywy` nie znika; odczyt danych `/przeplywy` przeniesiony do funkcji w `lib/dashboard/` (np. `getCashFlowData`), asercje z `przeplywy-ksef-environment`, `przeplywy-kafelek-podatku` i `kpir-cost-nondeducted-vat` przepisane na tę funkcję. Stare komponenty usuwasz dopiero potem | 10 |
| **E6** | P8 Wydatki + P9 Skrzynka KSeF + N3 + `/expenses/[id]` (§2.2). | tabele, kafle, filtry | 9 |
| **E8** | P7 Przypomnienia + P13 Kontrahenci/KPiR/Eksport/Import + portal księgowej `/accountant/[token]` (§2.2). | układ Finory, logika bez zmian; odczyt `/reports/kpir` przeniesiony do funkcji, asercje `kpir-roz-zaliczki` przepisane na nią | 8 |
| **E10** | P14 Ustawienia + P15 Logowanie + onboarding i zaproszenie w stylu kart P15 (§2.2). | wszystkie zakładki i ekrany auth | 9 |
| **E7** (warunkowo) | P10 + P11 Analizy (N2) + pozycje `/analizy/*` w menu i ⌘K (§4). W chmurze tylko jeśli po E10 zostaje 10 $ + 3 $; inaczej pierwsza sesja lokalna. Nie wliczone do sumy niżej. | obie strony z danymi i testami | 10 |
| **E9** (warunkowo) | N1 Faktury cykliczne (migracja, `prefillFromInvoiceAction`, P6, przyciski „Duplikuj”, „Ustaw jako cykliczną”, „Zrób fakturę cykliczną”, pozycja w menu i ⌘K). Tak samo: w chmurze tylko jeśli zostaje budżet. Nie wliczone do sumy niżej. | faktura za okres powstaje najwyżej raz (testy z N1), test RLS na liście w `vitest.rls.config.ts` | 10 |
| **Lokalnie** | P5 Wystaw fakturę (ryzyko!), N5 Bank (P12), poprawki z przeglądu wizualnego Bartosza/Masła. | — | — |
| | **Rezerwa** na czerwone CI, aktualizację gałęzi (BEHIND) i poprawki z punktu kontrolnego | | 10 |
| | **Razem w chmurze** (E0–E6, E8, E10 + rezerwa) | | **~99** |

Najpierw domykamy wygląd istniejących ekranów, potem nowe strony. Nowa strona
nie tworzy stanu mieszanego, niedokończony stary ekran tak. Gdy budżet
topnieje szybciej, E7 i E9 przechodzą do sesji lokalnych. Jeśli zostanie
zapas, P5 idzie przed N5.

**Punkt kontrolny:** po E1+E2 Bartosz albo Masło ogląda panel lokalnie (jasny
i ciemny motyw; 375, 768 i 1440 px; obok demo Finory) i dopiero wtedy rusza
E3. Poprawki fundamentu idą osobnym PR przed E3. Dalej każdy etap ekranów
odbiera lokalnie Bartosz albo Masło przed scaleniem.

### Każdy PR etapu zawiera
1. Opis wg `.github/pull_request_template.md`: zakres, tabela weryfikacji,
   migracje „Do wgrania: …”. Sesja w chmurze NIE uruchomi panelu: proxy
   potrzebuje `NEXT_PUBLIC_SUPABASE_URL`, a każda trasa panelu wymaga
   zalogowanego użytkownika. Zrzutów nie robi i nie próbuje. Zamiast nich:
   test `renderToStaticMarkup` każdej nowej karty dla stanu z danymi i stanu
   pustego (wzór: `tests/unit/ui-responsive-table.test.tsx`; karta =
   komponent prezentacyjny z propsami + osobny loader danych) oraz w opisie PR
   tabela „karta → plik w `../finora-src` → nasz plik”. Wygląd sprawdza
   sesja lokalna.
2. Testy nowych funkcji danych (§2.4), `pnpm run ci && pnpm build` zielone.
3. Wiersz w dzienniku (§12) i nowy „Następny krok”.
4. **Testy istniejące.** Przed zmianą zrób `grep -l` po `tests/unit` dla
   każdego ruszanego pliku i wpisz listę tych testów do opisu PR. Testy
   pilnujące danych (`przeplywy-*`, `szczegoly-faktury-*`,
   `lista-faktur-filtry`, `overdue-*`, `ksef-*-environment`, `kpir-*`)
   przenosisz na nowy komponent bez osłabiania asercji. Wolno zmienić
   selektor albo ścieżkę w drzewie, nie warunek. Żaden przypadek testowy nie
   znika. Specy e2e (`e2e/tests/0*.spec.ts`, `e2e/pages/*`) poprawiasz
   w tym samym PR co ekran, bo CI pull requestów ich nie uruchamia
   (`e2e-staging.yml`: tylko ręcznie na `main`). Zmienione specy wypisz
   w opisie PR. `e2e/tests/flo-*` należą do Masła. Formularze auth zachowują
   `id='email'`, `id='password'`, przycisk „Zaloguj się” i przycisk
   rejestracji „Utwórz konto” (wzorzec w `e2e/pages/auth-page.ts`). Akcent
   z białym tekstem przycisku ma kontrast ≥ 4,5:1 (WCAG AA,
   `e2e/tests/06-accessibility.spec.ts`).
5. Na ekranach przeniesionych w etapie `rg -e 'rgba[(]15,10,30' -e 'white/55'
   -e backdrop-blur -e ff-glass-pane` daje 0 trafień; sprawdzone też
   w ciemnym motywie.

### Wdrożenia
E1 i E2 idą stosem (gałąź E2 od gałęzi E1) i Bartosz scala je razem jednym PR
„Scalenie E1, E2”. Pierwsza widoczna zmiana na produkcji to więc cały nowy
szkielet, a nie same kolory na starym układzie. `main` wdraża też plan zero
zgubionych faktur, więc pojedynczo scalony E1 poszedłby na produkcję
z najbliższą poprawką KSeF. Każdy kolejny etap przenosi cały ekran, więc stan
mieszany (część ekranów jeszcze w starym wyglądzie) jest akceptowalny. Flag
funkcji nie robimy. PR, który dotyka ścieżek z `.github/CODEOWNERS`
(`package.json`, `pnpm-lock.yaml`, `next.config.ts`, `supabase/migrations/`,
`lib/jobs/`, `lib/exports/`, `proxy.ts`, `app/admin/`), zaznacza to w opisie.
Jeśli commity sesji idą jako `claude[bot]`, agent-guard wymaga etykiety
`zgoda:obszar-wrazliwy` od Bartosza.

### Oszczędzanie
1. Kod Finory czytasz tylko z plików wskazanych w §10 dla danego etapu,
   nigdy całego katalogu. `app/globals.css` (1642 linie) czytasz fragmentami
   (`grep -n`, `sed -n`).
2. W trakcie pracy `pnpm typecheck` i `pnpm vitest run <plik>`. Pełne
   `pnpm run ci && pnpm build` raz przed PR, z wyjściem przez `| tail -40`.
3. Etapy mechaniczne (E1, E2, E3, E6, E8, E10) mogą iść na Sonnecie,
   a etapy z agregatami, migracjami i prawem VAT (E0, E4, E5, E7, E9) na
   Opusie (zasada Bartosza z 10.10.2026). Model ustawia Bartosz przy starcie
   sesji.

### Dodatki do zakresu etapów
- **E1, nadpisania w `app/globals.css`.** Reguły `.ff-dashboard
  [data-slot='card' | 'card-footer' | 'button']` (ok. linie 831–889)
  i `html:not(.dark) .ff-dashboard [data-slot='card' | 'card-footer']` (ok.
  1101–1112) usuń. Nadawały wygląd prototypu starym prymitywom, które E1
  wymienia, a bez usunięcia karta Finory traci obwódkę (`ring-1` to
  `box-shadow`). Reguły `html:not(.dark) .ff-dashboard [class*='…white/…']`
  (ok. 1119–1158) zmień na dopasowanie całej klasy, np.
  `[class~='bg-white/5']`, bo `*=` łapie też `dark:bg-white/5`
  i `dark:hover:…` z komponentów Finory. `tbody tr[class*='hover:bg-']:hover`
  ogranicz do `tbody tr:not([data-slot])`. Toaster w `app/layout.tsx`
  (`toastOptions` z `backdrop-blur` i `rgba(15,10,30,…)`) przestyluj na
  tokeny Finory już w E1, bo toasty widać na każdym ekranie.
- **E1, motyw i font.** Nie przenosimy `ThemeProvider` ani providera
  ustawień Finory, panelu Theme Customizer, ciasteczka
  `shadcn-next-admin-settings`, BroadcastChannel ani skrótu klawisza „d”
  (Finora przełącza nim motyw przy każdym „d” wpisanym poza polem
  tekstowym). Wartości presetu z D2 wpisz na sztywno do `:root` (jasny)
  i `.dark` w `app/globals.css`, 1:1 z obiektu `themePresets`
  w `../finora-src`. Komponenty Finory, które czytają ustawienia
  z kontekstu, dostają stałe: układ `compact`, skala `md`, pasek `default`,
  zwijanie `icon`. Motywem dalej rządzi `lib/theme/theme.ts` i nasz
  `ThemeToggle`. Komponent Finory, który woła `useTheme()`, przepnij na
  `readStoredTheme`/`applyTheme` albo na odczyt klasy `dark` z `<html>`.
  **Font:** tylko rodzina z presetu (+ jej mono), przez `next/font/google`
  z `subsets: ['latin', 'latin-ext']`. Reguły `--font-geist-sans`
  i `font-family` w `.ff-dashboard` (globals.css ok. 610–612) podmień na nią.
  Pozostałych fontów panelu personalizacji nie przenosimy. Kwoty, NIP‑y
  i numery zostają w foncie o stałej szerokości: reguła
  `.ff-dashboard .font-mono` zostaje, a gdy preset nie ma mono, zostaje IBM
  Plex Mono. Geist zostaje dla `styles/zova.css` (auth, 404, landing).
  **PWA:** po zmianie `--background` zaktualizuj `viewport.themeColor`
  w `app/layout.tsx` oraz `background_color` i `theme_color`
  w `app/manifest.ts` (jasny i ciemny). Po E1 zrób twarde przeładowanie
  z wolnym CPU w DevTools: pierwsza klatka ma kolory presetu, bez mignięcia
  innym motywem.
- **E2, rozmiary paska.** Pasek Finory ma 256 px (`--sidebar-width: 16rem`)
  i zwija się do ikon (`3rem`), a nasz token `--ff-sidebar-w` to stałe
  280 px od `lg`. Ustaw `--ff-sidebar-w` z `--sidebar-width` /
  `--sidebar-width-icon` według `data-state` wrappera paska, a
  `--ff-header-h` na wysokość nagłówka Finory. Przy pasku rozwiniętym
  i zwiniętym sprawdź: pasek akcji formularzy faktur (`.ff-sticky-actions`),
  „Dodaj wydatek”, bąbelek pomocy i baner instalacji PWA. Nie zmieniaj
  `animation … backwards` w `.ff-route-template`, bo `both` przypina paski
  `fixed` do pudełka trasy.
- **E3, podgląd faktury.** `invoice-detail-view.tsx` przenosimy przez
  opakowanie: nowy układ w `[id]/page.tsx`, środek bez zmian. Przed startem
  `gh pr list --state open`. Jeśli otwarty PR planu zero zgubionych faktur
  dotyka `components/invoices/*` albo `app/(dashboard)/invoices/*`, zapytaj
  Bartosza o kolejność.

---

## 10. Inwentarz Finory (wypełnia E0)

| Karta / element (§5) | Plik w `../finora-src` | Zależności | Uwagi |
|---|---|---|---|
| _do uzupełnienia_ | | | |

Preset: `<nazwa z D2>`. Komplet zmiennych light i dark (z `shadow-*`)
z obiektu `themePresets` w `../finora-src`, przepisany 1:1 do `:root`
i `.dark` · Font: _do uzupełnienia_ · Mono dla liczb: _do uzupełnienia_ ·
Biblioteka wykresów: _do uzupełnienia_ · Ikony: _do uzupełnienia_ (oczekiwane:
Remix Icon) · Prymitywy (Base UI / Radix): _do uzupełnienia_ ·
`components.json` style: _do uzupełnienia_.

---

## 11. Pułapki znane z tego repo

- **`proxy.ts` przepuszcza bez logowania tylko pliki z rozszerzeniem
  z wzorca** (dziś: svg, png, jpg, jpeg, gif, webp, avif, ico, mp4, webm,
  mov, woff, woff2) oraz ścieżki `_next/static`, `_next/image` i `icons/`.
  Rozszerzenie dopisz TYLKO wtedy, gdy Finora wnosi do `public/` inny typ
  (np. `.ttf`, `.otf`, `.json`). Fonty z `next/font` tego nie wymagają.
  `proxy.ts` jest w CODEOWNERS. Nowe trasy panelu (`/analizy/*`, `/bank/*`,
  `/invoices/recurring`) są chronione automatycznie, bo proxy przepuszcza
  tylko ścieżki z `isPublicPath`.
- Plik `'use server'` eksportuje tylko funkcje asynchroniczne — łapie to
  `pnpm build`, nie `pnpm typecheck`.
- Wyłącznie klasy Tailwind; żadnych `.module.css` ani CSS‑in‑JS (AGENTS.md).
  Style Finory przenosimy jako klasy i zmienne w `app/globals.css`.
- Server Components domyślnie; `"use client"` tylko dla wykresów, filtrów,
  ⌘K i przełączników.
- Dane przykładowe Finory (avatary ludzi, logo marek, kwoty w $) nie mogą
  zostać nigdzie w produkcji — grep `\$[0-9]` i `images/avatars` przed PR.
- Atrapy przy `isLocalDevEnv()` są tylko dla danych agenta FLO i działają
  tylko po zalogowaniu do bazy deweloperskiej. Bez bazy żadna strona panelu
  się nie otworzy. Nowe karty nie dostają atrap w produkcji, mają puste stany
  z §7.3.
- **FLO (D4) zależy od szkieletu.** (1) Tokeny `--ff-*` zostają NA STAŁE, bo
  FLO używa ich 211 razy w 22 plikach. Aliasy z E1 (mapowane w
  `.ff-dashboard` na zmienne presetu) nie są tymczasowe i żaden etap ich nie
  usuwa. (2) Korzeń szkieletu i każdy portal z treścią FLO noszą klasę
  `ff-dashboard` (wzór: `flo-queue-sheet.tsx`). (3) `<link>` Material Symbols
  w `app/layout.tsx` i reguła `.ff-dashboard .material-symbols-outlined`
  w `globals.css` zostają. FLO używa ligatur w 8 plikach, marketing też.
  Ikony Material obok Remix w slocie FLO to świadomy kompromis do decyzji
  Masła. (4) Po nadpisaniu `components/ui/sheet.tsx` uruchom
  `tests/unit/ui-flo-*` i obejrzyj kolejkę FLO. Zmianę wyglądu zgłaszasz
  Masłu, jego pliku nie edytujesz. (5) Poza katalogami z D4 nie edytujesz
  `app/(dashboard)/settings/flo/*` ani `e2e/tests/flo-*.spec.ts`,
  a `lib/i18n/plural.ts` tylko importujesz. `lib/dashboard-nav-config.ts`
  według `docs/flo/UKLAD-DASHBOARDU.md` należy do Masła. E2 zmienia go po
  potwierdzeniu Bartosza w czacie i w tym samym PR aktualizuje mapę własności
  w tym dokumencie.
- Nie edytuj `components/flo/*`, `app/(dashboard)/flo/*`, `content/flo/*`,
  `app/(dashboard)/settings/flo/*`, `e2e/tests/flo-*.spec.ts`, `lib/flo/*`
  (D4).

---

## 12. Dziennik

| Data | Etap | PR | Zużycie $ | Stan | Wdrożone (SHA) | Uwagi |
|---|---|---|---|---|---|---|
| 17.10.2026 | Audyt | (ten dokument) | — | gotowe | — | audyt demo Finory (22 strony + auth + ustawienia) i kodu `main` @ `1ded2147` |
| 17.10.2026 | Krytyka planu | (ten dokument) | — | gotowe | — | 5 krytyków (dane, wykonalność, wizualna, produkt, kompletność) + sędzia: przyjęto 37 poprawek, odrzucono 1 |
| 17.10.2026 | Decyzja D7 | (ten dokument) | — | gotowe | — | karty podatkowe dozwolone: przywrócony licznik limitu zwolnienia z VAT (240 000 zł, gotowe funkcje z `vat-limit.ts`) w P1/P2, „Odłóż na podatek” w P2 |

**Dla Bartosza:** `lib/flo/wrapped.ts` czyta nieodświeżany
`mv_tenant_monthly_stats` (tor silnika). Zgłoszone, nie naprawiamy w tym
planie.

**Następny krok:** Bartosz wykonuje krok 0.1 (zakup + prywatne repo; konfiguracja
motywu już wybrana, D2). Potem sesja w chmurze: **E0**.
