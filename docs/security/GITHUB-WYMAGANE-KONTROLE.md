# GitHub — wymagane kontrole przed zmianą main (REV-04)

Status na **2026-09-25**: **reguły włączone przez Bartka** w wariancie bez obowiązkowej recenzji (decyzja właściciela: w zespole dwuosobowym wymóg akceptacji drugiej osoby tworzył stosy PR-ów). Ruleset `23339700`: `deletion`, `non_fast_forward`, `pull_request` (0 akceptacji), `required_status_checks` (6 kontroli poniżej, App ID 15368, `strict`); lista wyjątków pusta — także admin zmienia `main` wyłącznie przez PR. Próba blokady: PR z wpisem wydania 25.09.

Historyczny stan z 2026-09-23, 17:00 UTC: przygotowano konfigurację do zastosowania przez Bartka; ustawień GitHuba wtedy nie zmieniano.

## Potwierdzony stan

Odczytano oficjalne API GitHuba przez istniejące logowanie Git; wykonano wyłącznie GET. Poświadczenie pozostało w pamięci procesu, nie zapisano go do plików ani raportu.

- Repo: `ezior8888-cpu/ksef-saas`, domyślna gałąź `main`.
- `GET /repos/ezior8888-cpu/ksef-saas`: HTTP 200; bieżący użytkownik ma `admin: false`, `maintain: false`, `push: true`, `triage: true`, `pull: true`.
- `GET /repos/ezior8888-cpu/ksef-saas/rules/branches/main`: HTTP 200; tylko `deletion` i `non_fast_forward`, oba z rulesetu `23339700`. W efektywnych regułach nie ma wymaganego PR, zatwierdzenia ani kontroli CI.
- `GET /repos/ezior8888-cpu/ksef-saas/rulesets/23339700`: HTTP 200; nazwa `main - ochrona podstawowa`, `target: branch`, `enforcement: active`.
- Warunki tego rulesetu: `include: ["~DEFAULT_BRANCH"]`, `exclude: []`.
- Pole `bypass_actors` **nie zostało zwrócone**. Nie oznacza to pustej listy wyjątków. GitHub pokazuje to pole dopiero osobie mającej prawo edycji rulesetu; Bartek musi odczytać i zachować jego rzeczywistą wartość. [Zasady widoczności wyjątków w API](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset).
- `GET /repos/ezior8888-cpu/ksef-saas/branches/main/protection`: HTTP 404. Przy tym poziomie dostępu sam ten wynik nie rozstrzyga, czy klasycznej ochrony nie ma, czy nie jest widoczna. Przed zapisem Bartek powinien odczytać ją ze swoim dostępem i nie usuwać żadnych istniejących zabezpieczeń.

Bieżące konto nie ma dostępu administracyjnego. Aktualizacja rulesetu wymaga uprawnień administracyjnych do zapisu; nie podejmowano prób zapisu. [Wymagania API aktualizacji](https://docs.github.com/en/rest/repos/rules#update-a-repository-ruleset).

## Kontrole zweryfikowane na konkretnym commicie

`GET /repos/ezior8888-cpu/ksef-saas/commits/f3ca0d4c3b90b1eeaeb61d91cc78aa520206dd04/check-runs?per_page=100` zwrócił 7 zakończonych kontroli, wszystkie `success`, wszystkie dla tego samego SHA. To wynik opublikowanego PR #13, a nie dowód walidacji późniejszych lokalnych poprawek.

Do wymaganych kontroli proponujemy sześć jawnych jobów z `.github/workflows/ci.yml` i `.github/workflows/security.yml`. Dokładne nazwy mają znaczenie:

- `Typecheck + Lint + Unit tests`
- `Offline security inventory`
- `dependency-review`
- `Secret scan`
- `CodeQL (actions)`
- `CodeQL (javascript-typescript)`

Wszystkie sześć pochodzi z aplikacji `github-actions`, **App ID `15368`**. JSON poniżej wiąże każdą nazwę z tą aplikacją. Identyfikator pochodzi z API check runs, nie z domysłu ani numeru instalacji.

Dodatkowy wynik `CodeQL` pochodzi z `github-advanced-security`, App ID `57789`. Pozostaje dodatkową informacją; propozycja wymaga obu jawnych jobów CodeQL, które zawierają także lokalną bramkę odrzucającą findings high/critical. Nie zastępuj tych dwóch jobów samym agregatem `CodeQL`.

Dowody: [CI dla f3ca0d4](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35120892202), [Security dla f3ca0d4](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35120892103), [PR #13](https://github.com/ezior8888-cpu/ksef-saas/pull/13). W chwili odczytu PR #13 był otwartym draftem, bez merge, z bazą `codex/security-access-continuation`. Samo włączenie ochrony `main` nie scala łańcucha wcześniejszych PR.

Starszy endpoint `commits/{sha}/status` zwrócił `pending` i pustą listę statusów. Nie jest to sprzeczne z sukcesem siedmiu check runs: legacy statusy i checks są osobnymi źródłami. Do odbioru używamy również check runs.

## Docelowe zachowanie

Zmiana `main` przechodzi przez PR, ma zatwierdzenie jednej drugiej osoby oraz komplet sześciu kontroli dla aktualnej wersji. Nowy przeglądalny commit unieważnia wcześniejsze zatwierdzenie; ostatni push zatwierdza ktoś inny niż jego autor. Wszystkie dyskusje wymagają rozwiązania. Wymagamy kontroli na aktualnej bazie PR.

W zespole dwuosobowym autor PR powinien sam wprowadzać uzgodnione poprawki, a druga osoba je recenzować. Jeśli recenzent wypchnie ostatnią zmianę na cudzy PR, wymóg niezależnej akceptacji ostatniego push może wymagać dodatkowego recenzenta. Nie należy rozwiązywać tego przez stały wyjątek omijający kontrolę.

Nie dodajemy nowych wyjątków dla administratorów, aplikacji, deploy keys ani zespołów. Zachowujemy ochronę przed usunięciem i force push. Nie włączamy merge queue: obecne workflow nie mają wyzwalacza `merge_group`.

## Konkretne reguły JSON

Poniżej docelowe pole `rules` dla odczytanego rulesetu. To materiał do przygotowania zmiany przez Bartka, **nie pełny bezwarunkowy zapis konfiguracji**. Nazwa, aktywność, warunki i niewidoczna tutaj lista wyjątków muszą zostać zachowane z jego świeżego odczytu. Parametry odpowiadają schematowi [REST API rulesetów](https://docs.github.com/en/rest/repos/rules#update-a-repository-ruleset).

```json
{
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": true,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Typecheck + Lint + Unit tests", "integration_id": 15368 },
          { "context": "Offline security inventory", "integration_id": 15368 },
          { "context": "dependency-review", "integration_id": 15368 },
          { "context": "Secret scan", "integration_id": 15368 },
          { "context": "CodeQL (actions)", "integration_id": 15368 },
          { "context": "CodeQL (javascript-typescript)", "integration_id": 15368 }
        ]
      }
    }
  ]
}
```

`require_code_owner_review: false` oznacza brak dodatkowego obowiązku CODEOWNERS; nadal wymagamy jednej niezależnej akceptacji. Jeśli w świeżym odczycie istnieje silniejsza reguła, należy ją zachować. Nie kopiować powyższych dwóch nowych reguł na istniejące silniejsze ustawienia bez porównania.

## Kroki Bartka i warunki odbioru

1. Odczytać ruleset `23339700` ze swojego konta z uprawnieniami administracyjnymi. Zachować prywatną kopię pełnej konfiguracji przed zmianą, włącznie z `conditions`, `bypass_actors`, `rules`, `enforcement` i aktualizacją czasową. Nie publikować identyfikatorów wyjątków w tym publicznym repo.
2. Porównać świeży stan z odczytem opisanym wyżej. Jeśli reguły, zakres lub wyjątki się zmieniły, najpierw uzgodnić aktualizację. Nie zastępować konfiguracji ślepo starym JSON-em; nie usuwać dodatkowych reguł.
3. Przygotować zmianę istniejącego rulesetu: zachować nazwę, `target`, `enforcement`, `conditions` i rzeczywiste `bypass_actors` dokładnie z bieżącego odczytu; dołączyć dwie nowe reguły, pozostawiając wszystkie dotychczasowe. Pole wyjątków musi być dostępne i mieć znaną wartość — brak pola to powód do przerwania przygotowania pełnego zapisu, nie do podstawienia `[]`.
4. Włączyć uzgodnione wymagania przez ustawienia [istniejącego rulesetu](https://github.com/ezior8888-cpu/ksef-saas/rules/23339700) lub oficjalne API. W tej sesji tego kroku nie wykonano.
5. Ponownie odczytać ruleset i efektywne reguły `main`. Potwierdzić cztery oczekiwane typy reguł, dokładne nazwy i App ID sześciu kontroli, jedną akceptację, odrzucanie starych akceptacji, zatwierdzanie ostatniego push oraz niezmieniony zakres i wyjątki.
6. Na PR skierowanym do `main`, z konta bez bypass, sprawdzić blokadę przy braku review, kontrolowanej nieudanej kontroli oraz brakującym wyniku. Następnie sprawdzić, że nowy commit wymaga ponownego review i nowych wyników. Odbiór polega na weryfikacji blokady merge w UI/API; nie wymaga merge, push do `main` ani wdrożenia. Nie używać rzeczywistych sekretów do wymuszenia nieudanego skanu.
7. Zapisać datę, SHA testowanego PR, linki do wyników, działanie blokady i potwierdzenie braku nowych wyjątków w dzienniku. Dopiero wtedy zamknąć REV-04.

Sprawdzenie z konta mającego bypass nie potwierdza egzekwowania reguł dla zwykłego współpracownika. Jeśli istniejące wyjątki pozwalają szeroko omijać wymagania, odnotować osobne ryzyko i ustalić z właścicielem ich zawężenie; ten pakiet nie rozszerza ich ani samodzielnie nie zmienia.

## Pozostający warunek wydania: kompilacja aplikacji

Obecne CI uruchamia typy, lint, testy, audyt zależności i skany. **Nie wykonuje produkcyjnego `next build`.** Analiza CodeQL ma `build-mode: none` i nie zastępuje kompilacji Next.js. Zielone wymogi powyżej nie potwierdzą więc poprawnego zbudowania obrazu do Coolify.

Przed wydaniem potrzebny jest udokumentowany, pomyślny build dokładnego publikowanego SHA w izolowanym środowisku, bez sekretów i połączeń do usług produkcyjnych. Docelowo warto dodać oddzielny job kompilacji do CI i dopiero po uzyskaniu rzeczywistego wyniku dopisać jego dokładną nazwę i App ID do wymaganych kontroli. Nie wpisywać dziś nieistniejącej nazwy checka, która zablokowałaby wszystkie PR na stałe. Ten odczyt ustawień nie uruchamiał builda ani wdrożenia. Równoległa lokalna kompilacja kodu pakietu zakończyła się sukcesem; jej warunki i ograniczenia opisano w [raporcie napraw](NAPRAWY-PRZEGLADU-2026-09-23.md). Obraz standalone/Docker nadal wymaga odbioru.
