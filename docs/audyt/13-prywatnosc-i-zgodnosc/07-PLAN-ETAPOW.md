# 07 — Plan etapów: prywatność i zgodność

| | |
|---|---|
| Etap | Plan małych, spójnych etapów (pkt 7 zadania: „plan małych, spójnych etapów z kryteriami akceptacji, testami, migracjami i sposobem wycofania”) |
| Autor | agent PLAN (subagent koordynatora) |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza zawiera to scalenie; poza `docs/audyt/` brak różnic) |
| Zakres | 80 etapów (E-00 – E-79) pokrywających 85 wymagań macierzy `05` (WYM-01 – WYM-75, WYM-SOC-1 – WYM-SOC-7, WYM-X-01 – WYM-X-03): decyzje i dane wejściowe właściciela (E-00), zmiany kodu i konfiguracji, migracje, treści prawne (projekt → review prawne → publikacja), etapy organizacyjne i dowody SOC 2; kolejność z uzasadnieniem; bramka przed pierwszym prawdziwym klientem; mapowanie na SOC 2; wypełnienie kolumny „Etap planu” w `05` |
| Źródła | `00-ZADANIE.md` (pkt 7); `AGENTS.md` („Protokół naprawy błędu”, „Wgrywanie migracji”, „Wdrożenie produkcji”); `05-MACIERZ-WYMAGAN.md` (kolumny „Zmiana”, „Test”, „Zależność”, § 12–13); `09-MATERIALY-ROBOCZE.md` (§ 1–13: szkice rejestrów, DPIA, LIA, TIA, umowy, procedur, retencji, zgody); `01`, `02`, `03` (Q-ZR, N-ZR), `04` (PRC), `A1` (MIN, ZGD), `A2` (PRA, RET, AI), `A3` (DOW, testy T-01 – T-21, pytania P-01 – P-12), `A4` (RUN), `06` (SOC-01 – SOC-36, § 9 ścieżka); recenzje R1–R4 (scratchpad koordynatora); `docs/koordynacja/CLAUDE-DO-CODEXA.md` (rejestr migracji), `docs/koordynacja/PLAN-ZERO-ZGUBIONYCH-FAKTUR.md` (blok F, bramka wydania); kontrolne odczyty kodu na `3e5e00d` (§ 13) |
| Ograniczenia | Plan, nie decyzja: kolejność, warianty i wielkości to propozycje (I). Brak dostępu do produkcji, paneli i umów — etapy zależne od tych faktów czekają na E-00. Przepisy i wytyczne z pamięci modelu [NZ] — treść zmian prawnych zależy od końcowego review. Wielkości S/M/L to ocena orientacyjna, nie wycena. Fakty runtime z niescalonego PR #225 oznaczam [PR225] (deklaracja lub pomiar operatora, niezweryfikowane w tej sesji). Plik `08-NIEWIADOME-I-REVIEW-PRAWNE.md` był w chwili pisania w budowie — odwołuję się do niewiadomych po ID z raportów źródłowych. Plan nie przeszedł jeszcze niezależnej recenzji |
| Stan | gotowy do recenzji; autor nie zatwierdza własnego etapu |

## 0. Zasady planu

Ten plik kończy etap badawczy. Żaden etap nie jest rozpoczęty; wykonanie
zaczyna się dopiero po osobnym prompcie wykonawczym (`00` pkt 7). Etap
oznaczony „start: od razu” nie zależy od niewiadomych ani decyzji —
można go zacząć bez E-00. Etap „czeka” wskazuje, na co: decyzję D-NN
z E-00, pytanie do review (Q-ZR-NN z `03` § 5.2, P-NN z `A3` § 9, „`A2`
pyt. n”, „`04` pyt. n”) albo inny etap.

### 0.1. „Protokół naprawy błędu” w tym planie

| Pkt protokołu (`AGENTS.md`) | Jak go stosuję w kartach etapów |
|---|---|
| 1. Jedna naprawa = jedna gałąź od `origin/main` = jeden PR | etap kodu = jedna naprawa; karta podaje proponowaną gałąź `claude/<eNN>-<ustalenie>-<temat>`. Bez refaktorów „przy okazji”. Etapy organizacyjne i prawne nie mają PR kodu, chyba że kończą się publikacją strony |
| 2. Najpierw czerwony test na prawdziwej ścieżce | pole „Test czerwony”: plik, asercja, typ (jednostkowy / RLS na bazie / e2e / ręczny dowód) i przewidywany wynik przed zmianą. Wyzwalacze, RPC, uprawnienia i przejścia statusów — `tests/rls-*.test.ts` na lokalnym Supabase (job CI „RLS isolation (lokalny Supabase)”). Gdzie `A3` § 5 zaproponował test, podaję jego ID (T-NN). Test, który przechodzi przed zmianą, nie zamyka etapu |
| 3. Przyczyna i wszystkie wystąpienia | pole „Zakres” wymienia drugie wystąpienia, które znalazłem (np. dwa zapisy `hard_delete_at`, wiele domyślnych `?? 'test'`); wystąpienia poza zakresem są osobnym etapem, nie cichym pominięciem |
| 4. Fail-closed musi mieć wyjście | pole „Fail-closed i ponowienie”: komunikat dla klienta z nazwą dokumentu lub obiektu i tym, co ma zrobić, oraz ścieżka operatora (akcja w `/admin`, RPC, runbook) |
| 5. Ponowienie od zera | dla jobów pg-boss: co się stanie po ponowieniu po każdym kroku z efektem zewnętrznym; klucz idempotencji albo warunek w `UPDATE` |
| 6. Przed PR | `pnpm typecheck`, `eslint` na zmienionych plikach, pełny `pnpm vitest run`, przy zmianach w `app/` — `pnpm build`; całość `pnpm run ci`. Liczby na sztywno zmieniane świadomie (np. `tests/unit/jobs-foundation.test.ts:186` — 27 cronów; nowy cron retencji zmienia tę liczbę i komentarz) |
| 7. Opis PR wg szablonu | sekcje `.github/pull_request_template.md` (Co naprawia, Zmiana, Najpierw test, Ponowienie od zera, Weryfikacja, Migracje, Po wdrożeniu); E-76 dodaje sekcję o danych osobowych |
| 8. „Scalone” ≠ „naprawione” | ostatnie kryterium akceptacji każdej karty kodu: osoba inna niż autor czyta kod na `main` i podaje `plik:linia` |
| 9. Komendy dla operatora jako skrypty | odczyty i weryfikacje produkcji — skrypty w `scripts/ops/` same ładujące `.agents/infra.env`; wynik wyłącznie liczby i stany, bez danych osobowych (repo publiczne) |
| 10. Raport po etapie i stop | każdy etap kończy się raportem (status, tabela weryfikacji, numer PR, co dalej); następny dopiero po „idź dalej” |

### 0.2. Migracje i wdrożenie

- **Numer.** Z rejestru `docs/koordynacja/CLAUDE-DO-CODEXA.md` (wiersz
  „następny wolny”), w tym samym PR, który wprowadza migrację. Na
  `3e5e00d` następny wolny to `00149` (`CLAUDE-DO-CODEXA.md:91`); `main`
  poszedł dalej (`face09c` 10.10 [PR225 @a72b567]). **Plan nie rezerwuje
  numerów** — w kartach piszę „00NNN”.
- **Przed czy PO wdrożeniu.** Domyślnie przed (addytywne: tabela,
  kolumna z wartością domyślną, funkcja, luźniejszy warunek). PO — gdy
  migracja odbiera coś, czego stary kod używa. Każda karta z migracją
  podaje kierunek i czy migracja dotyka istniejących wierszy (wtedy
  najpierw zapytanie licznikowe tym samym warunkiem).
- **`DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE FROM`** — tylko za zgodą
  właściciela; joby usuwające dane (E-44 – E-51) dostają tryb „na sucho”
  (liczniki bez usuwania) jako pierwszy przebieg po wdrożeniu.
- **Kto wgrywa.** Tylko sesja lokalna z dostępem do `db-1`; sesja w chmurze
  wpisuje do opisu PR „Do wgrania: 00NNN, przed/PO wdrożeniu”. Po wgraniu:
  wpis w `schema_migrations`, `NOTIFY pgrst`, weryfikacja PostgREST,
  regeneracja `types/database.ts` z produkcji.
- **Wdrożenie obu aplikacji.** Kolejność z `AGENTS.md`: migracje „przed”
  → worker (Coolify `id=2`) → aplikacja (`id=1`) → migracje „PO” →
  weryfikacja (`scripts/ops/kontrola-faktur-ksef.sh`, kontenery na nowym
  SHA, liczba cronów w logu workera zgodna z rejestrem jobów). Bramka
  `/wdroz` wdraża w odwrotnej kolejności (`06` SOC-04) — ujednolica to
  E-72. Każda karta kodu ma pole „Po wdrożeniu”.

### 0.3. Treści prawne

Trzy kroki, każdy z osobnym statusem w karcie: **(1) projekt** — agent
przygotowuje tekst z materiałów `09` i decyzji E-00; **(2) review
prawne** — prawnik ocenia gotowy rezultat (zgodnie z pkt 1 zadania nie
uzależniam od niego wcześniejszych prac); **(3) publikacja** — PR ze
stroną, numerem wersji i datą, zapisem akceptacji (E-58). Do publikacji
nowych tekstów obowiązuje E-01: z publicznych stron znikają tezy, których
kod i infrastruktura nie potwierdzają.

### 0.4. Typy i wielkości

**Typy:** kod · migracja · treść prawna · konfiguracja dostawcy ·
organizacyjny · decyzja właściciela (pojedynczy etap może mieć dwa).

**Wielkość (I, orientacyjna):** **S** — jeden moduł, bez migracji albo
z migracją addytywną, jeden test; **M** — kilka modułów, migracja albo
nowy job, testy na bazie; **L** — zmiana zachowania bazy (wyzwalacze,
usuwanie danych), kilka systemów albo praca z wieloma właścicielami.

### 0.5. Format karty etapu

Pola: **Cel** · **Pokrywa** (WYM i ustalenia) · **Typ / wielkość / fala**
· **Zakres** (pliki, moduły) · **Warunki i zależności** · **Zmiany** ·
**Migracje** · **Test czerwony** · **Fail-closed i ponowienie** ·
**Akceptacja** · **Wycofanie** · **Po wdrożeniu** · **Dowód SOC 2** ·
**Ryzyko redukowane**. Etapy prawne i organizacyjne mają dodatkowo pole
**Kroki** (projekt → review → przyjęcie lub publikacja), a weryfikację
opisują polem dopasowanym do rodzaju pracy („Po przyjęciu”, „Po próbie”,
„Po operacji”, „Po scaleniu”). „Fail-closed i ponowienie” występuje
tylko w etapach kodu, które coś blokują albo dodają job.

Oznaczenia jak w raportach: **[NZ]** — przepis lub wytyczna z pamięci
modelu, niezweryfikowane online; **[PR225]** — deklaracja lub pomiar
operatora z niescalonego PR #225; klasy **P/O/S/I**; stany
**potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy**;
„nie znaleziono w repo” ≠ „nie istnieje”.

## 1. Kolejność i uzasadnienie

### 1.1. Fale

Kolejność zgodna z zadaniem: najpierw to, co obiecuje użytkownikowi coś,
czego kod nie robi; potem dane wysyłane bez podstawy; potem blokady praw
osób; dalej minimalizacja i retencja; na końcu dokumentacja i dowody
SOC 2. Wewnątrz fali — najpierw ryzyko „obecne W” z `05` § 12.1, potem
„K1 W”, potem reszta; przy równym ryzyku — etap bez zależności przed
etapem czekającym.

| Fala | Etapy | Dlaczego w tym miejscu |
|---|---|---|
| **F0 — decyzje i dane** | E-00 | odblokowuje etapy „czeka”; nie blokuje etapów „od razu”, więc biegnie **równolegle** z F1–F3 |
| **F1 — obietnice bez pokrycia** | E-01 – E-04 | publiczne strony i interfejs deklarują skutki, których kod nie wykonuje: „nieodwracalne usunięcie po 30 dniach” organizacji, usunięcie konta przez operatora, lokalizacje, SCC, audyt dostępu (`05` WYM-19, WYM-45, WYM-24, WYM-73 — ryzyko obecne **W**). Najtańsze kroki o największym spadku ekspozycji: prostowanie treści i zatrzymanie przetwarzania „usuniętych” firm |
| **F2 — dane bez podstawy** | E-05 – E-17 | dane trafiają do odbiorców bez potrzeby, informacji albo wyboru: ciasteczka sesji do dostawców telemetrii (WYM-36 — obecne **W**), sesje Sentry i fonty Google przed wyborem, NIP w prompcie AI, środowisko testowe KSeF dla prawdziwych faktur (WYM-37), e-maile nietransakcyjne bez wypisu |
| **F3 — prawa osób** | E-18 – E-28 | mechanizmy, bez których osoba nie wykona prawa: wycofanie zgody (art. 7 ust. 3 [NZ]), usunięcie konta Google, ewidencja żądań osób bez konta, sprostowanie, pełny eksport organizacji |
| **F4 — minimalizacja i retencja** | E-29 – E-57 | ograniczenie zakresu i czasu przechowywania; większość retencji czeka na decyzje (D-05) i review; kopie zapasowe (E-53) idą **torem równoległym** od razu (ryzyko obecne **W**, WYM-51; wykonawca — operator i PR #225) |
| **F5 — dokumenty i dowody** | E-58 – E-79 | treści prawne (rejestry, umowa powierzenia, polityka) wymagają podmiotu (D-01), decyzji i review; dowody SOC 2 mają sens, gdy kontrole działają. Mechanizm wersjonowania i akceptacji (E-58) startuje od razu, żeby był gotowy na publikację tekstów |

Fala to priorytet, nie zakaz: etap „od razu” z dalszej fali może iść
równolegle, gdy wcześniejsze czekają na przegląd lub scalenie. Kolejność
startu pierwszych etapów — § 1.4.

**Wyjątki od kolejności fal (uzasadnione):**

- E-53 (kopie poza hostem) — fala F4, ale start natychmiast: utrata hosta
  bazy to utrata danych wszystkich klientów (`05` ryzyko #4), a praca
  toczy się w PR #225 [PR225] poza ścieżką kodu aplikacji.
- E-36 (odczyty operatora w audycie) i E-70 (RLS jako wymagana kontrola)
  — start od razu mimo fali F4/F5: małe, bez zależności, a dają dowody
  dla wszystkich kolejnych etapów (E-70 sprawia, że czerwone testy RLS
  z F1–F4 blokują scalenie).
- E-10 (KSeF bez domyślnego `test`) — fala F2, ale ściśle związany
  z blokiem F planu „zero zgubionych faktur” (`PLAN-ZERO-ZGUBIONYCH-FAKTUR.md`,
  F1 i bramka wydania); realizować w koordynacji, nie równolegle.

### 1.2. Zależności między etapami (najważniejsze łańcuchy)

```
D-01 podmiot ──► E-59 rejestry/podstawy/LIA/DPIA ──► E-62 umowa powierzenia ──► E-63 polityka
                         │                              ▲          │
D-03, D-04 dostawcy ─► E-61 rejestr dostawców/TIA ──────┘          └─► E-64 informacja dla osób trzecich
E-58 wersje i akceptacja ─────────────────────────────► E-62, E-63, E-65 (publikacja)
E-03 ścieżka operatora ─► E-04 dowód wykonania ─► E-20 pełny zakres ─► E-21 dostawcy ─► E-55
E-02 wyłączenie firmy ─► E-25 pełny eksport ─► E-50 wykonawca hard_delete_at
D-05 retencja + E-40 rejestr ─► E-42 … E-47, E-51, E-52 ─► E-63 (okresy w polityce)
E-53 kopie ─► E-54 próba odtworzenia ─► E-55 ponowne usunięcia po odtworzeniu
E-22 rejestr żądań ─► E-66 procedura DSAR ;  D-15 dyżur ─► E-67 procedura naruszeń
E-70 RLS wymagany ─► (wszystkie etapy z testem tests/rls-*)
```

### 1.3. Praca równoległa

Etapy „od razu” w różnych plikach mogą iść równolegle, ale `main` jest
chroniony w trybie „strict”: każde scalenie robi z pozostałych PR
„BEHIND” i kolejny cykl CI (~10 min). Przy więcej niż dwóch gotowych PR
— zbiorcze scalenie według `AGENTS.md` („Kilka PR albo stos PR”), metodą
merge. Etapy dotykające tych samych plików idą po kolei: E-03 → E-04 →
E-20 (`lib/gdpr/deletion.ts`); E-05 → E-06 (`next.config.ts`,
`instrumentation-client.ts`); E-07 → E-08 (`app/layout.tsx`,
`next.config.ts`); E-13 → E-65 (`lib/email/preferences.ts`).

### 1.4. Proponowana kolejność startu (I)

| Krok | Etapy | Kto | Uzasadnienie |
|---|---|---|---|
| 1 | E-00: D-02, D-03 (PostHog), D-06, D-01 | właściciel, operator | rozstrzygają ryzyko „obecne” i odblokowują tor prawny; równolegle z krokami 2–6 |
| 2 | E-01 | agent + akceptacja właściciela | największy spadek ekspozycji najmniejszym kosztem (tezy publiczne) |
| 3 | E-02, E-05 | agent | przetwarzanie „usuniętych” firm i ciasteczka sesji u dostawców — ryzyko obecne W |
| 4 | E-03 → E-04 | agent | jedyna ścieżka realizacji żądań e-mailowych nie działa |
| 5 | E-53 (tor równoległy), E-09 | operator, właściciel | kopie poza hostem; panel PostHog wbrew kodowi |
| 6 | E-70 | agent + właściciel (ruleset) | od tej chwili testy RLS kolejnych etapów blokują scalenie |
| 7 | E-06, E-07, E-08, E-10 | agent (E-10 z PLAN-ZERO) | przekazania bez podstawy; środowisko KSeF |
| 8 | E-18, E-19, E-13, E-14 | agent | blokady praw i wiadomości bez wypisu |
| 9 | E-11, E-12, E-15, E-16, E-36 | agent | minimalizacja wysyłek i dostęp operatora |
| 10 | E-22, E-40, E-58, E-25 | agent | fundamenty dla etapów „czeka” (rejestr żądań, rejestr retencji, wersje dokumentów, eksport) |
| dalej | pozostałe „od razu” z F4/F5; etapy „czeka” w miarę decyzji E-00 i review | — | — |

## 2. Przegląd etapów

„Start”: **od razu** — nie zależy od niewiadomych, decyzji ani review
(wymaga tylko zwykłej zgody właściciela na scalenie); **czeka** — kolumna
„Czeka na” podaje warunek. Karty: etapy „od razu” — § 4 (kod
i konfiguracja), § 6 (E-58), § 7 (organizacyjne); etapy „czeka” — § 5
(kod), § 6 (treści prawne), § 7 (organizacyjne).

| ID | Tytuł | Fala | Typ | Wlk. | Start | Czeka na | Główne WYM |
|---|---|---|---|---|---|---|---|
| E-00 | Decyzje i dane wejściowe właściciela | F0 | decyzja właściciela, organizacyjny | M | od razu | — | wejście dla WYM-01, -34, -37, -40, -71 i in. |
| E-01 | Wycofanie nieprawdziwych deklaracji ze stron publicznych | F1 | treść prawna (korekta faktów), kod (test) | S | od razu | — | WYM-19, WYM-SOC-7 |
| E-02 | „Usunięta” organizacja wyłączona z przetwarzania; prawdziwy komunikat; przywrócenie przez operatora | F1 | kod | M | od razu | — | WYM-45, WYM-73, WYM-05 |
| E-03 | Usunięcie konta przez operatora wspólną ścieżką | F1 | kod, migracja | M | od razu | — | WYM-24, WYM-73 |
| E-04 | Dowód wykonania usunięcia konta | F1 | kod | S | od razu | po E-03 (ten sam plik) | WYM-24, WYM-75 |
| E-05 | Proxy telemetrii bez nagłówków przeglądarki | F2 | kod | M | od razu | — | WYM-36, WYM-09 |
| E-06 | Sentry w przeglądarce bez sesji i śledzenia wydajności | F2 | kod | S | od razu | — | WYM-63, WYM-36 |
| E-07 | Material Symbols z własnego serwera | F2 | kod | S | od razu | — | WYM-63, WYM-58 |
| E-08 | Service worker tylko w panelu | F2 | kod | S | od razu | — | WYM-63, WYM-32 |
| E-09 | PostHog: ustawienia projektu zgodne z kodem; kontrakt konfiguracji | F2 | konfiguracja dostawcy, kod | S | od razu | — | WYM-34, WYM-71 |
| E-10 | KSeF bez domyślnego środowiska `test` | F2 | kod | M | od razu | koordynacja z PLAN-ZERO (blok F) | WYM-37, WYM-SOC-3 |
| E-11 | Prompt kategoryzacji AI bez NIP | F2 | kod | S | od razu | — | WYM-06, WYM-05, WYM-62 |
| E-12 | Informacja o modelu AI przy czacie i OCR | F2 | kod, krótka treść | S | od razu | — | WYM-62, WYM-16 |
| E-13 | E-maile nietransakcyjne fail-closed | F2 | kod | S | od razu | — | WYM-66, WYM-14, WYM-28 |
| E-14 | Reply-To klienta w wiadomościach do kontrahentów | F2 | kod | S | od razu | — | WYM-67, WYM-42 |
| E-15 | Redakcja danych osobowych w logach i telemetrii | F2 | kod | M | od razu | — | WYM-36, WYM-06 |
| E-16 | Alerty Slack i Telegram bez e-maili | F2 | kod | S | od razu | — | WYM-36, WYM-58 |
| E-17 | Przełącznik organizacji „Automatyczna kategoryzacja AI” | F2 | kod, migracja | M | czeka | D-12 (wartość domyślna), `04` pyt. 1 | WYM-42, WYM-62 |
| E-18 | Wycofanie zgody analitycznej; wersja i data decyzji | F3 | kod | M | od razu | — | WYM-14, WYM-13, WYM-64, WYM-65 |
| E-19 | Usunięcie konta dla kont logowanych przez Google | F3 | kod | M | od razu | — | WYM-24 |
| E-20 | Usunięcie konta: pełny zakres w bazie | F3 | kod, migracja | M | czeka | E-04; D-05 (RT-CZAT, RT-MAIL, RT-DSAR); P-12 | WYM-24, WYM-38 |
| E-21 | Usunięcie konta: dane u dostawców | F3 | kod, procedura | M | czeka | E-20; D-03; P-07 | WYM-26, WYM-24 |
| E-22 | Rejestr żądań osób; wyszukiwanie osoby w magazynach | F3 | kod, migracja, skrypt | M | od razu | — | WYM-17, WYM-21, WYM-75 |
| E-23 | Eksport danych konta (art. 15) uzupełniony | F3 | kod | M | od razu | notatki operatora — `A2` pyt. 5 | WYM-21, WYM-22 |
| E-24 | Sprostowanie: zmiana imienia i e-maila w ustawieniach | F3 | kod | M | od razu | — | WYM-07, WYM-23 |
| E-25 | Pełny eksport danych organizacji | F3 | kod | L | od razu | — | WYM-27, WYM-45 |
| E-26 | Ograniczenie przetwarzania | F3 | kod, migracja | M | czeka | D-12 (zakres) | WYM-25 |
| E-27 | Analityka serwerowa spójna z wyborem i sprzeciwem | F3 | kod | S | czeka | E-59 (LIA L-03); D-12 | WYM-28, WYM-32 |
| E-28 | Strażnik braku decyzji zautomatyzowanych | F3 | kod (test) | S | od razu | — | WYM-29 |
| E-29 | PESEL: domyślnie „bez identyfikatora” | F4 | kod | S | od razu | — | WYM-X-03, WYM-32 |
| E-30 | Imię przy rejestracji opcjonalne | F4 | kod | S | od razu | — | WYM-06 |
| E-31 | Wyszukanie NIP bez nazw organizacji | F4 | kod | S | od razu | — | WYM-33 |
| E-32 | Jawne kolumny w odpowiedziach; IP w dzienniku tylko dla właściciela | F4 | kod | M | od razu | — | WYM-06, WYM-32 |
| E-33 | `validation_cache` bez odczytu dla zalogowanych | F4 | migracja | S | od razu | — | WYM-33, WYM-05 |
| E-34 | Dziennik audytu bez jawnych e-maili osób trzecich | F4 | kod | S | od razu | — | WYM-06 |
| E-35 | Skróty z kluczem (HMAC) zamiast gołego SHA-256 | F4 | kod | S | od razu | — | WYM-38, WYM-50 |
| E-36 | Odczyty i akcje operatora w dzienniku audytu | F4 | kod | M | od razu | — | WYM-35, WYM-47 |
| E-37 | Martwy kod z danymi osobowymi | F4 | kod | S | od razu | — | WYM-31 |
| E-38 | Dane testowe i publiczne repo | F4 | kod, dokument repo | S | od razu | — | WYM-37, WYM-X-02 |
| E-39 | Przycinanie `last_webhook_payload` Stripe | F4 | kod | S | od razu | — | WYM-06, WYM-71 |
| E-40 | Rejestr retencji w kodzie | F4 | kod | M | od razu | — | WYM-71, WYM-08, WYM-03 |
| E-41 | Rotacja logów Docker i retencja logów usług | F4 | konfiguracja | S | od razu | część `_supabase` — D-06 | WYM-36, WYM-71 |
| E-42 | Ciasteczko sesji: okres i dostępność dla skryptu | F4 | kod | S | czeka | D-05 (RT-SESJA) | WYM-32, WYM-63 |
| E-43 | Link księgowej i paczki: krótszy termin, dostęp przez portal | F4 | kod | M | czeka | D-12 (termin domyślny) | WYM-33, WYM-32 |
| E-44 | Retencja danych pomocniczych w bazie | F4 | kod | M | czeka | D-05; E-40 | WYM-08 |
| E-45 | Koniec życia plików S3 poza fakturami | F4 | kod | M | czeka | D-05 (RT-EKSP); E-40 | WYM-08, WYM-71 |
| E-46 | Retencja treści swobodnych (czat, FLO, notatki operatora) | F4 | kod | M | czeka | D-05; `A2` pyt. 3, 5 | WYM-08 |
| E-47 | Klasy retencji dziennika audytu | F4 | kod, migracja | M | czeka | D-05 (RT-AUD); P-05 | WYM-71, WYM-74 |
| E-48 | Payloady pg-boss z identyfikatorami; jawna retencja kolejek | F4 | kod | L | czeka | D-12 (wpływ na idempotencję KSeF) | WYM-06, WYM-71 |
| E-49 | PESEL: jedno miejsce, maskowanie, ochrona | F4 | kod, migracja | L | czeka | D-12 (`02` pyt. 6); E-29 | WYM-X-03 |
| E-50 | Wykonawca usunięcia organizacji (`hard_delete_at`) | F4 | kod, migracja | L | czeka | Q-ZR-01, `A2` pyt. 2; D-12; E-02, E-25 | WYM-45, WYM-73 |
| E-51 | Retencja faktur i kosztów | F4 | kod, migracja | L | czeka | Q-ZR-01, Q-ZR-02, `A2` pyt. 1, 10; D-06 | WYM-68, WYM-69, WYM-73 |
| E-52 | Konta nieaktywne po końcu subskrypcji | F4 | kod | M | czeka | D-05 (RT-KONTO), `A2` pyt. 9 | WYM-70 |
| E-53 | Kopie zaszyfrowane poza hostem; szyfrowanie lokalnych zrzutów | F4 (równolegle) | konfiguracja, skrypty | L | od razu | — (praca w PR #225) | WYM-51, WYM-50 |
| E-54 | Próba odtworzenia z protokołem | F4 | organizacyjny | M | czeka | E-53 | WYM-51, WYM-SOC-2 |
| E-55 | Ponowne zastosowanie usunięć po odtworzeniu | F4 | kod, runbook | M | czeka | E-53, E-04 | WYM-72 |
| E-56 | Rotacja klucza poświadczeń KSeF | F4 | organizacyjny (operacja) | S | od razu | — | WYM-50, WYM-SOC-4 |
| E-57 | Dane u dawnych dostawców | F4 | organizacyjny | S | od razu | — | WYM-08, WYM-58 |
| E-58 | Wersjonowanie dokumentów prawnych i zapis akceptacji | F5 | kod, migracja | M | od razu | — | WYM-X-01 |
| E-59 | Pakiet rozliczalności: role, rejestry art. 30, podstawy, LIA, screening DPIA, ocena IOD | F5 | treść prawna | L | czeka | D-01, D-05, D-12 → review | WYM-01, -04, -10, -11, -12, -48, -49, -55, -57 |
| E-60 | DPIA funkcji AI | F5 | treść prawna | M | czeka | E-59; D-03; D-14 | WYM-55, WYM-56, WYM-62 |
| E-61 | Rejestr dostawców, transfery, TIA | F5 | organizacyjny, treść prawna | M | czeka | D-03, D-04 | WYM-40, WYM-58 – WYM-62 |
| E-62 | Regulamin z umową powierzenia i listą dalszych procesorów | F5 | treść prawna, kod | L | czeka | D-01; E-58, E-59, E-61 → review | WYM-41 – WYM-46, WYM-53 |
| E-63 | Polityka prywatności, strona RODO, informacje przy zbieraniu, tabela technologii | F5 | treść prawna, kod | L | czeka | D-01, D-05; E-40, E-59, E-61 → review | WYM-18, WYM-19, WYM-04, WYM-15, WYM-63 |
| E-64 | Informacja dla osób trzecich: stopka w wiadomościach, wzór klauzuli | F5 | treść prawna, kod | S | czeka | E-62 → review | WYM-20, WYM-67 |
| E-65 | Marketing w modelu zgody; newsletter z potwierdzeniem | F5 | kod, migracja, treść | M | czeka | P-08, Q-ZR-05; E-13, E-63 | WYM-66, WYM-13, WYM-15 |
| E-66 | Procedura żądań osób (DSAR) | F5 | organizacyjny, treść prawna | M | czeka | E-22; D-10 → review | WYM-17, WYM-21, WYM-44, WYM-75 |
| E-67 | Procedura naruszeń i incydentów; rejestr; dyżur; ćwiczenie | F5 | organizacyjny, treść prawna | M | czeka | D-01, D-15 → review | WYM-52 – WYM-54 |
| E-68 | Upoważnienia, poufność, szkolenia, zasady dla agentów AI | F5 | organizacyjny | M | czeka | D-09; P-10 | WYM-47 |
| E-69 | Przegląd dostępów, konta imienne, MFA, klucze SSH | F5 | organizacyjny, konfiguracja | M | od razu | — | WYM-35, WYM-47, WYM-SOC-1 |
| E-70 | RLS jako wymagana kontrola; testy RLS tabel z danymi osobowymi | F5 | kod, konfiguracja | M | od razu | — | WYM-09, WYM-SOC-1 |
| E-71 | Agent-guard obejmuje gałęzie sesji agentów | F5 | kod | S | od razu | — | WYM-SOC-1 |
| E-72 | Wdrożenia przez bramkę z zapisem; zatwierdzenie scalenia; rejestr zmian konfiguracji | F5 | kod, organizacyjny | M | czeka | D-06 (NS-07) | WYM-SOC-1, WYM-74 |
| E-73 | Alarm na nieudany zapis audytu | F5 | kod | S | od razu | — | WYM-74, WYM-SOC-1 |
| E-74 | Polityki bezpieczeństwa, rejestr ryzyk, klasyfikacja, ciągłość działania | F5 | organizacyjny | L | czeka | D-01 | WYM-30, WYM-50, WYM-SOC-1, -2, -4 |
| E-75 | Dowody w czasie: kalendarz, skrypty, archiwizacja wyników, logi centralne | F5 | kod, organizacyjny | M | od razu | — | WYM-74, WYM-10, WYM-SOC-3 |
| E-76 | Szablon PR: sekcja „dane osobowe” | F5 | dokument repo | S | od razu | — | WYM-31, WYM-03 |
| E-77 | Staging | F5 | konfiguracja (infrastruktura) | L | czeka | D-12 | WYM-37, WYM-SOC-1 |
| E-78 | Skanowanie podatności; kanał zgłaszania | F5 | kod, konfiguracja | S | od razu | — | WYM-SOC-1 |
| E-79 | Opis systemu i decyzja o badaniu SOC 2 | F5 | organizacyjny, decyzja | M | czeka | D-01, D-13 | WYM-SOC-6, WYM-SOC-7 |

**Liczby (policzone skryptem z tej tabeli):** 80 etapów; **48 „od razu”**
(w tym E-00) i **32 „czeka”**. Według fal: F0 — 1, F1 — 4 (wszystkie
od razu), F2 — 13 (12 od razu), F3 — 11 (7 od razu), F4 — 29 (16 od
razu), F5 — 22 (8 od razu). Wielkość: S — 31, M — 38, L — 11. Etapy
z migracją w typie: 12 (kolejne 9 kart dopuszcza migrację addytywną
„jeśli potrzebna”: E-02, E-14, E-19, E-21, E-25, E-27, E-43, E-45, E-55). Etapy z treścią prawną: 9 (E-01 i osiem w § 6).

## 3. E-00 — decyzje i dane wejściowe właściciela

- **Cel:** zebrać fakty i decyzje, bez których etapy „czeka” nie mogą
  ruszyć, a ryzyko „obecne” w `05` nie ma pewnej wartości (N-PRC-10).
  Bez zmian kodu.
- **Typ / wielkość / fala:** decyzja właściciela, organizacyjny · M ·
  F0 (równolegle z F1–F3).
- **Zasady zapisu:** wynik każdej pozycji to datowany zapis (decyzja albo
  odczyt) z właścicielem. Repo jest publiczne — w repo tylko decyzje
  i liczby; identyfikatory kont, adresy, treść umów i listy osób trzyma
  się prywatnie (lokalizację wybiera właściciel; w repo wpis „zapisane
  DD.MM, gdzie: prywatnie”). Odczyty produkcji — skryptem `scripts/ops/`
  (pkt 9 protokołu) zwracającym wyłącznie liczby i stany. Sam skrypt
  odczytów to mały PR kodu (S) wykonywany na początku E-00.
- **Akceptacja:** każda pozycja D-NN ma datę, wynik i właściciela; tabela
  niżej uzupełniona w kolumnie „Wynik” (w pliku decyzji, nie w tym
  raporcie); pozycje bez wyniku mają termin.
- **Dowód SOC 2:** CC1.3, CC3.1 (decyzje kierownictwa, ocena ryzyka),
  CC9.2 (D-03, D-04 — wejście do zarządzania dostawcami) [NZ].
- **Ryzyko redukowane:** decyzje podejmowane po faktach, nie po
  założeniach; zamknięcie niewiadomych, które zmieniają ryzyko „obecne”
  na „K1”.

| ID | Decyzja albo odczyt | Po co (niewiadome) | Odblokowuje | Kto | Forma wyniku |
|---|---|---|---|---|---|
| D-01 | **Podmiot prawny administratora**: nazwa, NIP, adres, kontakt w sprawach danych; kto reprezentuje (kierownictwo) | N-01, N-INW-13, N-PRC-11, N-ZR-09, NS-01, N-DOW-08 | E-59, E-62, E-63, E-67, E-74, E-79; usunięcie placeholderów (`polityka-prywatnosci/page.tsx:20`, `regulamin/page.tsx:23`) | właściciel | decyzja z datą; dane podmiotu są jawne z natury (rejestr), trafiają do polityki dopiero w E-63 |
| D-02 | **KSeF przed pierwszym klientem**: (a) odczyt licznikowy — czy na produkcji są dane prawdziwych osób i czy coś prawdziwego trafiło do KSeF TEST; (b) potwierdzenie, że do przełączenia (runbook F1 planu „zero zgubionych faktur”) produkcja działa jawnie w trybie pokazowym, bez prawdziwych klientów; (c) planowana data przełączenia | N-PRC-10; `04` PRC-17; `06` SOC-25 | E-10; bramka § 8; wartość ryzyka „obecne” w całej macierzy `05` | właściciel + operator | liczby (bez danych), decyzja z datą |
| D-03 | **Odczyty paneli dostawców z datą**: PostHog (nagrania, konsola, czasy sieci, heatmapy, odrzucanie IP, retencja, źródło 2 nagrań), Sentry (IP, retencja, członkowie), Resend (region, śledzenie otwarć i kliknięć, retencja, kontakty), Anthropic (organizacja, retencja, region, warunki komercyjne), Stripe, Cloudflare (Email Routing, Turnstile), Slack i Telegram (retencja kanałów) | N-PRC-02, NA1-02, NA1-03, N-A2-09, N-A2-14, N-INW-08 | E-09, E-21, E-60, E-61, E-63; WYM-34 | właściciel (dostęp do kont) | zrzuty ustawień bez identyfikatorów kont, prywatnie; w repo — lista ustawień „tak/nie” z datą |
| D-04 | **Umowy z dostawcami**: strona umowy, plan, wersja DPA, mechanizm transferu (SCC/DPF), termin powiadomienia o naruszeniu, lista dalszych procesorów i sposób informowania o zmianach | N-PRC-01, N-DOW-05, N-ZR-10, NS-09 | E-61, E-62, E-63 (lista odbiorców), E-60 | właściciel | kopie umów prywatnie; w repo — wersja i data DPA per dostawca |
| D-05 | **Decyzje retencyjne właściciela** dla 31 pozycji `09` § 10. Część (a) — może zdecydować właściciel (minimalizacja, bez sporu prawnego): RT-ZAPR, RT-PUSH, RT-RUNLOG, RT-CACHE, RT-STRIPE, RT-PGB, RT-LINK, RT-SESJA, RT-EKSP, RT-LOGI, RT-SENTRY, RT-POSTHOG, RT-CZAT (usuwanie z kontem i okres od zamknięcia), RT-MAIL, RT-NEWS, RT-KSIEG, RT-FLO, RT-POCZTA, RT-HIST, RT-DOST (po odczycie D-03). Część (b) — wymaga review prawnego przed wdrożeniem: RT-FAKT, RT-FAKT-FF, RT-KOSZT, RT-KONTR, RT-ORG, RT-KONTO, RT-AUD, RT-DSAR, RT-ADMIN, RT-KOPIE, RT-AUTH | Q-ZR-01, Q-ZR-02, Q-ZR-13; P-05, P-12; `A2` pyt. 1, 3, 6, 9; N-ZR-06 | (a) E-41, E-42, E-44, E-45, E-46 (część), E-20; (b) E-47, E-50, E-51, E-52, E-55, E-63 | właściciel; (b) + prawnik | tabela decyzji `09` § 10 z kolumną „Decyzja” wypełnioną i datą; potem E-40 przenosi ją do kodu |
| D-06 | **Odczyty produkcji (liczniki i stany, bez treści)**: postać wyzwalaczy `trg_audit_logs_prevent_update` i `b_guard_invoice_pending_content` oraz klucza `audit_logs.user_id` (N-A2-01, N-A2-13); stan `00072` (N-A2-02); liczba faktur z `scheduled_deletion_at` i starszych niż 2 lata (N-A2-04); organizacje z `deleted_at` lub bez aktywnego członka (N-A2-05); schemat `auth.*` (N-INW-01, N-A2-06); przebiegi cronów retencji i audytu (N-DOW-02); liczba niepustych notatek w `details_json` (N-DOW-10); bramka `/wdroz`, `00100`, wpisy `ops.deploy.*` (N-DOW-11, NS-07); cron `pg_dump`, Healthchecks, flaga MFA (NS-05); rekordy poświadczeń KSeF w formacie v1 (NS-14); konfiguracja logów `_supabase` i Docker (N-A2-12, N-INW-06, N-INW-15); nazwy zmiennych środowiska bez wartości (N-PRC-03, N-INW-04, N-A2-03) | jak w kolumnie obok | E-03 (potwierdzenie mechanizmu), E-41, E-50, E-51, E-56, E-72; ryzyko `05` | operator (sesja lokalna) | wynik skryptu `scripts/ops/` (liczby, tak/nie) z datą |
| D-07 | **Dokumenty poza repo**: czy istnieją rejestry, umowy powierzenia, TIA, rejestr naruszeń, przeglądy dostępów, upoważnienia, szkolenia | N-DOW-01 | E-59, E-61, E-67, E-68, E-69 (start od istniejącego zamiast od zera) | właściciel | lista dokumentów z datami (bez treści) |
| D-08 | **Inwentarz kont i dostępów**: GitHub (członkowie, wyjątki rulesetu), Coolify, konsola Hetzner, klucze SSH (imienność), liczba wpisów `ADMIN_EMAILS`, panele dostawców, Slack i Telegram | N-DOW-03, NS-03, NS-04 | E-69, E-72 | właściciel | lista kont z rolą i właścicielem, prywatnie; w repo liczby |
| D-09 | **Agenci AI z dostępem do produkcji**: czy zostają, plany i warunki komercyjne dostawców, zakres dostępu (docelowo odczyt zredagowanej diagnostyki — [PR225]) | N-PRC-07; `04` pyt. 7, 8; `06` pyt. 4 | E-61, E-62 (lista dalszych procesorów), E-68 | właściciel | decyzja z datą |
| D-10 | **Kanał żądań i kontaktu**: czy skrzynka pomocy przyjmuje pocztę (MX), dokąd trafia (prywatne skrzynki czy służbowa), czy worker `ops/poczta` działa | N-A2-08, N-DOW-09, NS-15; `04` PRC-08 | E-22, E-66, E-63 (kontakt RODO) | właściciel | odczyt DNS i test wysyłki z datą |
| D-11 | **Magazyny historyczne**: stan i decyzja o usunięciu danych w Supabase Cloud, Inngest, Vercel, Cloudflare R2, Upstash | N-INW-16, N-PRC-06; `04` PRC-15 | E-57 | właściciel | lista z datą usunięcia albo uzasadnieniem pozostawienia |
| D-12 | **Decyzje produktowe**: (a) domyślna wartość automatycznej kategoryzacji AI (`04` pyt. 1, `02` pyt. 2); (b) zakres mechanizmu ograniczenia przetwarzania (WYM-25); (c) los organizacji jedynego właściciela przy usunięciu konta (`A2` PRA-02); (d) payloady jobów a idempotencja KSeF (`02` INW-08); (e) przechowywanie PESEL (`02` pyt. 6); (f) domyślny termin linku księgowej (propozycja `A1`: 30 dni — QA1-15); (g) wariant analityki serwerowej (L-03); (h) staging (`06` SOC-06); (i) opcja modelu w regionie UE (WYM-62); (j) plan Sentry Team EU ([PR225]) | QA1-01, QA1-02, QA1-15; `A2` pyt. 7 | E-17, E-26, E-27, E-43, E-48, E-49, E-50, E-77 | właściciel | decyzje z datą |
| D-13 | **Badanie SOC 2**: czy i kiedy; kategorie (rekomendacja `06` § 9.2: Security + Availability) | NS-13 | E-79 | właściciel | decyzja z datą |
| D-14 | **Skala docelowa**: prognoza liczby firm, kontrahentów i dokumentów OCR | N-DOW-06, N-09-05 | E-59 (screening), E-60 | właściciel | liczby orientacyjne |
| D-15 | **Dyżur**: odbiorca alarmów, zastępca, godziny reakcji (F0-G08 PARTIAL [PR225]) | N-09-04 | E-67, E-73, E-75 | właściciel + koordynator | decyzja z datą |

**Pozycje pilne (przed resztą E-00):** D-02 (bo wyznacza, czy ryzyka
„obecne” w `05` to w rzeczywistości K1), D-03 dla PostHog (E-09 — panel
włącza nagrania wbrew kodowi), D-06 dla wyzwalaczy (potwierdza
mechanizm, który naprawia E-03), D-01 (blokuje cały tor prawny).

## 4. Etapy kodu i konfiguracji, które można zacząć od razu

Ścieżki skrócone jak w `05`: `polityka-prywatnosci/page.tsx`,
`rodo/page.tsx`, `regulamin/page.tsx` = `app/(marketing)/legal/<nazwa>/page.tsx`;
`00052…sql` = `supabase/migrations/00052_….sql`. Linie — na `3e5e00d`.

### E-01 — Wycofanie nieprawdziwych deklaracji ze stron publicznych

- **Cel:** do czasu nowej polityki (E-63) publiczne strony nie twierdzą
  niczego, czego kod i infrastruktura nie potwierdzają.
- **Pokrywa:** WYM-19 (część „natychmiast” z `05`), WYM-SOC-7
  (strażnik); ZGD-12, ZGD-03 (część), ZGD-11 (tekst), PRC-01 – PRC-03,
  INW-17, RUN-11, DOW-02; deklaracje z tabel `A1` „Deklaracje ze stron
  prawnych vs stan faktyczny” (oznaczenia z `A1` — nie mylić z D-NN
  z E-00 ani P-NN z `A3`): `A1`-D-01 – D-03, D-06 – D-08, D-10, D-11;
  `A1`-P-07 – P-09, P-13, P-18, P-20; `A1`-R-03, R-04; `A1`-X-01.
- **Typ / wielkość / fala:** treść prawna (korekta faktów) + kod (test) · S · F1.
- **Zakres:** `rodo/page.tsx:20, 23, 26, 39-40, 43-44, 47, 54-58, 62-64`;
  `polityka-prywatnosci/page.tsx:76-77, 79, 81-120, 183-188, 221-224,
  229, 232-233`; `regulamin/page.tsx:90-91, 93-96`;
  `components/marketing/landing-hero.tsx:38`; `app/(marketing)/vs/*/page.tsx`
  („Frankfurt”, np. `vs/inni/page.tsx:138`).
- **Warunki i zależności:** start od razu. **Interpretacja (I):** zmiana
  tylko usuwa albo prostuje tezy sprzeczne z kodem i nie tworzy nowych
  zobowiązań, więc proponuję publikację bez czekania na review prawne;
  jeśli właściciel zdecyduje inaczej, E-01 idzie przez review razem
  z E-63. Placeholder administratora zostaje do D-01 i E-63 — nie
  wpisujemy niczego zastępczego. Okres faktur „10 lat” (`A1`-P-19) zostaje do
  E-63, bo zależy od Q-ZR-02. Gałąź `claude/e01-zgd12-deklaracje`.
- **Zmiany:** strona RODO — zdjąć albo zastąpić listą faktów z datą
  weryfikacji: lokalizacja bez Vercela i Frankfurtu; bez „AES-256
  (Supabase + R2)” i „TLS 1.3 dla wszystkich połączeń”; bez „kto i kiedy
  uzyskał dostęp do Twoich danych” (wraca po E-36); bez „SCC z każdym
  US-based subprocesorem” (wraca po E-61); bez „Brak cookies
  analitycznych”; zamiast obietnicy pliku DPA — „wzór umowy powierzenia
  w przygotowaniu” (do E-62); bez „72 godzin (zgodnie z art. 33 RODO)”
  (do E-62, E-67). Polityka — lokalizacja i kopie (bez „AWS Glacier,
  Frankfurt”); lista odbiorców bez nieużywanych (Vercel, Cloudflare R2,
  Inngest, Supabase jako dostawca) i z używanymi z `04` § 3 jako fakt
  (nazwa, cel) — bez deklaracji o mechanizmie transferu; „zanonimizowane”
  → „pseudonimizowane” (MIN-11); bez „do 30 dni po anulowaniu
  subskrypcji” (RET-13); okresy ciasteczek zgodne z kodem (ZGD-11).
  Regulamin — lokalizacja; bez „permanentnie usuwane po 30 dniach”
  (R-04). Nowa data „Ostatnia aktualizacja”. Strony marketingowe — bez
  „Frankfurt”.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/strony-prawne-tresc.test.ts` (podzbiór
  T-20, jednostkowy): renderowany tekst stron prawnych, strony głównej
  i stron `vs/*` nie zawiera fraz z listy zakazanej („Frankfurt”,
  „Vercel”, „Cloudflare R2”, „Inngest”, „AWS Glacier”, „z każdym
  US-based”, „kto i kiedy uzyskał dostęp”, „72 godzin”, „Brak cookies
  analitycznych”, „permanentnie”, „30 dni po anulowaniu”, „zgodny
  z SOC 2”, „SOC 2 ready”, „certyfikat SOC 2”); każdy aktywny odbiorca
  z listy w teście (z `04` § 3, do potwierdzenia D-03) jest wymieniony.
  Przed zmianą: **czerwony** (frazy obecne w liniach z „Zakresu”).
  Asercja o placeholderze należy do E-63 (do D-01 byłaby trwale czerwona).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test zielony; w opisie PR tabela „przed → po” z każdą
  tezą i etapem, który ją przywróci po wdrożeniu mechanizmu (E-36, E-61,
  E-62, E-63); akceptacja właściciela; kod na `main` przeczytany przez
  drugą osobę (`plik:linia`).
- **Wycofanie:** revert PR — niezalecane, bo przywraca nieprawdziwe tezy.
- **Po wdrożeniu:** worker i web na nowym SHA; strony publiczne zwracają
  200; ręczny odczyt trzech stron; widoczna nowa data.
- **Dowód SOC 2:** P1.1, CC2.3 (komunikacja zewnętrzna zgodna ze stanem)
  [NZ] — PR z tabelą zmian, test jako kontrola regresji.
- **Ryzyko redukowane:** WYM-19 obecne W → Ś (zostają brak administratora
  i niepełna informacja — E-63).

### E-02 — „Usunięta” organizacja wyłączona z przetwarzania

- **Cel:** organizacja z `deleted_at` przestaje być przetwarzana przez
  joby i niedostępna w sesji; komunikat w interfejsie mówi, co
  faktycznie się dzieje; operator może organizację przywrócić.
- **Pokrywa:** WYM-45 (część „od razu” z `05`), WYM-73 (część), WYM-05;
  PRA-04, RET-04, INW-02 (część), AI-01 (część: kategoryzacja faktur firm
  wyłączonych), DOW-17 (część), SOC-29 (część).
- **Typ / wielkość / fala:** kod · M · F1.
- **Zakres:** zapis znacznika — `components/settings/account-actions.ts:22-84`
  (właściciel) i `app/admin/users/actions.ts:149-180` (operator; usuwany
  w E-03); komunikat — `app/(dashboard)/settings/account/page.tsx:47-52`;
  joby wybierające firmy (grep `from('tenants')`, 13.10):
  `lib/jobs/runners/inbox-polling.ts:136-144`, `cert-expiry-alert.ts`,
  `co-pilot-monthly.ts`, `critical-alerts-monitor.ts`,
  `dunning-payment-failed.ts`, `trial-countdown-emails.ts`,
  `lib/reminders/prepare-delivery.ts`, `lib/ksef/submit-reference-boundary.ts`;
  joby iterujące faktury, koszty i przypomnienia bez odczytu `tenants` —
  pełna lista 27 cronów w `lib/jobs/queues.ts`; kontekst sesji —
  `lib/supabase/auth-context.ts`, `lib/supabase/middleware.ts` (grep
  `deleted_at` — 0 trafień); wzorzec istniejący — `lib/flo/tick.ts:305-306`.
- **Warunki i zależności:** start od razu; D-06 (N-A2-05) poda liczbę
  dotkniętych firm — nie blokuje. Gałąź `claude/e02-pra04-firma-wylaczona`.
- **Zmiany:** jeden filtr „firma aktywna” (np. `lib/tenants/active.ts`)
  użyty w każdym wyborze firm i w każdym cronie; kontekst sesji odrzuca
  firmę wyłączoną (przekierowanie na stronę z komunikatem); tekst
  w ustawieniach zgodny z kodem — wyłączenie od razu, trwałe usunięcie
  opisane bez obietnicy terminu do czasu E-50; akcja w `/admin`
  „Przywróć organizację” (zeruje `deleted_at`, `hard_delete_at`,
  przywraca `is_active`, wpis audytu z operatorem).
- **Migracje:** brak (opcjonalnie indeks częściowy `WHERE deleted_at IS
  NULL` — addytywny, przed wdrożeniem, bez zmiany wierszy).
- **Test czerwony:** (1) `tests/rls-firma-wylaczona.test.ts` (RLS na
  bazie): firma A z `deleted_at` i aktywnym certyfikatem KSeF, firma B
  aktywna; wybór firm do odbioru skrzynki zwraca tylko B — przed:
  **czerwony** (`inbox-polling.ts:136-144` filtruje tylko po certyfikacie
  i środowisku). (2) `tests/unit/joby-pomijaja-firmy-wylaczone.test.ts`
  (kontrakt): każdy cron z `lib/jobs/queues.ts` ma wpis „jak wyklucza
  firmy wyłączone” (filtr albo uzasadniony wyjątek, np.
  `cron.cleanup-audit-logs`); nowy cron bez wpisu = czerwony — przed:
  **czerwony** (brak wpisów). (3) kontekst sesji z aktywną firmą
  wyłączoną → odmowa — przed: **czerwony**.
- **Fail-closed i ponowienie:** komunikat dla członka: „Organizacja
  <nazwa> została wyłączona przez właściciela <data>. Aby ją przywrócić,
  właściciel kontaktuje się z pomocą”; operator: akcja „Przywróć
  organizację” i wpis w runbooku. Filtr tylko czyta — ponowienie joba bez
  skutków; przywrócenie idempotentne (`UPDATE … WHERE deleted_at IS NOT NULL`).
- **Akceptacja:** testy zielone; tekst nie zawiera „nieodwracalna po 30
  dniach”; po wdrożeniu brak wywołań AI i odbioru skrzynki dla firm
  wyłączonych (liczniki w logu workera); kod na `main` przeczytany przez
  drugą osobę.
- **Wycofanie:** revert PR; dane bez zmian (wpisy audytu przywróceń zostają).
- **Po wdrożeniu:** worker, potem web; `kontrola-faktur-ksef.sh`; liczba
  cronów bez zmian; logowanie kontem syntetycznym do firmy wyłączonej →
  komunikat.
- **Dowód SOC 2:** C1.2, P4.3 (koniec przetwarzania po decyzji klienta),
  CC6.5 (część) [NZ] — testy, log przebiegu jobów.
- **Ryzyko redukowane:** WYM-45 obecne W → Ś (dane zostają, ale nie są
  przetwarzane; pełne usunięcie — E-50).

### E-03 — Usunięcie konta przez operatora wspólną ścieżką

- **Cel:** żądanie przyjęte poza aplikacją (e-mail) operator realizuje tą
  samą funkcją co cron; wynik to usunięcie albo czytelna odmowa, nigdy
  częściowy stan.
- **Pokrywa:** WYM-24, WYM-73; PRA-03, INW-02 (część „operator”), DOW-06
  (część), SOC-29 (część).
- **Typ / wielkość / fala:** kod + migracja · M · F1.
- **Zakres:** `app/admin/users/actions.ts:132-215` (`deleteUserGdprAction`:
  oznaczanie firm `:149-180` — także firm z drugim właścicielem
  `:152-158`; odwołanie członkostw `:182-189`; `deleteUser` `:191-197`;
  komunikat `:215`); `lib/gdpr/deletion.ts:97-200` (`createGdprRequest`,
  `executeGdprRequest`, który przed `deleteUser` woła
  `anonymize_user_audit_logs` — `:190-195`); `lib/gdpr/deletion-blockers.ts`;
  mechanizm — `00001…sql:165` (`audit_logs.user_id … ON DELETE SET NULL`),
  `00052…sql:16-35` (wyzwalacz bez flagi `app.allow_audit_purge`).
- **Warunki i zależności:** start od razu; D-06 (N-A2-01) potwierdzi
  postać wyzwalacza na produkcji — test na bazie działa niezależnie.
  Gałąź `claude/e03-pra03-usuniecie-operatora`.
- **Zmiany:** akcja operatora tworzy żądanie (termin „teraz”, źródło
  „operator”, autor, powód) i woła `executeGdprRequest`; usunięta osobna
  logika (oznaczanie firm, odwołanie członkostw) — o firmach decydują te
  same blokady co u użytkownika; widok żądań `failed` w `/admin` z powodem.
- **Migracje:** `00NNN_gdpr_request_source` — kolumny `source`
  (`user`/`operator`, domyślnie `user`), `requested_by` (identyfikator
  operatora), `request_reason`; addytywna, **przed wdrożeniem**; istniejące
  wiersze dostają wartość domyślną (bez `UPDATE`).
- **Test czerwony:** `tests/rls-usuniecie-konta-operator.test.ts` (RLS na
  bazie; akcja z mockiem tylko dla HTTP): konto z wpisem `auth.login`
  w `audit_logs` → ścieżka operatora → brak wiersza w `auth.users`
  i `public.users`, wpisy audytu z `user_id = NULL`, żądanie `executed`,
  firma z drugim właścicielem nietknięta. Przed: **czerwony** — `deleteUser`
  pada na wyzwalaczu (mechanizm potwierdzony na schemacie syntetycznym,
  `A2` PRA-03), firmy oznaczone, członkostwa odwołane.
- **Fail-closed i ponowienie:** blokada (np. jedyna osoba z prawem do
  płatności) → operator widzi nazwy firm i wyjście (anulować subskrypcję,
  nadać rolę, a dla firmy — E-50), żądanie `failed` z powodem; osoba
  dostaje informację o przyczynie i terminie (procedura E-66). Ponowienie:
  `executeGdprRequest` sprawdza status — wykonane nie wykona się drugi
  raz; brak konta w GoTrue = sukces (warunek w `UPDATE status`).
- **Akceptacja:** test zielony; `app/admin` nie woła `deleteUser`
  bezpośrednio (grep); `tests/unit/admin-gdpr-membership-scope.test.ts`
  zmieniony świadomie; kod na `main` przeczytany przez drugą osobę.
- **Wycofanie:** revert PR; kolumny z migracji zostają (nieużywane, bez
  szkody); żądania utworzone przez operatora zostają jako ślad.
- **Po wdrożeniu:** migracja przed (+ `schema_migrations`, `NOTIFY pgrst`,
  `types/database.ts`); worker, potem web; usunięcie konta syntetycznego
  ścieżką operatora → `executed`.
- **Dowód SOC 2:** P4.3, C1.2, CC8.1 (test na bazie jako kontrola) [NZ] —
  żądania ze źródłem „operator”.
- **Ryzyko redukowane:** WYM-24 obecne W → Ś (zakres niepełny do E-20,
  E-21); WYM-73 — jedna z trzech ścieżek ujednolicona.

### E-04 — Dowód wykonania usunięcia konta

- **Cel:** każde wykonane usunięcie zostawia ślad bez danych osobowych,
  a osoba dostaje potwierdzenie.
- **Pokrywa:** WYM-24, WYM-75, WYM-74; DOW-06 (`A3` L1), T-03 (część),
  PRA-02 (brak potwierdzenia).
- **Typ / wielkość / fala:** kod · S · F1.
- **Zakres:** `lib/gdpr/deletion.ts:163-200`; `lib/audit/log.ts:146`
  (`logAudit`); szablony w `lib/email/`.
- **Warunki i zależności:** po E-03 (ten sam plik). Gałąź
  `claude/e04-dow06-dowod-usuniecia`.
- **Zmiany:** po skutecznym `deleteUser` wpis `gdpr.deletion_executed`
  z identyfikatorem żądania, bez e-maila i `user_id`; e-mail
  potwierdzający (kategoria transakcyjna) na adres z żądania, wysłany
  przed jego wyczyszczeniem (E-20).
- **Migracje:** brak.
- **Test czerwony:** `tests/rls-rodo-usuniecie-konta.test.ts` (T-03,
  część): po `executeGdprRequest` istnieje wpis `gdpr.deletion_executed`
  bez e-maila i `user_id`; transport testowy dostał jeden e-mail. Przed:
  **czerwony** (L1 — brak wpisu).
- **Fail-closed i ponowienie:** ponowienie po `deleteUser`: wpis audytu
  sprawdzany po `request_id` przed zapisem, e-mail z kluczem idempotencji
  `request_id` — bez duplikatów; błąd wysyłki nie cofa usunięcia
  (ponawiana jest tylko wysyłka).
- **Akceptacja:** test zielony; e-mail zawiera tylko potwierdzenie i datę;
  kod na `main` przeczytany przez drugą osobę.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; usunięcie konta syntetycznego →
  wpis w dzienniku i e-mail w skrzynce testowej.
- **Dowód SOC 2:** P4.3, CC7.2 [NZ] — populacja wpisów
  `gdpr.deletion_executed` do próbkowania. Wpisy `gdpr.*` są dziś
  czyszczone po 12 mies. (`lib/jobs/runners/cleanup-audit-logs.ts:19`) —
  trwałość daje E-22 (rejestr żądań) i E-47.
- **Ryzyko redukowane:** WYM-75 Ś → N w zakresie dowodu wykonania.

### E-05 — Proxy telemetrii bez nagłówków przeglądarki

- **Cel:** do PostHog i Sentry trafia tylko treść zdarzenia, bez ciasteczek
  sesji i innych nagłówków przeglądarki.
- **Pokrywa:** WYM-36, WYM-09; RUN-08; ZG-11 (`09` § 12.1); SOC-32 (część).
- **Typ / wielkość / fala:** kod · M · F2.
- **Zakres:** `next.config.ts:140-155` (rewrites `/ingest/*`), `:189`
  (`tunnelRoute: '/monitoring'`); `lib/supabase/middleware.ts:57,78`
  (ścieżki publiczne); konfiguracja tunelu w `instrumentation-client.ts`,
  jeśli zmieni się ścieżka. Mechanizm i dowód: `A4` § 3.6–3.7.
- **Warunki i zależności:** start od razu. Gałąź
  `claude/e05-run08-proxy-telemetrii`.
- **Zmiany:** zamiast rewrites — dwie trasy (`app/ingest/[...path]/route.ts`,
  `app/monitoring/route.ts`) przekazujące tylko treść i `content-type`;
  dla Sentry — sprawdzenie projektu z koperty (tunel nie jest otwartym
  przekaźnikiem); limit rozmiaru; bez `cookie`, `authorization`,
  `x-forwarded-*`.
- **Migracje:** brak.
- **Test czerwony:** uprząż `A4` (`narzedzia/uruchom-test-runtime.sh`,
  krok `e3`) z lokalnym odbiornikiem zamiast dostawcy: przed — żądania
  `/monitoring` i `/ingest/e/` niosą ciasteczko pierwszej strony
  (**czerwony**, wynik `A4` § 3.6); po — brak nagłówka `cookie`.
  Uzupełniająco `tests/unit/proxy-telemetrii-naglowki.test.ts`
  (jednostkowy, mock tylko `fetch`): żądanie z `cookie`, `authorization`
  i `x-forwarded-for` → wywołanie do dostawcy bez tych nagłówków.
- **Fail-closed i ponowienie:** zła koperta albo za duży ładunek → 400
  bez przekazania; awaria dostawcy → 502, bez ponowień (telemetria nie
  blokuje aplikacji). Jobów brak.
- **Akceptacja:** uprząż `e3` bez `cookie`; po wdrożeniu zdarzenia nadal
  docierają (błąd testowy w Sentry; `$pageview` w PostHog po zgodzie);
  kod na `main` przeczytany przez drugą osobę.
- **Wycofanie:** revert PR (przywraca lukę — tylko przy awarii telemetrii).
- **Po wdrożeniu:** worker (dla zgodności SHA), potem web; błąd testowy
  z przeglądarki widoczny w Sentry; w logu trasy brak nagłówków
  przeglądarki (log bez wartości). Pytanie do dostawców o logi nagłówków
  sprzed zmiany — w D-03.
- **Dowód SOC 2:** CC6.1, CC6.7 (ochrona poświadczeń w transmisji), P6.x
  [NZ] — wynik uprzęży przypięty do PR.
- **Ryzyko redukowane:** WYM-36 obecne W → Ś (zostaje treść telemetrii —
  E-15); WYM-09 obecne W → Ś.

### E-06 — Sentry w przeglądarce bez sesji i śledzenia wydajności

- **Cel:** przeglądarka wysyła do Sentry tylko raporty błędów; sesje
  i ślady wydajności — wyłączone (wariant ostrożny do czasu LIA L-06
  i decyzji, czy objąć je zgodą — `09` ZG-01).
- **Pokrywa:** WYM-63, WYM-36; RUN-04, ZGD-10 (część), SOC-32 (część).
- **Typ / wielkość / fala:** kod · S · F2.
- **Zakres:** `instrumentation-client.ts:5-21` (`tracesSampleRate: 0.1`
  w `:8`, brak bramki zgody); opcje `lib/observability/scrub.ts:70-79`
  (nie wyłączają sesji); domyślne integracje SDK.
- **Warunki i zależności:** start od razu; ewentualne włączenie sesji po
  zgodzie — później, po E-59 (L-06) i E-18. Gałąź
  `claude/e06-run04-sentry-przegladarka`.
- **Zmiany:** `tracesSampleRate: 0` i wyłączone śledzenie sesji
  w konfiguracji przeglądarkowej; raporty błędów bez zmian (podstawa —
  LIA L-06 w E-59).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/sentry-przegladarka-konfiguracja.test.ts`
  (kontrakt konfiguracji): `tracesSampleRate === 0`, integracja sesji
  wyłączona — przed: **czerwony** (`:8` = 0.1). Uprząż `A4` scenariusz `a`:
  0 kopert `session` i `transaction` przed wyborem (przed: obecne
  w każdym scenariuszu — `A4` § 3.3).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test zielony; uprząż bez kopert `session`/`transaction`;
  błąd testowy nadal trafia do Sentry; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; w panelu Sentry brak nowych sesji
  przeglądarkowych od daty wdrożenia.
- **Dowód SOC 2:** P2.1, P3.x [NZ] — wynik uprzęży.
- **Ryzyko redukowane:** WYM-63 Ś → N w części Sentry.

### E-07 — Material Symbols z własnego serwera

- **Cel:** żadna strona nie przekazuje IP i UA odwiedzającego do Google
  w celu pobrania fontu ikon.
- **Pokrywa:** WYM-63, WYM-58; RUN-05, RUN-07, PRC-10, INW-11 (część),
  ZG-10.
- **Typ / wielkość / fala:** kod · S · F2.
- **Zakres:** `app/layout.tsx:112-126` (`preconnect` `:114`, arkusz
  `:124`); `lib/security/csp.ts:30,32` (hosty Google); CSP service
  workera (`next.config.ts:117`, `csp.ts:8,33` — przyczyna RUN-07).
- **Warunki i zależności:** start od razu. Licencja fontu (Apache 2.0 wg
  wiedzy modelu [NZ]) — sprawdzić przy dodaniu pliku. Gałąź
  `claude/e07-run05-fonty-lokalnie`.
- **Zmiany:** plik fontu w `public/` (albo pakiet npm z przypiętą wersją),
  `@font-face` w `app/globals.css`; usunięcie `preconnect`, `<link>`
  i hostów Google z CSP. **Nie** dopisywać `fonts.googleapis.com` do
  `connect-src` (RUN-07).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/brak-zewnetrznych-fontow.test.ts`
  (statyczny): `app/layout.tsx` i CSP bez `fonts.googleapis.com`
  i `fonts.gstatic.com` — przed: **czerwony**. Uprząż `A4` scenariusz `a`:
  0 żądań do Google (przed: na 11 z 11 stron — `A4` § 3.2).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** testy zielone; ikony widoczne w panelu także od drugiej
  strony wizyty (RUN-07 usunięty); kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; ręczny przegląd panelu i stron
  publicznych.
- **Dowód SOC 2:** P3.x, P6.x [NZ] — wynik uprzęży.
- **Ryzyko redukowane:** WYM-63 Ś → N; przekazanie do USA usunięte
  (WYM-58 w tej części).

### E-08 — Service worker tylko w panelu

- **Cel:** odwiedzający strony publiczne nie dostaje zapisu w urządzeniu
  (service worker, Cache Storage) bez potrzeby; SW działa tam, gdzie jest
  funkcją żądaną (panel, push, instalacja).
- **Pokrywa:** WYM-63, WYM-32; RUN-06, ZGD-10 (część), ZG-10.
- **Typ / wielkość / fala:** kod · S · F2.
- **Zakres:** `next.config.ts:11-20` (`withSerwistInit`, domyślne
  `register: true`); `app/sw.ts:16-38`; `lib/security/service-worker-cache.ts:5-10`;
  powiadomienia push (`lib/push/*`) wymagają SW.
- **Warunki i zależności:** start od razu; po E-07 (ten sam
  `next.config.ts`). Gałąź `claude/e08-run06-sw-panel`.
- **Zmiany:** `register: false`; rejestracja SW w układzie panelu po
  zalogowaniu albo przy włączeniu push/instalacji; decyzja w PR, czy
  wyrejestrowywać SW zarejestrowane wcześniej u odwiedzających strony
  publiczne.
- **Migracje:** brak.
- **Test czerwony:** kontrakt `register: false` (`tests/unit/sw-rejestracja.test.ts`)
  — przed: **czerwony**; uprząż `A4` scenariusz `a`: brak `/sw.js`
  i Cache Storage na stronach publicznych (przed: na 11 z 11 — `A4` § 3.1).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** testy zielone; push działa w panelu (konto testowe);
  kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; włączenie powiadomień push na
  koncie syntetycznym.
- **Dowód SOC 2:** P3.x [NZ].
- **Ryzyko redukowane:** WYM-63 — RUN-06 (niskie) zamknięte.

### E-09 — PostHog: ustawienia projektu zgodne z kodem; kontrakt konfiguracji

- **Cel:** panel PostHog nie poszerza przetwarzania ponad to, co robi kod
  i co mówi polityka; rozjazd wykrywa skrypt.
- **Pokrywa:** WYM-34, WYM-71 (zapis ustawień dostawcy); PRC-09, MIN-08
  (część panelu), SOC-05 (część), T-10.
- **Typ / wielkość / fala:** konfiguracja dostawcy + kod · S · F2.
- **Zakres:** ustawienia projektu PostHog (nagrania, konsola, czasy sieci,
  heatmapy, „Discard client IP data”, retencja) — wg [PR225 @a72b567]
  nagrania, konsola i czasy sieci są włączone, 2 nagrania o nieznanym
  źródle; kod `lib/analytics/init-posthog-browser.ts:37`
  (`disable_session_recording`) i `:52` (`ip: false` — bez działania
  w SDK 1.374.3, `@posthog/types/dist/posthog-config.d.ts:1490-1494`).
- **Warunki i zależności:** start od razu (właściciel ma dostęp do
  panelu); wynik zasila D-03; retencja wg D-05 (RT-POSTHOG) może przyjść
  później. Gałąź (część kodu) `claude/e09-prc09-posthog-kontrakt`.
- **Zmiany:** w panelu — wyłączyć nagrania, konsolę, czasy sieci
  i heatmapy, włączyć odrzucanie IP; ustalić źródło 2 nagrań i usunąć je,
  jeśli zawierają dane osobowe (w raporcie tylko liczba). W kodzie —
  usunąć martwe `ip: false` (komentarz wskazujący ustawienie projektu);
  test kontraktu konfiguracji; skrypt `scripts/ops/posthog-ustawienia.sh`
  (API PostHog, tylko odczyt) porównujący ustawienia projektu z oczekiwanymi.
- **Migracje:** brak.
- **Test czerwony:** skrypt porównania na obecnych ustawieniach —
  **czerwony** (nagrania, konsola, czasy sieci włączone [PR225 @a72b567]);
  `tests/unit/posthog-konfiguracja.test.ts` (T-10): flagi kodu bez zmian
  i brak opcji `ip` w konfiguracji — przed: **czerwony** (`:52`).
- **Fail-closed i ponowienie:** skrypt kończy się błędem przy rozjeździe
  (sygnał dla E-75); jobów brak.
- **Akceptacja:** skrypt zielony z datą; liczba nagrań w projekcie = 0;
  wpis w rejestrze ustawień dostawców (E-61); kod na `main` przeczytany.
- **Wycofanie:** ustawienia panelu przywracane ręcznie (niezalecane);
  kod — revert.
- **Po wdrożeniu:** uruchomienie skryptu; potem miesięcznie (E-75).
- **Dowód SOC 2:** CC8.1, CC7.1 (kontrola dryfu konfiguracji — SOC-05),
  P3.x [NZ] — datowane wyniki skryptu.
- **Ryzyko redukowane:** WYM-34 obecne Ś → N.

### E-10 — KSeF bez domyślnego środowiska `test`

- **Cel:** ścieżka wysyłki nie wybiera środowiska „po cichu”; brak albo
  błędna wartość zatrzymuje wysyłkę z komunikatem; produkcja
  z prawdziwymi klientami nie może działać na KSeF TEST bez jawnej decyzji.
- **Pokrywa:** WYM-37 (część), WYM-SOC-3 (część); PRC-17, SOC-25
  (część), SOC-06 (część).
- **Typ / wielkość / fala:** kod · M · F2.
- **Zakres:** domyślne `?? 'test'` w wysyłce — `lib/jobs/runners/submit-invoice.ts:628`,
  `lib/invoices/ksef-submit-enqueue.ts:127`, `lib/ksef/client.ts:49, 246`;
  wzorzec bez domyślnej wartości — `lib/ksef/claim-environment.ts`
  (`requireConfiguredKsefEnvironment`); pozostałe odczyty z domyślnym
  `test` (pkt 3 protokołu — ocenić w tym PR): `app/(dashboard)/_components/ksef-health-banner.tsx:7`,
  `app/api/ksef/health/route.ts:22`, `app/api/status/components/route.ts:80`,
  `lib/analytics/platform-metrics.ts:37`, `lib/jobs/runners/ksef-health-check.ts:24`,
  `lib/pdf/invoice-pdf.ts:197`.
- **Warunki i zależności:** start od razu, w koordynacji z blokiem F
  `docs/koordynacja/PLAN-ZERO-ZGUBIONYCH-FAKTUR.md` (F1 — runbook
  przełączenia; D-A4-2: aplikacja bez poprawnego `KSEF_ENV` pokazuje
  „Nie możemy teraz potwierdzić środowiska KSeF…”). Jeśli sesja tamtego
  planu obejmuje już tę zmianę, E-10 zamyka się odsyłaczem do jej PR.
  D-02 rozstrzyga jawny tryb pokazowy produkcji. Gałąź
  `claude/e10-prc17-ksef-srodowisko`.
- **Zmiany:** `requireConfiguredKsefEnvironment()` zamiast `?? 'test'`
  w wysyłce, kolejkowaniu i kliencie; w warstwie prezentacji — jawny stan
  „nieskonfigurowane” zamiast domyślnego `test`; przy wdrożeniu
  produkcyjnym (znacznik środowiska wdrożenia — `NODE_ENV` nie
  wystarcza) wartość `KSEF_ENV` inna niż `production` wymaga jawnej
  zmiennej trybu pokazowego, inaczej joby KSeF odmawiają wysyłki (wariant
  „odmowa startu całej aplikacji” z `05` WYM-37 — do wyboru w PR).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/ksef-srodowisko-bez-domyslnego.test.ts`
  (runner i akcja; mock tylko HTTP i bazy): przy nieustawionym `KSEF_ENV`
  brak wywołania HTTP do KSeF, faktura z komunikatem, zdarzenie bez
  środowiska `test` — przed: **czerwony** (`submit-invoice.ts:628`,
  `ksef-submit-enqueue.ts:127` wybierają `test`); przypadek „wdrożenie
  produkcyjne + `test` bez trybu pokazowego” → odmowa — przed: **czerwony**.
- **Fail-closed i ponowienie:** klient: „Wysyłka faktury <numer> do KSeF
  wstrzymana — środowisko KSeF nie jest skonfigurowane. Faktura czeka;
  powiadomimy po wznowieniu” (treść uzgodnić z tekstami PLAN-ZERO);
  operator: ustawienie zmiennej w Coolify dla obu aplikacji + runbook F1.
  Zdarzenie bez środowiska kończy się bez efektu zewnętrznego; ponowienie
  po konfiguracji — istniejący mechanizm wznowień i `ENV_MISMATCH`.
- **Akceptacja:** testy zielone; grep `?? 'test'` w ścieżce wysyłki = 0;
  kod na `main` przeczytany przez drugą osobę.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** zmienna trybu pokazowego ustawiona w Coolify dla obu
  aplikacji **przed** wdrożeniem (inaczej wysyłka na TEST zatrzyma się —
  zamierzone, ale musi być świadome); worker, potem web;
  `kontrola-faktur-ksef.sh`; baner pokazuje tryb.
- **Dowód SOC 2:** PI1.1 – PI1.3 [NZ] — konfiguracja środowiska w dzienniku
  wydań (E-75).
- **Ryzyko redukowane:** WYM-37 K1 W → Ś (zostają staging — E-77 i dane
  testowe — E-38).

### E-11 — Prompt kategoryzacji AI bez NIP

- **Cel:** automatyczna kategoryzacja kosztów nie wysyła do modelu
  identyfikatora podatkowego sprzedawcy.
- **Pokrywa:** WYM-06, WYM-05, WYM-62 (część); AI-01 (część), INW-06
  (część).
- **Typ / wielkość / fala:** kod · S · F2.
- **Zakres:** `lib/categorization/ai-classifier.ts:48` (`nip:
  data.seller_nip`); klient `lib/anthropic/client.ts`.
- **Warunki i zależności:** start od razu. Gałąź `claude/e11-ai01-prompt-bez-nip`.
- **Zmiany:** usunięcie NIP z danych promptu; test kontraktu treści promptu.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/ai-kategoryzacja-prompt.test.ts`: prompt
  zbudowany dla faktury z NIP sprzedawcy nie zawiera ciągu 10 cyfr NIP —
  przed: **czerwony** (`:48`).
- **Fail-closed i ponowienie:** nie dotyczy (zmiana treści wejścia).
- **Akceptacja:** test zielony; jakość kategoryzacji na zbiorze
  syntetycznym bez istotnego spadku (próg w PR); kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; kategoryzacja faktury syntetycznej.
- **Dowód SOC 2:** P3.x (minimalizacja zbierania) [NZ].
- **Ryzyko redukowane:** część WYM-62 — nazwa sprzedawcy (dla JDG dana
  osobowa) nadal trafia do modelu; resztę zamykają E-17 i E-60.

### E-12 — Informacja o modelu AI przy czacie i OCR

- **Cel:** użytkownik wie przed użyciem, że treść trafia do zewnętrznego
  modelu i czego nie wklejać.
- **Pokrywa:** WYM-62 (część), WYM-16 (część); ZGD-08, AI-05 (część),
  AI-02 (część), Q-ZR-14 (informacja niezależnie od kwalifikacji z AI Act
  — [NZ]).
- **Typ / wielkość / fala:** kod + krótka treść · S · F2.
- **Zakres:** `components/support/support-widget.tsx` (pole czatu),
  `app/api/support/chat/route.ts`; przycisk OCR w
  `app/(dashboard)/expenses/[id]/page.tsx` (i komponentach dodawania
  kosztu — grep `ocr` w `components/`).
- **Warunki i zależności:** start od razu; treść zatwierdza właściciel,
  ostateczne brzmienie może poprawić review w E-63. Gałąź
  `claude/e12-zgd08-informacja-ai`.
- **Zmiany:** jedno zdanie pod polem czatu i przy przycisku OCR (wzór
  `A1` ZGD-08: „Odpowiada model AI (Anthropic). Nie wklejaj danych
  osobowych kontrahentów.”), z linkiem do polityki.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/informacja-ai-widoczna.test.ts`
  (komponent): render pola czatu i przycisku OCR zawiera zdanie
  o modelu AI — przed: **czerwony**.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test zielony; zrzut ekranu w PR; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; ręczny przegląd.
- **Dowód SOC 2:** P1.1 [NZ].
- **Ryzyko redukowane:** WYM-62 — brak informacji przy użyciu zamknięty;
  transfer i DPIA — E-60, E-61.

### E-13 — E-maile nietransakcyjne fail-closed

- **Cel:** wiadomość nietransakcyjna nie wychodzi bez sprawdzenia
  rezygnacji i bez działającego linku wypisu.
- **Pokrywa:** WYM-66 (część techniczna), WYM-14 (część), WYM-28
  (marketing); ZGD-06 (część), NA1-10, PRA-07 (marketing).
- **Typ / wielkość / fala:** kod · S · F2.
- **Zakres:** `lib/email/preferences.ts:151-178` (`canSendTo`; warstwa
  „brak userId = OK” `:166-167`); `lib/email/send.ts:172` (wywołanie),
  `:193` („EMAIL_UNSUBSCRIBE_SECRET missing → skip headers, ale wyślij
  email”); `lib/email/unsubscribe-token.ts:39-42`; sekwencja próbna
  `lib/jobs/runners/email-sequence.ts:151-168`.
- **Warunki i zależności:** start od razu; model zgody dla marketingu
  i klasyfikacja e-maila 8. dnia — E-65 (P-08, Q-ZR-05). Gałąź
  `claude/e13-zgd06-mail-fail-closed`.
- **Zmiany:** dla kategorii innych niż transakcyjna brak `userId` nie
  oznacza zgody (sprawdzenie po adresie albo odmowa); brak sekretu wypisu
  = brak wysyłki nietransakcyjnej (nie „wyślij bez nagłówków”); link
  wypisu w treści każdej wiadomości nietransakcyjnej (nagłówek
  `List-Unsubscribe` już powstaje, gdy sekret jest ustawiony — `send.ts`
  przed `:193`).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/email-nietransakcyjne-fail-closed.test.ts`:
  (a) `canSendTo(adres, null, 'marketing')` → odmowa bez zapisu zgody —
  przed: **czerwony** (`:167` zwraca `ok: true`); (b) wysyłka
  `product_updates` bez `EMAIL_UNSUBSCRIBE_SECRET` → brak wywołania
  dostawcy — przed: **czerwony** (`send.ts:193`); (c) treść każdej
  wiadomości nietransakcyjnej zawiera link wypisu.
- **Fail-closed i ponowienie:** brak sekretu → wysyłki nietransakcyjne
  wstrzymane, alarm operatora (bez adresów), runbook „ustaw sekret”;
  transakcyjne bez zmian. Pominięty krok sekwencji zapisany z powodem —
  ponowienie joba nie wyśle go później „po cichu”.
- **Akceptacja:** testy zielone; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** sprawdzenie, że `EMAIL_UNSUBSCRIBE_SECRET` jest
  ustawiony dla obu aplikacji (nazwa zmiennej, bez wartości) **przed**
  wdrożeniem; worker, potem web; e-mail sekwencji na konto syntetyczne
  zawiera link wypisu.
- **Dowód SOC 2:** P2.1, P3.x [NZ].
- **Ryzyko redukowane:** WYM-66 obecne Ś → N w części wypisu; model zgody
  — E-65.

### E-14 — Reply-To klienta w wiadomościach do kontrahentów

- **Cel:** odpowiedzi kontrahentów na fakturę wysłaną e-mailem trafiają
  do klienta, nie do skrzynek operatora.
- **Pokrywa:** WYM-67, WYM-42 (część); INW-07, Q-ZR-08.
- **Typ / wielkość / fala:** kod · S · F2.
- **Zakres:** `lib/email/send.ts:197-200` (`replyTo: SUPPORT_EMAIL` dla
  każdej wiadomości), `sendInvoiceEmail` `send.ts:550-581`, wywołanie
  `components/invoices/actions-detail.ts:495-505`; wzorzec istniejący —
  przypomnienia (`reply_to_email`, `components/reminders/reminder-settings-form.tsx:29-33`,
  `app/actions/reminders.ts:160`).
- **Warunki i zależności:** start od razu; stopka o roli procesora —
  E-64. Gałąź `claude/e14-inw07-reply-to-klienta`.
- **Zmiany:** dla wiadomości wysyłanych w imieniu klienta Reply-To =
  adres organizacji (pole jak w przypomnieniach albo e-mail właściciela);
  `SUPPORT_EMAIL` tylko dla wiadomości FaktFlow do użytkowników;
  procedura dla wiadomości kontrahentów, które już trafiły do pomocy
  (przekazanie klientowi i usunięcie) — w E-66.
- **Migracje:** brak (pole adresu w ustawieniach organizacji, jeśli
  potrzebne — addytywne, przed wdrożeniem).
- **Test czerwony:** `tests/unit/email-faktura-reply-to.test.ts`: wysyłka
  faktury → `replyTo` = adres organizacji — przed: **czerwony** (`SUPPORT_EMAIL`).
- **Fail-closed i ponowienie:** brak adresu organizacji → wysyłka faktury
  dalej działa z Reply-To właściciela; nie blokować wysyłki faktury.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; faktura syntetyczna wysłana na
  skrzynkę testową, nagłówek Reply-To sprawdzony.
- **Dowód SOC 2:** P6.x (przetwarzanie na polecenie) [NZ].
- **Ryzyko redukowane:** WYM-67 K1 Ś → N; dane osób bez relacji z FF
  przestają trafiać do skrzynek operatora.

### E-15 — Redakcja danych osobowych w logach i telemetrii

- **Cel:** logi aplikacji i zdarzenia Sentry nie zawierają e-maili, NIP,
  PESEL ani IBAN w treści.
- **Pokrywa:** WYM-36, WYM-06; MIN-07, INW-08 (część logi), T-12, T-13.
- **Typ / wielkość / fala:** kod · M · F2.
- **Zakres:** `lib/observability/logger.ts` (logger aplikacji bez
  redakcji); `lib/jobs/logger.ts` (logger workera — maskuje po nazwie
  pola, wzorzec); `lib/observability/scrub.ts:8` (`scrubTelemetryText` —
  bez wzorców PESEL/NIP).
- **Warunki i zależności:** start od razu. Gałąź `claude/e15-min07-redakcja-logow`.
- **Zmiany:** jedna funkcja redakcji (nazwy pól + wzorce PESEL, NIP,
  e-mail, IBAN) używana przez logger aplikacji, logger workera
  i `scrubTelemetryText`; reguła statyczna dla `console.*`
  z interpolacją zmiennych `*email*`, `*nip*`, `*pesel*` poza loggerem.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/telemetria-kanarek.test.ts` (T-12):
  trasa, akcja i job kończą się błędem z kanarkami (e-mail, NIP, PESEL,
  IBAN); przechwycone `console.*`, logger i transport testowy Sentry bez
  kanarków — przed: **czerwony** co najmniej dla loggera aplikacji (MIN-07).
  `tests/unit/logi-bez-pii-statyczny.test.ts` (T-13) — wynik przed:
  nieznany; jeśli zielony — nie liczy się jako dowód czerwieni.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** testy zielone; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; przegląd logów z 10 minut
  (`AGENTS.md` krok 4) bez wzorców danych — wynik jako liczba trafień.
- **Dowód SOC 2:** CC7.2, C1.1 [NZ] — test kanarków w CI.
- **Ryzyko redukowane:** WYM-36 Ś → N w części logów aplikacji.

### E-16 — Alerty Slack i Telegram bez e-maili

- **Cel:** kanały zespołu dostają identyfikatory, nie adresy e-mail
  i nie treść danych klientów.
- **Pokrywa:** WYM-36, WYM-58 (część); PRC-12, INW-08 (część), RET-10
  (część Slack).
- **Typ / wielkość / fala:** kod · S · F2.
- **Zakres:** `lib/support/support-actions.ts:41, 76-83` (`user_email`
  w alercie Slack); `lib/alerts/slack.ts`, `lib/alerts/telegram.ts`
  i miejsca wywołań (grep `sendSlackAlert`, `sendTelegram`).
- **Warunki i zależności:** start od razu. Gałąź `claude/e16-prc12-alerty-bez-email`.
- **Zmiany:** w alertach identyfikator rozmowy, konta lub organizacji
  zamiast e-maila; funkcja wysyłki alertu odrzuca treść z wzorcem e-mail
  (redakcja z E-15, jeśli już scalona).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/alerty-bez-email.test.ts`: prośba
  o kontakt w czacie → treść alertu Slack bez adresu e-mail — przed:
  **czerwony** (`:81`).
- **Fail-closed i ponowienie:** alert z wykrytym e-mailem — wysyłany po
  redakcji, nie blokowany (alarmy muszą dochodzić).
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; alert testowy w kanale.
- **Dowód SOC 2:** P6.x, CC9.2 [NZ].
- **Ryzyko redukowane:** WYM-36 N; dane osób w narzędziach bez umowy
  ograniczone (WYM-58).

### E-18 — Wycofanie zgody analitycznej; wersja i data decyzji

- **Cel:** zgodę na analitykę można zmienić lub wycofać z każdej strony
  tak łatwo, jak się ją wyraża; decyzja ma wersję treści i datę.
- **Pokrywa:** WYM-14, WYM-13 (część baneru), WYM-64, WYM-65; RUN-03,
  RUN-10, ZGD-05 (część); ZG-04, ZG-05, ZG-06, ZG-08 (`09` § 12.1); T-09, DOW-14, RUN-01 i RUN-02 (utrzymanie stanu potwierdzonego).
- **Typ / wielkość / fala:** kod · M · F3.
- **Zakres:** `components/analytics/consent-banner.tsx:28-33` (baner tylko
  przy stanie `unset`), `:36, 40` (`setAnalyticsConsent`);
  `lib/analytics/consent.ts:27-37` (zapis bez wersji i daty);
  `lib/analytics/init-posthog-browser.ts:13-24`; stopki układów:
  marketing, logowanie, panel, `app/not-found.tsx`; `/settings`.
- **Warunki i zależności:** start od razu; kopia decyzji przy koncie
  (`09` ZG-06, ZG-07) i okres ważności (ZG-08) — po decyzji D-12;
  treść baneru — E-63. Gałąź `claude/e18-run03-wycofanie-zgody`.
- **Zmiany:** link „Ustawienia prywatności” w stopce wszystkich układów
  i w `/settings`, otwierający ten sam wybór; przy wycofaniu
  `opt_out_capturing()` + `reset()`; zapis `{decyzja, wersja, data}`;
  zmiana wersji treści baneru → baner wraca.
- **Migracje:** brak (zapis w przeglądarce; kopia przy koncie —
  osobny etap po decyzji).
- **Test czerwony:** `e2e/tests/08-zgoda-analityczna.spec.ts` (T-09,
  e2e bez backendu, port uprzęży `A4`): zgoda → kliknięcie „Ustawienia
  prywatności” → wycofanie → zero żądań `/ingest`, flaga SDK `0`, nowy
  identyfikator — przed: **czerwony** (brak kontrolki — `A4` RUN-03, d0);
  `tests/unit/consent-wersja.test.ts`: zapis zawiera wersję i datę,
  zmiana wersji przywraca baner — przed: **czerwony** (`consent.ts:27-37`).
- **Fail-closed i ponowienie:** nieczytelny lub stary zapis → traktowany
  jak brak decyzji (baner wraca), nie jak zgoda.
- **Akceptacja:** testy zielone; dwa kliknięcia od dowolnej strony do
  wycofania; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; ręczny przebieg: zgoda → wycofanie
  → brak żądań w narzędziach przeglądarki.
- **Dowód SOC 2:** P2.1 [NZ] — e2e w CI (po E-75 jako stały przebieg).
- **Ryzyko redukowane:** WYM-14 obecne Ś → N; WYM-64, WYM-65 Ś → N.

### E-19 — Usunięcie konta dla kont logowanych przez Google

- **Cel:** osoba bez hasła (konto założone przez Google) może sama zażądać
  usunięcia konta.
- **Pokrywa:** WYM-24 (część); PRA-02 (konta Google bez samoobsługi), N-A2-07.
- **Typ / wielkość / fala:** kod · M · F3.
- **Zakres:** `app/(dashboard)/settings/account/actions.ts:35-44`
  (ponowne uwierzytelnienie hasłem), `lib/auth/reauth.ts:25-80`,
  `app/(dashboard)/settings/account/_components/gdpr-section.tsx:85-86, 101`
  (pole hasła).
- **Warunki i zależności:** start od razu; po E-03 (spójność ścieżek).
  Gałąź `claude/e19-pra02-usuniecie-google`.
- **Zmiany:** dla kont bez hasła — potwierdzenie żądania jednorazowym
  linkiem na adres konta (albo ponowne logowanie przez Google z krótkim
  oknem ważności); ta sama funkcja `createGdprRequest`; UI pokazuje drogę
  właściwą dla rodzaju konta.
- **Migracje:** brak (token potwierdzenia — istniejący mechanizm
  `cancel_token`/`00072` albo nowa kolumna addytywna, przed wdrożeniem).
- **Test czerwony:** `tests/unit/rodo-usuniecie-konto-google.test.ts`
  (akcja; mock tylko GoTrue HTTP i bazy): konto wyłącznie z tożsamością
  Google → żądanie usunięcia możliwe po potwierdzeniu — przed:
  **czerwony** (wymagane hasło).
- **Fail-closed i ponowienie:** link wygasły → komunikat „Link wygasł —
  wyślij nowy” i przycisk; ponowne kliknięcie ważnego linku nie tworzy
  drugiego żądania (`getActiveGdprRequest`).
- **Akceptacja:** test zielony; zrzut ekranu ścieżki; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; żądanie z konta syntetycznego
  Google (środowisko testowe GoTrue) i anulowanie.
- **Dowód SOC 2:** P4.3, P5.x [NZ].
- **Ryzyko redukowane:** WYM-24 — blokada prawa dla części użytkowników usunięta.

### E-22 — Rejestr żądań osób i wyszukiwanie osoby w magazynach

- **Cel:** każde żądanie osoby (z konta i spoza niego) ma wpis z datą
  wpływu, terminem i wynikiem, a operator potrafi znaleźć dane osoby we
  wszystkich magazynach bez kopiowania ich treści.
- **Pokrywa:** WYM-17, WYM-21, WYM-75, WYM-44 (narzędzie), WYM-74; PRA-09, PRA-11,
  DOW-04, SOC-33, SOC-36 (część); `09` § 8.3 (21 magazynów), § 8.5 (pola).
- **Typ / wielkość / fala:** kod + migracja + skrypt · M · F3.
- **Zakres:** nowa tabela rejestru (pola z `09` § 8.5: kanał, data wpływu,
  rodzaj żądania, rola FF-A/FF-P, sposób identyfikacji, termin,
  przedłużenie, wynik, data odpowiedzi — bez treści danych); widok
  i akcje w `/admin`; skrypt `scripts/ops/szukaj-osoby.sh` (wejście:
  e-mail albo NIP; wynik: liczba wierszy per magazyn); powiązanie
  z `gdpr_deletion_requests` i wpisami `gdpr.*` w audycie (dziś czyszczone
  po 12 mies. — `A2` PRA-11).
- **Warunki i zależności:** start od razu dla mechanizmu; okres
  przechowania rejestru (RT-DSAR) — D-05; procedura — E-66; kanał
  (skrzynka) — D-10. Gałąź `claude/e22-pra11-rejestr-zadan`.
- **Zmiany:** tabela z RLS (tylko serwis i operator); automatyczny wpis
  przy żądaniu z aplikacji (eksport, usunięcie); ręczny wpis operatora;
  liczenie terminu miesięcznego (art. 12 ust. 3 [NZ]) i alarm 7 dni przed
  terminem; skrypt wyszukiwania tylko do odczytu, wynik bez treści.
- **Migracje:** `00NNN_privacy_requests` — nowa tabela, RLS, uprawnienia
  tylko `service_role`; addytywna, **przed wdrożeniem**; nie dotyka
  istniejących danych.
- **Test czerwony:** `tests/rls-rejestr-zadan.test.ts` (RLS na bazie):
  zalogowany członek firmy nie czyta ani nie zapisuje rejestru; żądanie
  eksportu z aplikacji tworzy wpis z datą wpływu — przed: **czerwony**
  (brak tabeli i wpisu). `tests/unit/szukaj-osoby-zakres.test.ts`: lista
  magazynów w skrypcie = lista z rejestru retencji (E-40) albo z `09`
  § 8.3 — przed: **czerwony** (brak skryptu).
- **Fail-closed i ponowienie:** wpis automatyczny w tej samej transakcji
  co utworzenie żądania; alarm o terminie — job z kluczem
  `request_id + dzień`, ponowienie nie dubluje alarmu.
- **Akceptacja:** testy zielone; operator rejestruje żądanie testowe
  i znajduje konto syntetyczne w każdym magazynie z listy; kod na `main`
  przeczytany.
- **Wycofanie:** revert PR; tabela zostaje (pusta lub z wpisami testowymi
  — usunięcie tabeli tylko za zgodą właściciela).
- **Po wdrożeniu:** migracja przed (+ `NOTIFY pgrst`, typy); worker,
  potem web; liczba cronów — jeśli dochodzi cron alarmu, test
  `jobs-foundation.test.ts:186` zmieniony świadomie.
- **Dowód SOC 2:** P5.1, P5.2, P8.1 [NZ] — rejestr żądań jako populacja.
- **Ryzyko redukowane:** WYM-75 Ś → N; WYM-17, WYM-21 K1 W → Ś (procedura
  i kanał — E-66, D-10).

### E-23 — Eksport danych konta (art. 15) uzupełniony

- **Cel:** plik eksportu obejmuje wszystkie dane osoby z bazy i informacje
  z art. 15 ust. 1 [NZ], bez danych innych osób i bez cichego obcięcia.
- **Pokrywa:** WYM-21, WYM-22; PRA-01, T-01, T-02.
- **Typ / wielkość / fala:** kod · M · F3.
- **Zakres:** `app/api/gdpr/export/route.ts`, `lib/gdpr/data-collector.ts`
  (limit 1000 wierszy, brak IP/UA z dziennika, brak wpisów audytu
  z `entity_id = userId`); test listy tabel `tests/unit/rodo-eksport-pelny.test.ts:90-120`.
- **Warunki i zależności:** start od razu; notatki operatora
  (`admin_user_notes`) — `A2` pyt. 5 (review); sekcja informacyjna
  (cele, odbiorcy, okresy) — treść z E-61, E-63 (do tego czasu odesłanie
  do polityki). Gałąź `claude/e23-pra01-eksport-konta`.
- **Zmiany:** dopisanie brakujących źródeł; stronicowanie albo zadanie
  w tle z plikiem i krótkim linkiem zamiast limitu; liczniki pokrycia
  w pliku; sekcja „informacje z art. 15”; limit liczby pobrań na godzinę.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/rodo-eksport-schemat.test.ts` (T-01,
  statyczny odczyt migracji): każda tabela z kolumną wskazującą osobę jest
  w `data-collector.ts` albo na liście wyłączeń z uzasadnieniem — wynik
  przed: do sprawdzenia (T-01 „nieznane”); `tests/rls-rodo-eksport.test.ts`
  (T-02, na bazie): osoba A w dwóch firmach, osoba B; eksport A zawiera
  wiersze A z każdej sekcji, 0 wierszy B; przy > 1000 wierszy brak cichego
  obcięcia — przed: **czerwony** dla obcięcia i IP/UA (PRA-01).
- **Fail-closed i ponowienie:** przekroczenie limitu → komunikat z czasem
  następnej próby; zadanie w tle z kluczem `user_id + dzień`.
- **Akceptacja:** testy zielone; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; eksport konta syntetycznego
  z > 1000 wpisów.
- **Dowód SOC 2:** P5.1 [NZ].
- **Ryzyko redukowane:** WYM-21 Ś → N w części konta; WYM-22 N.

### E-24 — Sprostowanie: zmiana imienia i e-maila w ustawieniach

- **Cel:** użytkownik sam poprawia imię i adres e-mail (z potwierdzeniem
  nowego adresu); zmiana trafia do Stripe i dziennika.
- **Pokrywa:** WYM-07, WYM-23; PRA-05, Q-ZR-17 (część: dane konta).
- **Typ / wielkość / fala:** kod · M · F3.
- **Zakres:** ustawienia konta (`app/(dashboard)/settings/account/*`);
  GoTrue `updateUser` (potwierdzenie na oba adresy); `lib/stripe/customer-email.ts:9`
  (`syncStripeCustomerEmail`); `lib/audit/log.ts`.
- **Warunki i zależności:** start od razu; opis sprostowania faktur jako
  korekty — E-63 (Q-ZR-17). Gałąź `claude/e24-pra05-sprostowanie-konta`.
- **Zmiany:** formularz imienia; zmiana e-maila przez GoTrue
  z potwierdzeniem; wpis audytu bez starych i nowych adresów w jawnej
  postaci (E-34); synchronizacja do Stripe po potwierdzeniu.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/konto-sprostowanie.test.ts` (akcja; mock
  GoTrue HTTP i bazy): zmiana imienia zapisuje nową wartość; zmiana
  e-maila wywołuje potwierdzenie i po nim synchronizację Stripe — przed:
  **czerwony** (brak akcji).
- **Fail-closed i ponowienie:** nieudana synchronizacja Stripe → ponowienie
  z kluczem `user_id + adres`, komunikat dla operatora po wyczerpaniu prób;
  adres w aplikacji zmienia się dopiero po potwierdzeniu.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; zmiana adresu konta syntetycznego.
- **Dowód SOC 2:** P5.2, P7.1 [NZ].
- **Ryzyko redukowane:** WYM-07, WYM-23 Ś → N.

### E-25 — Pełny eksport danych organizacji

- **Cel:** klient może pobrać wszystkie dane firmy przed odejściem
  (warunek dla usunięcia organizacji — E-50).
- **Pokrywa:** WYM-27, WYM-45 (część „zwrot”); RET-11, PRA-04 (część).
- **Typ / wielkość / fala:** kod · L · F3.
- **Zakres:** nowe zadanie w tle (kolejka pg-boss bez crona); pliki
  z magazynu S3 (`lib/storage/r2.ts`): XML FA(3), UPO, PDF, zdjęcia kosztów;
  JSON lub CSV kontrahentów, produktów, płatności, kosztów; link
  z uwierzytelnieniem (portal), krótki TTL.
- **Warunki i zależności:** start od razu; okres przechowania paczki —
  D-05 (RT-EKSP). Gałąź `claude/e25-ret11-eksport-organizacji`.
- **Zmiany:** akcja właściciela „Pobierz wszystkie dane firmy”; job
  budujący ZIP strumieniowo; wpis audytu i wpis w rejestrze żądań (E-22),
  jeśli żądanie pochodzi od osoby; plik usuwany po TTL.
- **Migracje:** brak albo addytywna (tabela zadań eksportu, jeśli
  istniejąca `export_jobs` nie wystarcza) — przed wdrożeniem.
- **Test czerwony:** `tests/unit/eksport-organizacji.test.ts` (runner;
  magazyn S3 w pamięci, mock bazy): firma z fakturą, korektą, kosztem ze
  zdjęciem → ZIP zawiera wszystkie pliki i JSON — przed: **czerwony**
  (brak runnera). `tests/rls-eksport-organizacji.test.ts`: członek bez
  roli właściciela nie uruchomi eksportu; eksport nie zawiera danych innej
  firmy.
- **Fail-closed i ponowienie:** job idempotentny po `export_id`
  (ponowienie nadpisuje ten sam obiekt); brak pliku źródłowego → paczka
  z listą braków, nie cichy sukces; komunikat dla klienta z nazwą pliku.
- **Akceptacja:** testy zielone; test `jobs-foundation.test.ts` (liczba
  kolejek) zmieniony świadomie; kod na `main` przeczytany.
- **Wycofanie:** revert PR; utworzone paczki wygasają z TTL.
- **Po wdrożeniu:** worker, potem web; eksport firmy syntetycznej,
  porównanie liczby plików z bazą.
- **Dowód SOC 2:** P5.1, C1.2 [NZ].
- **Ryzyko redukowane:** WYM-27 Ś → N; warunek dla WYM-45.

### E-28 — Strażnik braku decyzji zautomatyzowanych

- **Cel:** test pilnuje, że wynik AI nie zatwierdza niczego bez człowieka,
  a `payment.score` nie włączy się bez oceny.
- **Pokrywa:** WYM-29; PRA-08, AI-04 (część).
- **Typ / wielkość / fala:** kod (test) · S · F3.
- **Zakres:** `lib/categorization/ai-classifier.ts:91` (pewność 0.7),
  `lib/jobs/runners/auto-categorize-inbox.ts:409` (próg 0.9 dla `is_reviewed`),
  `lib/flo/flags.ts:41-49` (`payment.score` wyłączone); wzorzec —
  `tests/unit/flo-nieaktywne.test.ts:22-41`.
- **Warunki i zależności:** start od razu. Gałąź `claude/e28-pra08-straznik-art22`.
- **Zmiany:** test kontraktu: wynik AI nigdy nie ustawia `is_reviewed =
  true`; `payment.score` wyłączone, a jego włączenie wymaga zmiany testu
  z odsyłaczem do oceny (E-59 screening, E-60 DPIA).
- **Migracje:** brak.
- **Test czerwony:** to etap strażnika — test przechodzi od razu (stan
  zgodny). Zgodnie z pkt 2 protokołu nie dowodzi naprawy; w raporcie
  etapu oznaczony jako **kontrola zapobiegawcza**, nie naprawa.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test w CI; wpis w rejestrze funkcji AI (E-59); kod na
  `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** bez wdrożenia (tylko test) — wdrożenie przy
  najbliższym wydaniu.
- **Dowód SOC 2:** PI1.3, CC8.1 [NZ].
- **Ryzyko redukowane:** WYM-29 — utrzymanie „nie dotyczy” (ryzyko
  pojawiłoby się przy zmianie progu albo włączeniu `payment.score`).

### E-29 — PESEL: domyślnie „bez identyfikatora”

- **Cel:** faktura dla osoby prywatnej nie wymaga PESEL, chyba że
  wystawiający świadomie go wybierze.
- **Pokrywa:** WYM-X-03 (część domyślna), WYM-32; MIN-01, INW-05
  (część), `05` § 12.3 sprzeczność 1.
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `components/invoices/invoice-form.tsx:437` (`'pesel'` po
  wyborze „Osoba prywatna”), `:774` (`?? 'pesel'`); wartość zapasowa
  serwera `components/invoices/actions.ts:413` (`?? 'no_id'`).
- **Warunki i zależności:** start od razu; pytanie, czy przepisy
  o fakturowaniu w KSeF wymagają identyfikatora konsumenta (`A1`, pytania
  do review) — zmiana domyślnej wartości nie odbiera możliwości podania
  PESEL, więc nie czeka. Gałąź `claude/e29-min01-pesel-domyslnie`.
- **Zmiany:** domyślnie „Bez identyfikatora”; PESEL lub numer dokumentu
  po świadomym wyborze, z jednozdaniową podpowiedzią, kiedy jest potrzebny.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/faktura-osoba-prywatna-domyslny-id.test.ts`
  (komponent): po wyborze „Osoba prywatna” typ identyfikatora = brak —
  przed: **czerwony** (`:437`).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test zielony; XML FA(3) faktury bez identyfikatora
  przechodzi lokalną walidację (libxmljs2) — test istniejący generatora;
  kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; faktura syntetyczna dla osoby
  prywatnej na KSeF TEST.
- **Dowód SOC 2:** P3.x [NZ].
- **Ryzyko redukowane:** WYM-X-03 K1 W → Ś (przechowywanie — E-49).

### E-30 — Imię przy rejestracji opcjonalne

- **Cel:** formularz nie wymaga danych, których polityka i serwer nie
  wymagają.
- **Pokrywa:** WYM-06; MIN-02 (`A1`-P-03).
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `app/(auth)/register/page.tsx:111-117` (`required`); stałe
  komunikaty błędów zamiast odbicia tekstu z URL (MIN-02).
- **Warunki i zależności:** start od razu. Gałąź `claude/e30-min02-imie-opcjonalne`.
- **Zmiany:** pole „Imię (opcjonalnie)” bez `required`; szablony e-maili
  bez imienia działają z formą ogólną.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/rejestracja-pola.test.ts`: formularz
  wysłany bez imienia przechodzi walidację klienta i serwera (wspólny
  schemat Zod) — przed: **czerwony** (`required`).
- **Akceptacja:** test zielony; `pnpm build`; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; rejestracja konta syntetycznego bez imienia.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Dowód SOC 2:** P3.x [NZ].
- **Ryzyko redukowane:** WYM-06 — niezgodność formularza z polityką (N).

### E-31 — Wyszukanie NIP bez nazw organizacji

- **Cel:** zalogowany użytkownik nie dowiaduje się, które firmy korzystają
  z FaktFlow, ani jak klient nazwał organizację.
- **Pokrywa:** WYM-33; MIN-03.
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `components/onboarding/actions.ts:94-117` (`lookupNipAction`
  zwraca listę organizacji z nazwą i stanem weryfikacji KSeF, czyta
  kluczem serwisowym), limit `:61-71`; test `tests/unit/onboarding-nip-limit.test.ts`.
- **Warunki i zależności:** start od razu. Gałąź `claude/e31-min03-nip-bez-nazw`.
- **Zmiany:** odpowiedź „ten NIP ma już organizację w FaktFlow” bez nazw
  i liczby; prośba o dostęp idzie do właściciela bez ujawniania danych
  pytającemu.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/onboarding-nip-bez-nazw.test.ts` (akcja;
  mock bazy): odpowiedź dla istniejącego NIP nie zawiera nazwy organizacji
  — przed: **czerwony**.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; onboarding syntetyczny z NIP
  istniejącej organizacji testowej.
- **Dowód SOC 2:** C1.1, P6.x [NZ].
- **Ryzyko redukowane:** WYM-33 Ś → N w tej części.

### E-32 — Jawne kolumny w odpowiedziach; IP w dzienniku tylko dla właściciela

- **Cel:** komponenty klienckie dostają tylko potrzebne pola; IP i UA
  współpracowników nie są widoczne dla każdego członka firmy.
- **Pokrywa:** WYM-06, WYM-32; MIN-04, INW-09 (część), DOW-09 (część).
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** `select('*')` w `app/` i `components/` (16 miejsc wg `A1`;
  na `3e5e00d` — 7 plików `app/**/page.tsx`), m.in.
  `app/(dashboard)/expenses/page.tsx:29`,
  `app/(dashboard)/settings/notifications/page.tsx:20-26` (klucze
  subskrypcji push do przeglądarki), `app/(dashboard)/settings/audit/page.tsx:34-38`
  (pełne wpisy z IP); surowe komunikaty błędów bazy w akcjach (`A1` MIN-04).
- **Warunki i zależności:** start od razu. Gałąź `claude/e32-min04-jawne-kolumny`.
- **Zmiany:** jawne listy kolumn; reguła lint albo test na `select('*')`
  w `app/**/page.tsx`; IP i UA w dzienniku firmy tylko dla roli
  właściciela (albo maskowane); stały komunikat z identyfikatorem błędu
  zamiast tekstu z bazy.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/brak-select-gwiazdka.test.ts` (statyczny)
  — przed: **czerwony** (7 plików); `tests/unit/dziennik-ip-rola.test.ts`
  (strona dziennika; mock bazy): członek bez roli właściciela nie widzi
  IP — przed: **czerwony**.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** testy zielone; `pnpm build`; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; przegląd stron panelu.
- **Dowód SOC 2:** CC6.1, P3.x [NZ].
- **Ryzyko redukowane:** WYM-06 Ś → N w części odpowiedzi.

### E-33 — `validation_cache` bez odczytu dla zalogowanych

- **Cel:** wspólna dla wszystkich klientów pamięć danych rejestrowych nie
  jest czytelna przez PostgREST dla dowolnego zalogowanego użytkownika.
- **Pokrywa:** WYM-33, WYM-05; INW-16 (część), L-04 (warunek z `09` § 4).
- **Typ / wielkość / fala:** migracja · S · F4.
- **Zakres:** `00022_validation_infrastructure.sql:57-62` (`GRANT SELECT
  … TO authenticated`, polityka odczytu dla zalogowanych); jedyny odczyt
  w kodzie — `createAdminClient` w `lib/validation/cache.ts:95, 111, 126,
  170` (grep `validation_cache` w `app/` i `components/` — 0 trafień, 13.10).
- **Warunki i zależności:** start od razu. Gałąź `claude/e33-inw16-validation-cache`.
- **Zmiany:** odebranie `SELECT` roli `authenticated` i usunięcie polityki
  odczytu.
- **Migracje:** `00NNN_validation_cache_service_only` — odbiera
  uprawnienie (zasada „PO wdrożeniu” dla odbierania), ale kod go nie
  używa, więc kolejność względem wdrożenia jest obojętna — **wgrać po
  scaleniu, bez wdrożenia aplikacji**; nie dotyka wierszy.
  `DROP POLICY` + `REVOKE` — dozwolone (zmiana uprawnień, dane bez zmian).
- **Test czerwony:** `tests/rls-validation-cache.test.ts` (RLS na bazie):
  zalogowany użytkownik dostaje 0 wierszy lub odmowę; `service_role`
  czyta — przed: **czerwony** (polityka zezwala).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test zielony; test PostgREST po wgraniu (odpowiedź bez
  danych dla tokenu użytkownika); kod na `main` przeczytany.
- **Wycofanie:** migracja odwrotna (`GRANT` + polityka) — gotowa w PR.
- **Po wdrożeniu:** `schema_migrations`, `NOTIFY pgrst`; walidacja NIP
  w aplikacji działa (odczyt przez serwer).
- **Dowód SOC 2:** CC6.1, C1.1 [NZ].
- **Ryzyko redukowane:** WYM-33 — udostępnienie nieokreślonej liczbie osób (N).

### E-34 — Dziennik audytu bez jawnych e-maili osób trzecich

- **Cel:** wpisy audytu identyfikują osoby trzecie (księgowa, odbiorca
  faktury) identyfikatorem, nie adresem e-mail.
- **Pokrywa:** WYM-06; DOW-09, T-19, P-06 (minimalizacja nie czeka na
  odpowiedź — jeśli review uzna e-mail za potrzebny, wraca w kolejnym PR).
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `lib/audit/log.ts:62-63, 116` (`accountant.access_used`
  i pokrewne), wpisy `invoice.emailed`, akcje operatora z e-mailem.
- **Warunki i zależności:** start od razu. Gałąź `claude/e34-dow09-audyt-bez-email`.
- **Zmiany:** identyfikator dostępu albo skrót z kluczem (E-35) zamiast
  e-maila w `metadata`.
- **Migracje:** brak (stare wpisy wygasają z retencją dziennika; ich
  przepisanie — tylko za zgodą właściciela).
- **Test czerwony:** `tests/unit/audyt-metadata-minimalizacja.test.ts`
  (T-19): wejście księgowej, wysłanie faktury, akcja operatora → `metadata`
  bez wzorca e-mail — przed: **czerwony** (L8).
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; wpis testowy w dzienniku.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Dowód SOC 2:** P3.x, CC7.2 [NZ].
- **Ryzyko redukowane:** WYM-06 N.

### E-35 — Skróty z kluczem (HMAC) zamiast gołego SHA-256

- **Cel:** klucze limitów i ślady resetu hasła nie dają się odwrócić
  słownikiem IP lub znanych e-maili.
- **Pokrywa:** WYM-38, WYM-50 (część); MIN-10, INW-16 (część).
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `lib/rate-limit/index.ts:130-135` (IP, e-mail), 
  `app/(auth)/forgot-password/actions.ts:48` (skrót e-maila w audycie);
  tokeny losowe (`lib/accountant/tokens.ts`, `lib/gdpr/deletion.ts:112`)
  — **bez zmian** (skrót losowego tokenu jest właściwy).
- **Warunki i zależności:** start od razu; nowy sekret środowiskowy dla
  obu aplikacji. Gałąź `claude/e35-min10-hmac`.
- **Zmiany:** HMAC-SHA256 z osobnym kluczem; wpis klucza w rejestrze
  kluczy (E-74).
- **Migracje:** brak (klucze limitów w Redisie wygasają; stare ślady
  resetu — z retencją dziennika).
- **Test czerwony:** `tests/unit/skroty-z-kluczem.test.ts`: skrót IP
  i e-maila ≠ SHA-256 bez klucza; brak klucza → odmowa startu funkcji
  limitów z alarmem — przed: **czerwony**.
- **Fail-closed i ponowienie:** brak klucza → limity działają w trybie
  ostrożnym (odmowa prób ponad próg) i alarm operatora, nie wyłączenie
  limitów.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR (limity wracają do starych kluczy po wygaśnięciu).
- **Po wdrożeniu:** sekret ustawiony dla obu aplikacji **przed**
  wdrożeniem; worker, potem web; logowanie z błędnym hasłem → limit działa.
- **Dowód SOC 2:** CC6.1, C1.1 [NZ].
- **Ryzyko redukowane:** WYM-38 Ś → N w części skrótów.

### E-36 — Odczyty i akcje operatora w dzienniku audytu

- **Cel:** każde wejście operatora w dane klienta i każda akcja operatora
  zostawiają wpis z tożsamością operatora, IP i UA.
- **Pokrywa:** WYM-35, WYM-47 (część), WYM-SOC-1; DOW-08 (L4, L5), SOC-11, MIN-05,
  INW-15, T-16, T-17; warunek przywrócenia deklaracji „kto i kiedy
  uzyskał dostęp” (E-01).
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** `app/admin/users/[userId]/page.tsx`, `app/admin/support/page.tsx`,
  `app/admin/audit/page.tsx`, `app/admin/ksef/[id]/page.tsx`;
  `lib/audit/log-system.ts:24` (`user_agent: 'inngest-job'` dla akcji
  operatora); strażnik `lib/auth/admin-guard.ts:13-53`. Funkcji
  `logAuditAdmin` z `05` WYM-35 nie ma na `3e5e00d` (grep 13.10) — nazwa
  robocza.
- **Warunki i zależności:** start od razu. Gałąź `claude/e36-dow08-audyt-operatora`.
- **Zmiany:** funkcja zapisu „admin.read” (operator, osoba lub firma,
  zakres widoku, IP, UA — bez kopiowania danych) wywoływana na wejściu
  w szczegóły; akcje z `app/admin/**` zapisują `user_id` operatora,
  IP i UA zamiast `inngest-job`; klasa retencji dla wpisów operatora
  (E-47).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/admin-odczyt-audyt.test.ts` (T-16):
  wejście na `/admin/users/[userId]`, `/admin/support`, `/admin/audit`
  zapisuje wpis — przed: **czerwony** (L4);
  `tests/unit/admin-akcje-tozsamosc.test.ts` (T-17): akcje z
  `app/admin/**` mają operatora, IP i UA — przed: **czerwony** (L5).
- **Fail-closed i ponowienie:** nieudany zapis odczytu nie blokuje widoku
  (inaczej awaria dziennika blokuje obsługę incydentu), ale zwiększa
  licznik i alarmuje (E-73).
- **Akceptacja:** testy zielone; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; wejście operatora na konto
  syntetyczne → wpis w dzienniku.
- **Dowód SOC 2:** CC6.1, CC7.2, C1.1 [NZ] — wpisy `admin.read`
  i miesięczny przegląd (E-69).
- **Ryzyko redukowane:** WYM-35 K1 W → Ś (przeglądy i upoważnienia —
  E-68, E-69).

### E-37 — Martwy kod z danymi osobowymi

- **Cel:** w repo nie ma nieużywanych ścieżek, które po przypadkowym
  podłączeniu wysyłałyby dane (obrazy Google, kontekst Sentry z e-mailem,
  formularz newslettera, pola profilujące).
- **Pokrywa:** WYM-31; MIN-12, INW-13.
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `next.config.ts:96` (`lh3.googleusercontent.com`
  w `remotePatterns`); `lib/observability/sentry-context.ts` (0 wywołań
  poza definicją — `09` § 0); moduły `ff-assets`/`FF_DASHBOARD_` bez
  importerów (`05` § 12.3 poz. 2); pola bez zasilania z `02` INW-13.
- **Warunki i zależności:** start od razu; usunięcie kolumn z bazy — tylko
  za zgodą właściciela, osobnym etapem. Gałąź `claude/e37-min12-martwy-kod`.
- **Zmiany:** usunięcie martwych modułów albo test-strażnik (wzór
  `tests/unit/flo-nieaktywne.test.ts`); usunięcie hosta z `remotePatterns`.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/martwy-kod-pii.test.ts`: brak
  `lh3.googleusercontent.com` w konfiguracji i brak modułów z listy —
  przed: **czerwony**.
- **Akceptacja:** test zielony; `pnpm build`; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Dowód SOC 2:** CC8.1 [NZ].
- **Ryzyko redukowane:** WYM-31 N.

### E-38 — Dane testowe i publiczne repo

- **Cel:** testy nie zawierają rzeczywistych identyfikatorów; publiczne
  repo nie zawiera danych infrastruktury ani wyników z produkcji.
- **Pokrywa:** WYM-37 (część), WYM-X-02, WYM-50; MIN-09, DOW-19, PRC-07 (część).
- **Typ / wielkość / fala:** kod + dokument repo · S · F4.
- **Zakres:** 10 numerów NIP z poprawną sumą kontrolną w testach (co
  najmniej jeden rzeczywistej spółki) i adresy e-mail w realnych
  domenach (`A1` MIN-09); plik wskazany w `A3` DOW-19; `AGENTS.md`
  (zasada „bez wyników z produkcji w PR, issue i plikach”).
- **Warunki i zależności:** start od razu; historia gita zostaje — ocena
  i ewentualne przepisanie historii osobno, tylko decyzją właściciela.
  Gałąź `claude/e38-min09-dane-testowe`.
- **Zmiany:** zamiana NIP na fikcyjny `1234567890` lub listę dozwolonych
  numerów testowych (`AGENTS.md`, „KSeF-specific”); e-maile w `*.test`,
  `*.invalid`, `example.*`; usunięcie pliku z DOW-19 z drzewa; zasada
  w `AGENTS.md`; skrypty `scripts/ops/` domyślnie zwracają agregaty.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/dane-testowe-straznik.test.ts`: skan
  `tests/` i `e2e/` — NIP z poprawną sumą spoza listy dozwolonych i e-mail
  spoza domen testowych = błąd — przed: **czerwony** (10 numerów).
- **Akceptacja:** test zielony w CI; kod na `main` przeczytany.
- **Wycofanie:** revert PR (niezalecane).
- **Po wdrożeniu:** bez wdrożenia aplikacji (testy i dokumenty).
- **Fail-closed i ponowienie:** nie dotyczy (strażnik w CI blokuje PR z niedozwolonymi danymi — wyjście: lista dozwolonych numerów testowych).
- **Dowód SOC 2:** CC8.1, C1.1 [NZ].
- **Ryzyko redukowane:** WYM-X-02 Ś → N dla nowych zmian (historia — osobno).

### E-39 — Przycinanie `last_webhook_payload` Stripe

- **Cel:** pełne obiekty faktur Stripe nie leżą w bazie bez terminu.
- **Pokrywa:** WYM-06, WYM-71; INW-12, RT-STRIPE.
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `lib/stripe/event-mapping.ts:446` (zapis całego obiektu);
  **odczyt** w `lib/jobs/runners/self-invoice-payment.ts:71, 86, 158`
  (migawka do faktury własnej FF) — przycinanie nie może zepsuć
  fakturowania własnego; istniejąca reguła 90 dni dla
  `stripe_webhook_events.payload` (`09` § 10).
- **Warunki i zależności:** start od razu (reguła 90 dni istnieje
  w kodzie; okres potwierdza D-05). Gałąź `claude/e39-inw12-stripe-payload`.
- **Zmiany:** zapis tylko pól potrzebnych do faktury własnej albo
  przycinanie po wystawieniu faktury własnej i po 90 dniach.
- **Migracje:** brak (przycinanie istniejących wierszy przez job — tryb
  „na sucho” w pierwszym przebiegu; licznik przed).
- **Test czerwony:** `tests/unit/stripe-payload-minimalny.test.ts`:
  zapis zdarzenia faktury Stripe nie zawiera pól spoza listy (adres,
  e-mail klienta…), a `self-invoice-payment` dalej tworzy fakturę — przed:
  **czerwony**.
- **Fail-closed i ponowienie:** job przycinania z warunkiem w `UPDATE`
  (tylko wiersze z wystawioną fakturą i starsze niż okres) — ponowienie
  bez skutków.
- **Akceptacja:** test zielony; faktura własna testowa poprawna; kod na
  `main` przeczytany.
- **Wycofanie:** revert PR (przycięte dane nie wracają — dlatego najpierw
  tryb „na sucho”).
- **Po wdrożeniu:** worker, potem web; licznik wierszy przed i po.
- **Dowód SOC 2:** P4.2 [NZ].
- **Ryzyko redukowane:** WYM-06 N.

### E-40 — Rejestr retencji w kodzie

- **Cel:** jedno źródło prawdy o retencji: każda tabela, magazyn
  i dostawca ma wpis (okres, zdarzenie początkowe, podstawa, wykonawca,
  dowód działania) — wejście dla jobów, polityki i wyszukiwania osoby.
- **Pokrywa:** WYM-71, WYM-08, WYM-03 (inwentarz jako dane), WYM-SOC-5; T-08,
  `09` § 10, `02` § 2–3.
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** nowy moduł danych (np. `lib/retention/registry.ts`);
  lista tabel z danymi osobowymi z `02`; istniejące wykonawcy:
  `lib/jobs/runners/cleanup-audit-logs.ts:19`, `lib/retention/invoice-files.ts`,
  `retention-delete`, przycinanie Stripe, reguły pg-boss.
- **Warunki i zależności:** start od razu z wpisami stanu obecnego (fakty
  z kodu, status „do decyzji” tam, gdzie D-05 jeszcze nie zapadła);
  decyzje D-05 wypełniają wpisy później. Gałąź `claude/e40-ret-rejestr-retencji`.
- **Zmiany:** rejestr jako dane typowane; test pokrycia; generowanie
  tabeli do polityki (E-63) i listy magazynów do E-22.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/retencja-rejestr.test.ts` (T-08,
  statyczny): każda tabela z migracji z kolumną wskazującą osobę ma wpis
  rejestru; nowa tabela bez wpisu = błąd — przed: **czerwony** (rejestru
  nie ma).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** test zielony; wpisy „do decyzji” mają odsyłacz do
  pozycji RT-… z `09` § 10; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** bez wdrożenia (moduł danych); wdrożenie z najbliższym
  wydaniem.
- **Dowód SOC 2:** P4.2, C1.2 [NZ] — rejestr jako opis kontroli.
- **Ryzyko redukowane:** WYM-71 — warunek dla wszystkich etapów retencji.

### E-41 — Rotacja logów Docker i retencja logów usług

- **Cel:** logi aplikacji i workera na hoście nie rosną bez końca; okres
  przechowania logów usług Supabase jest znany i ustawiony.
- **Pokrywa:** WYM-36, WYM-71; RT-LOGI, N-INW-06, N-A2-12 (część).
- **Typ / wielkość / fala:** konfiguracja · S · F4.
- **Zakres:** konfiguracja logów kontenerów na `app-1` (Coolify albo
  ustawienia demona Docker) — 7 dni, 10 MiB × 5 plików ([PR225]
  `data-policy.md`, decyzja przyjęta, niewdrożona); baza `_supabase`
  (logi usług przez Vector → Logflare, ok. 676 MB [PR225 @a72b567]) —
  okres ustawiany po odczycie D-06.
- **Warunki i zależności:** start od razu dla Dockera; `_supabase` — po
  D-06. Zmiana wyłącznie przez sesję lokalną z dostępem.
- **Zmiany:** ustawienia rotacji zapisane jako kod lub skrypt
  `scripts/ops/` (idempotentny) i opisane w runbooku.
- **Migracje:** brak.
- **Test czerwony:** ręczny dowód: odczyt konfiguracji logów kontenerów
  przed zmianą — brak limitu (N-INW-06, stan nieznany; jeśli limit już
  jest — etap zamyka się zapisem).
- **Fail-closed i ponowienie:** skrypt idempotentny.
- **Akceptacja:** odczyt po zmianie pokazuje limity; wpis w rejestrze
  retencji (E-40).
- **Wycofanie:** przywrócenie poprzedniej konfiguracji (zapisanej
  w protokole).
- **Po wdrożeniu:** kontenery wstały z nową konfiguracją
  (`kontrola-faktur-ksef.sh`).
- **Dowód SOC 2:** CC7.2, P4.2 [NZ] — protokół z datą.
- **Ryzyko redukowane:** WYM-36, WYM-71 — logi z IP i błędami bez terminu (Ś → N).

### E-53 — Kopie zaszyfrowane poza hostem; szyfrowanie lokalnych zrzutów

- **Cel:** utrata jednego hosta nie oznacza utraty danych; kopie są
  szyfrowane i obejmują obie bazy, oba magazyny plików i sekrety.
- **Pokrywa:** WYM-51, WYM-50 (część), WYM-SOC-2 (część), WYM-72 (okres rotacji), WYM-SOC-4, WYM-09; SOC-21, SOC-30
  (część), PRC-14, DOW-22 (część), INW-04 (część szyfrowania).
- **Typ / wielkość / fala:** konfiguracja + skrypty · L · F4 (tor równoległy).
- **Zakres:** `scripts/hetzner/db-backup.sh:62-89` (zrzut lokalny
  nieszyfrowany), `:77` (tylko baza `postgres`, bez `_supabase`); MinIO
  aplikacji bez kopii; sekrety Coolify bez kopii; decyzja 07.10
  (niewdrożona): restic na Storage Box w HEL1, 7 dziennych / 4 tygodniowe /
  12 miesięcznych [PR225]; praca w toku w PR #225 (F0-G09 FAIL [PR225 @a72b567]).
- **Warunki i zależności:** start od razu — **nie dublować PR #225**: ten
  etap to dokończenie i odbiór F0-G09, z dopisanymi warunkami
  prywatności: szyfrowanie po stronie klienta, klucz poza hostami
  źródłowymi i poza celem kopii, okres rotacji wpisany do rejestru
  retencji (E-40) i opisany w polityce (E-63) — 12 miesięcy kopii
  miesięcznych wydłuża czas „powrotu” usuniętych danych (WYM-72,
  Q-ZR-13, `A2` pyt. 6).
- **Zmiany:** kopie obu baz (`postgres`, `_supabase`), obu MinIO
  i sekretów; szyfrowanie lokalnych zrzutów; sygnał Healthchecks;
  listing kopii z sumami (skrypt `scripts/ops/`).
- **Migracje:** brak.
- **Test czerwony:** ręczny dowód: F0-G09 = FAIL [PR225 @a72b567]; listing
  celu kopii — brak (przed). Po: listing z datą i sumami; próba odczytu
  zrzutu lokalnego bez klucza — nieudana.
- **Fail-closed i ponowienie:** nieudana kopia → alarm (Healthchecks)
  i wpis w `backup_log`; skrypt idempotentny (restic).
- **Akceptacja:** 7 kolejnych dni udanych kopii; zrzut lokalny
  zaszyfrowany; F0-G09 PASS w PR #225; wpis w rejestrze retencji.
- **Wycofanie:** wyłączenie zadania kopii (stare kopie zostają do rotacji).
- **Po wdrożeniu:** `kontrola-faktur-ksef.sh`; listing kopii; potem
  E-54 (próba odtworzenia).
- **Dowód SOC 2:** A1.2, CC9.1, C1.1 [NZ] — historia przebiegów, listing
  z sumami (SOC-21).
- **Ryzyko redukowane:** WYM-51 obecne W → Ś (do udanej próby odtworzenia —
  E-54); WYM-50 — kopie nieszyfrowane (Ś → N).

## 5. Etapy czekające na decyzję właściciela lub review prawne

Karty niżej są gotowe do wykonania, gdy warunek z pola „Warunki
i zależności” zostanie spełniony. Do tego czasu nie zaczynać kodu —
wynik zależy od decyzji (np. okres, wartość domyślna, wariant usuwania).

### E-17 — Przełącznik organizacji „Automatyczna kategoryzacja AI”

- **Cel:** klient decyduje, czy dokumenty kosztowe jego firmy trafiają
  automatycznie do modelu językowego.
- **Pokrywa:** WYM-42, WYM-62, WYM-32; PRC-06, AI-01, ZGD-07.
- **Typ / wielkość / fala:** kod + migracja · M · F2.
- **Zakres:** `lib/jobs/runners/auto-categorize-inbox.ts` (wywołanie bez
  działania użytkownika), `lib/categorization/ai-classifier.ts`;
  ustawienia organizacji (UI); filtr firm wyłączonych z E-02.
- **Warunki i zależności:** **czeka** na D-12 (a) — wartość domyślna dla
  nowych i istniejących firm (`04` pyt. 1, `02` pyt. 2); postanowienie
  w umowie powierzenia (E-62) jako polecenie klienta. Gałąź
  `claude/e17-prc06-przelacznik-ai`.
- **Zmiany:** kolumna ustawienia firmy; job kategoryzacji sprawdza
  ustawienie przed wywołaniem modelu; opis w ustawieniach i w umowie.
- **Migracje:** `00NNN_tenant_ai_categorization` — `ADD COLUMN … NOT NULL
  DEFAULT <D-12>`; addytywna, **przed wdrożeniem**; istniejące firmy
  dostają wartość domyślną bez osobnego `UPDATE` — jeśli D-12 wybierze
  „wyłączone”, zmienia to zachowanie dla istniejących firm (komunikat
  w produkcie).
- **Test czerwony:** `tests/unit/ai-kategoryzacja-przelacznik.test.ts`
  (runner; mock HTTP modelu i bazy): firma z wyłączonym ustawieniem →
  0 wywołań modelu — przed: **czerwony** (brak ustawienia).
- **Fail-closed i ponowienie:** nieudany odczyt ustawienia → bez wywołania
  modelu, koszt z komunikatem „Kategoria do uzupełnienia ręcznie”;
  ponowienie joba per koszt — idempotentne (warunek „bez kategorii”).
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR; kolumna zostaje (bez szkody).
- **Po wdrożeniu:** migracja przed; worker, potem web; firma syntetyczna
  z wyłączonym ustawieniem — brak wywołań (licznik budżetu AI
  `lib/ai/tenant-ai-budget.ts`).
- **Dowód SOC 2:** P2.1, P6.x [NZ].
- **Ryzyko redukowane:** WYM-62 K1 W → Ś (transfer i DPIA — E-60, E-61).

### E-20 — Usunięcie konta: pełny zakres w bazie

- **Cel:** po usunięciu konta w bazie nie zostają dane osoby poza
  wyjątkami z udokumentowaną podstawą.
- **Pokrywa:** WYM-24, WYM-38; PRA-02, AI-03, RET-12, MIN-11, T-03
  (pełny), `A3` L10.
- **Typ / wielkość / fala:** kod (+ migracja funkcji) · M · F3.
- **Zakres:** `lib/gdpr/deletion.ts:163-200`; tabele: `support_conversations`,
  `support_messages` (zostają z `user_id = NULL` — AI-03),
  `newsletter_subscribers`, `email_bounces`, `email_preferences`,
  `organization_invitations` i `organization_join_requests` (po e-mailu),
  `push_subscriptions`, `admin_user_notes`, `gdpr_deletion_requests`
  (e-mail, IP, UA), `audit_logs.details_json` (L10); funkcja
  `anonymize_user_audit_logs`.
- **Warunki i zależności:** **czeka** na E-04 (ten sam plik), D-05
  (RT-CZAT, RT-MAIL, RT-DSAR — czy rozmowy usuwać z kontem, jak długo
  trzymać ślad żądania) i P-12 (wolny tekst w `details_json`). Gałąź
  `claude/e20-pra02-zakres-usuniecia`.
- **Zmiany:** kroki przed `deleteUser`: usunięcie albo anonimizacja treści
  czatu osoby; usunięcie wierszy po e-mailu (newsletter, odbicia,
  zaproszenia otrzymane); subskrypcje push; notatki operatora wg D-05;
  po wykonaniu — e-mail w żądaniu zastąpiony skrótem z kluczem (E-35),
  IP/UA usuwane po okresie z D-05; czyszczenie `details_json` wpisów
  osoby wg P-12.
- **Migracje:** zmiana funkcji `anonymize_user_audit_logs` (czyszczenie
  `details_json`) — ta sama sygnatura, **przed wdrożeniem**; dotyka
  istniejących wpisów dopiero przy wywołaniu dla konkretnej osoby.
- **Test czerwony:** `tests/rls-rodo-usuniecie-konta.test.ts` (T-03,
  pełny): po `executeGdprRequest` zero wierszy z `user_id` lub e-mailem
  osoby w tabelach z listy; wpisy audytu bez wolnego tekstu osoby (albo
  wyjątek z decyzją); faktury zostają; status `executed` — przed:
  **czerwony** (czat, listy e-mail, `details_json`).
- **Fail-closed i ponowienie:** kolejność: dane zależne → `deleteUser` →
  skrót e-maila; każdy krok to `DELETE`/`UPDATE` z warunkiem — ponowienie
  od zera nie ma skutków na już usuniętych wierszach; błąd kroku → status
  `failed` z nazwą kroku, widok w `/admin` i runbook (E-66).
- **Akceptacja:** test zielony; lista tabel w teście = rejestr retencji
  (E-40); kod na `main` przeczytany.
- **Wycofanie:** revert PR (usunięte dane nie wracają — dlatego test na
  bazie przed scaleniem).
- **Po wdrożeniu:** migracja przed; worker, potem web; usunięcie konta
  syntetycznego z rozmową, zaproszeniem i subskrypcją push.
- **Dowód SOC 2:** P4.3, C1.2 [NZ].
- **Ryzyko redukowane:** WYM-24 Ś → N w bazie.

### E-21 — Usunięcie konta: dane u dostawców

- **Cel:** usunięcie konta obejmuje dane u dostawców albo udokumentowany
  krok ręczny z terminem.
- **Pokrywa:** WYM-26, WYM-24; RET-10, DOW-18, P-07.
- **Typ / wielkość / fala:** kod + procedura · M · F3.
- **Zakres:** PostHog (osoba po `distinct_id` = UUID; przy usunięciu
  organizacji — profil i zdarzenia z `distinct_id = tenantId` i grupa
  `tenant` — `A2` RET-10 [R3]); Sentry (wyszukanie po `tenant_id` albo
  wygaśnięcie z retencją ≤ 90 dni jako uzasadnienie); Stripe (klient —
  anonimizacja albo zachowanie wg P-07); Resend (kontakty, jeśli są — D-03);
  Slack (E-16 dla nowych alertów; retencja kanału — D-05).
- **Warunki i zależności:** **czeka** na E-20, D-03 (ustawienia
  i dostępne API), P-07 (Stripe). Gałąź `claude/e21-ret10-usuniecie-dostawcy`.
- **Zmiany:** job „usunięcie u dostawców” z krokiem na dostawcę; kroki
  bez API — zadanie operatora w `/admin` z terminem; wpis w rejestrze
  żądań (E-22).
- **Migracje:** brak (albo tabela zadań operatora — addytywna, przed).
- **Test czerwony:** `tests/unit/rodo-usuniecie-dostawcy.test.ts` (runner;
  mock HTTP dostawców): po usunięciu konta wywołanie usunięcia osoby
  w PostHog i aktualizacji klienta w Stripe wg decyzji — przed:
  **czerwony** (brak wywołań).
- **Fail-closed i ponowienie:** klucz idempotencji `request_id + dostawca`;
  błąd dostawcy → ponowienia z odstępem; po wyczerpaniu — zadanie
  operatora z terminem (miesiąc od żądania) i runbook kroku ręcznego.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; usunięcie konta syntetycznego →
  osoba usunięta w projekcie PostHog (odczyt API).
- **Dowód SOC 2:** P4.3, P6.x [NZ].
- **Ryzyko redukowane:** WYM-26 K1 Ś → N.

### E-26 — Ograniczenie przetwarzania

- **Cel:** dane osoby (konto albo kontrahent) można oznaczyć, a joby je
  pomijają do zniesienia ograniczenia.
- **Pokrywa:** WYM-25; PRA-06.
- **Typ / wielkość / fala:** kod + migracja · M · F3.
- **Zakres:** przełączniki istniejące — wyłączenie przypomnień dla
  kontrahenta (`app/actions/reminders.ts:171, 245`), dezaktywacja konta,
  wyłączenie analityki; joby przypomnień, AI, FLO.
- **Warunki i zależności:** **czeka** na D-12 (b) — zakres (wariant
  minimalny: runbook z istniejącymi przełącznikami; wariant pełny: flaga
  `processing_restricted`) i na rozstrzygnięcie, czy przy roli FF-P to
  zadanie FaktFlow, czy klienta (`A2` PRA-06). Gałąź `claude/e26-pra06-ograniczenie`.
- **Zmiany:** wariant pełny — flaga na kontrahencie i koncie, filtr w jobach,
  informacja dla osoby przed zniesieniem (art. 18 ust. 3 [NZ]).
- **Migracje:** `ADD COLUMN … DEFAULT false` — addytywna, **przed
  wdrożeniem**; bez zmiany wierszy.
- **Test czerwony:** `tests/rls-ograniczenie-przetwarzania.test.ts`:
  kontrahent z flagą → job przypomnień go pomija — przed: **czerwony**.
- **Fail-closed i ponowienie:** filtr tylko czyta; ponowienie bez skutków.
- **Akceptacja:** test zielony; runbook; kod na `main` przeczytany.
- **Wycofanie:** revert PR; kolumna zostaje.
- **Po wdrożeniu:** migracja przed; worker, potem web.
- **Dowód SOC 2:** P5.x [NZ].
- **Ryzyko redukowane:** WYM-25 K1 Ś → N.

### E-27 — Analityka serwerowa spójna z wyborem i sprzeciwem

- **Cel:** zdarzenia serwerowe nie budują profilu osoby, która odmówiła,
  albo nie budują profili wcale.
- **Pokrywa:** WYM-28, WYM-32, WYM-05; MIN-08 (zdarzenia serwerowe), ZG-13, T-11, PRA-07.
- **Typ / wielkość / fala:** kod · S · F3.
- **Zakres:** `trackServer` i `components/analytics/analytics-identify.tsx`
  (identyfikacja po zalogowaniu); LIA L-03 w `09` § 4 (negatywna
  w obecnym kształcie).
- **Warunki i zależności:** **czeka** na wariant z D-12 (g) po LIA L-03
  (E-59): `$process_person_profile: false` albo honorowanie odmowy
  zapisanej przy koncie. Gałąź `claude/e27-min08-analityka-serwer`.
- **Zmiany:** wg wariantu; dodatkowo zdarzenia serwerowe bez pól dokumentu
  (`05` WYM-05).
- **Migracje:** brak (wariant „odmowa przy koncie” — kolumna addytywna, przed).
- **Test czerwony:** `tests/unit/analityka-serwer-odmowa.test.ts` (T-11):
  po odmowie brak zdarzeń z UUID osoby (albo żadne zdarzenie nie tworzy
  profilu) — przed: **czerwony**.
- **Fail-closed i ponowienie:** brak odczytu decyzji → zdarzenie bez profilu.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web.
- **Dowód SOC 2:** P2.1, P3.x [NZ].
- **Ryzyko redukowane:** WYM-28 K1 Ś → N.

### E-42 — Ciasteczko sesji: okres i dostępność dla skryptu

- **Cel:** okres ciasteczka sesji jest świadomie ustawiony i zgodny
  z polityką.
- **Pokrywa:** WYM-32, WYM-63; ZGD-11, RT-SESJA.
- **Typ / wielkość / fala:** kod · S · F4.
- **Zakres:** `cookieOptions` w `lib/supabase/client.ts`, `server.ts`,
  `middleware.ts` (domyślne `@supabase/ssr`: 400 dni, `httpOnly: false`);
  `ksef.active_org` (30 dni).
- **Warunki i zależności:** **czeka** na D-05 (RT-SESJA). `httpOnly` —
  ocenić w PR, czy klient przeglądarkowy Supabase wymaga odczytu
  ciasteczka (jeśli tak — zostawić i opisać w polityce). Gałąź
  `claude/e42-zgd11-sesja`.
- **Zmiany:** `maxAge` z decyzji; spójny opis w polityce (E-63).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/sesja-ciasteczko.test.ts`: `maxAge`
  ciasteczka sesji = wartość z decyzji — przed: **czerwony** (domyślne).
- **Akceptacja:** test zielony; logowanie i odświeżanie sesji działają;
  kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; logowanie kontem syntetycznym,
  odczyt atrybutów ciasteczka.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Dowód SOC 2:** CC6.1, P3.x [NZ].
- **Ryzyko redukowane:** WYM-63 N.

### E-43 — Link księgowej i paczki: krótszy termin, dostęp przez portal

- **Cel:** linki z pełnymi danymi faktur nie działają długo i nie trafiają
  do niekontrolowanych odbiorców.
- **Pokrywa:** WYM-33, WYM-32; MIN-06, INW-19, RET-07, SOC-30 (część), RT-LINK.
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** link portalu księgowej (domyślnie 90 dni, do 365 — `A1`
  MIN-06), `lib/accountant/*`; paczki księgowe e-mailem z podpisanym
  adresem ważnym 7 dni (także do adresów CC — INW-19); `export_jobs.emailed_to`.
- **Warunki i zależności:** **czeka** na D-12 (f) — domyślny termin
  (propozycja `A1`: 30 dni — I). Gałąź `claude/e43-min06-linki-ksiegowej`.
- **Zmiany:** krótszy domyślny termin z przypomnieniem o przedłużeniu;
  powiązanie linku z adresem księgowej (kod jednorazowy); paczki przez
  portal z uwierzytelnieniem zamiast podpisanego adresu S3 w e-mailu
  (albo TTL ≤ 24 h z ponownym wygenerowaniem); job usuwający pliki po
  `expires_at`.
- **Migracje:** ewentualnie kolumna na kod jednorazowy — addytywna, przed;
  istniejące linki zachowują swój termin (bez `UPDATE`).
- **Test czerwony:** `tests/unit/ksiegowa-link-termin.test.ts`: nowy link
  ma termin z decyzji; e-mail paczki nie zawiera podpisanego adresu S3 —
  przed: **czerwony**.
- **Fail-closed i ponowienie:** wygasły link → komunikat „Link wygasł —
  poproś firmę o nowy” z nazwą firmy; job usuwania plików z warunkiem
  `expires_at < now()` — ponowienie bez skutków.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; paczka syntetyczna.
- **Dowód SOC 2:** C1.1, CC6.1 [NZ].
- **Ryzyko redukowane:** WYM-33 K1 W → Ś.

### E-44 — Retencja danych pomocniczych w bazie

- **Cel:** zaproszenia, subskrypcje push, logi zdrowia KSeF, listy e-mail,
  newsletter i dostępy księgowej mają okres i wykonawcę.
- **Pokrywa:** WYM-08; INW-01 (część), RET-12 (część); RT-ZAPR, RT-PUSH,
  RT-RUNLOG, RT-MAIL, RT-NEWS, RT-KSIEG.
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** tabele `organization_invitations`, `organization_join_requests`,
  `push_subscriptions` (`lib/push/sender.ts`), `ksef_health_log`,
  `email_bounces`, `email_preferences`, `newsletter_subscribers`,
  `accountant_access`; rejestr E-40.
- **Warunki i zależności:** **czeka** na D-05 (a) i E-40. Gałąź
  `claude/e44-inw01-retencja-pomocnicza`.
- **Zmiany:** jeden cron retencji czytający rejestr E-40; pierwszy
  przebieg w trybie „na sucho” (liczniki); potem usuwanie.
- **Migracje:** brak (usuwanie przez job; `DELETE` na danych wymaga zgody
  właściciela — zgoda = decyzja D-05 zapisana dla każdej kategorii).
- **Test czerwony:** `tests/rls-retencja-pomocnicza.test.ts` (na bazie):
  wiersze starsze niż okres usunięte, młodsze zostają, inne firmy
  nietknięte — przed: **czerwony** (brak wykonawcy).
- **Fail-closed i ponowienie:** `DELETE … WHERE created_at < granica`
  w paczkach — ponowienie od zera bez skutków na usuniętych; tryb „na
  sucho” jako przełącznik.
- **Akceptacja:** test zielony; test `jobs-foundation.test.ts:186`
  (liczba cronów) zmieniony świadomie z komentarzem; kod na `main`
  przeczytany.
- **Wycofanie:** wyłączenie crona (flaga) albo revert; usunięte dane nie
  wracają — dlatego tryb „na sucho”.
- **Po wdrożeniu:** worker, potem web; log workera z nową liczbą cronów;
  raport liczników pierwszego przebiegu.
- **Dowód SOC 2:** P4.2, CC7.2 [NZ] — liczniki przebiegów (E-75).
- **Ryzyko redukowane:** WYM-08 Ś → N dla tych kategorii.

### E-45 — Koniec życia plików S3 poza fakturami

- **Cel:** eksporty, importy, zdjęcia i pliki OCR nie leżą w magazynie bez
  końca; pliki osierocone są wykrywane.
- **Pokrywa:** WYM-08, WYM-71; RET-06, INW-03, AI-02 (plik OCR), T-06
  (część plików), RT-EKSP.
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** `lib/storage/r2.ts`; komentarz „pliki usuwane po 90 dniach”
  bez kodu (`00024…sql:211`); importy „tymczasowe”; zdjęcie kosztu
  zostaje po usunięciu kosztu (`A2` RET-05, RET-06).
- **Warunki i zależności:** **czeka** na D-05 (RT-EKSP; okres dla zdjęć
  kosztów zależy od RT-KOSZT — review) i E-40. Gałąź
  `claude/e45-ret06-pliki-s3`.
- **Zmiany:** usuwanie pliku razem z wierszem (outbox: plik kasowany po
  zatwierdzeniu usunięcia wiersza); cron „inwentarz prefiksów vs wiersze”
  z alarmem dla sierot; okresy z rejestru.
- **Migracje:** ewentualnie tabela outbox plików — addytywna, przed.
- **Test czerwony:** `tests/unit/rodo-usuniecie-pliki.test.ts` (T-06,
  magazyn w pamięci): usunięcie kosztu usuwa zdjęcie; eksport starszy niż
  okres usunięty; sierota wykryta — przed: **czerwony** (`lib/gdpr`
  i joby nie odwołują się do magazynu).
- **Fail-closed i ponowienie:** plik usuwany dopiero po zatwierdzeniu
  wiersza; ponowienie kasowania nieistniejącego pliku = sukces.
- **Akceptacja:** test zielony; liczba cronów zmieniona świadomie; kod na
  `main` przeczytany.
- **Wycofanie:** wyłączenie crona; tryb „na sucho” w pierwszym przebiegu.
- **Po wdrożeniu:** worker, potem web; raport sierot (liczba).
- **Dowód SOC 2:** C1.2, P4.2 [NZ].
- **Ryzyko redukowane:** WYM-08 K1 W → Ś (faktury — E-51).

### E-46 — Retencja treści swobodnych (czat, FLO, notatki operatora)

- **Cel:** treści pisane swobodnie (mogą zawierać dowolne dane) mają okres
  przechowania.
- **Pokrywa:** WYM-08; AI-03, INW-10, RT-CZAT, RT-FLO, RT-ADMIN.
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** `support_conversations`, `support_messages`; `flo_approvals`
  (pełne wiadomości z załącznikami w base64), `flo_proposals`,
  `flo_shadow`, `flo_decisions`; `admin_user_notes` (tylko `archived_at`).
- **Warunki i zależności:** **czeka** na D-05 (RT-CZAT, RT-FLO) i review
  dla notatek operatora (`A2` pyt. 5) oraz rejestru żądań (`A2` pyt. 3).
  Gałąź `claude/e46-ai03-retencja-tresci`.
- **Zmiany:** cron retencji (wspólny z E-44, jeśli już jest); ostrzeżenie
  przy polu czatu (E-12); opcjonalnie maskowanie NIP/IBAN/PESEL przed
  zapisem (wzorce z E-15).
- **Migracje:** brak.
- **Test czerwony:** `tests/rls-retencja-tresci.test.ts`: rozmowa
  zamknięta dawniej niż okres usunięta — przed: **czerwony**.
- **Fail-closed i ponowienie:** jak E-44.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** wyłączenie reguły.
- **Po wdrożeniu:** worker, potem web; liczniki pierwszego przebiegu.
- **Dowód SOC 2:** P4.2 [NZ].
- **Ryzyko redukowane:** WYM-08 K1 W → Ś.

### E-47 — Klasy retencji dziennika audytu

- **Cel:** wpisy audytu mają okres zależny od klasy (dostęp, operator,
  finanse i KSeF, RODO, wdrożenia), a czyszczenie nie usuwa dowodów
  potrzebnych dłużej.
- **Pokrywa:** WYM-71, WYM-74; RET-03, DOW-07, SOC-17 (część), SOC-04
  (wpisy `ops.*`), T-07, P-05, `05` § 12.3 poz. 18.
- **Typ / wielkość / fala:** kod + migracja · M · F4.
- **Zakres:** `cleanup_old_audit_logs` (`00052…sql:53-74`),
  `lib/jobs/runners/cleanup-audit-logs.ts:19` (12 mies. dla wszystkiego);
  sprzeczne deklaracje (komentarz tabeli „10 lat” `00001…sql:174`,
  ADR 0006, [PR225] 13 mies./10 lat); wpisy `ops.deploy.*` z bramki
  `/wdroz` (`00100:167-185`) — R4: znikają po 12 mies.
- **Warunki i zależności:** **czeka** na D-05 (RT-AUD) i P-05. Do decyzji
  — bez zmian (czyszczenie co miesiąc trwa; zauważyć termin 1. dnia
  miesiąca). Gałąź `claude/e47-ret03-klasy-audytu`.
- **Zmiany:** klasy w rejestrze E-40; funkcja czyszcząca usuwa według
  klasy; wpisy `gdpr.*` przeniesione do rejestru żądań (E-22) przed
  czyszczeniem; dla klas długich — pseudonimizacja zamiast usuwania.
- **Migracje:** zastąpienie funkcji `cleanup_old_audit_logs` (ta sama
  sygnatura albo nowa z zachowaniem starej) — **przed wdrożeniem**; nie
  zmienia wierszy przy wgraniu.
- **Test czerwony:** `tests/rls-retencja-audytu.test.ts` (T-07): po
  przebiegu wpisy dostępu starsze niż okres usunięte, finansowe i `ops.*`
  zostają; bez flagi `app.allow_audit_purge` `DELETE` i `UPDATE`
  odrzucone także dla `service_role` — przed: **czerwony** dla części
  finansowej i `ops.*` (L2).
- **Fail-closed i ponowienie:** funkcja z warunkiem daty — ponowienie bez
  skutków; klasa nieznana → wpis zostaje (nie usuwać przy wątpliwości).
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** migracja odwrotna (poprzednia funkcja) w PR.
- **Po wdrożeniu:** migracja przed; worker, potem web; liczniki wpisów per
  klasa przed i po najbliższym przebiegu.
- **Dowód SOC 2:** CC7.2, CC8.1 (dowody wdrożeń przez okres badania) [NZ].
- **Ryzyko redukowane:** WYM-71 Ś → N dla audytu; utrata dowodów SOC 2 usunięta.

### E-48 — Payloady pg-boss z identyfikatorami; jawna retencja kolejek

- **Cel:** kolejka zadań nie przechowuje kopii obiektów faktur, NIP
  i e-maili; okresy przechowania zadań są zapisane w kodzie.
- **Pokrywa:** WYM-06, WYM-71; INW-08 (część), RET-08, RT-PGB.
- **Typ / wielkość / fala:** kod · L · F4.
- **Zakres:** `lib/jobs/events.ts` (schematy zdarzeń), `lib/jobs/enqueue.ts`,
  `lib/jobs/config.ts`; klucze współbieżności z NIP (np.
  `app/onboarding/magic-import/actions.ts:73-74`).
- **Warunki i zależności:** **czeka** na D-12 (d) — ocena wpływu na
  idempotencję KSeF (klucze `singletonKey`, porównania treści) i na plan
  „zero zgubionych faktur”. Gałąź `claude/e48-inw08-payloady-jobow`.
- **Zmiany:** identyfikatory zamiast obiektów; jawne `deleteAfterSeconds`
  i `retentionSeconds` z wpisem w rejestrze E-40.
- **Migracje:** brak (zmiana schematów zdarzeń; zgodność wsteczna dla
  zadań w kolejce w chwili wdrożenia — czytnik przyjmuje oba formaty
  przez okres retencji kolejki).
- **Test czerwony:** `tests/unit/jobs-payload-minimalny.test.ts`: schematy
  zdarzeń nie zawierają pól `nip`, `email`, obiektu faktury — przed:
  **czerwony**.
- **Fail-closed i ponowienie:** handler pobiera dane z bazy po
  identyfikatorze — ponowienie od zera czyta stan aktualny (opis w PR dla
  każdego kroku z efektem zewnętrznym).
- **Akceptacja:** test zielony; scenariusze KSeF TEST z PLAN-ZERO zielone;
  kod na `main` przeczytany.
- **Wycofanie:** revert PR (czytnik obu formatów pozwala wrócić bez utraty
  zadań).
- **Po wdrożeniu:** worker, potem web; `kontrola-faktur-ksef.sh`; liczba
  kolejek bez zmian.
- **Dowód SOC 2:** P3.x, PI1.3 [NZ].
- **Ryzyko redukowane:** WYM-06 Ś → N w kolejce.

### E-49 — PESEL: jedno miejsce, maskowanie, ochrona

- **Cel:** identyfikatory konsumentów są przechowywane raz, chronione
  i maskowane w listach.
- **Pokrywa:** WYM-X-03; INW-05, MIN-10 (PESEL), `02` pyt. 6.
- **Typ / wielkość / fala:** kod + migracja · L · F4.
- **Zakres:** trzy kopie w wierszu (`00012…sql:66-68`), XML, PDF,
  dziennik; widoczność dla każdego członka firmy (INW-05).
- **Warunki i zależności:** **czeka** na D-12 (e) i E-29. Gałąź
  `claude/e49-inw05-pesel`.
- **Zmiany:** jedna kolumna (albo szyfrowanie kolumnowe z kluczem
  w rejestrze kluczy), maskowanie w listach, pełny podgląd tylko w widoku
  faktury.
- **Migracje:** dwie: (1) **przed** — nowa kolumna i przepisanie danych
  (`UPDATE` istniejących wierszy — najpierw zapytanie licznikowe tym samym
  warunkiem); (2) **PO** — usunięcie starych kopii (`DROP COLUMN` —
  wyłącznie za zgodą właściciela).
- **Test czerwony:** `tests/rls-pesel-jedna-kopia.test.ts`: po zapisie
  faktury PESEL w jednej kolumnie; członek bez uprawnienia widzi maskę —
  przed: **czerwony**.
- **Fail-closed i ponowienie:** przepisanie w paczkach z warunkiem „nowa
  kolumna pusta” — ponowienie bez skutków; wyzwalacze zamrożenia faktur
  wysłanych do KSeF (`00119`, `00132`) — sprawdzić, czy `UPDATE` przejdzie
  (test na bazie przed wgraniem).
- **Akceptacja:** test zielony; XML FA(3) bez zmian (porównanie
  przed/po na fakturach syntetycznych); kod na `main` przeczytany.
- **Wycofanie:** do migracji PO — revert i nowa kolumna nieużywana; po
  migracji PO — tylko z kopii.
- **Po wdrożeniu:** migracja przed → worker → web → migracja PO.
- **Dowód SOC 2:** C1.1, P3.x [NZ].
- **Ryzyko redukowane:** WYM-X-03 K1 Ś → N.

### E-50 — Wykonawca usunięcia organizacji (`hard_delete_at`)

- **Cel:** po terminie dane organizacji są usuwane (albo zwracane
  i usuwane) zgodnie z umową, łącznie z plikami; wyjątki mają podstawę.
- **Pokrywa:** WYM-45, WYM-73, WYM-SOC-4; PRA-04 (docelowo), RET-04, INW-02, DOW-17,
  SOC-29, T-04, T-06.
- **Typ / wielkość / fala:** kod + migracja · L · F4.
- **Zakres:** zapisy `hard_delete_at` — `components/settings/account-actions.ts:62`,
  `app/admin/users/actions.ts:173` (przed E-03); brak czytelnika (grep
  `hard_delete_at -- lib` = 0); blokady kaskady: wyzwalacz audytu
  (`audit_logs.tenant_id`) i `b_guard_invoice_pending_content`
  (`00132…sql:63-73` — `DELETE` faktury wysłanej do KSeF odrzucany dla
  każdej roli, także `service_role`; R1, sprawdzone na schemacie
  syntetycznym).
- **Warunki i zależności:** **czeka** na Q-ZR-01 i `A2` pyt. 2 (czy FF
  przechowuje faktury klienta po zakończeniu umowy, czy zwraca i usuwa),
  D-12 (c) (los organizacji jedynego właściciela), decyzję projektową:
  ścieżka serwisowa w wyzwalaczu (funkcja `SECURITY DEFINER` z flagą
  transakcji) albo zerowanie danych osobowych zamiast `DELETE` (`A2`
  RET-02 [R3]); E-02 (wyłączenie) i E-25 (eksport przed odejściem).
  Gałąź `claude/e50-pra04-usuniecie-organizacji`.
- **Zmiany:** job czytający `hard_delete_at`: powiadomienie z linkiem do
  eksportu przed terminem; anulowanie subskrypcji; usunięcie danych
  (poza dokumentami z decyzji) i plików S3 (outbox po zatwierdzeniu
  wierszy); wpis audytu wykonania.
- **Migracje:** ścieżka serwisowa w wyzwalaczu albo funkcja zerowania —
  **przed wdrożeniem** (luźniejszy warunek tylko dla funkcji serwisowej;
  role klienckie bez zmian — sprawdzić istniejącymi `tests/rls-cykl-wyzwalacze.test.ts`);
  nie dotyka wierszy przy wgraniu.
- **Test czerwony:** `tests/rls-usuniecie-organizacji.test.ts` (T-04):
  firma z `hard_delete_at` w przeszłości → po przebiegu dane usunięte
  (poza wyjątkiem z decyzji), pliki usunięte (T-06), wpis audytu — przed:
  **czerwony** (brak wykonawcy; wyzwalacz odrzuca `DELETE`).
- **Fail-closed i ponowienie:** job per firma, kroki idempotentne
  (`DELETE` z warunkiem, pliki z outboxa); blokada (np. faktura w trakcie
  wysyłki do KSeF) → firma czeka z powodem w `/admin`, klient dostaje
  „Usunięcie organizacji <nazwa> wstrzymane: <dokument> czeka na
  potwierdzenie KSeF; dokończymy po potwierdzeniu”; operator: akcja
  „ponów” i runbook. Pierwszy przebieg w trybie „na sucho”.
- **Akceptacja:** testy zielone; liczniki trybu „na sucho” zatwierdzone
  przez właściciela przed włączeniem usuwania; kod na `main` przeczytany.
- **Wycofanie:** wyłączenie crona; migracja odwrotna wyzwalacza w PR;
  usunięte dane wracają tylko z kopii (wtedy E-55).
- **Po wdrożeniu:** migracja przed; worker, potem web; liczba cronów
  zmieniona świadomie; raport trybu „na sucho”.
- **Dowód SOC 2:** C1.2, CC6.5, P4.3 [NZ] — przebiegi usuwania (SOC-29).
- **Ryzyko redukowane:** WYM-45 Ś → N; WYM-73 K1 W → Ś.

### E-51 — Retencja faktur i kosztów

- **Cel:** termin usunięcia faktury i dowodu kosztowego wynika z reguły
  przyjętej po review, jest liczony deterministycznie i daje się
  wykonać; pliki nie znikają przed wierszem.
- **Pokrywa:** WYM-68, WYM-69, WYM-73, WYM-70 (faktury własne FF), WYM-SOC-4; RET-01,
  RET-02, RET-05, INW-18, T-05; RT-FAKT, RT-FAKT-FF, RT-KOSZT.
- **Typ / wielkość / fala:** kod + migracja · L · F4.
- **Zakres:** `lib/retention/invoice-files.ts`, `retention-delete`
  (`lib/jobs/runners/retention-delete.ts:29-36`), archiwizacja Glacier
  (`lib/storage/glacier.ts:8-31`; termin = dzień archiwizacji + 8 lat;
  bez zmiennych AWS nic nie dostaje terminu), `tenants.retention_years`;
  wyzwalacz `00132…sql:63-73`; `00079…sql:73-84` (faktury własne FF).
- **Warunki i zależności:** **czeka** na Q-ZR-01, Q-ZR-02, `A2` pyt. 1
  i 10 (okres, początek biegu, czy usuwać wiersz faktury z KSeF czy
  zerować dane osobowe), N-ZR-06; D-06 (N-A2-04: ile faktur ma termin);
  ścieżka serwisowa wspólna z E-50. Gałąź `claude/e51-ret01-retencja-faktur`.
- **Zmiany:** `scheduled_deletion_at` liczone przy wystawieniu/akceptacji
  z reguły „koniec roku + N” (N z review; dla FF-P — z umowy); wspólny
  termin dla łańcucha (korekta i oryginał, faktura przychodząca i koszt);
  usuwanie fakturą po fakturze w transakcji z outboxem plików; koszty
  i KPiR tym samym mechanizmem; archiwizacja niezależna od terminu.
- **Migracje:** (1) **przed** — funkcja liczenia terminu; (2) przeliczenie
  `scheduled_deletion_at` dla istniejących faktur — `UPDATE` (najpierw
  zapytanie licznikowe; uwaga na wyzwalacze zamrożenia — test na bazie).
- **Test czerwony:** `tests/rls-retencja-faktur-wyzwalacz.test.ts` (T-05):
  faktura wysłana do KSeF po terminie → przebieg kończy się zgodnie
  z regułą (usunięcie albo jawny stan „zatrzymana” z komunikatem), bez
  cichego błędu; pliki usunięte dopiero po wierszu; daty graniczne
  31.12/1.01 — przed: **czerwony** (wyzwalacz odrzuca `DELETE`, pliki
  znikają wcześniej — `A2` RET-02).
- **Fail-closed i ponowienie:** faktura zablokowana → stan „zatrzymana”
  z powodem, alarm operatora, klient widzi „Dokument <numer> nie został
  usunięty: <powód>”; ponowienie po outboxie — pliki kasowane raz.
- **Akceptacja:** testy zielone; raport „na sucho” zaakceptowany;
  scenariusze KSeF TEST zielone; kod na `main` przeczytany.
- **Wycofanie:** wyłączenie usuwania (flaga); migracja odwrotna funkcji.
- **Po wdrożeniu:** migracje przed; worker, potem web; raport liczników.
- **Dowód SOC 2:** C1.2, PI1.5 (przechowywanie wyjść) [NZ].
- **Ryzyko redukowane:** WYM-68 K1 W → N; WYM-73 — trzecia ścieżka.

### E-52 — Konta nieaktywne po końcu subskrypcji

- **Cel:** dane konta po zakończeniu umowy nie są przechowywane bez
  terminu albo polityka mówi wprost, jak jest.
- **Pokrywa:** WYM-70; RET-13, RT-KONTO.
- **Typ / wielkość / fala:** kod · M · F4.
- **Zakres:** subskrypcje (`subscriptions`), konta i firmy bez aktywnej
  subskrypcji; deklaracja usunięta w E-01.
- **Warunki i zależności:** **czeka** na D-05 (RT-KONTO) i `A2` pyt. 9 —
  wariant (a) reguła „nieaktywne N miesięcy → powiadomienie → usunięcie
  z wyjątkami podatkowymi” albo (b) brak mechanizmu i opis w polityce
  (wtedy etap zamyka się w E-63). Gałąź `claude/e52-ret13-konta-nieaktywne`.
- **Zmiany:** wariant (a): cron z powiadomieniem i przekazaniem do E-50/E-03.
- **Migracje:** brak.
- **Test czerwony:** `tests/rls-konto-nieaktywne.test.ts`: konto po
  terminie dostaje powiadomienie, po kolejnym — żądanie usunięcia —
  przed: **czerwony**.
- **Fail-closed i ponowienie:** powiadomienie z kluczem `user_id + etap`.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** wyłączenie crona.
- **Po wdrożeniu:** worker, potem web; liczba cronów zmieniona świadomie.
- **Dowód SOC 2:** P4.2 [NZ].
- **Ryzyko redukowane:** WYM-70 K1 Ś → N.

### E-55 — Ponowne zastosowanie usunięć po odtworzeniu

- **Cel:** odtworzenie z kopii nie przywraca danych usuniętych po dacie
  kopii.
- **Pokrywa:** WYM-72; INW-04, RET-09, SOC-29 (część), Q-ZR-13.
- **Typ / wielkość / fala:** kod + runbook · M · F4.
- **Zakres:** dziennik wykonanych usunięć (konta, organizacje, faktury po
  terminie) poza kopiowaną bazą albo w każdej kopii z procedurą
  ponowienia; `docs/runbooks/backup-restore.md`; `unlock-account.md` § 4
  (`A2` RET-09).
- **Warunki i zależności:** **czeka** na E-53 (kopie), E-04 (dowód
  wykonania usunięcia), E-50, E-51 (inne ścieżki usuwania). Gałąź
  `claude/e55-ret09-usuniecia-po-odtworzeniu`.
- **Zmiany:** zapis identyfikatorów usuniętych obiektów (bez danych
  osobowych) w miejscu przeżywającym odtworzenie; skrypt `scripts/ops/`
  ponawiający usunięcia po odtworzeniu; krok w runbooku.
- **Migracje:** ewentualnie tabela dziennika usunięć — addytywna, przed.
- **Test czerwony:** `tests/rls-usuniecia-po-odtworzeniu.test.ts`: baza
  odtworzona do stanu sprzed usunięcia konta + skrypt ponowienia → konta
  brak — przed: **czerwony** (brak dziennika i skryptu).
- **Fail-closed i ponowienie:** skrypt idempotentny (usunięcie
  nieistniejącego = sukces); aplikacja po odtworzeniu nie startuje jobów
  wysyłki przed ponowieniem usunięć (krok runbooka).
- **Akceptacja:** test zielony; krok przećwiczony w E-54; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; próba w E-54.
- **Dowód SOC 2:** A1.3, P4.3 [NZ] — protokół próby.
- **Ryzyko redukowane:** WYM-72 K1 W → Ś (okres rotacji kopii — E-63).

## 6. Treści prawne: projekt → review prawne → publikacja

Każda karta ma trzy kroki z osobnym stanem (dziś wszystkie: **nie
rozpoczęte**; projekty robocze części materiałów są w `09`). Projekt
przygotowuje agent; review — prawnik (końcowe review rezultatu, pkt 1
zadania); publikację lub przyjęcie zatwierdza właściciel. Treści prawnych
nie wpisuje się do kodu przed krokiem (2). Miejsce przechowywania
dokumentów wewnętrznych (rejestry, LIA, TIA, DPIA) wybiera właściciel —
repo jest publiczne, więc domyślnie poza repo, a w repo tylko wpis
„przyjęte DD.MM, wersja N”.

### E-58 — Wersjonowanie dokumentów prawnych i zapis akceptacji

- **Cel:** wiadomo, kto, kiedy i na jaką wersję regulaminu (i przyszłej
  umowy powierzenia) się zgodził; polityka jest informacją z wersją,
  nie „akceptacją”.
- **Pokrywa:** WYM-X-01; ZGD-04, SOC-31 (część), T-21.
- **Typ / wielkość / fala:** kod + migracja · M · F5 · start **od razu**
  (mechanizm nie zależy od treści).
- **Zakres:** `app/(auth)/register/page.tsx:164-173` (zdanie o akceptacji
  bez zapisu); logowanie Google bez informacji (`app/(auth)/login/page.tsx`
  — brak słów „regulamin”/„polityk”); strony prawne z datą bez wersji
  (`regulamin/page.tsx:18` — data sprzed zmiany treści z 1.10.2026).
- **Warunki i zależności:** start od razu. Gałąź `claude/e58-zgd04-wersje-akceptacja`.
- **Zmiany:** tabela wersji dokumentów (numer, data, skrót treści)
  i tabela akceptacji (użytkownik, dokument, wersja, skrót, chwila,
  kanał); zapis przy rejestracji e-mailem; ekran potwierdzenia przy
  pierwszym logowaniu Google przed utworzeniem organizacji; „Zapoznałem
  się z polityką prywatności” zamiast „akceptuję”; numer wersji i data
  na stronach; procedura powiadomienia o zmianie (e-mail transakcyjny,
  ponowna akceptacja przy zmianie istotnej). **Bez** wstecznych wpisów
  akceptacji dla istniejących kont — nie tworzymy zapisów, które nie
  odpowiadają zdarzeniom; istniejące konta potwierdzą wersję przy
  pierwszej publikacji E-62.
- **Migracje:** `00NNN_legal_documents_acceptances` — dwie nowe tabele,
  RLS (użytkownik czyta swoje wpisy, nie zmienia; zapis przez serwer),
  wpis bieżących wersji dokumentów; addytywna, **przed wdrożeniem**; nie
  dotyka istniejących danych.
- **Test czerwony:** `tests/rls-akceptacja-dokumentow.test.ts` (na
  bazie): rejestracja tworzy wpis z wersją; użytkownik nie zmieni ani nie
  usunie swojego wpisu — przed: **czerwony** (brak tabel i zapisu);
  `tests/unit/strony-prawne-wersja.test.ts` (T-21): zmiana treści strony
  bez nowej wersji = błąd — przed: nie dotyczy (brak wersjonowania) —
  pisany razem z mechanizmem, zielony dopiero po zmianie.
- **Fail-closed i ponowienie:** brak opublikowanej wersji regulaminu →
  rejestracja odmawia z komunikatem „Rejestracja chwilowo niedostępna”
  i alarmem operatora (wyjście: opublikować wersję — skrypt w PR);
  zapis akceptacji w tej samej transakcji co utworzenie konta albo
  ponawiany z kluczem `user_id + wersja`.
- **Akceptacja:** testy zielone; `pnpm build`; kod na `main` przeczytany.
- **Wycofanie:** revert PR; tabele zostają (zawierają prawdziwe zdarzenia
  akceptacji — nie usuwać).
- **Po wdrożeniu:** migracja przed (+ `NOTIFY pgrst`, typy); worker,
  potem web; rejestracja konta syntetycznego i odczyt wpisu.
- **Dowód SOC 2:** P1.1, P2.1, CC2.3 [NZ] — populacja akceptacji z wersją.
- **Ryzyko redukowane:** WYM-X-01 K1 W → Ś (treść — E-62, E-63).

### E-59 — Pakiet rozliczalności: role, rejestry art. 30, podstawy, LIA, screening DPIA, ocena IOD

- **Cel:** FaktFlow umie wykazać, kto jest kim w każdej operacji, na
  jakiej podstawie przetwarza dane, dlaczego uzasadniony interes przeważa
  i czy potrzebna jest DPIA i IOD.
- **Pokrywa:** WYM-01, WYM-02, WYM-03, WYM-04, WYM-10, WYM-11, WYM-12,
  WYM-16, WYM-29 (zapis), WYM-39, WYM-48, WYM-49, WYM-55 (screening),
  WYM-57; ZGD-01, DOW-01, DOW-20, INW-16 (L-04).
- **Typ / wielkość / fala:** treść prawna · L · F5.
- **Zakres:** `09` § 1 (rejestr FF-A, 16 czynności RA-01 – RA-16), § 2
  (rejestr FF-P, RP-01 – RP-12), § 3 (screening 9 operacji), § 4 (LIA
  L-01 – L-06; 5 celów bez LIA — akapit końcowy § 4); `02` § 4 (role per
  operacja); `A1` „Tabela: cel → proponowana podstawa”; zapisy „nie
  dotyczy” (art. 8–10, art. 22, art. 26) z uzasadnieniem; ocena IOD
  (jedna strona; usunąć odwołania do „DPO” w runbookach albo wyznaczyć).
- **Warunki i zależności:** **czeka** na D-01 (administrator), D-05
  (okresy do rejestrów), D-12 (warianty: AI, analityka L-03), D-14
  (skala — screening), D-07 (dokumenty istniejące poza repo); review:
  Q-ZR-06, Q-ZR-07, Q-ZR-09, Q-ZR-10, Q-ZR-11, Q-ZR-15, Q-ZR-16, Q-ZR-18,
  P-01, P-02, P-04, P-08, `02` pyt. 1, 3, 13.
- **Kroki:** (1) projekt — uzupełnić `09` § 1–4 o decyzje E-00, usunąć
  placeholdery, ujednolicić z rejestrem retencji (E-40) i rejestrem
  dostawców (E-61); (2) review prawne; (3) przyjęcie — data, właściciel,
  przegląd roczny i przy zmianie (nowa funkcja — szablon PR, E-76).
- **Migracje / test:** brak migracji; „test” = przegląd kompletności:
  każda operacja z `02` § 4 ma rolę, cel, podstawę, kategorie, odbiorców,
  okres (odsyłacz do E-40), transfer (odsyłacz do E-61) i środki; każda
  podstawa z lit. f ma LIA z wynikiem; każda operacja ma wynik screeningu.
  Stan przed: **brak** (DOW-01, DOW-20 — nie znaleziono w repo; N-DOW-01).
- **Akceptacja:** dokumenty przyjęte z datą; lista otwartych warunków LIA
  (np. L-03 negatywna → E-27) przypisana do etapów.
- **Wycofanie:** nie dotyczy (dokumenty wersjonowane; nowa wersja
  zastępuje poprzednią).
- **Po przyjęciu:** odsyłacze w E-62, E-63; przegląd roczny w kalendarzu
  dowodów (E-75).
- **Dowód SOC 2:** CC3.1, CC3.2, P1.1, P3.x [NZ] — wersje dokumentów
  z datą przyjęcia (Privacy nie jest rekomendowana do pierwszego badania
  — `06` § 9.2; dowód służy głównie RODO).
- **Ryzyko redukowane:** WYM-10, WYM-11, WYM-48 K1 W → Ś (działanie
  w czasie — przeglądy).

### E-60 — DPIA funkcji AI

- **Cel:** ocena skutków dla OCR, kategoryzacji, czatu i FLO (przed
  włączeniem części z modelem) z decyzją o środkach i ryzyku szczątkowym.
- **Pokrywa:** WYM-55 (DPIA), WYM-56, WYM-62 (część), WYM-16 (część), WYM-10;
  DS-01, DS-02, DS-07 (`09` § 3.3), AI-04, AI-05.
- **Typ / wielkość / fala:** treść prawna · M · F5.
- **Zakres:** `09` § 3.3 (szkielet elementów art. 35 ust. 7 [NZ]);
  przepływy `A2` AI.0; DPA Anthropic [DOK-3]; środki wdrożone w E-11,
  E-12, E-17; opcja modelu w regionie UE (D-12 (i)).
- **Warunki i zależności:** **czeka** na E-59 (screening), D-03
  (ustawienia organizacji Anthropic, retencja), D-04 (umowa), D-14
  (skala); review: Q-ZR-11, Q-ZR-14, P-02, `A2` pyt. 7.
- **Kroki:** (1) projekt; (2) review prawne (+ IOD, jeśli wyznaczony);
  (3) przyjęcie; decyzja o uprzednich konsultacjach (WYM-56) — jeśli
  ryzyko szczątkowe wysokie.
- **Migracje / test:** brak; przegląd kompletności elementów art. 35
  ust. 7 [NZ]. Stan przed: **brak**.
- **Akceptacja:** DPIA przyjęta; warunki (np. przełącznik E-17
  domyślnie wyłączony, informacja E-12) przypisane do etapów; pakiet
  materiałów dla DPIA klientów (`09` § 3.4).
- **Wycofanie:** nie dotyczy.
- **Po przyjęciu:** warunki DPIA przypisane do etapów (E-11, E-12, E-17, E-28) i sprawdzone po ich wdrożeniu; ponowna ocena przy zmianie funkcji AI albo po przekroczeniu skali z D-14.
- **Dowód SOC 2:** CC3.2 [NZ].
- **Ryzyko redukowane:** WYM-55, WYM-62 K1 W → Ś.

### E-61 — Rejestr dostawców, transfery, TIA

- **Cel:** dla każdego dostawcy wiadomo: podmiot umowy, plan, region,
  wersja i data DPA, mechanizm transferu, dalsi procesorzy, retencja,
  właściciel i data przeglądu.
- **Pokrywa:** WYM-40, WYM-58, WYM-59, WYM-60, WYM-61, WYM-62 (część), WYM-SOC-1, WYM-10;
  PRC-02, PRC-04, PRC-06 – PRC-09, PRC-11, PRC-12, PRC-16, SOC-18,
  DOW-20 (TIA), DOW-21 (raporty dostawców).
- **Typ / wielkość / fala:** organizacyjny + treść prawna · M · F5.
- **Zakres:** `04` § 1 i § 3 (odbiorcy R-NN); `09` § 5 (lista kontrolna
  TIA dla 10 dostawców), § 7 (projekt listy dalszych procesorów);
  agenci AI (D-09); ustawienia paneli z datą (D-03, E-09).
- **Warunki i zależności:** **czeka** na D-03, D-04, D-09; review:
  `04` pyt. 1 – 11, N-ZR-07 (DPF), P-10.
- **Kroki:** (1) projekt rejestru (prywatnie) i wersji publicznej listy
  (do E-62); weryfikacja wpisu DPF dla dostawców z USA z datą; TIA dla
  transferów na SCC; jawne wykluczenie art. 49 dla transferów stałych;
  usunięcie zbędnych transferów (E-07, E-16); (2) review prawne;
  (3) przyjęcie; przegląd roczny i przy nowym dostawcy.
- **Migracje / test:** brak; kontrola: każdy odbiorca z rejestru retencji
  (E-40) i z CSP (`lib/security/csp.ts`) ma wpis w rejestrze dostawców
  (porównanie skryptem — część E-75). Stan przed: **brak** (PRC-04).
- **Akceptacja:** rejestr kompletny dla wszystkich R-NN z `04`; TIA dla
  każdego transferu na SCC; data przeglądu.
- **Wycofanie:** nie dotyczy.
- **Po przyjęciu:** publiczna lista do E-62; przegląd roczny i przy nowym dostawcy; porównanie z CSP i rejestrem retencji skryptem (E-75).
- **Dowód SOC 2:** CC9.2 (SOC-18), P6.x [NZ] — rejestr, kopie raportów
  dostawców, protokół przeglądu.
- **Ryzyko redukowane:** WYM-40, WYM-60 K1 W → Ś.

### E-62 — Regulamin z umową powierzenia i listą dalszych procesorów

- **Cel:** każdy klient zawiera przy rejestracji umowę powierzenia
  (np. jako załącznik regulaminu), z listą dalszych procesorów i zasadami
  ich zmiany; regulamin wskazuje usługodawcę.
- **Pokrywa:** WYM-41, WYM-42, WYM-43, WYM-44, WYM-45 (postanowienia),
  WYM-46, WYM-53, WYM-16 (dane szczególne), WYM-68 (przechowywanie na
  polecenie), WYM-X-01 (akceptacja), WYM-05; ZGD-02, PRC-05, SOC-35, SOC-24
  (brzmienie zobowiązania dostępności).
- **Typ / wielkość / fala:** treść prawna + kod · L · F5.
- **Zakres:** `09` § 6 (szkielet — mapa 14 elementów na funkcje i luki),
  § 7 (lista); `regulamin/page.tsx` (placeholder `:23`, „99,9 %”
  `:76-77`, brak postanowień o powierzeniu — R-05); strona RODO
  (`rodo/page.tsx:54-58`); nowa strona `/legal/podprocesorzy` z jednego
  źródła danych.
- **Warunki i zależności:** **czeka** na D-01, E-58 (zapis akceptacji),
  E-59 (role, cele), E-61 (lista); review: Q-ZR-01, Q-ZR-03, Q-ZR-08,
  Q-ZR-09, Q-ZR-12, P-03, `04` pyt. 3 – 6, `06` pyt. 1, `A2` pyt. 2, 8.
- **Kroki:** (1) projekt umowy (przedmiot, czas, charakter i cel —
  w tym kategoryzacja AI jako polecenie klienta (E-17), kategorie danych
  i osób, poufność (E-68), środki (streszczenie E-74), dalsi procesorzy
  z ogólną zgodą i okresem sprzeciwu, pomoc przy prawach osób z terminem
  (E-66), zawiadomienie o naruszeniu w terminie krótszym niż 72 h
  (decyzja review), zwrot albo usunięcie po zakończeniu (E-25, E-50),
  audyty i informacje (WYM-46), dane szczególne, przechowywanie poza
  Polską — art. 112a [NZ]); regulamin z usługodawcą i brzmieniem
  dostępności; (2) review prawne; (3) publikacja: PR ze stronami, nowa
  wersja w E-58, akceptacja przy rejestracji i przy pierwszym logowaniu
  istniejących kont; e-mail do właścicieli organizacji przy zmianie listy
  dalszych procesorów.
- **Migracje:** brak (tabele z E-58).
- **Test czerwony (część kodu):** `tests/unit/podprocesorzy-jedno-zrodlo.test.ts`:
  strona `/legal/podprocesorzy` i polityka renderują listę z tego samego
  modułu danych — przed: **czerwony** (brak strony); test akceptacji: nowe
  konto ma wpis akceptacji regulaminu i umowy z wersją — przed:
  **czerwony** (do E-58).
- **Fail-closed i ponowienie:** istniejący klient bez akceptacji nowej
  wersji — skutek (okres przejściowy, ograniczenie funkcji, wypowiedzenie)
  to decyzja review; komunikat po zalogowaniu z nazwą dokumentu i tym,
  co ma zrobić; operator widzi listę firm bez akceptacji.
- **Akceptacja:** review zakończone; strony opublikowane z wersją; testy
  zielone; kod na `main` przeczytany.
- **Wycofanie:** publikacja poprzedniej wersji w E-58 (wpisy akceptacji
  zostają).
- **Po wdrożeniu:** worker, potem web; akceptacja kontem syntetycznym.
- **Dowód SOC 2:** CC2.3, CC9.2, P6.x [NZ] — wersje umowy, zapisy
  akceptacji, lista dalszych procesorów z historią zmian.
- **Ryzyko redukowane:** WYM-41, WYM-43 K1 W → N (po publikacji).

### E-63 — Polityka prywatności, strona RODO, informacje przy zbieraniu, tabela technologii

- **Cel:** pełna i prawdziwa informacja z art. 13 i 14 [NZ] dla każdej
  grupy osób i każdego punktu zbierania; tabela technologii
  przeglądarkowych z celem i okresem.
- **Pokrywa:** WYM-18, WYM-19 (docelowo), WYM-04, WYM-15 (treść baneru),
  WYM-17 (informacja o kanale), WYM-23 (opis korekty), WYM-38 (słowo
  „pseudonimizacja”), WYM-63 (tabela), WYM-72 (opis rotacji kopii), WYM-SOC-5;
  ZGD-03, ZGD-11, INW-17, PRC-01 – PRC-03, RUN-11, DOW-02, SOC-31, RUN-09 (Turnstile w tabeli technologii).
- **Typ / wielkość / fala:** treść prawna + kod · L · F5.
- **Zakres:** `09` § 11 (20 wymagań polityki, 11 pozycji strony RODO,
  9 punktów zbierania — m.in. ekran logowania Google, czat, newsletter),
  § 12.3 (technologie); `A4` § 4; `polityka-prywatnosci/page.tsx`
  (placeholder `:20`), `rodo/page.tsx`, baner (`consent-banner.tsx:47-57`).
- **Warunki i zależności:** **czeka** na D-01, E-59 (cele i podstawy),
  E-61 (odbiorcy i transfery), E-40 + D-05 (okresy), E-62 (informacja
  o roli procesora), decyzje RUN-04 – RUN-06 (E-06 – E-08 albo zgoda);
  review: Q-ZR-02, Q-ZR-04, Q-ZR-06, Q-ZR-13, Q-ZR-17, `A2` pyt. 4, 6, 9,
  `A4` pyt. 1 – 3, 5.
- **Kroki:** (1) projekt (tabela celów z E-59, odbiorcy z E-61, okresy
  z E-40, prawa i kanał z E-66, technologie z `A4` § 4); (2) review;
  (3) publikacja — nowa wersja w E-58, informacja przy logowaniu Google
  i w czacie, treść baneru z nową wersją (E-18 przywraca baner).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/strony-prawne-tresc.test.ts` (T-20,
  pełny): brak placeholderów; każdy odbiorca z rejestru dostawców
  wymieniony; okresy równe stałym z rejestru retencji (E-40) — przed:
  **czerwony** (placeholder `:20`).
- **Fail-closed i ponowienie:** nie dotyczy.
- **Akceptacja:** review zakończone; test zielony; data i wersja; kod
  na `main` przeczytany.
- **Wycofanie:** poprzednia wersja (E-58).
- **Po wdrożeniu:** worker, potem web; przegląd stron; powiadomienie
  użytkowników o zmianie (procedura E-58).
- **Dowód SOC 2:** P1.1, CC2.3 [NZ].
- **Ryzyko redukowane:** WYM-18, WYM-19 W → N.

### E-64 — Informacja dla osób trzecich: stopka w wiadomościach, wzór klauzuli

- **Cel:** odbiorcy wiadomości wysyłanych w imieniu klienta wiedzą, kto
  jest nadawcą i administratorem, a klient ma wzór klauzuli art. 14 [NZ].
- **Pokrywa:** WYM-20, WYM-67; ZGD-09, NA1-14, Q-ZR-08.
- **Typ / wielkość / fala:** treść prawna + kod · S · F5.
- **Zakres:** szablony wiadomości do osób trzecich (faktura, przypomnienia,
  zaproszenia, paczki księgowe) w `lib/email/`; strona „Informacja dla
  odbiorców wiadomości FaktFlow”; centrum pomocy.
- **Warunki i zależności:** **czeka** na E-62 (rola FF-P) i review
  (brzmienie, Q-ZR-08). Reply-To — już w E-14.
- **Kroki:** (1) projekt stopki i strony; (2) review; (3) publikacja (PR
  z szablonami).
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/email-stopka-osoby-trzecie.test.ts`:
  każdy szablon do osób trzecich zawiera stopkę z odsyłaczem — przed:
  **czerwony**.
- **Akceptacja:** review; test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web; wysyłka syntetyczna.
- **Fail-closed i ponowienie:** nie dotyczy.
- **Dowód SOC 2:** P1.1 [NZ].
- **Ryzyko redukowane:** WYM-20 K1 Ś → N.

### E-65 — Marketing w modelu zgody; newsletter z potwierdzeniem

- **Cel:** wiadomości marketingowe wychodzą tylko do osób, które się na
  nie zgodziły (z dowodem wersji i daty); newsletter potwierdza adres.
- **Pokrywa:** WYM-66, WYM-13, WYM-15, WYM-28 (marketing), WYM-32; ZGD-06,
  INW-14, RT-NEWS.
- **Typ / wielkość / fala:** kod + migracja + treść · M · F5.
- **Zakres:** `lib/email/preferences.ts` (kategorie `marketing`,
  `product_updates` w modelu wypisu), sekwencja próbna
  (`lib/jobs/runners/email-sequence.ts:151-168` — treść handlowa w e-mailu
  8. dnia), `newsletter_subscribers` (brak potwierdzenia, `unsubscribed_at`
  nigdy nie ustawiane, formularze nieosadzone — MIN-12).
- **Warunki i zależności:** **czeka** na P-08, Q-ZR-05, N-ZR-05 (czy
  potrzebna zgoda z PKE [NZ]; czy e-mail 8. dnia to informacja
  handlowa), E-13, E-63 (treść zgody); D-05 (RT-NEWS — wariant „usunąć
  zbiór do czasu uruchomienia newslettera”).
- **Kroki:** (1) projekt treści zgody; (2) review; (3) PR kodu.
- **Zmiany:** zapis zgody (osoba, kategoria, wersja treści, data, źródło);
  domyślnie brak wysyłki marketingowej; podwójne potwierdzenie
  newslettera; e-mail 8. dnia — część handlowa oddzielona albo objęta zgodą.
- **Migracje:** tabela zgód marketingowych albo kolumny w `email_preferences`
  — addytywna, **przed wdrożeniem**; istniejące osoby bez zapisu zgody =
  brak zgody (bez wstecznych wpisów).
- **Test czerwony:** `tests/unit/marketing-opt-in.test.ts`: nowe konto
  bez zgody → brak wiadomości `marketing`; zgoda ma wersję i datę —
  przed: **czerwony** (model wypisu).
- **Fail-closed i ponowienie:** brak zapisu zgody = brak wysyłki;
  potwierdzenie newslettera z tokenem jednorazowym.
- **Akceptacja:** review; testy zielone; kod na `main` przeczytany.
- **Wycofanie:** revert PR; tabela zgód zostaje.
- **Po wdrożeniu:** migracja przed; worker, potem web.
- **Dowód SOC 2:** P2.1 [NZ] — zapisy zgód.
- **Ryzyko redukowane:** WYM-66 K1 Ś (W przy kampanii) → N.

### E-66 — Procedura żądań osób (DSAR)

- **Cel:** każde żądanie (konto, osoba bez konta, żądanie dotyczące
  danych klienta) ma ścieżkę, identyfikację proporcjonalną, termin
  i ewidencję.
- **Pokrywa:** WYM-17, WYM-21, WYM-44, WYM-75, WYM-SOC-5; PRA-09, PRA-10, DOW-04,
  SOC-33, SOC-36, PRC-08.
- **Typ / wielkość / fala:** organizacyjny + treść prawna · M · F5.
- **Zakres:** `09` § 8 (kanały, przebieg, zakres wyszukiwania — 21
  magazynów, terminy, pola rejestru, ścieżka FF-P); narzędzia z E-22;
  kanał z D-10; klasyfikacja poczty `ops/poczta/worker.mjs:14-27`.
- **Warunki i zależności:** **czeka** na E-22 (rejestr i wyszukiwanie),
  D-10 (skrzynka służbowa zamiast prywatnych — PRC-08), E-62 (termin
  przekazania klientowi); review: P-11, `A2` pyt. 5, 8.
- **Kroki:** (1) projekt procedury i wzorów odpowiedzi; (2) review;
  (3) przyjęcie + ćwiczenie na żądaniu syntetycznym (osoba bez konta,
  kontrahent klienta).
- **Migracje / test:** brak; ręczny dowód: ćwiczenie — żądanie
  zarejestrowane, osoba znaleziona w magazynach, odpowiedź w terminie,
  przekazanie klientowi (FF-P). Stan przed: **brak** (PRA-09).
- **Akceptacja:** procedura przyjęta; protokół ćwiczenia; przegląd
  kwartalny rejestru (E-75).
- **Wycofanie:** nie dotyczy.
- **Po przyjęciu:** kwartalny przegląd rejestru żądań (E-75): brak przekroczonych terminów.
- **Dowód SOC 2:** P5.1, P5.2, P8.1 [NZ].
- **Ryzyko redukowane:** WYM-17, WYM-21 K1 W → N.

### E-67 — Procedura naruszeń i incydentów; rejestr; dyżur; ćwiczenie

- **Cel:** naruszenie jest wykrywane, oceniane i zgłaszane w terminie
  (FF-A do organu, FF-P do klienta), a wszystkie naruszenia są w rejestrze.
- **Pokrywa:** WYM-52, WYM-53, WYM-54, WYM-SOC-1, WYM-74; DOW-03, SOC-16, `A1`-D-11
  (błędne „72 h zgodnie z art. 33”).
- **Typ / wielkość / fala:** organizacyjny + treść prawna (+ mały PR
  kodu) · M · F5.
- **Zakres:** `09` § 9 (źródła wykrycia, triage, tory FF-A i FF-P, pola
  rejestru); runbooki nieaktualne (`docs/runbooks/disaster-recovery.md:117`);
  `ops/poczta/worker.mjs:14-27` — brak kategorii „bezpieczeństwo/naruszenie”
  (`09` § 15); dyżur F0-G08 PARTIAL [PR225]; game day H2 z
  `PLAN-ZERO-ZGUBIONYCH-FAKTUR.md`.
- **Warunki i zależności:** **czeka** na D-01 (kto zgłasza), D-15
  (dyżur), E-62 (termin dla klientów); review: Q-ZR-12, P-03, P-04,
  N-ZR-12. Pilne niezależnie od reszty: **ocena, czy RUN-08 (ciasteczka
  sesji u dostawców telemetrii) wymaga wpisu do rejestru naruszeń**
  (`05` WYM-52) — po D-03 i E-05.
- **Kroki:** (1) projekt procedury, rejestru i wzorów; mały PR kodu:
  kategoria „bezpieczeństwo” w `ops/poczta` (test jednostkowy klasyfikacji
  — czerwony przed); (2) review; (3) przyjęcie + ćwiczenie co 6 miesięcy.
- **Migracje:** brak.
- **Test / dowód:** ręczny — ćwiczenie stołowe z protokołem (czas od
  sygnału do decyzji); test klasyfikacji poczty.
- **Akceptacja:** procedura przyjęta; rejestr założony (także wpis „brak
  naruszeń” z datą przeglądu); protokół ćwiczenia; dyżur z zastępcą.
- **Wycofanie:** nie dotyczy.
- **Po przyjęciu:** rejestr prowadzony (także wpisy „brak naruszeń” z datą przeglądu); ćwiczenie co 6 mies. w kalendarzu dowodów (E-75); PR kodu `ops/poczta` wdrożony (worker poczty).
- **Dowód SOC 2:** CC7.3 – CC7.5 (SOC-16), P6.x [NZ].
- **Ryzyko redukowane:** WYM-52, WYM-53 K1 W → Ś.

## 7. Etapy organizacyjne i dowody SOC 2

Większość kontroli z `06` § 8 wynika z ryzyka samej usługi (kopie,
dostęp, zmiany, KSeF), więc warto je wdrażać niezależnie od decyzji
o badaniu (`06` § 9.1). Zgodnie z R4 (`R4.md`, „Najważniejsze dla
dalszych etapów”): bramkę `/wdroz` i kanał `ops/poczta` **uruchomić lub
zweryfikować**, nie budować od zera.

### E-54 — Próba odtworzenia z protokołem

- **Cel:** dowód, że kopia przywraca usługę, z pomiarem czasu.
- **Pokrywa:** WYM-51, WYM-SOC-2, WYM-74; SOC-22, DOW-22, TEST-07 [PR225].
- **Typ / wielkość / fala:** organizacyjny · M (cyklicznie) · F4.
- **Zakres:** `docs/runbooks/backup-restore.md` § 5 (próba miesięczna);
  kwartalnie pełny stos na izolowanym hoście z weryfikacją faktur
  (`PLAN-ZERO-ZGUBIONYCH-FAKTUR.md:501-503`, I3); krok ponowienia usunięć
  (E-55).
- **Warunki i zależności:** **czeka** na E-53.
- **Kroki:** odtworzenie z kopii poza hostem na izolowanym hoście;
  sprawdzenie liczników (bez treści); pomiar RTO; usunięcie środowiska
  próby (dane prawdziwe — zniszczenie potwierdzone w protokole).
- **Dowód / akceptacja:** protokół (data, zakres, czas, wynik, odchylenia);
  pierwsza udana próba = warunek bramki § 8; potem miesięcznie.
- **Wycofanie:** nie dotyczy.
- **Migracje:** brak.
- **Po próbie:** protokół w kalendarzu dowodów (E-75); odchylenia jako zadania z właścicielem.
- **Dowód SOC 2:** A1.3 [NZ] — seria protokołów.
- **Ryzyko redukowane:** WYM-51 Ś → N po pierwszej udanej próbie.

### E-56 — Rotacja klucza poświadczeń KSeF

- **Cel:** klucz szyfrujący poświadczenia KSeF (przechowywany wcześniej
  u poprzedniego dostawcy hostingu) zostaje zmieniony; rekordy formatu v1
  znikają.
- **Pokrywa:** WYM-50, WYM-SOC-4; SOC-28, NS-14; I1 z `PLAN-ZERO`.
- **Typ / wielkość / fala:** organizacyjny (operacja) · S · F4.
- **Zakres:** `lib/ksef/credentials-crypto.ts` (format v1: stała sól, bez
  AAD — `:24-25`), `scripts/reencrypt-ksef-credentials.ts`,
  `docs/runbooks/key-rotation.md` (nieaktualny).
- **Warunki i zależności:** start od razu (D-06: liczba rekordów v1 —
  wykonuje sama operacja); sesja lokalna z dostępem.
- **Kroki:** nowy klucz; `…_PREVIOUS` = stary; przeszyfrowanie skryptem;
  weryfikacja odczytu; usunięcie starego klucza; aktualizacja runbooka.
- **Dowód / akceptacja:** protokół (data, odciski kluczy, liczba
  rekordów przed i po, 0 rekordów v1).
- **Wycofanie:** `…_PREVIOUS` pozwala czytać stare rekordy do końca operacji.
- **Migracje:** brak.
- **Po operacji:** odczyt poświadczeń firmy testowej; `kontrola-faktur-ksef.sh`; liczba rekordów v1 = 0 (zliczenie skryptem bez odszyfrowania).
- **Dowód SOC 2:** C1.1, CC6.1 [NZ].
- **Ryzyko redukowane:** WYM-SOC-4 — SOC-28 (W) zamknięte.

### E-57 — Dane u dawnych dostawców

- **Cel:** dane z poprzedniej infrastruktury (Supabase Cloud, Inngest,
  Vercel, Cloudflare R2, Upstash) usunięte albo uzasadnione.
- **Pokrywa:** WYM-08, WYM-58, WYM-37; PRC-15, RT-HIST, N-INW-16, N-PRC-06.
- **Typ / wielkość / fala:** organizacyjny · S · F4.
- **Zakres:** projekty i dane w Supabase Cloud (baza deweloperska), Inngest, Vercel, Cloudflare R2, Upstash (`02` § 3.3 — checklista sprzątania niezaznaczona).
- **Warunki i zależności:** start od razu (D-11 to jednocześnie wykonanie).
  Baza deweloperska (`.env.local` celuje w osobny projekt — `AGENTS.md`)
  zostaje tylko z danymi syntetycznymi (potwierdzenie — `05` WYM-37).
- **Dowód / akceptacja:** lista dostawców z datą usunięcia lub
  uzasadnieniem; zrzut bez identyfikatorów kont, prywatnie.
- **Migracje:** brak.
- **Wycofanie:** nie dotyczy — usunięcie u dostawcy jest nieodwracalne; przed usunięciem potwierdzić, że dane nie są potrzebne (np. baza deweloperska).
- **Po wykonaniu:** wpis „zakończony” z datą w rejestrze dostawców (E-61).
- **Dowód SOC 2:** CC6.5, C1.2 [NZ].
- **Ryzyko redukowane:** WYM-58 — nieznane kopie danych poza bieżącą
  infrastrukturą.

### E-68 — Upoważnienia, poufność, szkolenia, zasady dla agentów AI

- **Cel:** każda osoba i każdy automat z dostępem do danych działa na
  podstawie imiennego upoważnienia i zobowiązania do poufności; zespół
  przechodzi szkolenie; praca agentów AI ma zasady.
- **Pokrywa:** WYM-47, WYM-SOC-1; DOW-23, SOC-13, PRC-07, P-10, `06` pyt. 4.
- **Typ / wielkość / fala:** organizacyjny · M · F5.
- **Zakres:** osoby z dostępem do danych (właściciel, koordynator, współpracownicy), agenci AI w sesjach lokalnych i w chmurze, zasady pracy w `AGENTS.md`.
- **Warunki i zależności:** **czeka** na D-09 (agenci), D-07 (istniejące
  dokumenty); review: P-10.
- **Kroki:** upoważnienia imienne i zobowiązania (także współpracownicy
  spoza zatrudnienia); szkolenie roczne (bezpieczeństwo, RODO, KSeF,
  praca z agentami) z potwierdzeniem; zasady dla agentów AI: plan
  z umową komercyjną, dostęp tylko do zredagowanej diagnostyki ([PR225]),
  bez danych produkcji w promptach, PR i plikach (zasada z E-38).
- **Dowód / akceptacja:** lista upoważnień z datami; potwierdzenia
  szkoleń; zasady przyjęte; przegląd kwartalny razem z E-69.
- **Migracje:** brak.
- **Wycofanie:** nie dotyczy (dokumenty wersjonowane).
- **Po przyjęciu:** kwartalny przegląd razem z E-69; szkolenie przy dołączeniu nowej osoby.
- **Dowód SOC 2:** CC1.1, CC1.4, CC2.2 [NZ].
- **Ryzyko redukowane:** WYM-47 K1 W → Ś.

### E-69 — Przegląd dostępów, konta imienne, MFA, klucze SSH

- **Cel:** dostęp do produkcji, kodu i paneli mają tylko uprawnione
  osoby, imiennie, z MFA; przegląd co kwartał.
- **Pokrywa:** WYM-35, WYM-47, WYM-SOC-1, WYM-74; SOC-07, SOC-08, SOC-09, SOC-10,
  DOW-05, MIN-05 (przegląd `ADMIN_EMAILS`).
- **Typ / wielkość / fala:** organizacyjny + konfiguracja (+ mały PR
  kodu) · M · F5 · start **od razu** (dane wejściowe D-08 zbiera sam etap).
- **Warunki i zależności:** start od razu; D-08 jest pierwszym krokiem etapu; MFA dla operacji wrażliwych — przed KSeF PROD (bramka A15).
- **Zakres:** GitHub (członkowie, wyjątki rulesetu — NS-03), Coolify,
  konsola Hetznera, klucze SSH (imienność — NS-04), `ADMIN_EMAILS`,
  panele dostawców (konto Sentry używane przez dwie osoby [PR225
  @a72b567]), Telegram i Slack; flaga MFA dla operacji wrażliwych
  domyślnie wyłączona (`lib/auth/sensitive-mfa.ts:8-15`), a błąd jej
  odczytu nie blokuje (`:14`).
- **Kroki:** inwentarz kont i kluczy z właścicielem (prywatnie; w repo
  liczby); konta imienne i wymuszone MFA; konto tylko do odczytu dla
  diagnostyki (także agentów); procedura nadania i odebrania dostępu;
  decyzja i włączenie MFA dla operacji wrażliwych przed KSeF PROD;
  **osobny PR kodu:** błąd odczytu flagi MFA → wymóg MFA (fail-closed),
  test `tests/unit/sensitive-mfa-fail-closed.test.ts` — przed:
  **czerwony** (`:14`).
- **Dowód / akceptacja:** protokół przeglądu z listą kont i decyzjami;
  zrzuty ustawień MFA; kwartalnie.
- **Wycofanie:** nie dotyczy (PR kodu — revert).
- **Migracje:** brak.
- **Po wykonaniu:** protokół przeglądu; PR kodu — worker, potem web; operacja wrażliwa na koncie syntetycznym wymaga MFA, także przy błędzie odczytu flagi.
- **Dowód SOC 2:** CC6.1 – CC6.3, CC7.2 [NZ].
- **Ryzyko redukowane:** WYM-35 K1 W → Ś; gotowość CC6 (SOC-07 – SOC-09 W).

### E-70 — RLS jako wymagana kontrola; testy RLS tabel z danymi osobowymi

- **Cel:** czerwony test izolacji firm blokuje scalenie; tabele z danymi
  osobowymi mają testy izolacji na bazie.
- **Pokrywa:** WYM-09, WYM-SOC-1; SOC-03, DOW-12, DOW-15, T-14, T-15.
- **Typ / wielkość / fala:** kod + konfiguracja · M · F5 · start **od razu**.
- **Warunki i zależności:** start od razu; zmiana rulesetu — właściciel (uprawnienia administratora repo). Gałąź `claude/e70-dow15-testy-rls`.
- **Zakres:** ruleset `main` (9 wymaganych kontroli wg API, `AGENTS.md`
  mówi 11 — `05` § 12.3 poz. 16); `docs/security/GITHUB-WYMAGANE-KONTROLE.md`;
  14 tabel bez pokrycia (`A3` § 4.3: `contractors`, `invoice_line_items`,
  `support_conversations`, `support_messages`, `email_preferences`,
  `email_bounces`, `push_subscriptions`, `newsletter_subscribers`,
  `gdpr_deletion_requests`, `mfa_recovery_codes`, `admin_user_notes`,
  `export_files`, `export_jobs`, `import_jobs`).
- **Kroki / zmiany:** (a) PR testów T-14 (`tests/rls-dane-osobowe-izolacja.test.ts`)
  i T-15 (`tests/rls-pokrycie-tabel.test.ts` — każda tabela `public` ma
  RLS i politykę; `anon` bez uprawnień do tabel z danymi osobowymi;
  `SECURITY DEFINER` z przypiętym `search_path`); (b) właściciel dopisuje
  job „RLS isolation (lokalny Supabase)” do wymaganych kontroli
  i ujednolica `AGENTS.md` z rulesetem.
- **Migracje:** brak.
- **Test czerwony:** to kontrola, nie naprawa — wynik T-14 i T-15 przed
  jest **nieznany** (`A3` § 5); jeśli któryś jest czerwony, naprawa to
  osobny etap z własnym PR (pkt 1 protokołu).
- **Akceptacja:** testy w CI; eksport reguł gałęzi z API z datą
  pokazuje job RLS jako wymagany.
- **Wycofanie:** zdjęcie kontroli z rulesetu (niezalecane).
- **Po scaleniu:** bez wdrożenia aplikacji (testy); eksport rulesetu z API z datą; PR testowy z czerwonym testem RLS zablokowany.
- **Dowód SOC 2:** CC8.1, CC6.1 [NZ] — eksport rulesetu, historia CI.
- **Ryzyko redukowane:** WYM-09 — regresja izolacji nie przejdzie do `main`.

### E-71 — Agent-guard obejmuje gałęzie sesji agentów

- **Cel:** zmiany obszarów wrażliwych przez sesje agentów wymagają zgody
  właściciela niezależnie od nazwy gałęzi.
- **Pokrywa:** WYM-SOC-1; SOC-02.
- **Typ / wielkość / fala:** kod · S · F5 · start **od razu**.
- **Warunki i zależności:** start od razu.
- **Zakres:** `scripts/ci/agent-guard.mjs:4, 21-22, 68-72` (rozpoznaje
  tylko `agent/*` i commit `claude[bot]`).
- **Zmiany:** rozpoznanie gałęzi `claude/*`, `codex/*` i trailerów sesji
  agenta. Gałąź `claude/e71-soc02-agent-guard`.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/agent-guard-galezie.test.ts`: gałąź
  `claude/x` zmieniająca ścieżkę wrażliwą bez etykiety zgody → odmowa —
  przed: **czerwony**.
- **Akceptacja:** test zielony; kontrola „Agent guard” w PR testowym.
- **Wycofanie:** revert PR.
- **Po scaleniu:** bez wdrożenia aplikacji; kontrola „Agent guard” na PR testowym z gałęzi `claude/*`.
- **Dowód SOC 2:** CC8.1 [NZ].
- **Ryzyko redukowane:** gotowość CC8 (SOC-02 Ś).

### E-72 — Wdrożenia przez bramkę z zapisem; zatwierdzenie scalenia; rejestr zmian konfiguracji

- **Cel:** każde wdrożenie, migracja i zmiana konfiguracji zostawia zapis
  „kto zatwierdził, kto wykonał, kiedy, jaki SHA, wynik weryfikacji”.
- **Pokrywa:** WYM-SOC-1, WYM-74; SOC-01, SOC-04, SOC-05, DOW-13.
- **Typ / wielkość / fala:** kod + organizacyjny · M · F5.
- **Zakres:** bramka `/wdroz` (`ops/bramka/src/deploy.mjs:120-137`,
  `00100:167-185` — zapisuje aktora i SHA; wdraża web przed workerem,
  odwrotnie niż `AGENTS.md`); procedury `tinker` i `psql` z `AGENTS.md`
  bez zapisu; zdjęcie flag SQL-em (`docs/runbooks/bramka-telegram.md:18`,
  `hamulce-ksef.md:8-12`); wpisy `ops.*` czyszczone po 12 mies. (E-47).
- **Warunki i zależności:** **czeka** na D-06 (NS-07, N-DOW-11: czy
  bramka i `00100` działają na produkcji); E-47 (retencja `ops.*`).
- **Kroki / zmiany:** zweryfikować i uruchomić bramkę jako jedyną drogę
  wdrożeń; kolejność worker → web ujednolicona (PR kodu z testem
  kolejności — przed: **czerwony**); wpis o wgraniu migracji; polecenie
  scalenia zapisane w PR (komentarz lub etykieta z konta człowieka) albo
  tygodniowy przegląd scalonych PR z podpisem; flagi tylko przez `/admin`
  z audytem; miesięczne porównanie paneli z polityką (E-09).
- **Migracje:** brak.
- **Dowód / akceptacja:** populacja wpisów `ops.deploy.*` z SHA obu
  aplikacji; dziennik wydań (E-75).
- **Wycofanie:** procedura `AGENTS.md` pozostaje jako awaryjna (z ręcznym
  wpisem).
- **Po wdrożeniu:** pierwsze wdrożenie przez bramkę — wpisy `ops.deploy.*` dla workera i aplikacji w kolejności worker → web; `kontrola-faktur-ksef.sh`.
- **Dowód SOC 2:** CC8.1, CC7.1 [NZ].
- **Ryzyko redukowane:** gotowość CC8 (SOC-01, SOC-04 W).

### E-73 — Alarm na nieudany zapis audytu

- **Cel:** utrata wpisu audytu jest widoczna.
- **Pokrywa:** WYM-74, WYM-SOC-1; DOW-11 (L6), SOC-17 (część), T-18.
- **Typ / wielkość / fala:** kod · S · F5 · start **od razu**.
- **Warunki i zależności:** start od razu; odbiorca alarmów (D-15) nie blokuje — alarm trafia do istniejącego kanału operatora.
- **Zakres:** `lib/audit/log.ts:146-168` (`logAudit` przy błędzie tylko
  `console.error('[audit] write_failed')`).
- **Zmiany:** licznik i alarm (Telegram, bez treści wpisu) przy błędzie
  zapisu; ponowienie zapisu raz. Gałąź `claude/e73-dow11-alarm-audytu`.
- **Migracje:** brak.
- **Test czerwony:** `tests/unit/audyt-zapis-alarm.test.ts` (T-18): błąd
  wstawienia → alarm wysłany bez treści wpisu — przed: **czerwony**.
- **Fail-closed i ponowienie:** zapis audytu nie blokuje operacji
  biznesowej (decyzja projektowa obecnego kodu) — dlatego alarm jest
  wyjściem; alarm ograniczony częstotliwością.
- **Akceptacja:** test zielony; kod na `main` przeczytany.
- **Wycofanie:** revert PR.
- **Po wdrożeniu:** worker, potem web.
- **Dowód SOC 2:** CC7.2, CC4.1 [NZ].
- **Ryzyko redukowane:** WYM-74 — ciche luki w dowodach.

### E-74 — Polityki bezpieczeństwa, rejestr ryzyk, klasyfikacja, ciągłość działania

- **Cel:** krótkie zatwierdzone polityki z właścicielem i datą; rejestr
  ryzyk z przeglądem; klasyfikacja informacji; aktualne RTO/RPO i plan
  ciągłości.
- **Pokrywa:** WYM-30, WYM-50 (ocena ryzyka, rejestr kluczy),
  WYM-SOC-1, WYM-SOC-2, WYM-SOC-4; SOC-12, SOC-14 (rejestr
  niedoskonałości), SOC-15, SOC-23, SOC-24 (monitor dostępności), SOC-27.
- **Typ / wielkość / fala:** organizacyjny · L · F5.
- **Zakres:** polityki: bezpieczeństwo informacji, dostęp, zmiany,
  incydenty, kopie, dostawcy, klasyfikacja, retencja (odsyłacz do E-40);
  rejestr ryzyk planowany w `docs/security/PLAN-ODPORNOSCI-CYBER.md:36`
  (w tym ryzyka agentów AI i nadużyć wewnętrznych); rejestr kluczy
  (E-35, E-56); runbooki nieaktualne — `disaster-recovery.md`,
  `key-rotation.md`, `scaling-triggers.md`; RTO/RPO sprzed przeprowadzki
  (`docs/security/rto-rpo.md:20-50`); zewnętrzny monitor dostępności
  z historią (regulamin deklaruje 99,9 % — E-62).
- **Warunki i zależności:** **czeka** na D-01 (kto zatwierdza).
- **Dowód / akceptacja:** podpisane wersje; protokoły przeglądów
  (rocznie; rejestr ryzyk — kwartalnie); runbooki nieaktualne oznaczone
  albo wycofane.
- **Migracje:** brak.
- **Wycofanie:** nie dotyczy (nowe wersje dokumentów zastępują poprzednie).
- **Po przyjęciu:** przeglądy w kalendarzu dowodów (E-75); nieaktualne runbooki zaktualizowane albo oznaczone w PR.
- **Dowód SOC 2:** CC2.2, CC3.1 – CC3.4, CC5.3, CC9.1, A1.2, C1.1 [NZ].
- **Ryzyko redukowane:** WYM-30 K1 W → Ś; gotowość CC3, CC5 (W).

### E-75 — Dowody w czasie: kalendarz, skrypty, archiwizacja wyników, logi centralne

- **Cel:** kontrole zostawiają zapisy z okresu (Type II), zbierane
  skryptami bez danych osobowych.
- **Pokrywa:** WYM-74, WYM-10 (część), WYM-SOC-3, WYM-46 (pakiet
  zgodności dla klientów), WYM-SOC-1; SOC-17, SOC-26, SOC-32, N-DOW-02, DOW-14, RUN-01, RUN-02 (uprząż `A4` jako regresja), DOW-16 (testy prywatności w CI — utrzymanie).
- **Typ / wielkość / fala:** kod + organizacyjny · M · F5 · start **od
  razu** (kalendarz i pierwsze skrypty).
- **Warunki i zależności:** start od razu; część zapisów powstaje dopiero z etapami, których dotyczy (E-09, E-61, E-72).
- **Zakres:** `scripts/ops/` (dziś `kontrola-faktur-ksef.sh`,
  `dopisz-dane-specjalne.sh`): nowe skrypty — przebiegi cronów retencji
  i audytu (liczby), porównanie ustawień PostHog (E-09), rejestr dostawców
  vs CSP (E-61), dziennik wydań (SHA web i worker, migracje, wynik
  kontroli); archiwizacja dziennych wyników strażnika poza Telegramem;
  tygodniowy przebieg scenariuszy KSeF TEST w CI; uprząż `A4` per wydanie;
  logi centralne z retencją ≥ okres badania + 3 mies. (`06` SOC-17).
- **Kroki:** kalendarz dowodów (przegląd dostępów — kwartalnie, próba
  odtworzenia — miesięcznie, przebiegi retencji — miesięcznie, rejestr
  żądań i naruszeń — kwartalnie, polityki — rocznie); każdy skrypt jako
  osobny mały PR z testem formatu wyniku (bez wzorców danych osobowych).
- **Migracje:** brak.
- **Dowód / akceptacja:** pierwszy miesiąc zapisów kompletny według
  kalendarza.
- **Wycofanie:** revert PR skryptu; zebrane zapisy zostają.
- **Po wdrożeniu:** pierwszy przebieg każdego skryptu z datą; wynik bez wzorców danych osobowych (test formatu).
- **Dowód SOC 2:** CC4.1, CC7.2, PI1.3, PI1.4 [NZ].
- **Ryzyko redukowane:** WYM-74 K1 W → Ś.

### E-76 — Szablon PR: sekcja „dane osobowe”

- **Cel:** każda zmiana przetwarzająca dane przechodzi listę kontrolną
  ochrony danych w projektowaniu.
- **Pokrywa:** WYM-31, WYM-03 (aktualizacja inwentarza w PR); DOW-13 (część).
- **Typ / wielkość / fala:** dokument repo · S · F5 · start **od razu**.
- **Warunki i zależności:** start od razu. Gałąź `claude/e76-wym31-szablon-pr`.
- **Zakres:** `.github/pull_request_template.md` (36 linii, sekcje bez
  pola o danych osobowych — `05` § 14).
- **Zmiany:** sekcja: cel, nowe pola/tabele, odbiorca, okres (wpis w E-40),
  informacja dla osób (czy zmienia politykę), czy potrzebny screening DPIA.
- **Test:** przegląd 3 kolejnych PR z wypełnioną sekcją (ręczny dowód).
- **Migracje:** brak.
- **Akceptacja:** szablon scalony; 3 kolejne PR z wypełnioną sekcją.
- **Wycofanie:** revert PR.
- **Po scaleniu:** bez wdrożenia (dokument repo).
- **Dowód SOC 2:** CC8.1, CC3.4 [NZ].
- **Ryzyko redukowane:** WYM-31 Ś → N.

### E-77 — Staging

- **Cel:** środowisko do testów zmian i awarii z osobną bazą, kolejką,
  magazynem i kluczami, KSeF TEST i danymi syntetycznymi.
- **Pokrywa:** WYM-37 (część), WYM-SOC-1; SOC-06, F0-G03 FAIL [PR225].
- **Typ / wielkość / fala:** konfiguracja (infrastruktura) · L · F5.
- **Zakres:** osobna baza, kolejka pg-boss, magazyn S3, klucze i zmienne; KSeF TEST; dane syntetyczne; workflow `e2e-staging.yml` (0 przebiegów — `A3` § 3.1).
- **Warunki i zależności:** **czeka** na D-12 (h) — koszt i termin.
- **Dowód / akceptacja:** dowód izolacji (osobne sekrety, brak danych
  produkcyjnych); `e2e-staging.yml` z przebiegami per wydanie.
- **Migracje:** brak nowych; migracje z repo wgrywane na bazę staging tą samą procedurą co na produkcję (ćwiczenie procedury).
- **Wycofanie:** wyłączenie środowiska (koszt); dane syntetyczne.
- **Po uruchomieniu:** dowód izolacji (brak wspólnych sekretów z produkcją); pierwszy przebieg e2e.
- **Dowód SOC 2:** CC8.1, PI1.3 [NZ].
- **Ryzyko redukowane:** WYM-37 — zmiany testowane dopiero na produkcji.

### E-78 — Skanowanie podatności; kanał zgłaszania

- **Cel:** podatności obrazów i hostów są wykrywane; badacze wiedzą,
  dokąd zgłaszać.
- **Pokrywa:** WYM-SOC-1; SOC-19, SOC-20.
- **Typ / wielkość / fala:** kod + konfiguracja · S · F5 · start **od razu**.
- **Warunki i zależności:** start od razu.
- **Zakres:** skanowanie obrazów w CI; okresowe skanowanie hostów; MinIO
  bez wsparcia producenta (`04` PRC-13 — decyzja w E-74); automatyczne
  scalanie Renovate (`renovate.json:17-23`) a ruleset (NS-06);
  `security.txt` planowany (`PLAN-ODPORNOSCI-CYBER.md:149`).
- **Migracje:** brak.
- **Test czerwony:** job skanowania w CI (pierwszy przebieg — lista
  znalezisk jako punkt odniesienia).
- **Dowód / akceptacja:** raporty skanów miesięcznie; plik `security.txt`
  z monitorowaną skrzynką.
- **Wycofanie:** revert PR (job skanowania).
- **Po scaleniu:** pierwszy raport skanu; `security.txt` dostępny — sprawdzić wzorzec rozszerzeń w `proxy.ts` (pułapka z `AGENTS.md`: nieujęte rozszerzenia przechodzą przez bramkę logowania).
- **Dowód SOC 2:** CC7.1, CC6.8, CC2.3 [NZ].
- **Ryzyko redukowane:** gotowość CC7 (Ś).

### E-79 — Opis systemu i decyzja o badaniu SOC 2

- **Cel:** jeśli organizacja zdecyduje o badaniu — opis systemu wg DC 200
  [NZ], wybór kategorii, ewentualna ocena gotowości; bez deklaracji
  „zgodny z SOC 2” przed raportem.
- **Pokrywa:** WYM-SOC-6, WYM-SOC-7, WYM-SOC-5 (decyzja o kategorii);
  SOC-14 (ocena zewnętrzna), `06` § 9, DOW-21.
- **Typ / wielkość / fala:** organizacyjny + decyzja · M · F5.
- **Zakres:** opis systemu wg DC 200 [NZ] — usługi, zobowiązania, komponenty (Hetzner, Coolify, Supabase self-hosted, MinIO, pg-boss), granice, organizacje podusługowe z E-61; `06` § 9.3 etapy 0, 2, 3.
- **Warunki i zależności:** **czeka** na D-01 (kierownictwo, oświadczenie
  zarządu), D-13 (czy badanie); rekomendacja `06` § 9.2: Security +
  Availability po E-53 i E-54; Processing Integrity po ≥ 3 mies. KSeF PROD.
- **Kroki:** opis systemu równolegle z etapami F5; organizacje podusługowe
  (carve-out, CUEC, CSOC) z rejestru E-61; opcjonalna ocena gotowości;
  potem Type I lub od razu okres Type II (`06` § 9.3).
- **Dowód / akceptacja:** opis zatwierdzony przez kierownictwo; strażnik
  fraz w E-01 utrzymany (brak „SOC 2 ready”).
- **Migracje:** brak.
- **Wycofanie:** nie dotyczy.
- **Po decyzji:** zapis D-13; przegląd opisu systemu rocznie i przy istotnej zmianie.
- **Dowód SOC 2:** cały opis systemu [NZ].
- **Ryzyko redukowane:** WYM-SOC-7 — utrzymanie; WYM-SOC-6 N.

## 8. Bramka: przed pierwszym prawdziwym klientem

„Pierwszy prawdziwy klient” = pierwsze dane prawdziwych kontrahentów
w systemie albo pierwsza faktura w KSeF PROD (punkt K1 z `05` § 1.1).
Bramka **nie zastępuje** bramki wydania „zero zgubionych faktur”
(`PLAN-ZERO-ZGUBIONYCH-FAKTUR.md` § 8) — obie muszą być spełnione.
Każdy punkt odhacza się z datą i numerem PR lub protokołu; „scalone” nie
wystarcza (pkt 8 protokołu — kod na `main` przeczytany przez drugą osobę,
wdrożony na obu aplikacjach, zweryfikowany).

### 8.1. Bramka A — przed pierwszym prawdziwym klientem (warunek konieczny)

| # | Warunek | Etapy | Dlaczego blokuje |
|---|---|---|---|
| A1 | Podmiot administratora ustalony; brak placeholderów na stronach | D-01, E-63 | bez administratora nie ma kogo wskazać w informacji, umowie i zgłoszeniu naruszenia (`05` WYM-18 — ryzyko obecne W) |
| A2 | Na stronach publicznych brak tez sprzecznych z kodem | E-01 | publiczna deklaracja wprost nieprawdziwa (WYM-19) |
| A3 | Regulamin z umową powierzenia i listą dalszych procesorów opublikowany; akceptacja z wersją zapisywana | E-58, E-61, E-62 | każdy klient jest administratorem danych kontrahentów (WYM-41, WYM-43 — warunek sprzedaży B2B) |
| A4 | Polityka prywatności i informacje w punktach zbierania po review | E-59, E-63 | art. 13 [NZ] wobec każdej rejestrującej się osoby |
| A5 | Środowisko KSeF fail-closed; przełączenie TEST → PROD według runbooka F1; potwierdzenie licznikowe, że w KSeF TEST nie ma prawdziwych danych | D-02, E-10; PLAN-ZERO F1 | prawdziwe faktury w środowisku testowym (WYM-37, PRC-17) |
| A6 | Ciasteczka sesji nie trafiają do dostawców telemetrii; sesje Sentry i fonty Google nie działają przed wyborem; panel PostHog zgodny z kodem | E-05, E-06, E-07, E-09 | przekazanie bez podstawy przy każdej wizycie (WYM-36 — obecne W; WYM-34, WYM-63) |
| A7 | Wycofanie zgody analitycznej z interfejsu | E-18 | art. 7 ust. 3 [NZ] (WYM-14) |
| A8 | Usunięcie konta działa dla każdej ścieżki (użytkownik, operator, konto Google), w pełnym zakresie bazy, z dowodem wykonania; dostawcy — automatycznie albo krokiem ręcznym z terminem w procedurze | E-03, E-04, E-19, E-20; E-21 albo krok w E-66 | prawo do usunięcia (WYM-24 — obecne W) |
| A9 | „Usunięta” organizacja nie jest przetwarzana; tekst w interfejsie zgodny z kodem; pełny eksport organizacji dostępny | E-02, E-25 | obietnica w interfejsie (WYM-45 — obecne W); zwrot danych po zakończeniu (art. 28 ust. 3 lit. g [NZ]) |
| A10 | Rejestr żądań, wyszukiwanie osoby, procedura DSAR, kanał poczty na skrzynkę służbową | D-10, E-22, E-66 | osoby bez konta to największa grupa (WYM-17, WYM-21 — K1 W) |
| A11 | Funkcje AI: NIP poza promptem, informacja przy użyciu, wybór klienta dla kategoryzacji (albo polecenie w umowie), DPIA | E-11, E-12, E-17, E-60 | dane kontrahentów i dokumenty kosztowe do USA bez wyboru (WYM-62 — K1 W) |
| A12 | Rejestry art. 30, mapa podstaw, LIA, screening DPIA, ocena IOD przyjęte; rejestr dostawców z TIA | E-59, E-61 | rozliczalność (WYM-10, WYM-48, WYM-40 — K1 W) |
| A13 | Kopie zaszyfrowane poza hostem: 7 kolejnych udanych dni; pierwsza udana próba odtworzenia z protokołem | E-53, E-54 | utrata hosta = utrata danych klientów (WYM-51 — obecne W) |
| A14 | Procedura naruszeń z rejestrem i dyżurem z zastępcą; ocena RUN-08 zapisana | D-15, E-67 | terminy zgłoszeń; zawiadomienie klienta (WYM-52, WYM-53 — K1 W) |
| A15 | Dostęp: przegląd kont, konta imienne, MFA (w tym dla operacji wrażliwych przed KSeF PROD), upoważnienia i zobowiązania do poufności; odczyty operatora w dzienniku | E-36, E-68, E-69 | dostęp do danych wszystkich klientów bez rozliczalności (WYM-35, WYM-47 — K1 W) |
| A16 | E-maile nietransakcyjne fail-closed; Reply-To klienta w wiadomościach do kontrahentów | E-13, E-14 | wiadomości bez wypisu; korespondencja kontrahentów u operatora (WYM-66, WYM-67) |
| A17 | PESEL domyślnie „bez identyfikatora” | E-29 | identyfikatory konsumentów zbierane domyślnie (WYM-X-03 — K1 W) |
| A18 | Job RLS wymagany do scalenia | E-70 | regresja izolacji firm może trafić na `main` (WYM-09) |
| A19 | Rotacja klucza poświadczeń KSeF wykonana | E-56 | także punkt bramki PLAN-ZERO (I1) |

### 8.2. Bramka B — przed zdarzeniem (nie blokuje startu, blokuje zdarzenie)

| Zdarzenie | Warunek | Etapy |
|---|---|---|
| Pierwsze trwałe usunięcie organizacji (najwcześniej 30 dni po pierwszym „Usuń organizację” klienta) | wykonawca `hard_delete_at` po decyzji Q-ZR-01; tryb „na sucho” zaakceptowany | E-50 |
| Pierwszy termin retencji faktury albo import historii starszej niż okres | reguła okresu po review; ścieżka serwisowa wyzwalacza; kolejność plik/wiersz | E-51 |
| Pierwsze odtworzenie produkcji z kopii | ponowienie usunięć po odtworzeniu | E-55 |
| Pierwsza kampania marketingowa lub uruchomienie newslettera | model zgody z zapisem; treść po review | E-65 |
| Włączenie `payment.score` albo części FLO z modelem | DPIA (E-60) i zmiana strażnika (E-28) z odsyłaczem do oceny | E-28, E-60 |
| Rozpoczęcie badania SOC 2 | decyzja D-13; opis systemu; dowody z okresu | E-72 – E-75, E-79 |
| Przekroczenie progu skali z D-14 | ponowny screening DPIA | E-59 |

### 8.3. Warunki spoza etapów

- Review prawne zakończone dla E-59, E-62, E-63 (bez tego A3, A4, A12
  nie są spełnione).
- Pierwszy prawdziwy klient nie jest wprowadzany przez import historii
  sprzed okresu retencji, dopóki nie ma E-51 (inaczej bramka B
  „pierwszy termin” zadziała od pierwszego dnia).
- Ryzyko „obecne” z `05` przeliczone po D-02: jeśli odczyt pokaże
  prawdziwe dane już dziś, bramka A obowiązuje **natychmiast**, a A2,
  A6, A8, A9 są pilne w tej kolejności.

## 9. Mapowanie na SOC 2

Identyfikatory kryteriów według `06` (TSC 2017 z punktami 2022 —
z pamięci modelu, niezweryfikowane online: N-ZR-11, NS-02). Mapowanie
mówi, **jakie dowody** etap może dać; nie oznacza spełnienia kryterium
ani gotowości do badania. Raport może wydać tylko niezależny audytor
(`06` § 9.4); plan nie zawiera i nie dopuszcza sformułowań „zgodny
z SOC 2” (strażnik w E-01).

### 9.1. Kategorie i kryteria → etapy

| Kategoria / kryterium [NZ] | Etapy dające dowód | Rodzaj dowodu |
|---|---|---|
| CC1 — środowisko kontroli | E-68, E-74, E-79 | upoważnienia, szkolenia z potwierdzeniem, polityki z datą, opis systemu |
| CC2 — informacja i komunikacja | E-01, E-58, E-62, E-63, E-74, E-78 | wersje dokumentów, zapisy akceptacji, `security.txt` |
| CC3 — ocena ryzyka | E-59, E-60, E-74, E-76 | rejestr ryzyk, screening DPIA, DPIA, sekcja „dane osobowe” w PR |
| CC4 — monitorowanie kontroli | E-73, E-75, E-79 | alarmy, kalendarz dowodów, ocena gotowości (SOC-14) |
| CC5 — działania kontrolne i polityki | E-74 | zatwierdzone polityki, przeglądy roczne |
| CC6 — dostęp logiczny i fizyczny | E-05, E-32, E-33, E-35, E-36, E-43, E-56, E-69, E-70; CC6.5 — E-02, E-50, E-57 | przeglądy dostępów, MFA, wpisy `admin.read`, testy RLS, protokół rotacji klucza, przebiegi usuwania |
| CC7 — operacje (monitoring, incydenty) | E-09, E-15, E-36, E-41, E-67, E-73, E-75, E-78 | wyniki skryptów, rejestr incydentów, protokoły ćwiczeń, raporty skanów |
| CC8 — zarządzanie zmianami | E-28, E-37, E-38, E-70, E-71, E-72, E-76, E-77 (oraz test na bazie w każdym etapie kodu) | eksport rulesetu, wpisy `ops.deploy.*`, zatwierdzenia scalenia, historia CI |
| CC9 — ograniczanie ryzyka, dostawcy | E-53, E-61, E-74 | rejestr dostawców, raporty atestacyjne dostawców, kopie |
| A1 — dostępność | E-53, E-54, E-55, E-74 | historia kopii, protokoły prób odtworzenia, RTO/RPO, monitor dostępności |
| PI1 — integralność przetwarzania | E-10, E-28, E-48, E-51, E-75, E-77; bramka PLAN-ZERO | konfiguracja środowiska KSeF w dzienniku wydań, wyniki strażnika, scenariusze KSeF TEST |
| C1 — poufność | E-02, E-31, E-33, E-35, E-36, E-43, E-45, E-49, E-50, E-51, E-53, E-56, E-74 | klasyfikacja, szyfrowanie kopii, przebiegi usuwania, rotacja kluczy |
| P1 — informacja | E-01, E-12, E-58, E-63, E-64 | wersje polityki, informacje w punktach zbierania |
| P2 — wybór i zgoda | E-06, E-13, E-17, E-18, E-27, E-58, E-65 | zapisy zgód z wersją, e2e zgody |
| P3 — zbieranie | E-07, E-08, E-11, E-29, E-30, E-32, E-34, E-48, E-49 | testy minimalizacji |
| P4 — wykorzystanie, retencja, usuwanie | E-02, E-03, E-04, E-20, E-21, E-40, E-44 – E-47, E-50 – E-52, E-55 | rejestr retencji, przebiegi jobów, wpisy `gdpr.deletion_executed` |
| P5 — dostęp i korekta | E-22, E-23, E-24, E-26 | rejestr żądań, eksporty |
| P6 — ujawnianie i powiadamianie | E-05, E-14, E-16, E-61, E-62, E-67 | lista dalszych procesorów, umowy, rejestr naruszeń |
| P7 — jakość | E-24 | sprostowanie danych konta |
| P8 — monitorowanie i skargi | E-22, E-66 | rejestr żądań i skarg, przegląd kwartalny |

Rekomendacja `06` § 9.2: pierwsze badanie **Security + Availability**
(po E-53 i E-54); Processing Integrity po ≥ 3 miesiącach KSeF PROD;
Confidentiality — na żądanie klientów; Privacy — nie (obowiązki
prywatności wynikają z RODO; etapy P1–P8 służą przede wszystkim RODO).

### 9.2. Luki SOC-NN (`06` § 8) → etapy

| SOC | Etapy | SOC | Etapy | SOC | Etapy |
|---|---|---|---|---|---|
| SOC-01 | E-72 | SOC-13 | E-68 | SOC-25 | E-10 (+ bramka PLAN-ZERO) |
| SOC-02 | E-71 | SOC-14 | E-74, E-79 | SOC-26 | E-75 |
| SOC-03 | E-70 | SOC-15 | E-74 | SOC-27 | E-74 |
| SOC-04 | E-72, E-47 | SOC-16 | E-67 | SOC-28 | E-56 |
| SOC-05 | E-72, E-09 | SOC-17 | E-75, E-73, E-47, E-41 | SOC-29 | E-02, E-03, E-45, E-50, E-51, E-55 |
| SOC-06 | E-77, E-10 | SOC-18 | E-61 | SOC-30 | E-53, E-43 |
| SOC-07 | E-69 | SOC-19 | E-78 | SOC-31 | E-01, E-58, E-63 |
| SOC-08 | E-69 | SOC-20 | E-78 | SOC-32 | E-06, E-07, E-09, E-18 |
| SOC-09 | E-69 | SOC-21 | E-53 | SOC-33 | E-22, E-23, E-24, E-26, E-66 |
| SOC-10 | E-69 | SOC-22 | E-54 | SOC-34 | E-40, E-44 – E-47 |
| SOC-11 | E-36 | SOC-23 | E-74 | SOC-35 | E-61, E-62, E-67 |
| SOC-12 | E-74 | SOC-24 | E-74, E-62 | SOC-36 | E-66 (+ D-10) |

Warunek wstępny poza tabelą (`06` § 8.6): podmiot i kierownictwo — D-01.

## 10. Pokrycie macierzy

**Wymagania.** Każde z 85 wymagań macierzy `05` (82 z katalogu `03`
+ 3 WYM-X) ma co najmniej jeden etap. Sprawdzone skryptem: z pól
„Pokrywa” 79 kart (E-01 – E-79) wyciągnięte identyfikatory WYM —
85 z 85, bez nadmiarów. Ta sama lista wypełnia kolumnę „Etap planu”
w `05` (E-00 pomijam — to warunek wejścia, nie realizacja; zależności
od D-NN są w kartach).

**Wymagania, których nie da się zacząć bez decyzji lub review (30):**
WYM-01, -02, -04, -11, -12, -15, -18, -20, -25, -26, -30, -39, -40,
-41, -43, -48, -49, -52, -53, -54, -55, -56, -57, -59, -60, -61, -68,
-69, -70 i WYM-SOC-6. To głównie dokumenty (rejestry, umowa, polityka,
procedury), które czekają na podmiot (D-01), odczyty umów i paneli
(D-03, D-04), decyzje retencyjne (D-05) i review prawne. Dlatego D-01
i D-03 – D-05 są w E-00 oznaczone jako pilne.

**Ustalenia.** Każde ze 159 ustaleń wymienionych w `05` § 11 jest
nazwane w co najmniej jednej karcie (sprawdzone skryptem 13.10). Siedem
ustaleń dopisałem do kart po pierwszym sprawdzeniu: DOW-14 (E-18, E-75),
DOW-21 (E-61, E-79), PRA-07 (E-13, E-27), RUN-09 (E-63) oraz ustalenia
pozytywne do utrzymania — DOW-16, RUN-01, RUN-02 (E-18, E-75: regresja
w CI, nie naprawa).

**Testy z `A3` § 5.** T-01 – T-21 mają miejsce w kartach: T-01, T-02 —
E-23; T-03 — E-04 (część), E-20 (pełny); T-04 — E-50; T-05 — E-51;
T-06 — E-45, E-50; T-07 — E-47; T-08 — E-40; T-09 — E-18; T-10 — E-09;
T-11 — E-27; T-12, T-13 — E-15; T-14, T-15 — E-70; T-16, T-17 — E-36;
T-18 — E-73; T-19 — E-34; T-20 — E-01 (część), E-63 (pełny); T-21 —
E-58, E-63.

**Materiały `09`.** § 1–4 → E-59, E-60; § 5 → E-61; § 6–7 → E-62;
§ 8 → E-22, E-66; § 9 → E-67; § 10 → D-05, E-40 i etapy retencji;
§ 11 → E-63; § 12 → E-05 – E-09, E-18, E-27, E-63; § 13 (materiały
nieprzygotowane: ocena IOD, upoważnienia, rejestr umów, pełna DPIA) →
E-59, E-68, E-61, E-60.

## 11. Czego plan nie obejmuje i dlaczego

| Poza planem | Dlaczego | Gdzie trafia |
|---|---|---|
| Brzmienie przepisów, klauzul, okresów retencji i podstaw prawnych | wymaga odczytu źródeł pierwotnych (egress zablokowany, WebSearch odrzucony) i oceny prawnika; plan podaje strukturę dokumentów, zależności i pytania | końcowe review prawne (`03` § 5.2, `A2`/`A3`/`06` pytania; `08` w budowie) |
| Harmonogram kalendarzowy i wycena | zależy od dostępności zespołu i decyzji E-00; S/M/L to tylko względna wielkość | decyzja właściciela |
| Przepisanie historii gita (adresy infrastruktury z dawnej wersji `AGENTS.md`, plik z DOW-19) | operacja nieodwracalna na repo publicznym, wymaga decyzji i koordynacji klonów; `AGENTS.md` sam zaznacza, że historia zostaje | decyzja właściciela; E-38 usuwa tylko z bieżącego drzewa |
| Plan „zero zgubionych faktur” (go-live KSeF, bramka wydania) | osobny plan z własnym protokołem i dziennikiem; tu tylko punkty styku | E-10 (środowisko), E-48 (payloady), E-51 (retencja), E-56 (klucz — I1); bramka § 8 wymaga obu bramek |
| Bezpieczeństwo poza prywatnością (ustalenia SEC-* z `docs/security/audyt/*`, np. 78 zapytań kluczem serwisowym do przeglądu) | inny audyt; dubluję tylko tam, gdzie luka dotyczy danych osobowych | `docs/security/audyt/*`; E-33 jako jedyny przypadek przejęty |
| Zmiana dostawców i stosu (MinIO bez wsparcia, model AI w regionie UE, plan Sentry Team EU) | decyzje produktowe i kosztowe; stos jest niezmienny wg `AGENTS.md`, chyba że właściciel zdecyduje | D-12 (i), (j); E-74 (ryzyko MinIO) |
| Formalne badanie SOC 2 (wybór audytora, okres, Type I/II) | decyzja biznesowa (NS-13); przegląd gotowości nie jest badaniem | E-79 przygotowuje decyzję i opis systemu |
| Przepisy sektorowe (krajowe wdrożenie NIS2, przepisy KSeF o uprawnieniach i tokenach) | poza zakresem zadania 13 (N-ZR-13) | decyzja koordynatora o rozszerzeniu |
| Uruchomienie części FLO z modelem i `payment.score` | funkcje wyłączone; wymagają DPIA i decyzji | bramka B (§ 8.2): E-28, E-60 |
| Automatyczny eksport danych osoby z PostHog i Sentry (art. 15) | niska wartość przy obecnej skali; wystarczy procedura | E-66 (informacja i obsługa ręczna), E-21 (usuwanie) |
| Treść szkoleń | E-68 wskazuje potrzebę i zakres, nie materiał | właściciel |
| Ocena, czy RUN-08 było naruszeniem wymagającym zgłoszenia | ocena prawna faktów, których nie znamy (logi dostawców) | E-67 (ocena i zapis w rejestrze), review |

## 12. Niewiadome i ograniczenia

| ID | Niewiadoma | Wpływ na plan | Rozstrzyga |
|---|---|---|---|
| N-01 (N-INW-13, N-PRC-11, NS-01) | podmiot administratora | blokuje tor prawny (E-59, E-62, E-63, E-67, E-74, E-79) i bramkę A1 | D-01 |
| N-PRC-10 | czy na produkcji są prawdziwe dane i czy coś prawdziwego trafiło do KSeF TEST | jeśli tak — bramka A obowiązuje od razu (§ 8.3), a E-67 ocenia zdarzenie | D-02 |
| N-PRC-01, N-DOW-05, N-ZR-10 | umowy z dostawcami | E-61, E-62, E-60 | D-04 |
| N-PRC-02, NA1-02, NA1-03 | ustawienia paneli | E-09, E-21, E-63 | D-03 |
| N-A2-01, N-A2-13 | postać wyzwalaczy na produkcji | E-03 i E-50 testują mechanizm na bazie lokalnej; produkcja może się różnić | D-06 |
| N-A2-04, N-A2-05 | liczba faktur z terminem usunięcia i firm „usuniętych” | pilność E-02, E-50, E-51 | D-06 |
| N-DOW-01 | dokumenty poza repo | etapy F5 mogą startować od istniejących dokumentów, a nie od zera | D-07 |
| N-DOW-11, NS-07 | czy bramka `/wdroz` działa | zakres E-72 (uruchomić czy zweryfikować) | D-06 |
| NS-14 | rekordy poświadczeń KSeF w formacie v1 | zakres E-56 | D-06 (wykonuje sam E-56) |
| N-ZR-01 – N-ZR-06, Q-ZR-01, Q-ZR-02 | brzmienie przepisów; okres faktur | E-51, E-50, E-63, E-65 | review prawne |
| NS-02, N-ZR-11 | tekst TSC 2017 i DC 200 | identyfikatory w § 9 | odczyt AICPA przed użyciem w badaniu |

**Ograniczenia tego planu:**

- **Dryf wersji.** Linie `ścieżka:linia` dotyczą `3e5e00d`; `main` poszedł
  dalej (`face09c` 10.10, przebudowa importu), a produkcja według [PR225
  @a72b567] działa na `43091e7`. Każdy etap zaczyna się od świeżej gałęzi
  z `origin/main` i ponownego `grep` miejsc z pola „Zakres”.
- **„Przed: czerwony”** to przewidywanie z kodu i raportów — testów nie
  pisałem ani nie uruchamiałem (etap badawczy nie zmienia repo). Tam,
  gdzie wynik przed zmianą jest nieznany (T-01, T-13, T-14, T-15), karta
  to mówi i nie uznaje zielonego testu za dowód naprawy.
- **Nakładanie się z pracami w toku.** PR #225 (kopie, retencja telemetrii,
  dyżur) i plan „zero zgubionych faktur” obejmują część E-10, E-41, E-53,
  E-54, E-56, E-75 — w kartach wskazałem koordynację, ale nie sprawdzałem
  stanu tych gałęzi po `c2ab6a8`/`a72b567`.
- **Kolejność i podział na etapy** to propozycja (I). Inny podział jest
  dopuszczalny, jeśli zachowuje zasadę „jedna naprawa = jeden PR” i nie
  przesuwa etapów F1–F2 za dokumenty F5.
- `05` i `09` nie przeszły jeszcze niezależnej recenzji; `08` był
  w chwili pisania w budowie — plan opiera się na ich obecnym brzmieniu.
- Plan nie przeszedł niezależnej recenzji (autor nie zatwierdza własnego
  etapu).

## 13. Co sprawdziłem / czego nie

**Przeczytałem (13.10.2026):**

- `BRIEF.md` z ADDENDUM 1–3 i `00-ZADANIE.md` — w całości.
- `05-MACIERZ-WYMAGAN.md`: nagłówek, § 1, wszystkie 85 wierszy macierzy
  (kolumny ID, wymaganie, klasa, stan, ryzyko, zmiana, zależność —
  wyciąg skryptem), § 12–14.
- `09-MATERIALY-ROBOCZE.md`: nagłówek, § 0, § 10 (31 pozycji RT-…),
  § 12.1–12.2, § 13–15; nagłówki pozostałych sekcji.
- `06-SOC2.md` § 8 (SOC-01 – SOC-36), § 9, § 10, § 11; `A3` § 4.3–4.4,
  § 5 (T-01 – T-21), § 8, § 9 (P-01 – P-12); `A2` PRA-03, PRA-04,
  PRA-08 w całości, rekomendacje PRA/RET/AI, „Najważniejsze ryzyka”,
  niewiadome i pytania do review; `A1` B.0, C.0, MIN-03 – MIN-05, MIN-10,
  rekomendacje, tabele deklaracji; `A4` § 5 (RUN-01 – RUN-11) i § 6;
  `02` tabela INW i INW-07; `04` tabela PRC; `03` § 5 (N-ZR, Q-ZR);
  `01` § 5.
- Recenzje: `R4.md` (uwagi dla etapów `05` i `07`: bramka `/wdroz`,
  `ops/poczta`, retencja wpisów `ops.*`); przeszukanie R1–R4 pod kątem
  uwag do planu. Tabele „Historia recenzji” wszystkich 9 raportów
  (`01` – `04`, `A1` – `A4`, `06`) oznaczają uwagi swojej grupy jako
  naniesione (sprawdzone 13.10); recenzji nienaniesionej nie znalazłem,
  więc plan nie nanosi poprawek za recenzentów. Nie porównywałem każdej
  uwagi z treścią raportu.
- `docs/koordynacja/PLAN-ZERO-ZGUBIONYCH-FAKTUR.md` (blok F, bramka § 8),
  `docs/koordynacja/CLAUDE-DO-CODEXA.md:91` (następny wolny numer migracji
  `00149` na `3e5e00d`).

**Sprawdziłem w kodzie (`git grep`/`git show` na `3e5e00d`):**

| Sprawdzenie | Wynik | Użyte w |
|---|---|---|
| zapisy `hard_delete_at` | 2 (`app/admin/users/actions.ts:173`, `components/settings/account-actions.ts:62`), brak czytelnika | E-02, E-50 |
| domyślne `KSEF_ENV ?? 'test'` | 12 miejsc — 10 w `app/` i `lib/`, 2 w `scripts/` (m.in. `submit-invoice.ts:628`, `ksef-submit-enqueue.ts:127`, `lib/ksef/client.ts:49,246`); wzorzec bez domyślnej wartości — `lib/ksef/claim-environment.ts` (`requireConfiguredKsefEnvironment`) | E-10 |
| joby wybierające firmy | 8 plików z `from('tenants')`; 0 filtrów `deleted_at` w `lib/jobs/runners`, `auth-context.ts`, `middleware.ts`, `proxy.ts` | E-02 |
| `gdpr_deletion_requests` | brak kolumn źródła i autora (`00051`) | E-03 |
| `logAudit` przy błędzie | tylko `console.error('[audit] write_failed')` (`lib/audit/log.ts:146-168`); `logAuditAdmin` nie istnieje | E-36, E-73 |
| `canSendTo` | `if (!userId) return { ok: true }` (`lib/email/preferences.ts:167`); brak sekretu wypisu → wysyłka bez nagłówków (`send.ts:193`); `replyTo: SUPPORT_EMAIL` (`send.ts:200`) | E-13, E-14 |
| `validation_cache` | `GRANT SELECT … TO authenticated` i polityka (`00022:57-62`); odczyty tylko `createAdminClient` (`lib/validation/cache.ts:95`); 0 odczytów w `app/`, `components/` | E-33 |
| prompt kategoryzacji | `nip: data.seller_nip` (`lib/categorization/ai-classifier.ts:48`) | E-11 |
| `last_webhook_payload` | odczyt jako migawka faktury własnej (`self-invoice-payment.ts:158`) | E-39 |
| proxy telemetrii | rewrites `next.config.ts:140-155`, `tunnelRoute` `:189`; `lh3.googleusercontent.com` `:96` | E-05, E-37 |
| font Google, Sentry | `app/layout.tsx:114,124`, `csp.ts:30`; `tracesSampleRate: 0.1` (`instrumentation-client.ts:8`) | E-06, E-07 |
| rejestracja | `required` przy „Imię i nazwisko” (`register/page.tsx:111-117`) | E-30 |
| testy i crony | 8 plików `tests/rls-*`; „27 cronów” na sztywno (`tests/unit/jobs-foundation.test.ts:186`); crony RODO i retencji (`lib/jobs/queues.ts:91,105,123`) | § 0.1, E-44 |
| szablon PR, skrypty | 7 sekcji szablonu bez pola o danych osobowych; `scripts/ops/` — 2 skrypty | E-75, E-76 |
| istnienie plików z pól „Zakres” | runbooki (`backup-restore`, `key-rotation`, `bramka-telegram`, `hamulce-ksef`, `scaling-triggers`), `lib/auth/sensitive-mfa.ts`, `scripts/ci/agent-guard.mjs`, `renovate.json`, `scripts/hetzner/db-backup.sh`, `lib/storage/glacier.ts`, `gdpr-section.tsx`, `lib/rate-limit/index.ts` i in. — istnieją | karty |

Programowo (13.10): 85 z 85 WYM pokrytych polami „Pokrywa”; 159 ze 159
ustaleń z `05` § 11 nazwanych w planie; liczby w § 2 policzone z tabeli.

**Nie sprawdziłem / nie mogłem sprawdzić:**

- Produkcji, paneli dostawców, umów — brak dostępu; plików gałęzi PR #225
  nie czytałem (fakty z briefu i raportów).
- Źródeł prawa i AICPA — egress zablokowany; WebSearch nie używany
  zgodnie z decyzją właściciela.
- Testów — niczego nie uruchamiałem; stany „przed” to przewidywania.
- Każdego `ścieżka:linia` cytowanego za raportami (np. `lib/rate-limit/index.ts:130-135`,
  `components/onboarding/actions.ts:94-117`, `lib/flo/flags.ts:41-49`) —
  potwierdziłem istnienie plików, linie przyjąłem z raportów po recenzjach.
- `02`, `03`, `04` w całości — tylko tabele ustaleń, pytania i niewiadome.

Poza tym plikiem zmieniłem wyłącznie kolumnę „Etap planu” w `05`.
Nie zmieniałem kodu, migracji ani konfiguracji; nie commitowałem i nie
pushowałem; nie czytałem `docs/automation/` ani `.agents/`.
