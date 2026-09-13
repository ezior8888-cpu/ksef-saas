# Dziennik odporności cybernetycznej — FaktFlow / KSeF SaaS

## Zasady kontynuacji dla ludzi i AI

Ten dziennik śledzi realizację [planu odporności cybernetycznej](PLAN-ODPORNOSCI-CYBER.md). Jest osobnym etapem po [wcześniejszych naprawach Astry](DZIENNIK-NAPRAW-ASTRA.md) i [audytach Claude](DZIENNIK-AUDYT.md). Nie zastępuje ich ani nie zmienia historycznych wyników.

- Najnowsza instrukcja Igora: przygotować własny plan; **realizacji zabezpieczeń jeszcze nie rozpoczęto**. Samo otwarcie tego pliku nie upoważnia do wdrożeń, SQL, testów na produkcji ani rotacji.
- Przed pracą przeczytaj aktualne instrukcje projektu i zgodę z rozmowy, sprawdź gałąź oraz cudze niezapisane zmiany.
- Dopisuj datowane wpisy. Korekty starszych wniosków opisuj jako korekty, z przyczyną i nowym dowodem.
- Oddzielaj: zaplanowane, w kodzie/konfiguracji, sprawdzone na testach, wdrożone, potwierdzone w nazwanym środowisku. Przywrócenie problemu otwiera wpis ponownie.
- Zamknięcie wymaga wyniku testu odnoszącego się do konkretnego ryzyka; brak zgłoszeń, pusty zbiór danych lub zielony skaner nie dowodzą izolacji.
- Repo jest publiczne. Nie zapisuj kluczy, danych klientów, surowych dumpów, tokenowych URL ani szczegółów dostępu operacyjnego. Dowody wrażliwe przechowuj poza repo; tutaj identyfikator i bezpieczne podsumowanie.
- Dla każdego przekazania podaj pliki/commit, status środowiska, ograniczenia, zależności od Bartka/Igora i konkretny następny krok. Nie przypisuj AI wdrożenia wykonanego przez operatora.

## 2026-09-13 — Przygotowanie własnego planu

**Autor:** Astra; równoległy odczyt repo przez agentów do izolacji/CI i infrastruktury/odtwarzania.

**Zlecenie:** zastąpić przekazaną listę tematów własnym, uporządkowanym planem gotowości na zagrożenia cybernetyczne. Zachowano wcześniejsze ograniczenie do planowania i obowiązek prowadzenia dziennika.

**Punkt odniesienia:** kod `d49e8aebdf7fe74e392f6e33d90dd2549b53e93c`. Poprzedni [draft PR #1](https://github.com/ezior8888-cpu/ksef-saas/pull/1) przy sprawdzeniu był otwarty, niepołączony. Dokumenty nowego etapu powstają na osobnej lokalnej gałęzi `codex/security-preparedness-plan`. Nie zakładamy, że kod starego PR działa na produkcji.

**Wykonano:**
- Odczytano istniejące dzienniki, rejestr ustaleń, migracje 00068/00069, propozycje GDPR, workflow, skrypty audytowe oraz wybrane granice uprawnień, backupy, Dockerfile, limiter i runbooki.
- Zweryfikowano dokumentację pierwotną Supabase, GitHub, OWASP, NIST, KSeF, RODO i RFC 9116. Źródła są przy odpowiednich punktach planu.
- Opracowano dziewięć faz z celami, właścicielami, zależnościami, warunkami odbioru i bramką uruchomienia.
- Utworzono [plan](PLAN-ODPORNOSCI-CYBER.md) i ten dziennik. Towarzyszący lokalny widok faz w Codex jest skrótem; źródłem dla kolejnych AI pozostają dokumenty w repo.

**Korekty założeń i ryzyka do późniejszej weryfikacji:**
- 78 to historyczna liczba miejsc do przeglądu spośród 305 zapytań service_role; nie liczba potwierdzonych luk. Nowego skanu nie wykonano.
- CI już ma audit zależności produkcyjnych i dependency review; CSP już jest egzekwowane w kodzie. Konfiguracja wymaganych kontroli GitHub i stan nagłówków produkcji pozostają niepotwierdzone.
- Eksport przez REST nie daje dowodu spójnego pełnego backupu. Pomija część stanu, a runbook odtwarzania jest częściowo historyczny. Nie oceniono rzeczywistych kopii i szyfrowania na Hetzner/MinIO.
- Guard administracji nie wymusza samodzielnie MFA; zaufanie do IP wymaga ponownej oceny po migracji hostingu, limiter dopuszcza ruch podczas awarii, a obraz workera wymaga przeglądu uprawnień i zależności.
- Skrypty audit-* zapisują raporty, lecz trafienie nie musi kończyć ich błędem. Część łączy się z usługami; run-prod-verify wywołuje mutujące RPC. Nie wolno uznać ich za bezpieczny gotowy zestaw CI bez adaptacji.
- Istnieją alerty dostępności, ale potrzeba dowodu doręczenia i reakcji także przy utracie głównej aplikacji.

**Decyzje planistyczne:**
- Odtwarzanie i integralność faktur mają priorytet obok izolacji firm.
- MFA obejmuje administrację aplikacji i konta operatorów; potrzebny jest działający dostęp awaryjny.
- FLO wymaga osobnego modelu zagrożeń oraz kontroli narzędzi, zgody, kosztów i izolacji danych.
- Domknięcie techniczne GDPR, decyzja o retencji i wymagania wobec dostawców są oddzielnymi warunkami.
- Cele RPO ≤ 1 h i RTO podstawowej obsługi ≤ 4 h są propozycją do zatwierdzenia i pomiaru. Nie opisują obecnych możliwości.
- Pentest zewnętrzny i ćwiczenie odzyskania usługi należą do warunków odbioru, nie do dekoracyjnego dodatku po starcie.

**Stan faz:** F01–F09 mają przygotowany zakres. Nie wykonano odbioru rzeczywistego środowiska ani żadnej z zaplanowanych zmian. Analiza przygotowawcza kodu nie zamyka F01.

**Nie wykonano:** zmian kodu aplikacji/workflow/Dockera, SQL i migracji, uruchamiania audit-*.ts, testów aplikacji, skanów sieci/produkcji, odczytu wartości sekretów, rotacji, zmian infrastruktury, wdrożenia, wysyłania wiadomości ani zamówienia pentestu. Nowy etap nie został opublikowany na zdalnej gałęzi.

**Weryfikacja dokumentacji:** przegląd spójności przez drugiego agenta bez istotnych uwag; sprawdzono komplet dziewięciu faz, poprawność kodowania oraz 21 lokalnych odnośników w obu dokumentach. Sprawdzenie typów lokalnego widoku faz zakończyło się powodzeniem po dopasowaniu elementów do SDK. To kontrole dokumentacji i jej prezentacji, nie nowe testy bezpieczeństwa aplikacji.

**Otwarte zależności:**
- Bartek: potwierdzenie schematu i wdrożonego kodu, dostęp do bezpiecznych testów, kopie i restore, infrastruktura, operacyjne procedury rotacji.
- Igor: zgoda na rozpoczęcie realizacji, priorytety biznesowe, cele odtwarzania, administratorzy, obsada alarmów, budżet i zakres pentestu.
- Igor/prawnik: retencja, role dostawców i dokumenty, ocena obowiązków przy naruszeniu.
- Kolejne AI: po rozpoczęciu realizacji odświeżyć stan repo, potwierdzić zależności i prowadzić osobny dowód dla każdej kontroli.

**Następny krok po zgodzie na realizację:** wykonać odbiór stanu z F01, ustalić bezpieczne środowisko i pierwsze ćwiczenie odtwarzania; równolegle przygotować przegląd krytycznej autoryzacji oraz bramki CI. Na etapie samego planu zatrzymujemy się na dokumentacji.

## Format następnego wpisu

Dopisz wpis dopiero po faktycznym działaniu:

- Data, autor, faza i identyfikator ryzyka.
- Zakres zgody; środowisko i stan wyjściowy.
- Problem/scenariusz oraz źródło ustalenia.
- Wykonana zmiana; pliki i commit.
- Weryfikacja: metoda, kontrolne dane, wynik oczekiwany i rzeczywisty, identyfikator dowodu.
- Status osobno dla kodu, testów i wdrożenia; czego nie sprawdzono.
- Skutki uboczne, zależności, możliwość wycofania; przy incydencie ochrona dowodów.
- Właściciel pozostałych działań, konkretne następne zadanie i termin przeglądu wyjątku, jeśli istnieje.
