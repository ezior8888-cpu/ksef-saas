# Docker: sekrety builda Sentry

Pakiet: **CYB-DOCKER-BUILD-SECRETS**, **faza 4** planu odporności cyber.
Stan: przygotowanie kodu i odbioru; ten dokument nie potwierdza wdrożenia.

## Cel i granice

`SENTRY_AUTH_TOKEN` służy do uwierzytelnienia uploadu map źródłowych podczas
`next build`. Raportowanie błędów w działającej aplikacji używa DSN.
Zmiana kanału przekazania tokenu zachowuje upload, konfigurację Sentry oraz
kontrole bezpieczeństwa aplikacji. Token nie jest zmienną `NEXT_PUBLIC_*`
i nie należy go dodawać do konfiguracji runtime.

Poprzednie `ARG` i `ENV` etapu `build` tworzyły ryzyko utrwalenia wartości
w metadanych tego etapu, historii lub eksportowanym cache. Osobny etap
`runner` ogranicza dziedziczenie `ENV`, lecz nie jest dowodem wyczyszczenia
całej historii budowania. **Nie ustalono, że rzeczywisty token wyciekł.**
W tym pakiecie nie odczytujemy prawdziwych tokenów, nie zmieniamy produkcji,
nie uruchamiamy workera ani migracji.

## Kontrakt Dockerfile

Token trafia do procesu builda przez BuildKit
`--mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN`. Mount jest
opcjonalny, co zachowuje dotychczasowy build bez uploadu, gdy token nie został
skonfigurowany. Nie ma fallbacku tokenu do `ARG`, `ENV`, `COPY` ani pliku `.env`.

`SENTRY_AUTH_TOKEN_REQUIRED=1` jest niesekretnym wymaganiem operatora:
build musi zatrzymać się przy brakującym tokenie.
To sprawdzenie obecności, nie potwierdzenie ważności tokenu ani odbioru map
przez Sentry. W środowisku wymagającym uploadu nie usuwaj tego wymagania,
aby obejść błąd konfiguracji. Budowanie bez tokenu nie sprawdza ścieżki uploadu.

Potrzebne publiczne `NEXT_PUBLIC_*`, `SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_URL`, `SENTRY_RELEASE` i `SENTRY_AUTH_TOKEN_REQUIRED` mają dwa kanały:

- Zwykły Docker: jawne `--build-arg`, tylko dla niesekretnych wartości.
- Coolify z build secrets: jawne, opcjonalne mounty plikowe o identycznych
  nazwach udostępniają te wartości podczas tego samego `RUN` co build.
  Shell odczytuje tylko istniejące pliki i wtedy nadpisuje publiczne ARG/ENV.
  Brak pliku zachowuje wartość z ARG; pusty plik oznacza jawną pustą wartość.
  W BuildKit 0.33.1 opcjonalny mount `env=` bez sekretu nadpisuje istniejące
  ARG/ENV pustą wartością. Dlatego `env=` pozostaje tylko dla samego tokenu.

Nazwa mechanizmu „secret” nie zmienia publiczności `NEXT_PUBLIC_*`: Next.js
nadal zapisuje je w bundlu klienta. `SENTRY_URL` nie może zawierać hasła ani
tokenu. DSN nie zastępuje tokenu uwierzytelniającego upload.

## Zwykły Docker BuildKit

Potrzebny jest BuildKit i frontend Dockerfile obsługujący `env=` dla secret
mountów (od wersji 1.10). Repo przypina frontend `# syntax=docker/dockerfile:1.10`; jego dostępność
musi zostać sprawdzona na builderze.

Builder otrzymuje nazwę zmiennej, nie jej wartość w linii polecenia:

```text
docker buildx build --secret id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN --build-arg SENTRY_AUTH_TOKEN_REQUIRED=1 --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.invalid --load -t faktflow-build-secret-check .
```

To kształt wywołania, nie komplet konfiguracji produkcyjnej. Uzupełnij
niesekretne argumenty wymagane przez dany build. Token powinien być wcześniej
udostępniony builderowi przez mechanizm sekretów środowiska CI. Nie wpisuj
prawdziwej wartości w poleceniu, śledzonym pliku lub logu. Do testów używaj
wyłącznie syntetycznej wartości i izolowanego odbiornika; nie wysyłaj testów
uwierzytelnienia na rzeczywisty projekt Sentry.

## Coolify: warunki zgodności

Dokumentacja Coolify opisuje `Use Docker Build Secrets`, ale także powrót do
build arguments, gdy BuildKit nie jest dostępny. Sam checkbox nie jest
potwierdzeniem bezpiecznego przekazania. `Inject Build Args to Dockerfile`
jest domyślnie włączone; przed dopuszczeniem konfiguracji trzeba potwierdzić,
że nie odtwarza tokenu jako `ARG`.

Przejrzano publiczny kod Coolify pod SHA
`c0d81d4c9ccc0307de7fa0caf3c0694251b39237`, nie wersję działającą na serwerze.
W tym kodzie tryb secrets czyści build arguments i przekazuje wszystkie
build variables jako `--secret id=NAZWA,env=NAZWA`. Przekształcenie Dockerfile
pomija instrukcję `RUN`, która już zawiera `--mount=type=secret`. Dlatego
jawny mount tokenu musi być uzupełniony o mounty wszystkich używanych publicznych
zmiennych oraz flagi wymagającej uploadu. Pozostałe `RUN` mogą automatycznie
otrzymać wszystkie sekrety, w tym token Sentry. Wyłączenie samego wstrzykiwania
ARG nie dowodzi wyłączenia tego przekształcenia.

Przed osobno autoryzowanym wdrożeniem wymagany jest odbiór konkretnej wersji
Coolify, ustawień i **efektywnie wygenerowanego Dockerfile**, na syntetycznych
danych. `SENTRY_AUTH_TOKEN`: Build Variable włączone, Runtime Variable
wyłączone. `SENTRY_AUTH_TOKEN_REQUIRED=1`: włączone dla buildów, w których upload
jest wymagany. Wszystkie potrzebne publiczne zmienne pozostają build variables.
Odrębna aplikacja workera nie potrzebuje tokenu Sentry do budowania celu `worker`.

**Do osobnej kolejki: CYB-COOLIFY-BUILD-SECRET-SCOPE.** Zweryfikować i ograniczyć
automatyczne udostępnianie tokenu innym instrukcjom `RUN` przez konkretną wersję
Coolify. Repozytoryjny Dockerfile z mountem w jednym kroku nie potwierdza takiego
samego zakresu po przekształceniu. Do czasu odbioru nie deklarować, że token
produkcyjny jest dostępny wyłącznie procesowi `next build`.

## Cache, logi i artefakty

BuildKit nie umieszcza wartości secret mountów w warstwach ani provenance.
Nazwy sekretów mogą być widoczne w provenance `mode=max`. To nie jest maskowanie
wyjścia programu: proces builda może sam zapisać lub wypisać otrzymaną wartość.
Nie używaj `set -x`, `printenv` ani diagnostyki ujawniającej środowisko.

**Zmiana wartości secret mountu nie unieważnia cache.** Dotyczy to tokenu,
a w trybie Coolify także publicznych zmiennych oraz `SENTRY_AUTH_TOKEN_REQUIRED`.
Po każdej zmianie konfiguracji przekazywanej tą drogą potrzebny jest build
bez cache (lub osobno sprawdzony niesekretny mechanizm invalidacji). Ponowne
użycie starej warstwy może pominąć upload, nową bramkę wymagania tokenu i nowe
wartości `NEXT_PUBLIC_*`. Nie uznawaj samej nazwy
`COOLIFY_BUILD_SECRETS_HASH` za dowód unieważnienia cache.

Nowy sposób przekazania nie usuwa historycznych cache, obrazów ani logów.
Ich ewentualny przegląd i retencja są osobnym zadaniem operacyjnym, bez założenia,
że znajdują się w nich ujawnione tokeny.

## Bramka odbioru — wyłącznie dane syntetyczne

Odbiór kodu oraz odbiór konfiguracji serwera to dwa odrębne wyniki. Przed użyciem
prawdziwego tokenu utrwal wersję Docker/BuildKit/Coolify, SHA kodu, tryb budowania
i wynik następujących prób na izolowanym środowisku:

1. Build bez tokenu, bez wymagania uploadu: zachowane dotychczasowe zachowanie.
   Build z `SENTRY_AUTH_TOKEN_REQUIRED=1` bez tokenu: jednoznaczny błąd bez sekretów
   w komunikacie. Próby wykonaj bez cache.
2. Fikcyjny token dociera do procesu builda przez mount. Przy publicznych
   build args oraz przy publicznych secret mountach konfiguracja aplikacji
   zachowuje te same wartości, w szczególności URL Supabase używany przez CSP.
3. Zweryfikuj wygenerowany przez Coolify Dockerfile i polecenie budowania.
   Brak `ARG`/`ENV` tokenu, wartości tokenu w poleceniu i fallbacku do build args.
   Zidentyfikuj wszystkie kroki, do których Coolify domontował token.
4. Poszukaj syntetycznej wartości w logach, konfiguracji/historii obrazów,
   wyeksportowanych warstwach, wyniku `.next`, provenance `mode=max` i eksportowanym
   cache etapu build. Wynik pozytywny wymaga zarówno obecności w konsumującym
   procesie, jak i nieobecności w zapisanych artefaktach.
5. Zmień syntetyczną wartość i flagę wymagania uploadu: udokumentuj zachowanie
   przy cache oraz wymuszone ponowne wykonanie po jego pominięciu.
6. Test transportu z zastępczym procesem nie dowodzi poprawnego uploadu Sentry.
   Ścieżka rzeczywistego pluginu wymaga osobnego odbioru na fikcyjnym tokenie
   i izolowanym odbiorniku. Zainstalowany `@sentry/bundler-plugin-core@5.3.0`
   obsługuje błąd uploadu jako recoverable i bez `errorHandler` może zakończyć
   build sukcesem. `next.config.ts` nie ustawia tego handlera. To wcześniejszy,
   niezależny zakres **CYB-SENTRY-UPLOAD-FAILURE-GATE** w kolejce: ocenić
   wymuszanie poprawnego uploadu i test odrzucenia uwierzytelnienia.
   Nowa flaga wymaga wyłącznie obecności tokenu i nie naprawia tego zachowania.

Brak syntetycznej wartości w tych próbach nie jest dowodem braku historycznego
wycieku ani automatycznym potwierdzeniem ustawień produkcji. Samo przygotowanie
runbooka nie oznacza wykonania opisanych prób; ich wyniki zapisuje dziennik pakietu.

## Źródła

- [Docker — build secrets](https://docs.docker.com/build/building/secrets/)
- [Dockerfile — secret mount](https://docs.docker.com/reference/dockerfile/#run---mounttypesecret)
- [Docker — build variables](https://docs.docker.com/build/building/variables/)
- [BuildKit 0.33.1 — loadSecretEnv](https://github.com/moby/buildkit/blob/v0.33.1/solver/llbsolver/ops/exec.go#L576-L601)
- [Docker — cache invalidation](https://docs.docker.com/build/cache/invalidation/)
- [Docker — provenance](https://docs.docker.com/build/metadata/attestations/slsa-provenance/)
- [Docker — SLSA definitions](https://docs.docker.com/build/metadata/attestations/slsa-definitions/)
- [Sentry Next.js — source maps](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/)
- [Coolify — environment variables](https://coolify.io/docs/applications/configuration/environment-variables)
- [Coolify — advanced settings](https://coolify.io/docs/applications/configuration/advanced)
- [Coolify — kod pod sprawdzonym SHA](https://github.com/coollabsio/coolify/blob/c0d81d4c9ccc0307de7fa0caf3c0694251b39237/app/Jobs/ApplicationDeploymentJob.php)
