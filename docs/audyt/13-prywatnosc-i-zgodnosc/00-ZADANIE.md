# Zadanie 13 — Prywatność i zgodność: research i audyt

Plik zawiera pierwotne wymagania etapu badawczego, w brzmieniu przekazanym
przez właściciela 7.10.2026. Recenzenci każdego etapu dostają ten plik jako
punkt odniesienia. Nie edytuj treści wymagań; zmiany zakresu dopisuj
w sekcji „Zmiany zakresu” na końcu.

## Polecenie (treść oryginalna)

Pracujesz w repozytorium naszej aplikacji. Wykonaj bardzo dokładny research
i audyt zadania „13. Prywatność i zgodność”. Ustal stan obecny, luki, ryzyka
i najlepszy sposób realizacji w tej konkretnej aplikacji. Masz przeznaczyć na
analizę tyle pracy, ile potrzeba do uzasadnionych, sprawdzalnych wniosków.
Ten etap obejmuje analizę oraz zapis raportów. Zmiany funkcjonalne
w aplikacji rozpoczniesz dopiero po otrzymaniu osobnego prompta wykonawczego.

### 1. Zasada dotycząca prawnika

Przeprowadź cały research i audyt bez angażowania prawnika. Prawnik zrobi
wyłącznie końcowe review przygotowanego rezultatu. Nie uzależniaj postępu od
konsultacji prawnych.
Rejestruj niepewności, proponowane interpretacje, podstawy źródłowe i pytania
do końcowej oceny. Nie przedstawiaj roboczych założeń jako zatwierdzonych
faktów.

### 2. Rozpoznanie projektu i dostępu

Przeczytaj obowiązujące instrukcje repozytorium, w tym AGENTS.md i CLAUDE.md,
jeśli istnieją, oraz dokumentację architektury. Rozpoznaj stos, strukturę,
modele danych, API, frontend, zadania w tle, integracje, konfigurację
środowisk, infrastrukturę i testy. Zapisz wersję kodu i istotne lokalne
zmiany.
Sprawdź cały cykl życia danych: zebranie, przesłanie, przetworzenie, zapis,
udostępnienie, eksport, retencję, usuwanie i odtwarzanie. Uwzględnij
istniejące bazy, pliki, cache, kolejki, logi, tracing, analitykę, backupy,
support oraz systemy AI/OCR, wyszukiwarki i bazy wektorowe, jeżeli występują.
Korzystaj przede wszystkim z kodu, schematów, konfiguracji, metadanych
i danych syntetycznych. Nie kopiuj danych klientów, dokumentów, sekretów ani
pełnych payloadów do raportów lub zewnętrznych usług.
Brak dostępu do produkcji, umowy lub panelu dostawcy oznacz jako ograniczenie
dowodowe. Nie udawaj, że sprawdziłeś niedostępne źródło.

### 3. Automatyczny workflow agentowy

Jako koordynator deleguj niezależne części analizy agentom: research źródeł,
przepływy danych, mechanizmy aplikacji, testy i dowody/SOC 2. Dobierz liczbę
agentów do dostępnych narzędzi.
Każdy etap — rozpoznanie, research, inwentarz, analiza luk, plan — ma przejść
niezależny review. Recenzent otrzymuje pierwotne wymagania i materiały
źródłowe, sprawdza wnioski, luki i sprzeczności. Autor nie zatwierdza
własnego etapu. Poprawiaj uwagi i przechodź dalej automatycznie.
Nie udawaj delegowania. Jeśli subagenci są niedostępni, wykonaj możliwe
kontrole samodzielnie, zapisz brak niezależnego review i kontynuuj użyteczną
analizę; nie oznaczaj tej bramki jako spełnionej.

### 4. Research w źródłach pierwotnych

Sprawdź aktualne oficjalne materiały, właściwą jurysdykcję i datę ich
weryfikacji:

- RODO w EUR-Lex, w szczególności art. 25 oraz powiązane przepisy dotyczące
  zasad, podstaw przetwarzania, praw osób, procesorów, bezpieczeństwa,
  retencji i transferów.
- EROD/EDPB i UODO: privacy by design/default, zgody, role stron, dostęp,
  usuwanie i istotne aktualne wytyczne.
- Dla cookies i podobnych technologii: właściwe przepisy ePrivacy i krajowe;
  dla Polski sprawdź aktualne Prawo komunikacji elektronicznej, w tym
  art. 399–400.
- AICPA: aktualne Trust Services Criteria i zasady raportowania SOC 2.
- Oficjalne dokumentacje rzeczywiście używanych dostawców oraz dostępne umowy
  i ustawienia usług.

Advisera i Schneider Downs mogą wskazywać zagadnienia do sprawdzenia.
Kluczowe ustalenia potwierdzaj w źródłach pierwotnych.
Oddziel obowiązek wynikający z prawa, interpretację organu, kryterium SOC 2
i proponowaną praktykę inżynierską.
Dla każdego istotnego wniosku podaj źródło, odpowiedni przepis/punkt, datę
sprawdzenia i zastosowanie do aplikacji. Nie przypisuj obowiązywania
projektom lub materiałom konsultacyjnym.

### 5. Obowiązkowy zakres audytu

**A. Inwentarz i klasyfikacja.** Zidentyfikuj kategorie osób, danych i celów
przetwarzania. Uwzględnij dane kont, osób bez konta, dokumentów klientów,
kontaktów, identyfikatorów i telemetryki, jeżeli występują.
Określ role stron osobno dla operacji; nie zakładaj jednej roli dla całej
aplikacji. Dla każdej kategorii opisz źródło, przepływ, magazyny, odbiorców,
dostęp, retencję i dowody.

**B. Minimalizacja i domyślne ustawienia.** Sprawdź konieczność pól, zakres
odpowiedzi API, dostęp pracowników i użytkowników, domyślne udostępnianie,
logi, błędy, analitykę i dane testowe.
Oceń pseudonimizację, oddzielenie powiązań i kluczy oraz możliwość
identyfikacji. Nie utożsamiaj hashowania, UUID, maskowania ani szyfrowania
z dowodem anonimizacji.

**C. Podstawy przetwarzania, informacje, zgody i cookies.** Zmapuj cele na
uzasadnione podstawy i obowiązki informacyjne. Nie przypisuj automatycznie
zgody każdemu przetwarzaniu.
Zbadaj oddzielnie zgody produktowe, marketing i technologie przeglądarkowe.
Sprawdź wersjonowanie treści, udzielenie, odmowę i wycofanie decyzji.
Gdy środowisko pozwala, zbadaj rzeczywiste żądania sieciowe, cookies i inne
magazyny, także przed wyborem i po wycofaniu. Uzasadnij klasyfikację
technologii niezbędnych. Samo istnienie bannera nie jest dowodem poprawnego
działania.

**D. Prawa osób.** Rozróżnij dostęp i kopię danych, przenoszenie,
sprostowanie, usuwanie, ograniczenie i sprzeciw, odpowiednio do zastosowania.
Oceń identyfikację osoby, zakres wyszukiwania, terminy, bezpieczeństwo
eksportu i ochronę danych innych osób. Uwzględnij żądania osób
nieposiadających konta oraz obowiązki wobec klientów, gdy aplikacja działa
jako procesor.

**E. Retencja i usuwanie.** Zidentyfikuj aktualne reguły, ich podstawy,
moment rozpoczęcia biegu okresu oraz usuwanie we wszystkich systemach.
Rozróżnij usunięcie konta, logiczne ukrycie, faktyczne usunięcie
i anonimizację. Sprawdź wyjątki, ewentualne obowiązki przechowywania
dokumentów, backupy, dostawców i przywracanie danych. Nie wymyślaj jednego
okresu retencji dla całej aplikacji.

**F. Procesorzy, lokalizacje i transfery.** Odtwórz rzeczywistych odbiorców
i dostawców, w tym dalszych procesorów, support i telemetrię.
Sprawdź dostępne DPA, regiony, lokalizacje backupów, zdalny dostęp, retencję
dostawców i mechanizmy transferów. Nie uznawaj deklaracji „region UE” za
pełną ocenę całego łańcucha. Nie zgaduj zawartości nieudostępnionych umów.

**G. Dokumenty i dowody.** Zbadaj polityki, rejestry przetwarzania, procedury
praw osób, incydentów i retencji, przeglądy dostępów, ślady audytowe oraz
rzeczywiste raporty/certyfikaty.
Oceń potrzebę dodatkowych analiz, np. DPIA, LIA lub oceny transferów, na
podstawie faktów. Przygotuj materiały robocze tam, gdzie są potrzebne.
Nie oznaczaj procedury, szkolenia lub kontroli organizacyjnej jako wykonanej
tylko dlatego, że istnieje dokument.

### 6. SOC 2

Przeanalizuj wszystkie pięć kategorii: Security, Availability, Processing
Integrity, Confidentiality, Privacy.
Sprawdź Common Criteria i właściwe kryteria dodatkowe. Mapuj kontrole
i dowody do zweryfikowanych identyfikatorów; jeśli pełny tekst jest
niedostępny, oznacz ograniczenie zamiast wymyślać numery.
Dla każdej kategorii opisz znaczenie dla aplikacji, istniejące kontrole, luki
i wymagane dowody. Uwzględnij zarządzanie dostępem i zmianami, odtwarzanie,
poprawność i kompletność przetwarzania, ochronę informacji poufnych oraz
cykl życia danych osobowych.
Oddziel zakres naszego przeglądu pięciu kategorii od zakresu ewentualnego
formalnego badania.
Odróżnij Type I i Type II, gotowość do badania, projekt kontroli i dowody ich
działania w czasie. Nie ogłaszaj „certyfikacji SOC 2”, nie twórz fikcyjnego
raportu audytora i nie uznawaj SOC 2 za automatyczne potwierdzenie RODO.

### 7. Wymagany wynik

Zapisz materiały zgodnie z konwencją repozytorium, w jednym logicznym
miejscu. Przygotuj:

- raport stanu obecnego i granic audytu;
- inwentarz danych, mapę przepływów i role stron;
- rejestr źródeł oraz procesorów/lokalizacji;
- macierz: ID wymagania → źródło → stan → dowód → luka → ryzyko → zmiana →
  test → zależność;
- mapowanie pięciu kategorii SOC 2;
- plan małych, spójnych etapów z kryteriami akceptacji, testami, migracjami
  i sposobem wycofania;
- rejestr niewiadomych i materiałów do końcowego review prawnego.

Stan wymagania opisuj jako: potwierdzone, częściowe, brak, niezweryfikowane
albo nie dotyczy z uzasadnieniem.
Oddziel „nie znaleziono” od „nie istnieje”. Dla ustaleń o aplikacji wskazuj
konkretne pliki/miejsca, konfiguracje i wyniki sprawdzeń, a nie samą opinię.
Ujawnione niewiadome nie blokują zakończenia audytu. Blokują wnioski lub
działania, które zależą od brakujących faktów. Raport ma pozwolić rozpocząć
implementację bez ponawiania całego badania.
Zakończ niezależnym review kompletności: każdy wskazany obszar musi mieć
ustalenie, dowód lub jawne ograniczenie i dalszą ścieżkę. Podaj najważniejsze
ryzyka oraz zalecaną kolejność zmian.
Po tym zatrzymaj się na granicy etapu badawczego i oczekuj osobnego prompta
wykonawczego.

## Zmiany zakresu

- 7.10.2026, w trakcie sesji: właściciel odrzucił użycie wyszukiwarki
  internetowej (WebSearch) i polecił kontynuować. Research źródeł prowadzimy
  bez wyszukiwarki; szczegóły w `01-STAN-I-GRANICE.md` (ograniczenia
  dowodowe).
