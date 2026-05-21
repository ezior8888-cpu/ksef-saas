# KSeF SaaS — Agent Instructions

## Projekt

Aplikacja SaaS do wystawiania i odbierania faktur VAT w integracji z KSeF 2.0 (Krajowy System e-Faktur, Polska). Multi-tenant, solo-founder MVP, target: mikroprzedsiębiorcy i księgowi.

## Stack (NIEZMIENNY)

- Next.js 16 (App Router), TypeScript, React Server Components
- Tailwind CSS + shadcn/ui (style: new-york, baseColor: neutral)
- Supabase (Postgres + RLS, region Frankfurt `eu-central-1`)
- NextAuth.js (Auth.js v5) — Email/Password + Google OAuth
- Inngest — background jobs (event-driven, step functions)
- Cloudflare R2 — storage XML FA(3)
- Vercel — hosting
- **pnpm** — menedżer pakietów (`pnpm-lock.yaml`); w root nie używaj `npm install` (brak `package-lock.json`; globalny `.npmrc` z opcjami pnpm potrafi psuć npm).

## Konwencje kodu

### Routing (App Router)

- Strony chronione: grupa `app/(dashboard)/` — wymaga auth przez middleware.
- Strony niechronione: grupa `app/(auth)/` — login/register/forgot-password.
- API routes: `app/api/*/route.ts`.
- Komponenty prywatne strony: folder `_components/` wewnątrz folderu strony.

### TypeScript

- Włączony `strict: true`. Bez `any`, bez `@ts-ignore` bez wyjaśnienia w komentarzu.
- Typy domenowe w `types/` (np. `types/invoice.ts`).
- Import alias `@/*` od root projektu.

### Komponenty

- Domyślnie Server Components. `"use client"` dodaję TYLKO gdy komponent używa `useState`, `useEffect`, event handlerów lub browser API.
- Używam komponentów shadcn z `@/components/ui/*`. Nigdy nie instaluję MUI, Chakra ani innych bibliotek UI.
- Nazwy komponentów — PascalCase (`InvoiceRow`, `SubmitButton`).
- Nazwy plików komponentów — `kebab-case.tsx` lub PascalCase.tsx (trzymaj konsekwentnie to samo w projekcie).

### Logika biznesowa

- Wszystko co nie jest UI, ląduje w `lib/`.
- `lib/ksef/` — klient KSeF API, auth, submit, inbox.
- `lib/supabase/` — tylko klienty Supabase (`client.ts`, `server.ts`, `middleware.ts`).
- `lib/xml/` — generator i walidator FA(3) XML.
- `lib/inngest/functions/` — definicje background jobs.
- `lib/audit/log.ts` — helper do zapisywania logów do tabeli `audit_logs`.

### Supabase / bazy danych

- Używam `@supabase/supabase-js` i `@supabase/ssr`. NIE używam Prisma ani Drizzle.
- RLS (Row Level Security) jest włączony na WSZYSTKICH tabelach z `tenant_id`.
- Klient server-side z service_role używam TYLKO w Inngest jobs i admin endpointach.
- W komponentach i route handlerach używam klienta z uwierzytelnionego sessionu (respektuje RLS).

### Formularze

- React Hook Form + Zod do walidacji.
- Komponenty Form z `@/components/ui/form` (shadcn).
- Walidacja klient + server (Zod schema używam w obu miejscach).

### KSeF-specific

- Wszystko co dotyczy KSeF — rozróżniam środowisko TEST (`KSEF_ENV=test`) i PROD (`KSEF_ENV=production`).
- NIE używam prawdziwych NIP-ów w testach (fikcyjny testowy: `1234567890`).
- XML FA(3) waliduję LOKALNIE (libxmljs2) PRZED wysyłką do KSeF.
- Credentials KSeF w bazie szyfruję `KSEF_CREDENTIALS_ENCRYPTION_KEY`.

### Styling

- Wszystkie style przez klasy Tailwind. Nie piszę CSS-in-JS ani plików `.module.css`.
- Zmienne tematu (kolory, radius) w `app/globals.css` (zdefiniowane przez shadcn init).
- Helper `cn()` z `@/lib/utils` do warunkowego łączenia klas.

### Compliance (Polska)

- RODO — retencja 10 lat dla danych fakturowych.
- Logowanie audytowe — każda akcja istotna zapisana w `audit_logs`.
- Dane hostowane w EU (Frankfurt).

## Co NIE robić

- Nie proponować alternatywnych technologii do stacku powyżej.
- Nie używać pages routera (tylko App Router).
- Nie używać `getServerSideProps` / `getStaticProps` (to Pages Router).
- Nie używać Redux ani Zustand bez konkretnej potrzeby — Server Components + React Context + URL state wystarczą w 95% przypadków.
- Nie używać Prisma / Drizzle ORM — `@supabase/supabase-js` wystarczy.
- Nie sugerować przepisania na Remix, SvelteKit itd.

## Dobre praktyki dla AI

Gdy piszesz nowy kod:

1. Sprawdź, czy podobna logika już istnieje w `lib/`.
2. Używaj TypeScript strict — pełne typy, nie `any`.
3. Dla Server Components — async/await bezpośrednio, bez `useEffect`.
4. Dla Client Components — dodawaj `"use client"` na górze pliku.
5. Commituj małe, logiczne zmiany (jeden commit = jedna sensowna zmiana).
