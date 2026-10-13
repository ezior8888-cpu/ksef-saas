# Recenzja R5a — Macierz wymagań (05) i plan etapów (07)

| | |
|---|---|
| Autor | niezależny agent-recenzent R5a (nie jest autorem recenzowanych plików; plików nie edytował) |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (odczyty przez `git show 3e5e00d:<plik>` i `git grep … 3e5e00d`) |
| Zakres | `docs/audyt/13-prywatnosc-i-zgodnosc/05-MACIERZ-WYMAGAN.md` (629 linii), `07-PLAN-ETAPOW.md` (3142 linie) |
| Źródła | `BRIEF.md` z ADDENDUM 1–3; `00-ZADANIE.md` (pkt 7); raporty `01`, `02`, `03`, `04`, `A1`–`A4`, `06` (tabele ustaleń, szczegóły wybranych ustaleń, historie recenzji); recenzje `R1.md`–`R4.md` (fragmenty z uwagami dla `05`/`07`); `AGENTS.md` (protokół naprawy, migracje, wdrożenie); kod na `3e5e00d` |
| Ograniczenia | Bez WebSearch (decyzja właściciela), bez dostępu do produkcji, paneli i umów; przepisy wyłącznie jako [NZ] za raportami. Nie uruchamiałem testów repo. `08` i `09` poza zakresem (czytane tylko w miejscach, do których odsyłają `05`/`07`) |

## 1. Werdykt per plik

| Plik | Werdykt | Uzasadnienie (skrót) |
|---|---|---|
| `05-MACIERZ-WYMAGAN.md` | **zatwierdzony z uwagami** | Kształt zgodny z pkt 7 (wszystkie 9 kolumn + „Etap planu”). Pokrycie pełne: 82/82 WYM z `03` + 3 WYM-X, 159/159 ustaleń (sprawdzone skryptem). Klasy P/O/S/I identyczne z katalogiem (82/82). Liczby w § 12.1 i rozkład ryzyk zgodne z tabelami. 13 z 14 sprawdzonych dowodów kodu potwierdzonych. Jeden błąd stanu (WYM-29 „nie dotyczy” — R5a-U03) i nieaktualne zdania o kolumnie „Etap planu” (R5a-U05). |
| `07-PLAN-ETAPOW.md` | **wymaga poprawek** (bez uwag blokujących) | Karty mają test czerwony, akceptację, migracje z kierunkiem, wycofanie i „Po wdrożeniu” zgodne z `AGENTS.md` (worker → web, `schema_migrations`, `NOTIFY pgrst`, typy z produkcji). Kolumna „Etap planu” w `05` = pola „Pokrywa” kart (85/85, 0 różnic). Ale: bramka A pomija 4 wymagania z ryzykiem K1 = W, w tym retencję — ryzyko #6 z `05` (R5a-U01); DOW-10 nie ma karty, a § 10 twierdzi 159/159 (R5a-U02); ocena RUN-08 jako możliwego naruszenia jest „pilna”, ale zamknięta w etapie czekającym (R5a-U04). Poprawki są gotowe do naniesienia; ponowna recenzja niepotrzebna, wystarczy kontrola koordynatora. |
| **Łącznie (najgorszy)** | **wymaga poprawek** | 4 uwagi istotne, 7 drobnych, 0 blokujących |

## 2. Zgodność z pkt 7 zadania (`00-ZADANIE.md:152-178`)

| Wymóg pkt 7 | Gdzie | Ocena |
|---|---|---|
| Macierz: ID → źródło → stan → dowód → luka → ryzyko → zmiana → test → zależność | `05` § 2–10, 13 kolumn w każdym z 85 wierszy (parser: 0 wierszy z inną liczbą komórek) | spełnione |
| Stany tylko z 5 wartości, „nie dotyczy” z uzasadnieniem | `05` (rozkład: potwierdzone 1, częściowe 43, brak 36, niezweryfikowane 4, nie dotyczy 1) | spełnione formalnie; WYM-29 — błędny stan (R5a-U03) |
| „Nie znaleziono” ≠ „nie istnieje” | `05` § 1 (kolumna „Stan”), § 13 N-DOW-01; `07` § 0.5 | spełnione |
| Plan małych, spójnych etapów z kryteriami akceptacji, testami, migracjami i wycofaniem | `07` § 3–7 (80 kart) | spełnione w kartach kodu; etapy L łączą kilka napraw (R5a-U09); E-78 bez testu czerwonego (R5a-U10) |
| Najważniejsze ryzyka i zalecana kolejność zmian | `05` § 12.2 (15 ryzyk), `07` § 1.1–1.4 | spełnione |
| Rejestr niewiadomych | `05` § 13, `07` § 12 (z odesłaniem do `08`) | spełnione |
| Review kompletności: każdy obszar ma ustalenie, dowód albo ograniczenie i dalszą ścieżkę | `05` § 11, `07` § 10 | prawie: DOW-10 bez ścieżki w planie (R5a-U02) |
| Mapowanie SOC 2 | `07` § 9 (kategorie → etapy, SOC-NN → etapy, wszystkie [NZ]) | spełnione |

## 3. Tabela kontroli punktowych

Wynik: **32 kontrole, 29 potwierdzonych, 3 z błędem** (K06, K26, K27).

| # | Teza (plik:miejsce) | Sprawdzenie | Wynik |
|---|---|---|---|
| K01 | `05`: 82 WYM z `03` + 3 WYM-X | skrypt: ID z `03` § 3 vs wiersze `05` § 2–10 | potwierdzone — 82 = 82, brak nadmiarów i braków |
| K02 | `05` § 11.9: 159 ustaleń, 0 bez WYM | ID z nagłówków `02`, `04`, `A1`, `A2`, `A3`, `A4` i tabeli `06` vs § 11 | potwierdzone — 19+17+24+29+23+11+36 = 159 |
| K03 | `05` § 12.1: liczby stanów, rozkład ryzyk, 8 wymagań „obecne W” | parser kolumn „Stan” i „Ryzyko” | potwierdzone (WYM-SOC-1 liczone jako Ś → W, zob. R5a-U10) |
| K04 | `05` § 1: klasy wg `03` § 4 | porównanie kolumny „Klasa” `03` vs `05` dla 82 WYM | potwierdzone — 0 różnic |
| K05 | `07` § 10: „Etap planu” w `05` = pola „Pokrywa” kart | skrypt: WYM z „Pokrywa” 79 kart vs kolumna `05` | potwierdzone — 85/85, 0 różnic |
| K06 | `07` § 10: „każde ze 159 ustaleń … nazwane w co najmniej jednej karcie” | skrypt: ID ustaleń w § 4–7 | **obalone** — DOW-10 i SOC-34 nie występują w żadnej karcie (SOC-34 tylko w tabeli § 9.2); PRC-13 tylko w „Zakresie” E-78 (R5a-U02) |
| K07 | `07` § 2: 80 etapów, 48 „od razu”, 32 „czeka”, fale | parser tabeli § 2 | potwierdzone (F4 = 28 + E-53 „F4 (równolegle)”) |
| K08 | `05` WYM-X-03 / § 12.3 poz. 1: interfejs domyślnie PESEL, serwer `no_id` | `components/invoices/invoice-form.tsx:437,774`; `components/invoices/actions.ts:413` | potwierdzone |
| K09 | `05` WYM-SOC-7 „potwierdzone” (brak deklaracji SOC 2) | `git grep "SOC 2\|SOC2\|SOC-2" 3e5e00d -- app components content lib public` | potwierdzone — 0 trafień |
| K10 | `05` WYM-36/RUN-08, `07` E-05: rewrites `/ingest/*`, tunel `/monitoring` | `next.config.ts:139-155`, `:189` | potwierdzone |
| K11 | `07` E-02, E-50: 2 zapisy `hard_delete_at`, brak czytelnika; brak filtra `deleted_at` | `components/settings/account-actions.ts:62`, `app/admin/users/actions.ts:173`; `git grep -c deleted_at` w `lib/supabase/auth-context.ts`, `lib/supabase/middleware.ts`, `proxy.ts`, `lib/jobs/runners` = 0; `lib/jobs/runners/inbox-polling.ts:136-144` (tylko certyfikat i środowisko); wzorzec `lib/flo/tick.ts:305-306` | potwierdzone |
| K12 | `07` E-10 / § 13: 12 miejsc `KSEF_ENV ?? 'test'` (10 w `app/`+`lib/`, 2 w `scripts/`) | `git grep` | potwierdzone (m.in. `submit-invoice.ts:628`, `ksef-submit-enqueue.ts:127`, `lib/ksef/client.ts:49,246`) |
| K13 | `05` § 12.3 poz. 11, `07` E-50/E-51: blokada `DELETE` bez wyjątku dla roli serwisowej | `00132_ksef_lifecycle_guard_tighten.sql:63-73` | potwierdzone |
| K14 | `07` E-03: wyzwalacz audytu bez flagi `app.allow_audit_purge` | `00052_audit_logs_immutable_trigger.sql:16-41` | potwierdzone |
| K15 | `07` § 0.2, E-72: bramka `/wdroz` wdraża web przed workerem | `ops/bramka/src/deploy.mjs:120-124` | potwierdzone (odwrotnie niż `AGENTS.md`) |
| K16 | `07` E-13, E-14: `canSendTo` bez `userId` = OK; brak sekretu = bez nagłówków wypisu; `replyTo: SUPPORT_EMAIL` | `lib/email/preferences.ts:167`; `lib/email/send.ts:193,200` | potwierdzone |
| K17 | `05` WYM-06, `07` E-11: NIP sprzedawcy w prompcie | `lib/categorization/ai-classifier.ts:48` | potwierdzone |
| K18 | `07` E-33: `GRANT SELECT … TO authenticated` + polityka | `00022_validation_infrastructure.sql:59` (`GRANT`), `:61-63` (polityka) | potwierdzone |
| K19 | `05` WYM-06/MIN-02, WYM-X-01: imię wymagane; „Rejestrując się akceptujesz…” bez pola | `app/(auth)/register/page.tsx:117`, `:164-173` | potwierdzone |
| K20 | `05` WYM-X-01: logowanie Google bez informacji o dokumentach | `app/(auth)/login/page.tsx:66,91` | potwierdzone |
| K21 | `07` E-07: arkusz Material Symbols z Google | `app/layout.tsx:114` (`preconnect`), `:124` (arkusz) | potwierdzone |
| K22 | `07` E-73: `logAudit` przy błędzie tylko `console.error` | `lib/audit/log.ts:146-168` | potwierdzone |
| K23 | `07` § 0.1: „27 cronów” na sztywno; § 0.2: następny wolny numer 00149 | `tests/unit/jobs-foundation.test.ts:186`; `docs/koordynacja/CLAUDE-DO-CODEXA.md:91` | potwierdzone |
| K24 | `07` E-71: agent-guard rozpoznaje tylko `agent/*` i `claude[bot]` | `scripts/ci/agent-guard.mjs:21-22,68-73` | potwierdzone |
| K25 | `07` E-69: flaga MFA domyślnie wyłączona, błąd odczytu nie blokuje | `lib/auth/sensitive-mfa.ts:8-15` | potwierdzone |
| K26 | `07` E-32: `select('*')` w „7 plikach `app/**/page.tsx`” | `git grep -nE "select\(\s*['\"]\*" 3e5e00d -- 'app/**/page.tsx'` | **częściowe** — 10 plików; 7 z gołym `select('*')`, plus `payments/overdue/page.tsx:60` i `reports/kpir/page.tsx:47` (`{ count: 'exact' }`, zwracają wiersze) oraz `przeplywy/page.tsx:104` (`head: true`, bez wierszy). Liczba „przed” zależy od nieopisanego wzorca testu (R5a-U08) |
| K27 | `05` WYM-29 „nie dotyczy” | treść wymagania w `03` („ustalić **i udokumentować**”), luka w tym samym wierszu („brak zapisu oceny”), logika WYM-39 | **obalone** (R5a-U03) |
| K28 | `05` WYM-66, § 12.3 poz. 8: e-mail 8. dnia z treścią handlową | `lib/jobs/runners/email-sequence.ts:151-168` | potwierdzone |
| K29 | `05` § 12.3 poz. 15, WYM-18/19/41/53/16: linie stron prawnych | `polityka-prywatnosci/page.tsx:20` (placeholder), `:231` (audyt 12 mies.), `:232` (sesja); `rodo/page.tsx:47`, `:64`; `regulamin/page.tsx:18` (data), `:56` (pełnoletność); grep „powierz” w regulaminie = 0 | potwierdzone |
| K30 | `05` § 1, `07` § 13: historie recenzji raportów — uwagi naniesione | tabele „Historia recenzji” 9 raportów; R2-U27 w `04:11,496` | potwierdzone (zgodnie z ADDENDUM 3 R3 wskazał `ip: false` — w `A1:538` oznaczone [R3]) |
| K31 | `07` § 8: bramka A obejmuje wymagania z ryzykiem K1 = W | skrypt: WYM z K1 = W vs etapy z § 8.1 i § 8.2 | **luka** — WYM-08, WYM-30, WYM-33, WYM-X-02 bez etapu w bramce A ani B; WYM-71 tylko przez E-09 (R5a-U01) — liczone jako kontrola potwierdzona metodą, wynik opisany w uwadze |
| K32 | Zasady repo publicznego w `05`, `07` | grep: IPv4, e-maile, NIP 10-cyfrowe, PESEL, wzorce sekretów, imiona osób | potwierdzone — 0 IP, 0 e-maili, jedyny NIP to fikcyjny `1234567890` (`07:1457`), brak imion; RUN-08 opisany bez kroków wykorzystania |

## 4. Śledzenie (pokrycie WYM i ustaleń)

| Kierunek | Wynik | Braki |
|---|---|---|
| WYM `03` → wiersze `05` | 82/82 + 3 WYM-X = 85 wierszy | brak |
| Ustalenia raportów → `05` § 11 | 159/159; `01` i `03` nie mają ID ustaleń (tylko N-/Q-) | brak |
| WYM `05` → etap `07` | 85/85; kolumna „Etap planu” = „Pokrywa” kart (0 różnic) | brak |
| Ustalenia `05` § 11 → karty `07` | 157/159 | **DOW-10** (niezmienność audytu tylko wyzwalaczem; rekomendacja `A3`: eksport wpisów lub skrótów poza host w trybie tylko-dopisywania) — brak w kartach i brak zmiany w planie; **SOC-34** — tylko w tabeli § 9.2, nie w karcie; **PRC-13** — tylko w „Zakresie” E-78, nie w „Pokrywa” |
| Ryzyko K1 = W (47 wymagań) → bramka § 8 | 43/47 | **WYM-08** (ryzyko #6 w `05` § 12.2), **WYM-33**, **WYM-X-02**, **WYM-30**; WYM-71 tylko nominalnie (przez E-09) |
| Testy T-01 – T-21 (`A3` § 5) → karty | 21/21 | brak |
| Rekomendacje R4 dla `05`/`07` (`R4.md:291-297`) | 3/3: ujednolicone ryzyka (`05` § 12.3 poz. 4–5), bramka `/wdroz` i `ops/poczta` „uruchomić lub zweryfikować” (`07` § 7, E-72, E-67), retencja `ops.*` (E-47, E-72) | brak |

## 5. Uwagi

Wagi: **blokująca** — bez poprawki etap nie może przejść; **istotna** — błąd albo brak zmieniający wniosek, stan, bramkę lub pokrycie; **drobna** — precyzja i spójność.

### R5a-U01 — istotna — `07` § 8.1 (bramka A)

**Problem.** Bramka A nie obejmuje czterech wymagań, które `05` ocenia na K1 = W: WYM-08 i WYM-71 (retencja — ryzyko #6 w `05` § 12.2: czat, zdjęcia dokumentów, eksporty, newsletter bez okresu i wykonawcy), WYM-33 (wyszukanie NIP ujawnia każdemu zalogowanemu nazwy organizacji-klientów — E-31; `validation_cache` czytelne dla wszystkich — E-33; link-okaziciel 90 dni — E-43), WYM-X-02 (dane z produkcji w publicznym repo i kontekście agentów — E-38) oraz WYM-30 (polityki — E-74). Jednocześnie A4 wymaga polityki z okresami (art. 13 ust. 2 lit. a [NZ]), których bez E-40 i D-05 nie będzie. E-31, E-33 i E-38 są „od razu” i małe (S), więc pominięcie nie wynika z kosztu.

**Wymagana zmiana.** W `07` § 8.1 dopisać trzy wiersze:

| # | Warunek | Etapy | Dlaczego blokuje |
|---|---|---|---|
| A20 | Rejestr retencji w kodzie z decyzjami D-05 część (a); wykonawcy dla treści swobodnych, plików S3 poza fakturami i danych pomocniczych działają (co najmniej w trybie „na sucho” z raportem); kategorie bez decyzji mają wpis „okres do ustalenia” z datą przeglądu | D-05 (a), E-40, E-44, E-45, E-46 | dane osób bez relacji z FF zostają bezterminowo od pierwszego dnia (`05` WYM-08, WYM-71 — K1 W; ryzyko #6); polityka z A4 musi podać okresy |
| A21 | Wyszukanie NIP bez nazw organizacji; `validation_cache` tylko przez serwer; domyślny termin linku księgowej według decyzji | E-31, E-33, E-43 | od pierwszego klienta każdy zalogowany ustali, które firmy korzystają z FF (WYM-33 — K1 W) |
| A22 | Dane testowe bez prawdziwych NIP i domen; zasada „bez danych z produkcji w PR, issue, plikach i kontekście agentów” przyjęta; skrypty `scripts/ops/` zwracają agregaty | E-38 (zasady agentów — E-68) | pierwsze prawdziwe dane mogą trafić do publicznego repo albo dostawcy agenta — nieodwracalnie (WYM-X-02 — K1 W) |

W § 8.3 dopisać: „WYM-30 (polityki, K1 W) świadomie poza bramką A: minimalne polityki powstają w E-67 (incydenty, A14) i E-69 (dostęp, A15); pełne E-74 — warunek rozpoczęcia badania SOC 2 (§ 8.2)”. W § 10 dodać zdanie: „Każde wymaganie z ryzykiem K1 = W ma etap w bramce A albo B albo zapisane uzasadnienie w § 8.3 (sprawdzone skryptem)”.

### R5a-U02 — istotna — `07` § 10 i karty E-75, E-40, E-78

**Problem.** § 10 twierdzi, że każde ze 159 ustaleń jest nazwane w co najmniej jednej karcie. Skrypt R5a: DOW-10 i SOC-34 nie występują w żadnej karcie (§ 4–7); SOC-34 jest tylko w tabeli § 9.2. Dla DOW-10 (`A3:706-715`: niezmienność `audit_logs` tylko wyzwalaczem ze zmienną sesji, bez kopii poza hostem; rekomendacja — okresowy eksport wpisów lub skrótów poza host, tylko-dopisywanie, poprawa komentarza migracji) plan nie ma żadnej zmiany — rekomendacja ginie. PRC-13 jest tylko w „Zakresie” E-78.

**Wymagana zmiana.**
- E-75, pole „Pokrywa”: dopisać `DOW-10`. Pole „Zakres”: dopisać „dzienny eksport wpisów `audit_logs` (albo skrótów łańcuchowych) do magazynu kopii poza hostem bazy (cel z E-53) w trybie tylko-dopisywania; poprawka komentarza `00052_audit_logs_immutable_trigger.sql:5`, który przecenia ochronę”. Pole „Kroki”: dopisać test `tests/unit/audyt-eksport-skroty.test.ts` — „wpis zmieniony po eksporcie wykrywany przez porównanie skrótów — przed: **czerwony** (brak eksportu)”. Pole „Dowód SOC 2”: dopisać CC7.2.
- E-40, pole „Pokrywa”: dopisać `SOC-34`. E-78, pole „Pokrywa”: dopisać `PRC-13 (decyzja w E-74)`.
- § 10, akapit „Ustalenia”: po naniesieniu ponowić skrypt i dopisać „Po recenzji R5a dopisano DOW-10 (E-75), SOC-34 (E-40), PRC-13 (E-78)”.

### R5a-U03 — istotna — `05` wiersz WYM-29 (linia 141), § 12.1

**Problem.** Wymaganie w katalogu brzmi „Art. 22: ustalić **i udokumentować** brak decyzji wyłącznie zautomatyzowanych”. Ten sam wiersz podaje lukę „brak zapisu oceny w dokumentach”, a plan przewiduje zapis (E-59) i strażnika (E-28). Stan „nie dotyczy” opisuje więc przedmiot art. 22 (decyzji nie znaleziono — PRA-08), a nie wymaganie. Niespójne z WYM-39 w tej samej macierzy, gdzie autor słusznie odmówił „nie dotyczy” właśnie dlatego, że brak udokumentowanej oceny.

**Wymagana zmiana.** WYM-29, kolumna „Stan”: „częściowe”; początek kolumny „Dowód” zmienić na „ustalone w audycie: decyzji wyłącznie zautomatyzowanych nie znaleziono (PRA-08) — …” (reszta bez zmian). § 12.1: wiersz D → częściowe 10, nie dotyczy 0; „Razem” → częściowe 44, nie dotyczy 0; zdanie „Z katalogu (82 wymagania)” → „częściowe 43 … nie dotyczy 0”; usunąć zdanie „„Nie dotyczy” (WYM-29) jest wstępne i wymaga zapisu oceny.” i dopisać „Żadne wymaganie nie ma stanu „nie dotyczy” — dla art. 8, 10, 22 i 26 brak zapisanej oceny (WYM-16, WYM-29, WYM-39)”. W `07` nic nie trzeba zmieniać (E-28, E-59 już to pokrywają).

### R5a-U04 — istotna — `07` E-00 (§ 3), E-05, E-67, § 8.1 A14

**Problem.** E-67 nazywa ocenę RUN-08 (ciasteczka sesji pierwszej strony przekazywane do PostHog i Sentry) „pilną niezależnie od reszty”, ale ocena siedzi w etapie, który **czeka** na D-01, D-15, E-62 i review, a bramka A14 wymaga jej dopiero przed pierwszym klientem. Termin z art. 33 [NZ] biegnie od stwierdzenia naruszenia, a nie od bramki; `A4:432-434` stawia to pytanie wprost. Brak też technicznego domknięcia po E-05: ciasteczka sesji przekazane przed poprawką pozostają ważne do wygaśnięcia.

**Wymagana zmiana.**
- § 3, tabela E-00: dodać wiersz „D-16 | **Ocena RUN-08** (art. 33 [NZ]): czy przekazanie ciasteczek sesji do dostawców telemetrii jest naruszeniem, kogo dotyczy (wg D-02), czy zgłaszać; pytania do dostawców o logowanie nagłówków (D-03) | `A4` pyt. 4; N-PRC-10 | E-67 (wpis do rejestru), A14 | właściciel (+ review) | decyzja z datą i uzasadnieniem, zapisana prywatnie; w repo — data i wynik tak/nie”. W akapicie „Pozycje pilne” dopisać D-16.
- E-05, pole „Po wdrożeniu”: dopisać „decyzja właściciela o unieważnieniu istniejących sesji (wymuszone ponowne logowanie) po wdrożeniu poprawki — (I), wynik w D-16”.
- E-67, pole „Warunki”: zamienić zdanie o ocenie RUN-08 na odesłanie „ocena RUN-08 — D-16 (E-00), niezależnie od tego etapu”. § 8.1 A14: „ocena RUN-08 zapisana (D-16)”. § 12: dodać wiersz „D-16 / `A4` pyt. 4 — czy RUN-08 jest naruszeniem | wpis do rejestru (E-67), ewentualne zgłoszenie | D-16 + review”.

### R5a-U05 — drobna — `05` nagłówek (linia 9) i § 1, tabela kolumn (wiersz „Etap planu”)

**Problem.** Nagłówek mówi „Kolumnę „Etap planu” wypełni agent PLAN”, a § 1 — „„—” — wypełni agent PLAN”. Kolumna jest wypełniona (85/85, zgodna z `07`).

**Wymagana zmiana.** Nagłówek: „…podsumowanie. Kolumnę „Etap planu” wypełnił agent PLAN 13.10.2026 z pól „Pokrywa” kart `07` (zgodność 85/85 — R5a)”. § 1, wiersz „Etap planu”: „etapy z `07-PLAN-ETAPOW.md`, które pokrywają wymaganie (E-00 pominięty — to wejście, nie realizacja)”.

### R5a-U06 — drobna — `07` § 0.1 i § 0.2 (zgodność z `AGENTS.md`)

**Problem.** (a) § 0.2 nie powtarza zasady „migracje tylko z plików na `main` (ze scalonego PR)” ani obowiązku aktualizacji stanu w rejestrze migracji („wgrana na db-1 DD.MM”) przy najbliższym PR. (b) § 0.1 proponuje gałąź `claude/<eNN>-<ustalenie>-<temat>`, a `AGENTS.md` (pkt 1 protokołu) — `claude/<kod-ustalenia>-<temat>`.

**Wymagana zmiana.** (a) W § 0.2, punkt „Kto wgrywa”, dopisać na początku: „Wgrywa się wyłącznie pliki z `main` (ze scalonego PR) — migracji z nie-scalonej gałęzi nie wgrywa się.” i na końcu: „Po weryfikacji — stan „wgrana na db-1 DD.MM” w rejestrze `CLAUDE-DO-CODEXA.md` przy najbliższym PR.” (b) W § 0.1, wiersz 1: „gałąź `claude/<kod-ustalenia>-<temat>` zgodnie z `AGENTS.md`; prefiks `eNN` dopuszczalny jako rozszerzenie (np. `claude/e70-dow15-testy-rls`) — zgoda koordynatora”.

### R5a-U07 — drobna — `07` § 1.2 vs § 2 (zależności)

**Problem.** Diagram § 1.2 rysuje `E-02 ─► E-25`, a § 2 daje E-25 „od razu, —”; karta E-51 mówi „ścieżka serwisowa wspólna z E-50”, a § 2 nie podaje E-50 w „Czeka na” dla E-51; łańcuch „D-05 + E-40 ─► E-42 … E-47” obejmuje E-43, który czeka tylko na D-12, a E-42 w § 2 nie wymienia E-40.

**Wymagana zmiana.** § 1.2: linię zamienić na „E-02 wyłączenie firmy ─► E-50 ◄── E-25 pełny eksport”; „D-05 retencja + E-40 rejestr ─► E-42, E-44 … E-47, E-51, E-52 ─► E-63”. § 2: E-51 „Czeka na” — dopisać „E-50 (ścieżka serwisowa w wyzwalaczu) albo wspólny PR migracji”.

### R5a-U08 — drobna — `07` E-32 (pole „Zakres” i „Test czerwony”)

**Problem.** „7 plików `app/**/page.tsx`” — odczyt R5a na `3e5e00d`: 10 plików z `select('*'`; 7 z gołym `select('*')`, dodatkowo `app/(dashboard)/payments/overdue/page.tsx:60` i `app/(dashboard)/reports/kpir/page.tsx:47` (`{ count: 'exact' }` — zwracają pełne wiersze) oraz `app/(dashboard)/przeplywy/page.tsx:104` (`head: true` — bez wierszy). Test bez opisanego wzorca da inną liczbę „przed”.

**Wymagana zmiana.** W „Zakresie”: „na `3e5e00d` — 9 plików `app/**/page.tsx` zwracających pełne wiersze (7 × `select('*')`, 2 × `select('*', { count: 'exact' })`); `head: true` (`przeplywy/page.tsx:104`) poza regułą”. W „Teście czerwonym”: „wzorzec `select\(\s*['"]\*['"]` z wyjątkiem `head: true` — przed: **czerwony** (9 plików)”.

### R5a-U09 — drobna — `07` E-50, E-51 (rozmiar L, pkt 1 protokołu)

**Problem.** E-50 łączy w jednym etapie migrację ścieżki serwisowej wyzwalacza, nowy job, powiadomienia, anulowanie subskrypcji i usuwanie plików S3; E-51 — funkcję terminu, przeliczenie istniejących wierszy i usuwanie z outboxem. To kilka napraw o różnym ryzyku wycofania, wbrew „małym etapom” (pkt 7) i zasadzie „jedna naprawa = jeden PR”.

**Wymagana zmiana.** W polu „Zmiany” obu kart dopisać podział na PR: E-50 — (a) ścieżka serwisowa albo funkcja zerowania + test na bazie (`tests/rls-cykl-wyzwalacze.test.ts` bez regresji), migracja przed; (b) job w trybie „na sucho” z raportem liczników; (c) włączenie usuwania wierszy i plików (outbox) po akceptacji raportu. E-51 — (a) funkcja terminu + przeliczenie `scheduled_deletion_at` na sucho; (b) usuwanie z outboxem plików. Każdy PR z własnym testem czerwonym i wycofaniem.

### R5a-U10 — drobna — `07` E-78 (pole „Test czerwony”); `05` WYM-SOC-1 (kolumna „Ryzyko”)

**Problem.** (a) E-78: „job skanowania w CI (pierwszy przebieg — lista znalezisk jako punkt odniesienia)” nie jest testem czerwonym w rozumieniu pkt 2 protokołu. (b) `05` WYM-SOC-1: „obecne: Ś — dla osób; W dla gotowości do badania; K1: W” odbiega od formatu skali § 1.1 (jedna wartość), a § 12.1 liczy go jako Ś → W.

**Wymagana zmiana.** (a) E-78: „Test czerwony: `tests/unit/security-txt.test.ts` — `/.well-known/security.txt` zwraca 200 i pole `Contact` bez przekierowania na `/login` (wzorzec rozszerzeń w `proxy.ts`) — przed: **czerwony** (brak pliku). Job skanowania — kontrola, pierwszy przebieg jako punkt odniesienia.” (b) WYM-SOC-1: „obecne: Ś; K1: W — dla osób Ś; dla gotowości do badania SOC 2 W już dziś (SOC-01 – SOC-20)”.

### R5a-U11 — drobna — `05` § 13 i `07` § 12 (ostatnie zdania)

**Problem.** Oba pliki kończą się zdaniem „nie przeszła/nie przeszedł jeszcze niezależnej recenzji”.

**Wymagana zmiana.** Po naniesieniu dopisać w obu plikach sekcję „Historia recenzji” w formacie pozostałych raportów: „R5a — niezależny agent-recenzent (`05` + `07`) | 13.10.2026 | `05`: zatwierdzony z uwagami; `07`: wymaga poprawek (32 kontrole, 29 potwierdzonych) | R5a-U01 … U11 | … | … | `reviews/R5a.md`”, a zdanie w § 13/§ 12 zastąpić odesłaniem do historii.

## 6. Ocena końcowa

- **Kompletność.** Macierz ma pełne pokrycie katalogu i ustaleń, sprawdzone trzema niezależnymi skryptami (WYM, ustalenia, klasy). Plan pokrywa wszystkie 85 wymagań; pokrycie ustaleń w kartach wymaga dopisania DOW-10, SOC-34 i PRC-13 (R5a-U02).
- **Poprawność stanów.** Na próbie 15 wierszy (WYM-06, -09, -14, -18, -19, -24, -29, -33, -36, -41, -45, -51, -53, -SOC-7, -X-03) jeden błędny stan (WYM-29). „Potwierdzone” użyto tylko raz i nie dla luki (WYM-SOC-7 — brak nieuprawnionych deklaracji, sprawdzone grepem). Rozstrzygnięcia sprzeczności (§ 12.3, 18 pozycji) są uzasadnione kodem albo skalą.
- **Klasy i założenia.** Klasy identyczne z `03`; przepisy oznaczone [NZ]; fakty z PR #225 oznaczone [PR225]; okresy w kolumnie „Zmiana” podane jako propozycje (I) albo zależności od review — nie znalazłem wymyślonych okresów, podstaw ani treści umów.
- **Plan.** Karty kodu są wykonalne bez ponownego badania: konkretne pliki i linie (14 sprawdzonych odczytów zgodnych), testy czerwone na prawdziwej ścieżce (wyzwalacze i uprawnienia na bazie — `tests/rls-*`), kierunek migracji, wycofanie, kolejność worker → web. Główne braki: kompletność bramki A (R5a-U01) i pilność oceny RUN-08 (R5a-U04).
- **Repo publiczne.** Bez naruszeń.
- **Dalsza ścieżka.** Koordynator nanosi R5a-U01 – U11 dosłownie; ponowna recenzja nie jest potrzebna — wystarczy ponowić skrypty pokrycia (`07` § 10) po naniesieniu.

## 7. Niewiadome i ograniczenia

- Nie czytałem `05` i `07` w całości słowo po słowie: wszystkie 85 wierszy macierzy przeszły przez parser (stany, ryzyka, klasy, etapy, puste komórki), a pełną treść przeczytałem dla § 1, § 11–14 macierzy oraz dla § 0–3, § 7–13 i kart E-01 – E-10, E-25, E-32, E-33, E-49 – E-51, E-62, E-67 planu; pozostałe karty — pola wyciągnięte skryptem (typ, migracje, test, wycofanie, ponowienie).
- Stany ustaleń w raportach źródłowych porównałem dla próbki (MIN-01, MIN-05, MIN-10, MIN-11, ZGD-05, ZGD-06, ZGD-12, DOW-02, DOW-03, DOW-08, DOW-22, SOC-21, PRC-09, INW-17, RUN-08, PRA-08), nie dla wszystkich 159.
- Ocena, czy RUN-08 jest naruszeniem w rozumieniu art. 33, to pytanie prawne [NZ] — uwaga R5a-U04 dotyczy wyłącznie miejsca tej oceny w planie, nie jej wyniku.
- Fakty runtime (produkcja na `KSEF_ENV=test`, panel PostHog, brak kopii poza hostem) przyjęte z [PR225] za raportami — niezweryfikowane.

## 8. Co sprawdziłem / czego nie

**Sprawdziłem (13.10.2026):** `BRIEF.md` (z ADDENDUM 1–3) i `00-ZADANIE.md` w całości; nagłówki, tabele ustaleń i historie recenzji wszystkich raportów; szczegóły DOW-10 (`A3`), RUN-08 i pytania do review (`A4`), PRA-08 (`A2`); fragmenty `R2.md`, `R4.md` z warunkami dla `05`/`07`; 25 odczytów kodu na `3e5e00d` (tabela § 3); skrypty pokrycia (WYM, ustalenia, klasy, etapy, bramka vs K1 = W, liczby § 2 i § 12.1, puste komórki, skan zasad repo publicznego).

**Nie sprawdziłem:** produkcji, paneli i umów dostawców (brak dostępu); źródeł prawa i AICPA (egress zablokowany, bez WebSearch); testów repo i uprzęży `A4` (nie uruchamiałem); plików `08`, `09` poza miejscami cytowanymi; gałęzi PR #225.

Nie zmieniałem kodu, migracji, konfiguracji ani recenzowanych plików; nie commitowałem i nie pushowałem. Jedyny zapisany plik: ten (`scratchpad/reviews/R5a.md`); pomocnicze listy ID w scratchpadzie (`r5a-*.txt`).
