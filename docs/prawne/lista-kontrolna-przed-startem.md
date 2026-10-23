# Lista kontrolna przed startem — sprawy prawne

Stan na 20.10.2026 (po zmianie nazwy na FaktWay), uzupełniona 23.10.2026 (rejestracja, newsletter). Każdy punkt ma właściciela. Dokumenty dla klientów
(regulamin, umowa powierzenia, polityki) obiecują rzeczy z tej listy —
**dopóki punkt nie jest zrobiony, dokument mija się z rzeczywistością.**

Oznaczenia: 🔴 bloker startu · 🟠 przed pierwszym płacącym klientem · 🟢 można po starcie.

## 1. Firma i dokumenty

- [ ] 🔴 **Usługodawca istnieje** (JDG / spółka) i jego dane są w
  `lib/legal/entity.ts`. Do tego czasu strony `/legal/*` mają baner
  „wersja robocza”, a bramka akceptacji regulaminu śpi. — Igor, Bartosz
- [ ] 🔴 **Rejestracja przy braku danych usługodawcy — decyzja teraz, nie w dniu startu.** Stan
  23.10.2026: formularz `/register` jest otwarty, a polityka prywatności,
  do której prowadzi zgoda, mówi „Administratorem danych osobowych … jest
  [DO UZUPEŁNIENIA …]” (tożsamość usługodawcy i administratora: art. 5
  ustawy o świadczeniu usług drogą elektroniczną, art. 13 RODO).
  Akceptacja zapisuje się jako robocza (`draft: true`), a po uzupełnieniu
  `lib/legal/entity.ts` bramka wymusi ją ponownie. Regulamin obiecuje
  jednak zawarcie umowy o prowadzenie Konta z chwilą jego utworzenia
  (§ 5 ust. 2) i potwierdzenie e-mailem z treścią dokumentów (§ 5 ust. 6),
  które w trybie roboczym nie wychodzi (`lib/legal/record.ts`). Do wyboru:
  zamknąć rejestrację flagą `disableSignups` (`/wylacz rejestracja`
  w bramce Telegrama albo `UPDATE` z `docs/runbooks/hamulce-ksef.md`)
  do czasu uzupełnienia danych — albo odhaczyć punkt z dopiskiem
  „rejestracja zostaje otwarta do uzupełnienia danych”. Przy zamkniętej
  rejestracji nowa osoba nie założy konta także z zaproszenia (hook GoTrue
  z migracji 00102 blokuje każde zakładanie konta; zaproszenia przyjmą
  tylko osoby, które już mają konto). Punkt wygasa sam po zrobieniu punktu
  wyżej (dane w `lib/legal/entity.ts`). — decyzja: Igor, Bartosz;
  flaga: Bartosz
- [ ] 🔴 **Przegląd prawnika** regulaminu, umowy powierzenia, polityk
  i pytań z memo (artefakt „Pakiet prawny”). — Igor
- [ ] 🔴 **Szablon strony Zova** (Framer Marketplace, 19 USD) — potwierdzić
  zakup i zachować dowód (faktura/e-mail z Framera) albo kupić. Licencja
  obejmuje jeden projekt i tylko po zapłacie; bez tego ilustracje, filmy
  i zdjęcia z `public/landing/` naruszają prawa autorskie. — Bartosz
- [ ] 🔴 **Szablon panelu Finora** (`docs/koordynacja/PLAN-FINORA.md`) —
  sprawdzić warunki licencji (czy obejmuje produkt SaaS dla klientów)
  i zachować dowód zakupu. — Bartosz
- [ ] 🟠 **Zrzuty prawdziwego panelu FaktWay** na stronę główną (zrzuty
  z szablonu usunięte — pokazywały cudzy produkt). — Bartosz

## 2. Dostawcy (podprocesorzy)

- [ ] 🔴 **Umowy powierzenia (DPA) zaakceptowane** u każdego dostawcy z
  `lib/legal/subprocessors.ts`: Hetzner, Anthropic, Resend, Sentry,
  PostHog, Cloudflare, Slack, Stripe. Przy każdym zapisać mechanizm
  przekazania do USA (DPF albo SCC) — polityka podaje dziś oba warianty.
  — Bartosz
- [ ] 🔴 **Poczta `pomoc@faktway.pl`** (i dawne `pomoc@faktflow.pl`) — runbook `docs/runbooks/skrzynka-pomoc.md`
  przekazuje ją na prywatne skrzynki (np. Gmail). Prywatny Gmail nie ma
  umowy powierzenia, a trafiają tam żądania RODO i dokumenty klientów.
  Przenieść na skrzynkę firmową z DPA (np. Google Workspace) i dopisać
  dostawcę do `lib/legal/subprocessors.ts`. — Bartosz
- [ ] 🟠 **PostHog** — ustawić przechowywanie danych na ≤ 24 miesiące
  (polityka prywatności, pkt 3). — Bartosz
- [ ] 🟢 **Anthropic** — sprawdzić w konsoli podmiot umowy (USA czy Irlandia)
  i okres przechowywania danych API; ewentualnie poprawić wpis w
  `lib/legal/subprocessors.ts`.

## 3. Kod — obietnice z dokumentów, których jeszcze nie ma

- [ ] 🔴 **Prawdziwe usuwanie firmy** (umowa powierzenia § 9, regulamin
  § 14 ust. 6). Samoobsługa jest wstrzymana, zlecenie idzie przez pomoc
  techniczną i ręczną procedurę operatora. Projekt z decyzjami:
  `docs/prawne/usuwanie-firmy-projekt.md`. — Bartosz
- [ ] 🟠 **Kopie zapasowe w terminie z umowy powierzenia** (§ 9 ust. 2:
  cykl do 60 dni): przy zakupie Storage Box ustawić retencję ≤ 60 dni
  (`db-backup.sh` wysyła przez `rclone copy`, więc kopie tam same nie
  znikają); kopie `manual` usuwać w tym samym terminie. — Bartosz
- [ ] 🟠 **Newsletter — zbudować albo usunąć z dokumentów.** Polityka
  prywatności (pkt 2 i pkt 3, wiersz „Newsletter”), regulamin (§ 3 ust. 1
  pkt 10) i rejestr czynności (A8) opisują go jako działający, a formularz
  nie jest nigdzie podpięty (`tests/unit/newsletter-wstrzymany.test.ts`);
  tabela `newsletter_subscribers` ma 0 wierszy (Bartosz, 23.10.2026), więc
  nie ma kogo powiadamiać. Albo zbudować: double opt-in, zapis wersji
  zgody, link wypisu, usuwanie wiersza przy usunięciu konta (dziś tabelę
  obejmuje tylko eksport RODO w `lib/gdpr/data-collector.ts`, usuwanie
  konta jej nie czyści) i newsletter w celu Resend w
  `lib/legal/subprocessors.ts`. Albo usunąć z polityki, regulaminu
  i rejestru (nowe wersje w `lib/legal/versions.ts`) razem z kodem
  newslettera: atrapą `components/marketing/blog-newsletter.tsx` oraz
  formularzem i akcją zapisu pilnowanymi przez test wyżej (test trzeba
  zmienić w tym samym PR). Usunięcie tabeli `newsletter_subscribers`
  (i jej sekcji w eksporcie RODO) to migracja — Bartosz. Rozstrzygnąć
  przed wysłaniem dokumentów do prawnika (sekcja 1), żeby przegląd objął
  wersję docelową. — Igor, Bartosz
- [x] **Retencja rozmów czatu pomocy — 24 miesiące** i usuwanie przy
  usunięciu konta (polityka, pkt 3) — `cron.support-chat-retention`.
- [ ] 🟠 **Tabela `legal_acceptances`** wyłączona z czyszczenia
  dziennika — dowód akceptacji regulaminu przez cały czas umowy
  i do przedawnienia. Dziś: `app_metadata` + `audit_logs` (12 mies.).
  Migracja — Bartosz.
- [ ] 🟢 **Rejestr żądań RODO: wpisy starsze niż 6 lat** — czyszczenie
  (polityka, pkt 3). Najstarsze wpisy są z 2026, więc termin to 2032.

## 4. Procesy (ludzie)

- [ ] 🟠 Przeczytać i przyjąć procedury z tego katalogu: naruszenia,
  żądania i reklamacje, zmiana podprocesora. — Igor, Bartosz
- [ ] 🟠 Upoważnienia do przetwarzania danych i zobowiązanie do poufności
  dla każdej osoby z dostępem do serwerów i panelu operatora (umowa
  powierzenia, załącznik A). — Igor, Bartosz
- [ ] 🟠 Rejestr naruszeń i rejestr żądań — założyć poza repozytorium
  (arkusz z ograniczonym dostępem).
- [ ] 🟢 Kompetencje w zakresie AI (art. 4 AI Act) — krótkie,
  udokumentowane zapoznanie zespołu z ograniczeniami funkcji AI.

## 5. Płatności (gdy ruszy Stripe)

- [ ] 🟠 Adres regulaminu i polityki w ustawieniach Stripe (Public details).
- [ ] 🟠 Sprawdzić, że faktura za subskrypcję wychodzi przez KSeF
  (regulamin § 6 ust. 5).
- [ ] 🟠 Ekran zgody Google OAuth: link do polityki prywatności i regulaminu.
