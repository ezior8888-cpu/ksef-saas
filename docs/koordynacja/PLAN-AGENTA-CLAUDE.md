# Plan agenta Claude — szukanie i naprawa błędów przed launchem

> **Polecenie „kontynuuj plan z agentem”** (albo podobne) znaczy:
> 1. przeczytaj ten plik do końca,
> 2. zrób checklistę z sekcji 1,
> 3. pracuj od sekcji **„5. Następny krok”**,
> 4. po każdym zakończonym etapie zaktualizuj sekcję 4 (stan) i sekcję 5 (następny krok)
>    w tym pliku — w tym samym PR co poprawka albo w osobnym, małym PR.
>
> Plik prowadzi Claude na zlecenie Igora. Codex ma swój kanał:
> [`CLAUDE-DO-CODEXA.md`](CLAUDE-DO-CODEXA.md) (sprawy C-01…C-16).

---

## 0. Po co ten plan

FaktFlow trzyma prawdziwe faktury VAT, więc błąd w kwocie, eksporcie albo
wysyłce do KSeF to realna szkoda dla klienta (podatek, kara, zła KPiR).
Agent przechodzi po ścieżkach krytycznych, znajduje błędy, naprawia je
w kodzie z testami i zgłasza to, czego sam zrobić nie może (migracje,
wdrożenia, decyzje księgowe).

## 1. Start każdej sesji — checklista

| # | Co | Jak |
|---|---|---|
| 1 | Świeży stan repo | `git fetch origin`; nowa gałąź `git checkout -b claude/<temat> origin/main`. **Nigdy `git checkout main`** (lokalny main bywa nieaktualny). |
| 2 | Otwarte PR-y | `gh pr list --state open` — porównaj z tabelą w sekcji 4. Scalony/zamknięty PR → popraw tabelę. |
| 3 | Kanał z Codexem | [`CLAUDE-DO-CODEXA.md`](CLAUDE-DO-CODEXA.md) — nowe odpowiedzi Codexa, rejestr numerów migracji. |
| 4 | Cudze pliki | Zanim ruszysz plik: `git diff --quiet origin/main...origin/<gałąź-codexa> -- <plik>` dla otwartych gałęzi `codex/*` i `ops/*`. Plik w cudzym stosie → wpis C-xx zamiast zmiany. |
| 5 | Środowisko | `pnpm install` w worktree (bez `node_modules` testy nie ruszą); testy XSD potrzebują systemowego `xmllint`. |

## 2. Zasady — twarde

1. **Bez wdrożeń.** Żadnego deployu, restartu, zmian zmiennych w Coolify,
   `docker …`. Wdrożenie aplikacji (id=1) i workera (id=2) robi Bartosz.
2. **Bez migracji.** Nie tworzymy plików w `supabase/migrations/`. Potrzebna
   zmiana schematu → prośba do Bartosza w opisie PR (gotowy SQL + co
   sprawdzić przed) i wpis w sekcji 4.3.
3. **Scalanie:** od 01.10.2026 Claude scala **swoje** PR-y (`claude/*`) sam,
   po zielonym CI i lokalnym `pnpm run ci` (zgoda Igora). Merge commit,
   nigdy `--admin`. Cudzych PR-ów (Codex, Bartosz) nie scala bez wyraźnego
   polecenia. Scalenie to nie wdrożenie — zasada 1 obowiązuje dalej.
4. **PR od `origin/main`, bez stosów.** Kilka gotowych PR-ów naraz → gałąź
   „wydanie” łącząca je, jedno CI, jedno scalenie.
5. **Każda poprawka:** test, który bez poprawki pada; testy mutacyjne
   (celowe psucie kodu — każda mutacja ma zostać złapana); `pnpm run ci`
   lokalnie przed pushem. Uwaga na CRLF w plikach przy skryptach mutacji.
6. **Rozmowa z Igorem po polsku.** Bez materiałów do nauki w repo.
7. Repo jest **publiczne** — żadnych adresów serwerów, kluczy ani danych klientów
   w tym pliku i w PR-ach.

## 3. Etapy

Status: ✅ zrobione · 🔄 w toku · ⏳ czeka na kogoś · ⬜ do zrobienia

| Etap | Zakres | Status | Gdzie |
|---|---|---|---|
| E1 | Eksporty: KPiR (koszty z wydatków, strony, odliczenie VAT), JPK_FA(4) wg XSD, JPK_V7M(3), CSV, eksporty programowe | ✅ / ⏳ | #58–#61, #91, #93, #97, #98, #99; wstrzymania #66, #93 |
| E2 | Faktury: adnotacje FA(3) (MPP, metoda kasowa, „odwrotne obciążenie”), ROZ po zaliczkach, PDF korekty, kod QR, mail z kwotą do zapłaty | ✅ / ⏳ C-05 | #75, #76, #79, #84, #95, #102, #103 |
| E3 | OCR i waluty: koszt w walucie obcej po kursie NBP | ✅ | #94 |
| E4 | Joby pg-boss: ponowienie wykonuje CAŁY job od nowa (brak pamięci kroków) — każdy zapis musi być odporny na powtórkę | 🔄 | #109 (OCR), #112 (Co-Pilot cron), #114 (Sentry w workerze); lista w 3.1 |
| E5 | RODO / konto: usunięcie konta a subskrypcja i klucze obce | ✅ kod / ⏳ migracja B3 | #108 |
| E6 | Konfiguracja produkcji bez cichych zastępstw (GUS sandbox, brak kluczy) | ✅ / ⏳ B2 | #107 |
| E7 | Retencja 10 lat: joby `retention-delete`, `archive-old-invoices` — czy nic nie kasuje faktur przed terminem | ✅ sprawdzone 01.10 | uwagi w 3.2 |
| E8 | Pozostałe obszary: import (Magiczny Import), portal księgowej, walidatory formularzy, powiadomienia | ⬜ | — |

### 3.1. Audyt jobów pod ponowienia (E4)

Pytanie dla każdego joba: *co się stanie, gdy job padnie PO zapisie i wykona
się od nowa?*

| Job | Wynik |
|---|---|
| `process-ocr` | ❌→✅ dubel wydatku w KPiR — #109 |
| `co-pilot-monthly` (cron) | ❌→✅ rezerwacja okresu przed wysłaniem zdarzenia; ponowienie pomijało firmy → paczka za miesiąc nie wychodziła — #112 |
| `co-pilot-monthly` (paczka) | ⚠️ ponowienie po wysłaniu maila tworzy nowe eksporty i wysyła mail drugi raz; nieudana paczka zostaje „zarezerwowana” bez alertu — do zrobienia po cronie |
| `auto-categorize-inbox` | ✅ sprawdza istniejący wydatek po `ksef_invoice_id` |
| `download-upo` | ✅ odczyt/aktualizacja istniejącego rekordu |
| `dunning-payment-failed`, `trial-countdown-emails` | ✅ claim w `billing_notifications` |
| `retention-delete`, `archive-old-invoices` | ✅ ponowienie bezpieczne (aktualizacje idempotentne) — reszta w 3.2 |
| `exports-generate`, `email-sequence`, `send-reminder`, `reminder-scheduler`, `magic-import-ksef`, `bulk-import`, `daily-summary-email` | ⬜ |
| `submit-invoice`, `inbox-polling`, `self-invoice-payment`, `process-offline-queue` | Codex (stos #62–#86) — tylko czytać, uwagi przez C-xx |

### 3.2. Retencja (E7) — wynik przeglądu 01.10.2026

Nic nie kasuje faktur przed terminem: archiwum (Glacier) bierze faktury
starsze niż 2 lata od daty wystawienia i planuje usunięcie za 8 lat, czyli
najwcześniej 10 lat od wystawienia (ustawowo wystarczy 5 lat od końca roku
terminu płatności podatku). Bez konfiguracji AWS archiwum rzuca błąd, nic
nie oznacza. Uwagi, bez pilności:

| Uwaga | Kiedy zaboli |
|---|---|
| `retention-delete` kasuje paczką 100 faktur; korekta (`parent_invoice_id … ON DELETE RESTRICT`) albo wydatek (`expenses.ksef_invoice_id`) blokuje całą paczkę i job staje codziennie na tych samych wierszach | ~2034 |
| `archive-old-invoices`: jedna faktura z brakującym XML w R2 zatrzymuje archiwizację wszystkich (te same 500 kandydatów co dzień) | gdy pierwszy XML zginie |
| Faktury bez XML (import CSV) nigdy nie dostają terminu usunięcia | RODO, po 10 latach |

## 4. Stan — aktualizuj po każdym etapie

**Ostatnia aktualizacja:** 01.10.2026 — Claude (sesja z Igorem).

### 4.1. Scalone do `main`, NIEWDROŻONE

Main od `b25c126` czeka na wdrożenie (aplikacja + worker, bez migracji):
#91–#97, #100, #101, #105 (= #98, #99, #102, #103), wydanie #111 (`7a9f49a`)
z #106–#110, oraz:

| PR | Co |
|---|---|
| #106 | Koordynacja: C-05 (aktualizacja), C-11…C-16 |
| #107 | JPK_FA: bez `GUS_API_KEY` w produkcji odmowa zamiast adresu z testowej bazy GUS |
| #108 | RODO: usunięcie konta nie zostawia płatnej subskrypcji bez opiekuna |
| #109 | OCR: ponowienie joba nie dubluje wydatku w KPiR |
| #110 | Ten plan + wskaźnik w `AGENTS.md` |
| #112 | Co-Pilot (cron): ponowienie nie gubi miesięcznej paczki dla księgowej |
| #114 | Worker pg-boss inicjalizuje Sentry — alerty z jobów wcześniej nie wychodziły wcale |

### 4.2. Otwarte PR-y Claude

Brak (stan po #114).

Cudze otwarte: Codex #62, #63, #64, #71, #83, #85, #86, #104; Bartosz #90,
#113 (health-check KSeF).

### 4.3. Prośby do Bartosza (migracje, produkcja)

| # | Prośba | Skąd |
|---|---|---|
| B1 | Wdrożyć `main` (aplikacja + worker) | 4.1 |
| B2 | Sprawdzić/ustawić `GUS_API_KEY` na produkcji | #107 |
| B3 | Migracja: klucze obce `expenses.created_by`, `ocr_jobs.created_by`, `accountant_access.created_by_user_id` → `ON DELETE SET NULL` (dziś blokują usunięcie konta RODO) | #108 |
| B4 | Odczyt: czy na produkcji są zdublowane wydatki z OCR (SQL w #109); potem `UNIQUE (tenant_id, ocr_job_id)` | #109 |
| B5 | C-16: płatności/ponaglenia ROZ liczone od pełnej kwoty — migracja przed zdjęciem wstrzymania ROZ | `CLAUDE-DO-CODEXA.md` |
| B6 | Po wdrożeniu workera: w logach startu ma być „Sentry: alerty z jobów włączone”; jeśli „WYŁĄCZONE” — dodać `SENTRY_DSN` do zmiennych workera (Coolify id=2) | #114 |

### 4.4. Czeka na decyzję / kogoś innego

| Sprawa | Kto |
|---|---|
| C-05: adnotacje P_16/P_18A dla ROZ | Claude, po scaleniu #85 (Codex) |
| JPK_V7M: pole dla „oo” (odwrotne obciążenie) i okres według daty sprzedaży | księgowa |
| JPK_FA: korekty (C-01, konwencja kwot) | Igor + Codex |
| Ochrona przed brakiem `KSEF_ENV` (`claim-environment`) | Codex (stos #63/#64) |
| Autouzupełnianie kontrahentów z testowej bazy GUS bez klucza | zgłoszone, decyzja produktowa |
| Pulpit `monthly-figures` i FLO sumują `gross_total` ROZ | Bartosz |

## 5. Następny krok

1. Co-Pilot (paczka, `runCoPilotSendPackage`): ponowienie po wysłanym mailu
   nie może wysłać go drugi raz ani tworzyć nowych `export_jobs`; nieudana
   paczka → alert (od #114 wyczerpany job idzie do Sentry sam). Znacznik:
   `export_jobs.emailed_at` — UI go czyta, ale nikt go nie zapisuje.
2. Dalej tabela 3.1 od góry (wiersze ⬜).
3. E8: import, portal księgowej, walidatory, powiadomienia.
