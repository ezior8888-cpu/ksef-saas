# Lista kontrolna przed startem — sprawy prawne

Stan na 15.10.2026. Każdy punkt ma właściciela. Dokumenty dla klientów
(regulamin, umowa powierzenia, polityki) obiecują rzeczy z tej listy —
**dopóki punkt nie jest zrobiony, dokument mija się z rzeczywistością.**

Oznaczenia: 🔴 bloker startu · 🟠 przed pierwszym płacącym klientem · 🟢 można po starcie.

## 1. Firma i dokumenty

- [ ] 🔴 **Usługodawca istnieje** (JDG / spółka) i jego dane są w
  `lib/legal/entity.ts`. Do tego czasu strony `/legal/*` mają baner
  „wersja robocza”, a bramka akceptacji regulaminu śpi. — Igor, Bartosz
- [ ] 🔴 **Przegląd prawnika** regulaminu, umowy powierzenia, polityk
  i pytań z memo (artefakt „Pakiet prawny FaktFlow”). — Igor
- [ ] 🔴 **Szablon strony Zova** (Framer Marketplace, 19 USD) — potwierdzić
  zakup i zachować dowód (faktura/e-mail z Framera) albo kupić. Licencja
  obejmuje jeden projekt i tylko po zapłacie; bez tego ilustracje, filmy
  i zdjęcia z `public/landing/` naruszają prawa autorskie. — Bartosz
- [ ] 🟠 **Zrzuty prawdziwego panelu FaktFlow** na stronę główną (zrzuty
  z szablonu usunięte — pokazywały cudzy produkt). — Bartosz

## 2. Dostawcy (podprocesorzy)

- [ ] 🔴 **Umowy powierzenia (DPA) zaakceptowane** u każdego dostawcy z
  `lib/legal/subprocessors.ts`: Hetzner, Anthropic, Resend, Sentry,
  PostHog, Cloudflare, Slack, Stripe. Przy każdym zapisać mechanizm
  przekazania do USA (DPF albo SCC) — polityka podaje dziś oba warianty.
  — Bartosz
- [ ] 🔴 **Poczta `pomoc@faktflow.pl`** — runbook `docs/runbooks/skrzynka-pomoc.md`
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

- [ ] 🔴 **Wykonanie usunięcia firmy** po `tenants.hard_delete_at`
  (umowa powierzenia § 9, regulamin § 14 ust. 6). Dziś „Usuń firmę”
  tylko oznacza firmę — nic jej potem nie usuwa. Wymaga pracy na bazie
  (wyzwalacze chronią faktury) — osobne zadanie z listą inwariantów.
- [ ] 🟠 **Retencja rozmów czatu pomocy — 24 miesiące** i usuwanie przy
  usunięciu konta (polityka, pkt 3). Osobna sesja w toku (15.10.2026).
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
