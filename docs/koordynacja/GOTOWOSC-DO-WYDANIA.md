# Gotowość do wydania — co znaczy „wystarczająco naprawione”

Spisane 03.10.2026 po rewizji napraw (`docs/automation/13_REWIZJA_2026-10-03.md`) jako odpowiedź na pytanie: czy po skończeniu rundy napraw aplikacja nie będzie już miała błędów związanych z wysyłką i agentem FLO, i do jakiego stopnia trzeba wszystko debugować przed wypuszczeniem.

## 1. Czego nie da się obiecać

Zero błędów nie jest osiągalne i nie jest celem. Aplikacja ma ~30 tysięcy linii logiki domenowej, 46 jobów, 130 migracji i integrację z systemem (KSeF), który sam bywa niedostępny i zmienia zachowanie między środowiskami. Dojrzałe produkty z zespołami mają incydenty z KSeF co miesiąc. Kolejny pełny audyt zawsze coś znajdzie, bo każda naprawa zmienia kod, a każda zmiana może dodać błąd (ETAP 10 i AUD-69 w rewizji to dokładnie ten mechanizm).

Po ośmiu etapach obecnej rundy zniknie klasa błędów „faktura ginie po cichu”. Nie zniknie klasa „coś poszło nie tak, trzeba zareagować”. Różnica między nimi jest cała istota gotowości.

## 2. Co jest osiągalne i mierzalne

Cel na Closed Alpha i launch to **zero cichych strat i zero ślepych uliczek na ścieżce krytycznej**, a nie zero defektów. Ścieżka krytyczna: wystawienie → wysyłka → status → UPO; skrzynka → koszt; płatność → faktura za abonament.

| Kryterium | Jak sprawdzić | Źródło |
|---|---|---|
| G1. Każda faktura wychodząca jest zawsze w znanym stanie i każdy stan ma wyjście w kodzie (nie w SQL operatora) | `SELECT * FROM ksef_lifecycle_violations()` = 0 wierszy; w `/admin/ksef` każda faktura `failed` ma przycisk | maszyna stanów, PR 1–4 |
| G2. Każda awaria na ścieżce krytycznej daje alarm w ciągu 15 minut | lista alarmów w `critical-alerts-monitor` pokrywa `queued`, `sending`, `failed TRANSIENT_EXHAUSTED`, skrzynkę bez kosztu, UPO bez pobrania; test: wymuszona awaria na KSeF TEST → alarm na Telegramie | PR 4, S2 |
| G3. Awaria nie jest utratą: po usunięciu przyczyny system sam dochodzi do stanu spójnego | wyłączony KSeF TEST na 2 h, potem włączony → wszystkie faktury `accepted` bez ręcznej ingerencji; skrzynka: zabity worker między zapisem a kategoryzacją → koszt pojawia się w ciągu 30 min | K2, K3, D1 |
| G4. Siedem kolejnych dni raportu dziennego strażnika bez naruszeń, przy realnym ruchu testowym (co najmniej 20 faktur dziennie, w tym KOR i ZAL, co najmniej 5 faktur zakupowych dziennie) | raport na Telegramie z PR 4 | PR 4 |
| G5. Treść podatkowa: `verify:fa3` dla wszystkich typów przechodzi, a 10 faktur z KSeF TEST (FA, KOR in minus, KOR in plus, ZAL, ROZ, np II, zw, oo, konsument, UE) zostało porównanych ręcznie z wydrukiem i KPiR przez księgową (Igor albo zewnętrzna) | protokół odbioru w `docs/security/` | C, C2 |
| G6. Pieniądze: pierwsza prawdziwa płatność testowa (karta testowa Stripe na produkcji w trybie test) kończy się fakturą `FF/…` w KSeF TEST i mailem do klienta | ręczny test po K1 | K1 |
| G7. Dane klienta nie wyciekają między firmami | job CI „RLS isolation” zielony; test ręczny: dwa konta, próba odczytu cudzej faktury po id przez PDF, XML, UPO, portal księgowej | F |
| G8. Procedury operatora istnieją i były przećwiczone: wgranie migracji, wdrożenie, wycofanie, reset faktury, uzgodnienie środowiska, odtworzenie bazy z kopii | runbooki + jedna próba każdej na KSeF TEST / kopii bazy | AGENTS.md, runbooki |

Jeśli G1–G8 są spełnione, produkt jest zdatny do Closed Alpha mimo otwartych ustaleń ŚRED i NISK. Jeśli któreś nie jest, liczba zamkniętych AUD-NN nie ma znaczenia.

## 3. Jak zabierać się za naprawy w kolejnych sesjach

1. **Nie zaczynaj od pełnego audytu.** Pełny audyt daje 100 ustaleń i pokusę naprawienia wszystkiego w jedną noc; tak powstała rewizja z 45 nowymi defektami. Zacznij od jednego pytania: „które z kryteriów G1–G8 jest dziś niespełnione?” i napraw tylko to, co je spełnia.
2. **Jedna sesja = jeden etap z `PR-CYKL-ZYCIA-FAKTURY.md` albo jedno ustalenie K/W z rewizji.** Protokół w `AGENTS.md` („Protokół naprawy błędu”): gałąź od `origin/main`, czerwony test na prawdziwej ścieżce, naprawa, pełny Vitest, PR według szablonu, raport, stop.
3. **Kolejność według wpływu na klienta, nie według wagi w tabeli.** Najpierw to, co dziś na produkcji może zgubić dokument lub pieniądze (K), potem to, co pokazuje klientowi zły wynik (W), potem reszta. Ustalenia ŚRED/NISK z rewizji wolno zostawić na po launchu, jeśli nie blokują G1–G8.
4. **Po każdych 3–4 PR wąska rewizja tylko tych PR** (jeden rewident, diff względem projektu), nie kolejny audyt całości. Pełna rewizja dopiero przed launchem, i tylko ścieżki krytycznej.
5. **Testy na bazie są obowiązkowe dla wyzwalaczy, RPC i przejść statusów.** Zielony Vitest z bazą w pamięci udowodnił w rewizji, że nie dowodzi niczego o produkcji.
6. **Zmiana środowiska, refaktor, migracja PO wdrożeniu — osobna sesja, osobny runbook, próba na KSeF TEST.** Przełączenie `KSEF_ENV` na produkcję to osobny etap z własną listą kontrolną (W15).
7. **Dziennik napraw aktualizuje rewident, nie autor.** „Scalone” zapisuje autor; „naprawione” dopiero ktoś, kto przeczytał `main`.
8. **Sesja kończy się, zanim zacznie się noc.** Daty commitów z rewizji mówią same za siebie; po 4 rano powstają błędy, które potem kosztują dzień.

## 4. Czego nie debugować przed launchem

- Agent FLO poza propozycjami (pułap A1): zostaje wyłączony; jego ryzyko to działanie bez człowieka, nie błędy w kodzie. Jedyna rzecz do zrobienia: zdjąć fałszywe znaczniki NIEAKTYWNE z wykonawcy ponagleń (S14), bo on działa.
- Offline24 i kody QR KOD II: decyzja prawna, nie debugowanie.
- Eksporty do systemów księgowych innych niż KPiR i JPK: wystarczy, że odmawiają czytelnie zamiast produkować zły plik.
- Ustalenia NISK z rewizji: po launchu, partiami, tym samym protokołem.

## 5. Jak rozpoznać, że pętla „audyt → naprawa → audyt” znowu nie zbiega

Trzy sygnały, każdy osobno wystarcza, żeby zatrzymać naprawy i wrócić do sekcji 2:

- liczba nowych ustaleń po rewizji PR-ów jest większa niż liczba zamkniętych,
- w PR pojawia się naprawa bez czerwonego testu albo z testem na bazie w pamięci dla wyzwalacza,
- ktoś zdejmuje hamulec (`KOR_HOLD`, Offline24, `KSEF_ENV`) bez listy kontrolnej z próbą na TEST.
