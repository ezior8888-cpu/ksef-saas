# Stan sesji — audyt bloku 1

## Start

- **Start sesji:** `Fri Oct  2 03:26:56 UTC 2026` (05:26 czasu polskiego).
- **Limit 10 godzin:** `2026-10-02 13:26 UTC` (15:26 czasu polskiego).
- **Tryb:** chmura (claude.ai/code), świeży klon z GitHuba.
- **Gałąź robocza:** `audyt/blok-1` (śledzi `origin/audyt/blok-1`). Środowisko
  przydzieliło też gałąź `claude/beautiful-babbage-o2hbm7`, ale zadanie wskazuje
  `audyt/blok-1` i na nią idą pushe. Jeśli push zostanie odrzucony, nazwa
  gałęzi zastępczej trafi tutaj.
- **Punkt startowy:** `c989309` (`origin/audyt/blok-1` = `origin/main@19821ea` + 2 commity z zadaniem).
- **Drzewo przy starcie:** czyste, brak nieznanych zmian.
- **`docs/automation/`:** brak w tym klonie (tryb chmurowy). Jedynym źródłem
  o trwających naprawach są otwarte PR — sprawdzane plik po pliku.
- **Pliki tymczasowe:** `.audyt-tmp/` w repo, wykluczony przez `.git/info/exclude`
  (nie trafia do gita, nie zmienia śledzonych plików).

## Ustalenie od Bartka (wiadomość w trakcie sesji)

Równolegle trwają naprawy w innych sesjach i PR mogą być w nocy scalane do
`main`. **Nie merguję ani nie rebase'uję `main` do `audyt/blok-1` — pracuję na
stanie z chwili startu (`c989309`).** Jeśli znalezisko dotyczy kodu, który
zmienia otwarty PR, oznaczam je „naprawiane w PR #N” i idę dalej (bez naprawy).

## Otwarte PR (stan 2.10.2026 ok. 03:35 UTC)

Lista z GitHuba (MCP). Względem `KONTEKST-REPO.md` doszły **#161** i **#162**.
PR są częściowo piętrowe (baza PR to gałąź innego PR):

| PR | Gałąź | Baza | Temat |
|---|---|---|---|
| #162 | claude/naprawy-billing | #161 | numeracja abonamentu, alarmy płatności, webhooki Stripe (00109, 00110) |
| #161 | claude/naprawy-ksef-5 | #160 | stały XML przy ponowieniach, szyfrowanie v2, AAL2 (00107, 00108) |
| #160 | claude/naprawy-organizacje | #159 | zaproszenia, sesja po MFA, push |
| #159 | claude/naprawy-joby-3 | #158 | równoległość KSeF, Retry-After, dedup alarmów |
| #158 | claude/naprawy-flo-budzet | #157 | zużycie AI, odliczenie VAT przy art. 113, limit maili (00105, 00106) |
| #157 | claude/naprawy-migracje | #156 | uprawnienia ról (00103, 00104) |
| #156 | claude/naprawy-scalenie | main | scalenie #147, #149–#155 |
| #155 | claude/naprawy-rodo | main | retencja, eksport danych, ponaglenia |
| #154 | claude/naprawy-bezpieczenstwo-3 | main | akcje po MFA, typ zdjęcia kosztu |
| #153 | claude/naprawy-joby-2 | main | maile bez dubli, błędy jobów |
| #152 | claude/naprawy-ksef-4 | main | ostrzeżenie o certyfikacie |
| #151 | claude/naprawy-finanse | main | pulpit bez dubla ROZ, grosze, progi VAT, XSD JPK |
| #150 | claude/naprawy-dlug-2 | main | test RLS |
| #149 | claude/naprawy-dlug | main | runbooki, FLO, porządki |
| #147 | claude/naprawy-ksef-3 | main | xml_documents, XSD bez ponowień, Offline24 |
| #134 | claude/przeglad-dalej | main | numer rachunku 26 cyfr przy KSeF |
| #128 | codex/security-ksef-inbox-currency | main | waluta kosztów |
| #122 | codex/offline-qr-spec | main | PDF bez poprawnych QR |
| #115 | codex/security-backup90-reconcile | main | backup |
| #104 | codex/security-audit-report-boundary | main | raport audytu HTTP |
| #90 | ops/bartosz-2026-09-28 | main | backup, rejestr migracji |
| #86 | codex/security-reminder-reconciliation-guard | #71 | sumy korekt, ponaglenia, import KSeF |
| #85 | codex/security-special-seller-boundary | #71 | ZAL, adnotacje VAT |
| #83 | codex/security-inbox-number-hotfix | main | numery w skrzynce |
| #71 | codex/security-ksef-special-action-auth | #64 | atomowy claim wysyłki |
| #64 | codex/security-ksef-inbox-reviewable | #63 | tożsamość skrzynki |
| #63 | codex/security-ksef-provenance-reviewable | #62 | dowód właściciela |
| #62 | codex/security-stripe-reviewable | main | claimy Stripe |

**Sposób sprawdzania:** gałęzie pobrane tylko do odczytu (`git fetch` do
`refs/remotes/origin/*`). Własne pliki każdego PR policzone jako
`git diff --name-only $(git merge-base <baza> <głowa>) <głowa>` (dla piętrowych
baza = gałąź PR-bazy, dla pozostałych `19821ea`). Mapa „plik → PR” w
`.audyt-tmp/pr-files.txt` (lokalnie). Przed każdym znaleziskiem K1/K2 i przed
każdą naprawą: `grep <plik> .audyt-tmp/pr-files.txt`, a przy trafieniu
`git diff <merge-base> origin/<gałąź> -- <plik>`, żeby ocenić, czy PR naprawia
właśnie ten błąd.

## Komendy weryfikujące i stan zastany (na `c989309`)

| Komenda | Wynik zastany | Uwagi |
|---|---|---|
| `pnpm install --frozen-lockfile` | OK (exit 0) | ostrzeżenie o zignorowanych build scripts (sentry-cli, esbuild, core-js, inngest-cli) — bez wpływu na testy |
| `pnpm typecheck` | **exit 0** | |
| `pnpm lint` | **exit 0** | 0 błędów, 33 ostrzeżenia (nieużywane zmienne itp.) |
| `pnpm test` | **exit 0** | 66 testów / 11 suite, 0 fail (tsx --test: kalkulator, generator FA(3), walidator) |
| `pnpm test:vitest` | **exit 0** | 296 plików, 4170 testów, 0 fail (ok. 2 min) |
| `pnpm build` | **exit 0** | `next build --webpack`, ok. 4 min, bez `.env.local` |

## Środowisko

- **Node** v22.22.0, **pnpm** 10.33.0.
- **Docker** 29.6.2 jest dostępny, ale zgodnie z `KONTEKST-REPO.md` nie
  uruchamiam lokalnego Supabase ani `pnpm test:rls`. Testy logiki: mocki.
- **`.env.local`:** brak (jest tylko `.env.example`). Zatem: brak zdalnej bazy,
  brak Resend, Stripe, Anthropic, R2/MinIO, KSeF — żaden kod uruchamiany w tej
  sesji nie ma dokąd się połączyć.
- **KSeF:** `KSEF_ENV` niezdefiniowane w środowisku; zgodnie z zadaniem tylko
  mocki (`lib/ksef/mock-fixtures.ts`), skrypty `ksef:*` nieuruchamiane.
- **GitHub:** `gh` CLI zainstalowane, ale w tej sesji GitHub obsługuję przez
  narzędzia MCP (tylko odczyt PR).
