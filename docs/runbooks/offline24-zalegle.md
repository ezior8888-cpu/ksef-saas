# Offline24 — zaległe wpisy kolejki i faktury `offline_queued`

Jak czytać sekcję **4a** skryptu `./scripts/ops/kontrola-faktur-ksef.sh`
i co robić przy każdym wierszu. Skrypt tylko czyta. **Danych nie zmieniaj
bez zgody Bartosza** — każda zmiana stanu faktury Offline24 to dziś ręczny
SQL, a przed nim trzeba uzgodnić fakturę z KSeF.

## Stan od 02.10.2026

Automatyczny Offline24 jest wyłączony wszędzie, także na KSeF TEST
(decyzja Bartosza, `lib/ksef/offline24-policy.ts`): nowe wpisy kolejki
`ksef_offline_queue` nie powstają, a zdarzenia odtworzenia z kolejki są
odrzucane. Zostaje cron `cron.process-offline-queue` (co 5 min), który
zamyka stare wpisy `queued` — **tylko ze środowiskiem równym `KSEF_ENV`
workera** (sekcja 9 skryptu), do 10 na przebieg
(`lib/jobs/runners/process-offline-queue.ts`):

| Wpis `queued` | Co robi cron | Faktura po przebiegu |
|---|---|---|
| faktura `accepted` | wpis → `failed` („Accepted invoice requires manual reconciliation”) | bez zmian (przyjęta) |
| po terminie, faktura nieprzejęta | wpis → `expired` | `failed OFFLINE_DEADLINE_EXCEEDED` — ma wyjście |
| po terminie, faktura przejęta (`submitted_to_ksef_at`) | wpis → `expired` | zostaje `offline_queued` — **bez wyjścia** |
| w terminie (kwarantanna) | wpis → `failed <KOD>_REQUIRES_RECONCILIATION` | zostaje `offline_queued`, kod `OFFLINE_*` tylko gdy nieprzejęta — **bez wyjścia** |
| środowisko NULL (sprzed 00117) albo inne | nic, co przebieg | bez zmian |
| `sending` | nic (odtworzenie wyłączone) | bez zmian |

**Dlaczego „bez wyjścia”:** z `offline_queued` nie wyprowadza żadne RPC
(`requeue_ksef_send` i `reset_ksef_send` przyjmują tylko `failed`/`rejected`),
strażnik `ksef_lifecycle_violations` nie ma inwariantu dla `offline_queued`,
`/admin/ksef` i cron cyklu życia jej nie widzą, a zamknięty wpis kolejki
nie wraca do crona. Klient widzi fakturę jako „W toku”
(`lib/invoices/list-query.ts`), portal księgowej pokazuje ją jako dokument
wystawiony offline (`lib/accountant/load-accountant-portal.ts`), a PDF jest
zablokowany (`lib/pdf/invoice-pdf.ts`). Naprawa to **luka #5** projektu A5
(„drugi zapis Offline24”, osobny PR): zapis faktury w kwarantannie i przy
wygaśnięciu ma dać stan z wyjściem. Skrót „luka 5” w wyniku skryptu to ta
naprawa.

Kody `OFFLINE_*` nie są w katalogu `ksef_error_codes`: faktura `failed`
z takim kodem to naruszenie I4 strażnika (alarm), ale ma przyciski.

## Jak czytać sekcję 4a

| Zapytanie | Normalnie | Problem | Co zrobić |
|---|---|---|---|
| (a) kolejka wg stanu | pusto albo same `failed`/`expired` sprzed 02.10 | „najnowszy wpis” po 02.10.2026 | Coś parkuje mimo wyłączenia — błąd krytyczny. SHA workera (sekcja 1), log `Faktura zaparkowana w Offline24`; zgłoś Bartoszowi |
| (b) otwarte wpisy | pusto | `sending` albo środowisko NULL | Cron ich nigdy nie zamknie. Każdą fakturę sprawdź w KSeF (lista d). **Nie ustawiaj `ksef_environment`** — cron wrzuciłby wpis w kwarantannę bez wyjścia |
| | | `queued ponad 15 min` | Środowisko wpisu inne niż `KSEF_ENV` (sekcja 9) — jak wyżej; to samo środowisko — cron pada: (h) i log workera `Offline24` |
| | | `queued: cron zamknie…` | Za ≤ 5 min wpis się zamknie: w terminie → nowa faktura bez wyjścia (c) |
| (c) faktury `offline_queued` | pusto | `BEZ WYJSCIA` z liczbą > 0 | **Luka #5 potrzebna.** Lista (d) do uzgodnienia z KSeF; nic nie zmieniaj |
| | | `przejęta` = t albo `dowód kontaktu` = t | Faktura mogła dotrzeć do KSeF — ponowna wysyłka bez uzgodnienia grozi duplikatem |
| | | `QR offline` = t | Faktura mogła trafić do nabywcy jako dokument offline — nie wracać do szkicu bez decyzji prawnej B1 |
| (d) lista do uzgodnienia | pusto | wiersze | Dla każdej: wyszukaj w KSeF (środowisko wpisu albo `KSEF_ENV`) po numerze, NIP-ie sprzedawcy i dacie; zapisz „jest z numerem K” albo „nie ma”; przekaż Bartoszowi |
| (e) `failed`/`rejected` z `OFFLINE_*` | pusto | wiersze | Alarm I4 (kod spoza katalogu). „Wyślij ponownie” działa, ale najpierw sprawdź fakturę w KSeF (stare próby Offline24 nie mają trwałej tożsamości). Przy `przejęta` = t — tylko uzgodnienie, decyzja Bartosza |
| (f) inny ślad | pusto | klucz offline = t | Treść i pozycje zamrożone dla każdej roli; „Wróć do szkicu” klucza nie zdejmuje (zamrożony szkic, bez PDF i usuwania) — zgłoś Bartoszowi zamiast resetować |
| (g) wpisy zamknięte | `expired … failed` (wygaśnięcie z wyjściem) | `…_REQUIRES_RECONCILIATION` albo `expired` przy `offline_queued` | Te same faktury co w (c) „BEZ WYJSCIA” — idź do (d). `QUEUE_INVOICE_OWNERSHIP_MISMATCH`: wpis niezgodny z fakturą, przejrzyj ręcznie |
| (h) przebiegi crona | `completed`, wynik `Empty queue` | `failed` | Wiersz, który psuje przebieg (wyjątek przerywa pętlę, a najstarszy wpis jest zawsze pierwszy). Log workera z 2 h (sekcja 2), `step FAIL` / `Offline24`; zgłoś Bartoszowi, nic nie kasuj |

Pusta lista pod etykietą znaczy zero wierszy; nieudane zapytanie skrypt
podpisuje „zapytanie nieudane”. pg-boss trzyma joby ok. 7 dni, więc puste
(h) przy działającym workerze może oznaczać tylko brak historii — log
workera „Gotowy: … N/N cronów zaplanowanych” i harmonogram w sekcji 7.

## Decyzja o luce #5

- **(c) bez wierszy `BEZ WYJSCIA` i (b) puste** — dziś nie ma ofiar;
  naprawa może poczekać (nowe wpisy nie powstają).
- **(c) `BEZ WYJSCIA` > 0** — blokada bez wyjścia jest na danych: luka #5
  potrzebna, a faktury z (d) trzeba uzgodnić z KSeF przed jakąkolwiek
  zmianą (jednorazowy UPDATE wyłącznie za zgodą Bartosza).
- **(b) `queued` w środowisku `KSEF_ENV`, w terminie** — każdy taki wpis
  stanie się w ciągu 5 min ofiarą kwarantanny; zgłoś przed kolejnym
  przebiegiem, jeśli luka #5 jest blisko.
