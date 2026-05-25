# ADR-0008: Polling statusu OCR (nie SSE)

- **Status:** Accepted
- **Data:** 2026-05-22
- **Faza:** 34

## Kontekst

OCR paragonów (Faza 18+) jest asynchroniczne — user uploaduje zdjęcie, job
Inngest woła Claude vision, wraca po sekundach. UI musi pokazać "processing"
i zaktualizować się, gdy gotowe. Dwie ścieżki:
1. **Polling** — klient co kilka sekund pyta o status (`getOcrJobStatusAction`).
2. **SSE** (Server-Sent Events) — server pushuje update do klienta przez
   długie połączenie.

Faza 34 wprost pytała o tę decyzję ("Server-Sent Events vs polling decision").

## Decyzja

**Polling.** Klient `/expenses?ocr_pending=<jobId>` odpytuje co 2-4 sekundy
przez ~30 s (lub do done/error). Brak SSE.

## Konsekwencje

### Pozytywne

- **Działa na Vercel bez kombinacji** — Vercel functions są serverless,
  pojedynczy request, krótki. SSE wymaga long-lived connection.
- Prosta implementacja — istniejący Server Action wystarcza.
- Stateless — każdy poll niezależny, łatwa skalowanie horyzontalna.
- Klient offline / sleep nie blokuje serwera.

### Negatywne / koszty

- Więcej round-tripów (1 upload + ~5 polli vs 1 SSE).
- Marnotrawstwo cyklu CPU klienta i serwera dla nudnych "still processing"
  odpowiedzi.
- Lekki delay (do interval) między "gotowe" a UI update.

### Wymaga

- Server Action `getOcrJobStatusAction` z lekkim selectem (`ocr_jobs.status`).
- Indeks na `ocr_jobs(id)` (primary key wystarcza).

## Rozważane alternatywy

- **SSE** — na Vercelu funkcje serverless źle znoszą long-lived connections;
  zżerają concurrency limit i czas funkcji. Migracja na Hetzner (gdzie
  EventSource działa naturalnie) jest opcją post-launch, ale dziś brak
  dowodów że polling realnie boli (loadtest tego nie pokazał, p95 OK).
- **WebSocket** — overkill dla jednorazowego update; complicated infra na Vercel.
- **Long polling (30 s hanging GET)** — zżera czas funkcji jak SSE. Odrzucone.

## Kryterium rewizji

Wracamy do SSE jeśli loadtest pokaże, że polling realnie obciąża backend
(`/api/inngest`-style routes p95 rośnie z pollingu) **i** rozważamy
przeprowadzkę na Hetzner z Faz post-launch. Dziś brak dowodów — `target`
profile k6 (1000 concurrent) ma OCR scenariusz uwzględniony, p95 mieści się
w budżecie.

## Linki

- [docs/architecture/ocr-flow.md](../architecture/ocr-flow.md)
- [docs/performance-budget.md](../performance-budget.md) §8
- [docs/runbooks/scaling-triggers.md](../runbooks/scaling-triggers.md) (kiedy Hetzner)
- `app/actions/expenses.ts` — `getOcrJobStatusAction`
