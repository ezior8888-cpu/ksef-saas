# ADR-0004: KSeF retry schedule + Offline24 fallback

- **Status:** Accepted
- **Data:** 2026-02-20
- **Faza:** 23

## Kontekst

KSeF (API rządowe MF) jest niestabilne — w środowisku test ma okresowe
incydenty (timeouty, 5xx, maintenance). Po wejściu mandatory (2026/2027)
przewidujemy spikes ruchu. Wymagania:
1. Nie tracimy faktur (każda musi w końcu dotrzeć do KSeF).
2. Klient nie czeka synchronicznie — mutacja musi wracać natychmiast.
3. Po przedłużonej awarii > 1 h KSeF — prawo pozwala na Offline24 (tryb
   awaryjny: faktura ze specjalnym QR ważna 24 h).

## Decyzja

**Inngest job `submitInvoiceJob`** (Faza 23) z trzema warstwami:

1. **Concurrency + throttle per tenant** — `concurrency: { limit: 100, key: tenantId }`, `throttle: { limit: 60, period: '1m', key: tenantId }`. Bulk import jednego tenanta nie zatka kolejki innym.
2. **Retry schedule** — 6 prób, eksponencjalne:
   | Próba | Po | Powód |
   |---|---|---|
   | 1 | natychmiast | network blip |
   | 2 | 30 s | krótki incydent |
   | 3 | 2 min | dłuższy |
   | 4 | 5 min | poważny |
   | 5 | 15 min | przedłużający się |
   | 6 | 1 h | "już dawno powinno wrócić" |
3. **Po wyczerpaniu retries** → faktura ląduje w `ksef_offline_queue` z
   deadline 24h. User dostaje QR. Cron `processOfflineQueueJob` retry'uje
   gdy KSeF wraca.

Rozróżnienie 4xx vs 5xx: 4xx = `NonRetriableError` (od razu fail, np. zły NIP),
5xx = retry.

## Konsekwencje

### Pozytywne

- 99.9%+ faktur dotrze do KSeF nawet w trakcie awarii.
- User nie widzi błędu na UI w trakcie krótkiego incydentu — async retry.
- Throttle per-tenant chroni przed self-DoS (bulk import 10k faktur).

### Negatywne / koszty

- W trakcie awarii > 1 h kolejki rosną — `ksef_offline_queue` może mieć
  tysiące wpisów. Cron musi je drenować po powrocie KSeF.
- Diagnoza "czemu moja faktura nie poszła?" wymaga zajrzenia do
  `ksef_submissions` (audit attempts) + `ksef_offline_queue`.
- 4xx vs 5xx klasyfikacja jest stąd — błąd zwrócony jako string w KSeF
  ciężko parsować, używamy heurystyk + `error_translations`.

### Wymaga

- Monitor zdrowia KSeF (`ksefHealthCheckJob` co 30 s, Faza 23) → Redis
  cache snapshotu, alert Slack `#urgent` przy degradation.
- Tabela `ksef_health_log` (90 d retencji) do post-mortem.

## Rozważane alternatywy

- **Synchroniczna wysyłka z UI** — user blokowany na 30 s+ przy incydencie KSeF.
  Odrzucone.
- **Tylko Offline24 (bez retry)** — generuje QR przy każdym chwilowym blipie,
  klient zalany QR-ami zamiast faktur. Odrzucone.
- **Krótsze retry (5 prób w 1 min)** — niewystarczająco dla typowego incydentu
  KSeF (~10-30 min). Odrzucone.

## Linki

- [docs/architecture/ksef-flow.md](../architecture/ksef-flow.md)
- `lib/inngest/jobs/submit-invoice.ts`
- `lib/inngest/jobs/process-offline-queue.ts`
- `lib/ksef/health-status.ts`
