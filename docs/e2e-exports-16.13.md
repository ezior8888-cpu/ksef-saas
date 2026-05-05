# 16.13 — Test E2E + commit (eksporty / Co-Pilot / portal księgowej)

Scenariusze zsynchronizowane z kodem (`components/exports/*`, `lib/exports/*`, `lib/inngest/jobs/co-pilot-monthly.ts`, `app/accountant/[token]`, `app/api/portal/exports/generate`).

## 16.13.1 — Scenariusze

### Test 1: Manual JPK_FA export

1. Zaloguj się.
2. Wystaw 3–5 faktur testowych w bieżącym miesiącu (pełny flow KSeF → accepted).
3. Idź do `/reports/exports`.
4. Wybierz format **JPK_FA(4)**, okres = bieżący miesiąc (np. przycisk „Bieżący miesiąc”), zaznacz **„Faktury wystawione”** (domyślnie włączone; opcjonalnie wyłącz odbiorców).
5. Kliknij **„Wygeneruj plik”** → toast sukcesu: **„Eksport rozpoczęty — plik za chwilę będzie do pobrania”** (dokładny tekst z `ExportsCenter`).
6. UI odświeża listę po **~3 s** (`router.refresh`); jeśli job trwa dłużej, odśwież stronę ręcznie lub poczekaj — status w historii zmieni się na **Gotowe** (zwykle w ciągu kilku–kilkunastu sekund od Inngest).
7. Kliknij **„Pobierz”** → plik XML się ściąga.
8. W edytorze sprawdź layout: root **`JPK`**, **`Naglowek`**, **`Podmiot1`**, **`Faktura`** (nagłówki faktur), **`FakturaWiersz`** (pozycje), **`FakturaCtrl`**, **`FakturaWierszCtrl`** — sumy kontrolne spójne z danymi.

### Test 2: Walidacja JPK_FA przeciw schemie MF

1. Pobierz schemę XSD: [struktury JPK MF](https://www.gov.pl/web/finanse/struktury-jpk) — wariant **4** (JPK_FA(4)).
2. Użyj walidatora (np. xmlvalidation.com lub `xmllint --noout --schema …`).
3. Wgraj wygenerowany plik + XSD — **powinien przejść bez errors** (ostrzeżenia zależą od narzędzia).

### Test 3: KPiR Excel

1. Wygeneruj **KPiR Excel** za wybrany okres (np. bieżący miesiąc).
2. Pobierz, otwórz w Excel / LibreOffice.
3. Sprawdź:
   - Arkusz **„Informacje”**: NIP, nazwa podatnika, okres, liczniki operacji.
   - Arkusz **„KPiR”**: **17 kolumn** z nagłówkami (Lp. … Numer KSeF).
   - Wiersze danych wypełnione.
   - Wiersz **„PODSUMOWANIE OKRESU”** z sumami w kolumnach kwotowych.
   - Format kwot w komórkach: `numFmt` `#,##0.00 "zł"` — wizualnie zwykle **1 234,56 zł** zależnie od ustawień regionalnych Excela (separator tysięcy może być spacją lub innym znakiem).

### Test 4: Co-Pilot — ręczny trigger

1. Jako **owner** konta: `/settings` → **„Co-Pilot Księgowego”** → `/settings/accountant` (nie istnieje osobny URL `/settings/accountant-access`).
2. Włącz Co-Pilota.
3. Ustaw email testowy (np. `bartek+test@…`), formaty: **JPK_FA + KPiR**, zapisz (**„Ustawienia zapisane”** po sukcesie).
4. Kliknij **„Wyślij teraz (za poprzedni miesiąc)”** → toast: **„Paczka jest generowana w tle — email pójdzie za chwilę”**.
5. Sprawdź skrzynkę — email z **dwoma załącznikami** (przy małej paczce); przy dużych plikach aplikacja może przejść na linki z R2 (logika limitów w jobie `co-pilot-send-package`).
6. Inngest Dashboard → run funkcji **`co-pilot-send-package`** → status **completed**.

### Test 5: Co-Pilot — symulacja crona

1. W ustawieniach ustaw **`send_day_of_month`** = **dzisiejszy dzień miesiąca** (wg kalendarza **Europe/Warsaw** — taki sam dzień liczy cron).
2. Pamiętaj: produkcyjny harmonogram to **codziennie 8:00** `Europe/Warsaw` (`co-pilot-monthly`); ręczne invoke w Inngest nie czeka na 8:00.
3. Inngest Dashboard → manual invoke **`co-pilot-monthly`** — powinien znaleźć tenantów z `send_day_of_month` = dzisiejszy dzień i wysłać eventy **`exports/co-pilot.send-package`**.
4. Sprawdź email / Resend Dashboard.

### Test 6: Portal księgowej

1. Wygeneruj token dostępu (lista na **`/settings/accountant`**, sekcja linków dla księgowej) lub przez DB (`accountant_access`).
2. Otwórz **`https://<twoja-domena>/accountant/<token>`** (ścieżka publiczna **`/accountant`**, **nie** `/portal/<token>`).
3. Dla poziomu **„Z pobieraniem”** (`access_level === 'download'`): read-only widok faktur + sekcja **„Pobierz dane księgowe”**.
4. Domyślnie picker miesiąca = **poprzedni miesiąc**; ustaw **bieżący** lub dowolny, kliknij **„Pobierz JPK_FA(4)”** (lub KPiR) — plik pobiera się przez `blob` + `a.download` (bez nowej karty).
5. Audyt: tabela **`audit_logs`** (nie `accountant_audit_log`), **`action`** = **`accountant.portal_export`**, w **`metadata`** m.in. `kind: 'export_download'`, `format`, okres, IP, user-agent.

## 16.13.2 — Lokalna weryfikacja przed commit

```bash
pnpm run typecheck   # równoważne: pnpm exec tsc --noEmit
pnpm build
pnpm dev
```

Opcjonalnie: `pnpm run lint`, Inngest dev (`pnpm run inngest:dev`) przy testach jobów.
