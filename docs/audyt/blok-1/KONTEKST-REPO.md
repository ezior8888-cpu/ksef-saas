# Kontekst repo dla audytu bloku 1

Stan na 2 października 2026. `ZADANIE.md` mówi, co robić; ten plik mówi, jak
wygląda to konkretne repo. Jeśli coś tutaj przeczy `AGENTS.md`, rację ma ten plik.

## 1. Gdzie pracujesz

Sesja może ruszyć w dwóch trybach — ustal, w którym jesteś, i zapisz to w `STAN.md`:

- **Chmura (claude.ai/code):** świeży klon z GitHuba. Gałąź `audyt/blok-1` jest
  na `origin` (od `origin/main`, commit `19821ea`). Zależności doinstaluj
  `pnpm install --frozen-lockfile`. Po każdym commicie `git push origin audyt/blok-1`.
- **Lokalnie:** worktree `.claude/worktrees/audyt-blok-1` na Macu Bartosza,
  zależności zainstalowane. Bez pushu. Nie wchodź do głównego katalogu repo —
  pracują tam inne sesje i przełączają gałęzie.

W obu trybach: repo jest **publiczne**, `docs/automation/` jest poufne i nigdy
nie trafia do gita, commitujesz pliki po nazwie.

## 2. Stos: co jest naprawdę (AGENTS.md na `main` jest częściowo nieaktualny)

| AGENTS.md na `main` mówi | Naprawdę |
|---|---|
| NextAuth.js | Supabase GoTrue (`@supabase/ssr`), MFA w `lib/auth/` |
| Inngest — background jobs | pg-boss (`lib/jobs/`, rejestracja w `lib/jobs/handlers/`); ciała jobów nadal w `lib/inngest/`; Inngest tylko jako ścieżka powrotu |
| Cloudflare R2 | MinIO przez API S3 (`lib/storage/r2.ts`, zmienne nadal `R2_*`) |
| Vercel | Hetzner + Coolify |
| Supabase Frankfurt | Supabase self-hosted, Hetzner NBG1 (Norymberga) |

Next.js to 16.x (`proxy.ts` zamiast `middleware.ts`).

## 3. Wcześniejszy audyt i trwające naprawy — NIE DUBLUJ

Od 1 października 2026 trwa osobny audyt całego kodu (ustalenia `AUD-NN`)
i naprawy w kilkunastu otwartych PR. Ich poprawek **nie ma** na `origin/main`,
więc w twoim drzewie te błędy nadal widać.

- Jeśli masz katalog `docs/automation/` (jest tylko w trybie lokalnym, w chmurze
  go nie ma), przeczytaj `02_AUDYT_KODU.md` i `12_NAPRAWY_POSTEP.md` przed
  audytem. Jeśli go nie ma, zapisz to w `STAN.md` — wtedy jedynym źródłem
  o trwających naprawach są otwarte PR (niżej), więc sprawdzaj je tym staranniej.
- Otwarte PR na 2 października 2026 (sprawdź świeżo `gh pr list --state open`;
  jeśli `gh` nie działa, `git ls-remote --heads origin` pokaże gałęzie):
  - **Claude (naprawy audytu):** #147, #149–#160. Dotyczą KSeF (XML, XSD, Offline24, Retry-After), finansów (grosze, progi VAT, JPK), jobów, RODO, organizacji i limitów maili.
  - **Codex (bezpieczeństwo, część dotyka logiki domeny):** #62, #63, #64, #71 (atomowy claim wysyłki do KSeF), #83 (numery w skrzynce), #85 (ZAL, adnotacje VAT), #86 (sumy korekt, ponaglenia), #104, #115, #122 (QR w PDF), #128 (waluta kosztów).
  - **Inne:** #134 (numer rachunku przy wysyłce do KSeF) oraz #90.
- Zanim zapiszesz znalezisko K1/K2 lub zaczniesz naprawę, sprawdź, czy któryś
  PR już to zmienia: `gh pr diff <nr> --name-only`, `git fetch origin <gałąź>`
  i `git diff origin/main origin/<gałąź> -- <plik>`. Tylko odczyt. Jeśli PR to
  naprawia, w raporcie zostaw znalezisko z adnotacją „naprawiane w PR #N”,
  a w planie daj je do „Poza planem” z tym powodem. Nie naprawiaj drugi raz.
- Nie powtarzaj w raporcie ustaleń `AUD-NN` dotyczących bezpieczeństwa — odwołaj
  się do ich numeru.

## 4. Migracje

Na `origin/main` ostatnia to `00102`; numery `00103`–`00106` zajmują otwarte PR,
a kolejne mogą być rezerwowane w nocy. **Twoje migracje: od `00200` w górę.**
Tylko jako pliki w `supabase/migrations/` — nic nie wgrywasz.

## 5. Środowisko

- **Nie ma `.env.local`** (ani w worktree, ani w chmurze). To celowe:
  bez niego nic nie dotknie zdalnej bazy, poczty (Resend), Stripe ani Anthropic.
  Jeśli plik jednak jest, wolno ci zapisać w `STAN.md` tylko hosty, nie wartości;
  zdalna baza z niego to deweloperski Supabase Cloud, nie produkcja, ale i tak
  nie wolno w niej niczego zmieniać.
- Lokalnie nie ma Dockera; w chmurze sprawdź `docker --version`, ale i tak nie
  uruchamiaj lokalnego Supabase ani `pnpm test:rls` (to blok bezpieczeństwa).
  Testy logiki: mocki.
- `KSEF_ENV=test`, ale tej nocy KSeF tylko na mockach (`lib/ksef/mock-fixtures.ts`).

## 6. Komendy

| Cel | Komenda |
|---|---|
| typecheck | `pnpm typecheck` |
| lint | `pnpm lint` |
| testy (dwa runnery) | `pnpm test` (node `tsx --test`, XML i kalkulator) oraz `pnpm test:vitest` |
| wszystko poza buildem | `pnpm ci` |
| build | `pnpm build` (`next build --webpack`, ok. 3–4 min; przechodzi bez `.env.local`, sprawdzone 2.10.2026) |
| walidacja FA(3) | `pnpm verify:fa3` |

Nie uruchamiaj: `seed:*`, `trigger:*`, `ksef:*`, `r2:smoke`, `db:push*`,
`test:phase5`, `load:*`, `test:e2e*` — dotykają zewnętrznych usług albo
wymagają działającej aplikacji.

## 7. Przydatne miejsca w kodzie

- XSD FA(3) już są w repo: `lib/xml/schemas/fa3/` (`schemat.xsd` i lokalna
  kopia `schemat-local.xsd`); JPK_FA(4): `lib/exports/schemas/jpk-fa4/`.
  Sprawdź w źródle MF, czy to aktualna wersja, ale nie podmieniaj bez potrzeby.
- Obliczenia: `lib/xml/invoice-calculator.ts` (+ testy obok).
- Generatory: `lib/xml/fa3-generator.ts`, `lib/ksef/fa3-correction-generator.ts`,
  `lib/ksef/fa3-advance-generator.ts`.
- KSeF: `lib/ksef/` (submit, UPO, QR, Offline24, idempotency, submission holds).
- Znane pułapki schematu FA(3): nabywca jako osoba fizyczna przez `NrID`, nie
  `NrPESEL`; `P_12` dla odwrotnego obciążenia; `RodzajFaktury`. Szczegóły w
  `docs/fa3-schema-analysis.md`.
- Porównania z konkurencją (Fakturownia, inFakt, wFirma, iFirma): wzmianki
  w `docs/launch/01-TWOJ-PLAN-TERAZ.md`, `docs/qa-checklist.md`,
  `docs/adr/0003-self-invoicing-przez-wlasny-ksef.md`.
  Publiczne strony porównawcze produktu: `app/(marketing)/vs/` (`/vs/infakt`, `/vs/wfirma`, `/vs/ifirma`) — to też obietnice wobec klienta.

## 8. Zakres

- Agent FLO (`lib/flo/`, asystent AI) jest **poza zakresem** — niewdrożony,
  osobny tor prac. Nie audytuj go poza miejscami, gdzie zmienia faktury.
- Obieg faktur kosztowych (skrzynka KSeF, OCR) jest w zakresie.
