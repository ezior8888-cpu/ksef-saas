# F0 — przygotowany adapter wznowienia usług

**PREPARATION_ONLY.** Kod i testy lokalne nie uruchamiają usług, SSH, kopii,
migracji ani stagingu. Nie stanowią odbioru G09. Rzeczywista konfiguracja,
prywatny plan okna i dostawcy dowodów pozostają wymaganymi wejściami.

## Podłączenie biblioteki

`createBackupServiceResume` z
[`backup-service-resume-wiring.mjs`](../../scripts/ops/backup-service-resume-wiring.mjs)
łączy koordynator
[`backup-write-resume.mjs`](../../scripts/ops/backup-write-resume.mjs)
z transportem
[`backup-resume-docker-command.mjs`](../../scripts/ops/backup-resume-docker-command.mjs).
Wynik jest funkcją przekazywaną jako `operations.resumeWrites` do
[`createBackupWiring`](../../scripts/ops/backup-wiring.mjs). Import i utworzenie
fabryki są bez efektów; nie ma polecenia CLI uruchamiającego wznowienie.

Wejście fabryki: prywatny `plan`, dokładna mapa `hosts` według `hostId` usług
oraz `observeBoundary`. Testy mogą wstrzyknąć `command` i `persist`.
Operacyjne użycie domyślnego transportu wymaga Linux, trybu
`separately-authorized` i osobnego `authorization.resumeWrites=true`.
Pojedynczy transport obsługuje jeden przypięty endpoint SSH; kompozycja
przypisuje pełne identyfikatory kontenerów do właściwych hostów.
Nie wybiera kontenera po nazwie, prefiksie, etykiecie lub obrazie.

SSH korzysta z jawnych identity/known_hosts, ścisłego sprawdzania klucza,
oddzielnego argumentu portu i wyłączonych forwardów, agentów i proxy.
Dopuszczone są jedynie inspect, start oraz odtworzenie restart policy.
Docker wskazuje lokalny socket; żaden odziedziczony `DOCKER_HOST` lub env
nie wybiera innego celu. Odczyt wymaga istniejącego `/usr/bin/python3`:
stały program hashuje konfigurację na hoście, zwracając tylko małe metadane.
Surowe `Config.Env` i logi healthchecka nie trafiają do wyniku.
Dostępności narzędzi i uprawnień na serwerach nie potwierdzono tymi testami.

## Obsługiwany profil i prywatny plan

Plan ma `schemaVersion:1`, `profile:docker-services-v1`, run/window/revision,
`capturedAtUtc`, jawne `reviewed:true`, referencje `originalState`/`heldState`,
listę `services` i listę `unchangedControls`. Referencja ma postać
`{sha256,evidenceRef}`; jej treść i pochodzenie muszą być sprawdzone osobno.
Plan trzeba zapisać i przejrzeć przed oknem. Fabryka nie przeprowadza
capture/freeze i nie uwierzytelnia flagi review. Plan starszy niż 24 h lub
z przyszłości jest odrzucany.

Każda usługa zawiera własne `id`, `hostId`, `dependsOn`, pełny snapshot `held`
oraz `original:{running,restartPolicy}`. Snapshot przypina pełny 64-znakowy
ID kontenera, image ID, czas utworzenia i hash konfiguracji; zawiera też
stan procesu, healthcheck, restart policy/count oraz czasy start/stop.
Zależności muszą wskazywać wcześniejsze, pierwotnie uruchomione usługi.
Kolejność jest częścią przejrzanego planu; nie jest zgadywana z nazw.

Stan po wstrzymaniu musi być stopped/created/exited z restart policy `no`,
bez paused/restarting/dead/auto-remove. Usługa pierwotnie uruchomiona musi
mieć skonfigurowany healthcheck i zerowy licznik restartów po zatrzymaniu. Nieudowodniona semantyka ręcznego startu z niezerowym licznikiem jest poza tym profilem. Usługa wcześniej wyłączona nie jest
uruchamiana. Odtwarzana jest jej pierwotna restart policy, jeśli ją zmieniono.
Zmiany poza tym profilem blokują wznowienie przed pierwszym efektem.

Wymagane niezmienione kontrole: ingress, maintenance, automatyczne wdrożenia,
harmonogramy, uprawnienia bazy, dostęp S3, lifecycle/replikacja oraz runtime
config/wolumeny. Każda ma równy hash stanu pierwotnego i tymczasowego oraz
bieżące potwierdzenie obserwatora. Jeżeli freeze zmienił np. rolę DB,
regułę S3, routing lub harmonogram, ten adapter **odmawia**; potrzebny jest
konkretny, osobno sprawdzony restorer tej kontroli. Nie odwraca on
`WORKER_DISABLE_SCHEDULES` ani skutków usunięcia trwałych harmonogramów.

Hash Docker obejmuje Config i HostConfig poza RestartPolicy. Nie obejmuje
zawartości wolumenów/bind mountów, bieżącej sieci ani skutków startu procesu.
To wymaga odrębnej kontroli. Siedem kategorii writerów z
[procedury spójności](f0-backup-consistency-window.md) nie oznacza siedmiu
kontenerów. Same poprawne odczyty Docker nie poświadczają całego zakresu.

## Kolejność i wynik awarii

1. Zweryfikować powiązanie planu, okna i referencji stanów oraz hash faktycznego
   lokalnego source seal. Wymagane są zakończone odczyty źródeł i trwałe
   zapisanie kopii lokalnej. Sprawdzanie historii repozytorium jest później.
2. Utworzyć nowy prywatny `resume-steps/`; istniejący katalog oznacza STOP.
   Zapisać plan i odczytać wszystkie cele przed pierwszą mutacją.
3. Przed każdym działaniem uzyskać dowód wyłącznej kontroli i odczytać
   oczekiwany stan wszystkich celów. Utrwalić osobny zamiar `OUTCOME_UNKNOWN`.
   Po zapisie ponownie sprawdzić kontrolę i stan, zanim nastąpi efekt.
4. Uruchomić tylko pierwotnie działającą usługę przy restart policy `no`.
   Oczekiwać na rzeczywisty healthcheck w ograniczonym czasie. `unhealthy`,
   zmiana tożsamości/konfiguracji, nieoczekiwany restart lub utrata odpowiedzi
   przerywają wykonanie. Dopiero później odtworzyć restart policy i odczytać ją.
5. Zapisać wynik każdego zweryfikowanego działania. Przed końcem ponownie
   odczytać wszystkie cele i uzyskać niezależny dowód przywrócenia całego
   zakresu. Utrwalić `complete.json`, następnie zwrócić receipt do sekwencji.

Nie ma retry, rollback, automatycznego stop ani usuwania dziennika/locka.
Każdy timeout zatrzymuje dalsze kroki; spóźniona odpowiedź nie rozpoczyna
kolejnej operacji. Niepewny wynik może oznaczać działającą część usług.
Operator musi ustalić faktyczny stan z dziennika i nowych odczytów przed
osobno dozwoloną próbą. Istnienie pliku zamiaru nie oznacza sukcesu.

Jeżeli adapter nie zwrócił poprawnego receipt — także przy awarii zapisu
jego `resume-steps/complete.json` po końcowym odczycie — sekwencja zachowuje
`RESUME_UNKNOWN` i lock. Dopiero po odebraniu i walidacji receipt sekwencja
ustawia `RESUMED`; późniejszy błąd zapisu jej `postgresql/write-resume.json`
lub historii kopii nie cofa tej potwierdzonej informacji. Lock i stan kopii
są rozliczane osobno.

Docker nie zapewnia atomowego compare-and-start. Powtórne inspect zmniejsza
okno wyścigu, ale go nie usuwa; przez cały proces wymagany jest rzeczywisty
mechanizm wyłącznej kontroli nad wdrożeniami, operatorami i pozostałymi
writerami. `observeBoundary` pozostaje dostawcą zaufanych dowodów, a nie
fikcyjnym callbackiem zwracającym stałe `true`. Obserwator musi niezależnie odczytać i powiązać wcześniejszy utrwalony plan/stan, zamiast odsyłać otrzymany `planSha256`; same zgodne sha/ref nie dowodzą treści oryginalnego planu.

## Kontrakty pozostałych dostawców

[`backup-operation-contracts.mjs`](../../scripts/ops/backup-operation-contracts.mjs)
weryfikuje ograniczony plain JSON przed klonowaniem/zapisem. Obowiązkowe są
wersja schematu, bieżące run/revision, czas wewnątrz wywołania i dozwolone
pola; odrzucane są gettery, proxy, cykle i nadmiarowe dane. Limit wynosi
64 KiB, 2048 węzłów i 12 poziomów. Nie wklejać konfiguracji ani kluczy
w referencje dowodów.

- Preflight: dokładne dwie bazy, dwa magazyny, trzy odrębne repozytoria,
  komplet readiness oraz referencje escrow.
- Consistency: przed/po, wspólne okno, siedem writerów oraz te same referencje
  original/held; po odczytach także ich zakończenie i całe sprawdzone okno.
- Recovery: sześć wymaganych zakresów, original/held, okno, escrow i hash
  faktycznego zaszyfrowanego pliku. Sama flaga `encrypted` nie dowodzi szyfru.
- Resume: dokładne powiązanie z seal, czas, siedem writerów i dowód wyniku.
- Notify: brak wyniku daje `UNCONFIRMED`; poprawny wynik dostawcy daje
  `PROVIDER_ACCEPTED`, zawsze `deliveryVerified:false`. Przyjęcie wiadomości
  przez API nie dowodzi dostarczenia na telefon.

Walidatory dowodzą kształtu i zgodności wejść, nie prawdziwości deklaracji.
Nie tworzą dostawców freeze, escrow, szyfrowania recovery lub kanału alarmów.
Te powiązania muszą zostać konkretnie rozliczone w
[karcie wykonania F0](../observability/f0-preparation-handoff.md).
