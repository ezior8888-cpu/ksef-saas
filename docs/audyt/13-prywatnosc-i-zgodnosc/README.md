# Audyt 13 — Prywatność i zgodność (etap badawczy)

| | |
|---|---|
| Stan | **synteza gotowa; poprawki po końcowym review kompletności (R6a, R6b) w toku** — wynik w `10-REVIEW.md` § 4; zmiany w aplikacji nie zostały rozpoczęte i czekają na osobny prompt wykonawczy |
| Wersja kodu | `origin/main` @ `3e5e00d` (dryf wersji po zamrożeniu: `01` § 2) |
| Okres prac | 7.10–13.10.2026 (przerwy przez limity użycia API) |
| Autor tego pliku | koordynator — streszczenie; wiążąca jest treść plików źródłowych i ich recenzji |
| Kontrola | każdy etap po niezależnej recenzji (`10-REVIEW.md`, `recenzje/`); całość po review kompletności R6a/R6b |

Audyt nie jest opinią prawną ani raportem SOC 2. Przepisy, wytyczne
i kryteria AICPA opisano według wiedzy modelu, bo dostęp do źródeł
pierwotnych był w tej sesji zablokowany. Każda taka pozycja ma oznaczenie
[NZ] i trafiła na listę do końcowego review prawnego (`08` § 4.2).

## 1. Jak czytać

| Plik | Co zawiera | Wymóg zadania (pkt 7) |
|---|---|---|
| `00-ZADANIE.md` | pierwotne wymagania (punkt odniesienia recenzentów) | — |
| `01-STAN-I-GRANICE.md` | rozpoznanie: wersja kodu, stos, środowiska, infrastruktura (z poziomem dowodu), ograniczenia dowodowe, workflow | raport stanu obecnego i granic audytu |
| `02-INWENTARZ-I-PRZEPLYWY.md` | kategorie osób i danych, magazyny (także poza bazą i historyczne), role stron per operacja, mapy przepływów | inwentarz, mapa przepływów, role stron |
| `03-REJESTR-ZRODEL.md` | rejestr źródeł (ZR) ze statusem weryfikacji i katalog 82 wymagań (WYM) z klasą P/O/S/I | rejestr źródeł |
| `04-PROCESORZY-I-LOKALIZACJE.md` | rzeczywiści odbiorcy danych z kodu, role, regiony, transfery, DPA (stan), projekt listy dalszych procesorów | rejestr procesorów/lokalizacji |
| `05-MACIERZ-WYMAGAN.md` | macierz: ID → źródło → stan → dowód → luka → ryzyko → zmiana → test → zależność → etap planu; pokrycie wszystkich ustaleń; 15 najważniejszych ryzyk | macierz wymagań |
| `06-SOC2.md` | pięć kategorii TSC, Common Criteria, Type I/II, gotowość, luki SOC-NN, rekomendacja zakresu | mapowanie SOC 2 |
| `07-PLAN-ETAPOW.md` | etapy E-00…E-79 z kryteriami akceptacji, testami (czerwony test najpierw), migracjami, wycofaniem; bramka przed pierwszym klientem | plan małych etapów |
| `08-NIEWIADOME-I-REVIEW-PRAWNE.md` | niewiadome N-NN (co blokują, kto rozstrzyga), pytania Q-NN z roboczymi interpretacjami, lista kontrolna źródeł [NZ] | rejestr niewiadomych i materiałów do review prawnego |
| `09-MATERIALY-ROBOCZE.md` | projekty: rejestry art. 30, screening DPIA, LIA, TIA, szkielet umowy powierzenia, procedury DSAR i naruszeń, tabela decyzji retencji, specyfikacja zgody | materiały robocze (pkt 5.G) |
| `10-REVIEW.md` | dziennik bramek: autor, recenzent, werdykt, kontrole, uwagi, naniesienie | dowód niezależnych recenzji |
| `A1`–`A4` | ustalenia szczegółowe: minimalizacja i zgody (A1), prawa osób, retencja i AI (A2), dowody i testy (A3), test runtime cookies i sieci (A4) | materiał dowodowy dla 05 |
| `narzedzia/` | powtarzalny test przeglądarki (Playwright, ruch zewnętrzny przerywany) i jego wynik bez wartości ciasteczek | dowód z pkt 5.C |
| `recenzje/` | pełne recenzje R1–R6 i brief agentów | — |

**Stany.** Stan wymagania wiąże wyłącznie w `05`. Pole „Stan” w plikach
ustaleń (`02`, `04`, `A1`–`A4`, `06`) opisuje stan wymagania, którego
dotyczy ustalenie, a pewność dowodu (kod / runtime / pomiar operatora)
podaje w nawiasie. Oznaczenia „D-NN” mają trzy znaczenia zależnie od pliku:
kategorie danych w `02`, deklaracje stron prawnych w `A1`/`09`, decyzje
etapu E-00 w `07` — w odwołaniach między plikami podajemy plik (np.
„`07` D-16”).

Wzmianki o „scratchpadzie” w plikach etapów dotyczą roboczych plików sesji
agentów (skrypty kontrolne, listy pomocnicze), których nie przenoszono do
repo; same recenzje są w `recenzje/`.

## 2. Najważniejsze wnioski

1. **Usuwanie danych obiecuje więcej, niż robi kod.** Usunięcie konta przez
   użytkownika ma poprawny rdzeń (14 dni, atomowe przejęcie), ale zostawia
   czat, dane osób bez konta, pliki i dane u dostawców. Ścieżka operatora
   przerywa się na wyzwalaczu dziennika audytu (potwierdzone na schemacie
   syntetycznym; wyzwalacze produkcji — odczyt `07` D-06), a „Usuń organizację” ustawia
   tylko znacznik, którego nikt nie wykonuje — firma jest dalej
   przetwarzana (`05` WYM-24, WYM-45; `A2` PRA-02–PRA-04).
2. **Retencja prawie nie istnieje.** Wykonawcę ma tylko kilka reguł
   (m.in. dziennik audytu 12 miesięcy, cache rejestrów, przycinanie zdarzeń
   Stripe, domyślne czyszczenie pg-boss — `A2` § E); większość kategorii
   nie ma okresu ani mechanizmu. Usuwanie faktur po terminie
   zablokuje wyzwalacz KSeF po skasowaniu plików. Założenie „10 lat” nie
   ma ustalonej podstawy (`05` WYM-08, WYM-68, WYM-71, WYM-73).
3. **Deklaracje publiczne nie odpowiadają stanowi faktycznemu.** Polityka ma
   placeholder administratora; polityka i strona RODO podają nieaktualne
   lokalizacje (Frankfurt, Vercel), dostawców, SCC, szyfrowanie, „audyt
   dostępu” i „brak cookies analitycznych” (`05` WYM-18, WYM-19).
4. **Dane trafiają do odbiorców bez potrzeby lub bez wyboru.** Test runtime
   wykazał sesje Sentry i fonty Google przed decyzją oraz to, że ciasteczko
   pierwszej strony dociera do proxy telemetrii `/ingest` i `/monitoring`.
   Z kodu (`next.config.ts:140-155,189`; Next.js `proxy-request.js:29-41`)
   wynika, że proxy przekazuje dostawcom wszystkie nagłówki, w tym `Cookie`;
   wyjścia na łączu nie obserwowano (blokada w teście), a dla zalogowanego
   użytkownika dotyczy to ciasteczek sesji — wniosek z kodu (`A4` RUN-08,
   stan „częściowe”). Według odczytu panelu przez operatora [PR225
   @a72b567] projekt PostHog ma włączone nagrania wbrew kodowi i zarejestrował
   2 nagrania o nieustalonym źródle. Kategoryzacja AI wysyła dane
   sprzedawców poza EOG (USA lub „global” — geografia nieodczytana) bez
   przełącznika (`04` PRC-06, PRC-09; `05` WYM-36, WYM-34, WYM-62).
5. **Baner zgody działa, ale bez wycofania.** Test wykazał zero żądań
   PostHog przed wyborem i po odmowie oraz brak ciasteczek na stronach
   publicznych przed wyborem (`A4` RUN-01, RUN-02); w kodzie przycisk
   odmowy stoi obok zgody (`A1`). Jednocześnie service worker i Cache
   Storage zapisują się każdemu odwiedzającemu (RUN-06), a po wyborze
   interfejs nie pozwala zmienić decyzji (RUN-03; `05` WYM-14).
6. **Rola procesora wobec klientów jest nieobsłużona.** Brak umowy
   powierzenia, listy dalszych procesorów, rejestrów z art. 30 i procedur
   (DSAR, naruszenia) — w repo nie znaleziono tych dokumentów, co nie
   przesądza, że nie istnieją poza repo (`05` WYM-41, WYM-43, obszar G).
7. **Produkcja działa z jawnym `KSEF_ENV=test`** [PR225]. Główna ścieżka
   wysyłki jest fail-closed przy pustej lub błędnej wartości
   (`lib/ksef/claim-environment.ts:6-21`, `lib/ksef/submit-invoice-full.ts:86`),
   ale nic nie blokuje jawnego `test` na produkcji — pierwsze prawdziwe
   faktury trafiłyby do testowego KSeF (`04` PRC-17; `?? 'test'`
   w `submit-invoice.ts:628` i `ksef-submit-enqueue.ts:127` to decyzje
   poboczne).
8. **SOC 2: gotowość niska, mocny projekt kontroli technicznych.** RLS
   z testami w CI (job RLS nie jest wymaganą kontrolą scalenia),
   szyfrowanie poświadczeń KSeF, wymagane kontrole PR;
   luki głównie organizacyjne (polityki, przeglądy dostępów, kopie poza
   hostem, próby odtworzenia, dyżur). Zalecany pierwszy zakres badania:
   Security + Availability, po zamknięciu kopii i prób odtworzenia
   (`06` § 9). Brak certyfikacji; SOC 2 nie potwierdza zgodności z RODO.

Stan 85 wymagań w macierzy (82 z katalogu `03` i 3 dodatkowe): potwierdzone 1,
częściowe 44, brak 36, niezweryfikowane 4, nie dotyczy 0 (`05` § 12.1, po
poprawkach R5a). Jedyne „potwierdzone” dotyczy braku nieuprawnionych
deklaracji SOC 2, nie wdrożonej kontroli.

## 3. Najważniejsze ryzyka

Pełna lista z identyfikatorami: `05` § 12.2. Skrót (kolejność wg skutku):

| # | Ryzyko | Wymagania |
|---|---|---|
| 1 | Niekompletne usunięcie konta; ścieżka operatora przerywa się po częściowych skutkach | WYM-24, WYM-73 |
| 2 | „Usuń organizację” bez wykonawcy; dalsze przetwarzanie „usuniętej” firmy | WYM-45 |
| 3 | Ciasteczka sesji przekazywane dostawcom telemetrii przez proxy (kod; wejście potwierdzone w teście) | WYM-36, WYM-09 |
| 4 | Brak pełnej kopii baz i plików poza hostem; jedna próba odtworzenia | WYM-51 |
| 5 | Polityka bez administratora; nieprawdziwe deklaracje publiczne | WYM-18, WYM-19 |
| 6 | Brak okresów i wykonawców retencji dla większości danych | WYM-08, WYM-71 |
| 7 | Odtworzenie z kopii przywraca dane usunięte | WYM-72 |
| 8 | Brak umowy powierzenia i listy dalszych procesorów | WYM-41, WYM-43 |
| 9 | Brak mapy cel → podstawa, LIA i screeningu DPIA | WYM-11, WYM-12, WYM-55 |
| 10 | Jawne `KSEF_ENV=test` na produkcji bez strażnika [PR225] | WYM-37 |
| 11 | Automatyczne przekazywanie danych sprzedawców do modelu poza EOG (geografia nieodczytana) | WYM-62, WYM-42, WYM-60 |
| 12 | Odczyty operatorów bez śladu, brak przeglądów dostępów, agenci AI z dostępem do produkcji | WYM-35, WYM-47 |
| 13 | PostHog: nagrania włączone w panelu wbrew kodowi [PR225 @a72b567, odczyt operatora] | WYM-34 |
| 14 | Retencja faktur „10 lat” bez podstawy; usuwanie zablokuje wyzwalacz po skasowaniu plików | WYM-68, WYM-73 |
| 15 | Osoby bez konta bez procedury, wyszukiwania i rejestru żądań; poczta pomocy według runbooka ma trafiać do prywatnych skrzynek (niezweryfikowane) | WYM-17, WYM-21, WYM-75 |

## 4. Zalecana kolejność zmian

Szczegóły i karty etapów: `07` § 1 (fale i kolejność startu), § 8 (bramka
przed pierwszym prawdziwym klientem).

1. **Równolegle od razu — decyzje i dane od właściciela (E-00):** podmiot
   prawny administratora, `KSEF_ENV` przed pierwszym klientem, odczyt
   i korekta panelu PostHog (źródło 2 nagrań), ocena, czy przekazywanie
   ciasteczek sesji dostawcom telemetrii jest naruszeniem (`07` D-16), umowy
   i panele dostawców, decyzje retencji (`08` — niewiadome P1).
2. **Obietnice bez pokrycia (F1):** wycofanie nieprawdziwych deklaracji
   publicznych (E-01), wyłączenie „usuniętej” organizacji z przetwarzania
   (E-02), wspólna ścieżka usunięcia konta przez operatora i dowód
   wykonania (E-03, E-04).
3. **Dane bez podstawy (F2):** proxy telemetrii bez nagłówków przeglądarki
   (E-05), Sentry i fonty bez wysyłki przed wyborem (E-06, E-07), service
   worker tylko w panelu (E-08), strażnik środowiska KSeF na produkcji (E-10),
   minimalizacja promptów AI i informacja o AI (E-11, E-12).
4. **Tory równoległe:** kopie poza hostem i próba odtworzenia (E-53, praca
   z PR #225), testy RLS jako wymagana kontrola scalenia (E-70), ślad
   odczytów operatora (E-36).
5. **Prawa osób (F3):** wycofanie zgody z wersją i datą (E-18), usunięcie
   konta dla logowania Google (E-19), rejestr żądań i wyszukiwanie osoby
   (E-22), eksport (E-23, E-25), sprostowanie (E-24).
6. **Minimalizacja i retencja (F4)** po decyzjach retencji; **dokumenty
   i dowody SOC 2 (F5)** po ustaleniu podmiotu i review prawnym (projekty
   w `09`).

Każdy etap kodu wykonuje się według „Protokołu naprawy błędu” z
`AGENTS.md`: jedna naprawa — jedna gałąź — jeden PR, najpierw czerwony
test na prawdziwej ścieżce, migracje według rejestru numerów
(przydzielane przy realizacji, nie zarezerwowane w tym audycie).

## 5. Granice i ograniczenia dowodowe

- Brak dostępu do produkcji, paneli i umów dostawców: fakty o produkcji
  pochodzą z niescalonego PR #225 (pomiar i deklaracje operatora) i są tak
  oznaczone (`01` § 4).
- Źródła prawa i AICPA nieodczytane online (blokada sieci; WebSearch
  odrzucony przez właściciela) — [NZ] w całym audycie, lista w `08` § 4.2.
- Test przeglądarki objął strony publiczne na lokalnym buildzie z danymi
  syntetycznymi; strony po zalogowaniu i konfiguracja produkcyjna
  telemetrii — poza zasięgiem (`A4` § 7).
- Niewiadome blokują tylko wnioski i etapy od nich zależne; zestawienie
  tego, co można robić od razu: `08` § 5.

## 6. Co dalej

Etap badawczy kończy się na tym katalogu. Wdrożenie wymaga osobnego
prompta wykonawczego; proponowany start: E-00 (decyzje) równolegle
z E-01–E-04, zgodnie z `07` § 1.4. Przed publikacją jakichkolwiek treści
prawnych — końcowe review prawnika na podstawie `08` § 4 i projektów `09`.
