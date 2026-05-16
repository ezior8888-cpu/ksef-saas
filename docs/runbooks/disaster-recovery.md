# Disaster Recovery Runbook (Faza 29)

Procedury awaryjne dla 7 najbardziej prawdopodobnych scenariuszy. Każdy
scenariusz ma:
- **Detection** — jak się dowiadujemy że coś padło
- **Immediate** — co zrobić w pierwszych 15 minutach
- **Recovery** — pełna procedura przywrócenia
- **Comms** — co i kiedy mówimy userom

Cel: **RTO < 2h, RPO < 1h** (pełna definicja w
[docs/security/rto-rpo.md](../security/rto-rpo.md)).

---

## Scenario A: Supabase DB crash / niedostępny

### Detection
- Vercel logs zalewają się `connection refused` / `503 Service Unavailable`
- Sentry: spike `PostgrestError`
- Status page (Faza 27): `/api/status/components` → DB down

### Immediate (T+0 do T+15)
1. Sprawdź **status.supabase.com** — jeśli to ich incident, czekamy.
2. Sprawdź `supabase status` w dashboardzie projektu — może connection limit.
3. Włącz banner w aplikacji: feature flag `degraded_mode=true` (Faza 22 Edge Config).
4. Slack `#urgent`: "Investigation: DB issue, monitoring".

### Recovery
**Scenario A1 — Supabase incident**: czekamy + monitorujemy. RTO zależy od MF.

**Scenario A2 — Connection limits hit**: dashboard ➜ Settings ➜ Database
  ➜ Connection Pooling. Sprawdź pool stats. Może wymaga upgrade do Pro
  (raz w przyszłości) lub krótkookresowy throttling Inngest jobs.

**Scenario A3 — Data corruption**: → [backup-restore.md](backup-restore.md).
  **Future**: po upgrade Supabase Pro + PITR → 1-click restore do
  punktu N godzin wstecz. Aktualnie: restore z naszego R2 snapshotu
  (max RPO = 24h, snapshot 02:00 PL daily).

### Comms
- T+15: status page banner "Investigation"
- T+30: tweet @faktflow + Slack #urgent (jeśli > 30 min)
- T+2h: email do tenants o ile RTO przekroczyło 2h

---

## Scenario B: Vercel down / deploy failed

### Detection
- Sentry: 5xx spike
- Vercel dashboard → Deployments → red
- status.vercel.com red

### Immediate
1. Sprawdź czy to deploy-related (`Last 24h deploys` w Vercel) — może instant rollback.
2. Vercel ➜ Production deployment ➜ **Promote** poprzedniego stable.
3. Jeśli Vercel-side: czekamy + status banner.

### Recovery
- Rollback: 1 klik w Vercel dashboard.
- Hot fix: `git revert <bad-commit>` ➜ push ➜ Vercel auto-redeploy.

### Comms
- Banner jeśli > 5 min downtime.

---

## Scenario C: Cloudflare R2 down

### Detection
- Sentry: `R2 storage put failed` / `S3ServiceException`
- Faktury submit fail (XML upload przed KSeF call)
- KSeF UPO download fail

### Immediate
1. **status.cloudflare.com** — incident widoczny?
2. Włącz fallback w lib/storage: tymczasowe trzymanie XML w DB jako blob (TODO: implement fallback layer przed Fazą 41).
3. Pauza Inngest job `submit-invoice` żeby nie nabijać retry queue.

### Recovery
- R2 incident: czekamy. R2 ma 99.9% SLA, downtime > 1h to ekstremalna rzadkość.
- Po recovery: Inngest auto-retry zaległych submitów.

### Comms
- Banner "Wystawianie faktur opóźnione — chwilowa awaria storage".

---

## Scenario D: DNS hijack / domain ownership lost

### Detection
- userzy zgłaszają redirect na obcą stronę
- WHOIS pokazuje innego ownera
- DMARC reports z innych domen

### Immediate (KRYTYCZNE — w 5 min)
1. **Login do Cloudflare** (lub aktualny DNS provider) → wymuszone wylogowanie + zmiana hasła + 2FA.
2. **Registrar** (homepage.pl, OVH, etc.) → wymusić odzyskanie panelu + change password.
3. **Zgłoszenie** do CERT Polska (cert.pl, 800 100 100).
4. Slack `#urgent` z opisem incidentu.

### Recovery
- DNS provider: cofnąć rekord A → naszych Vercel IP.
- Registrar: jeśli faktyczna utrata ownership, escalation do registrar fraud team.
- DPO/UODO: zgłoszenie breach (RODO art. 33 — 72h od momentu wykrycia).

### Comms
- Email do wszystkich userów: "Wykryliśmy incydent bezpieczeństwa, nie loguj się do nasdomena.pl przez 24h".
- Status page z dedicated alert.

---

## Scenario E: KSeF API down 24h+

### Detection
- Faza 23 KSeF health monitor: status=down > 30 min
- Slack `#urgent` z `ksef-health-check` cron

### Immediate
1. Sprawdź **ksef.mf.gov.pl** czy MF zgłasza problem.
2. Włącz banner w `KsefHealthBanner` (Faza 23 — automatycznie).
3. Sprawdź queue `submit-invoice` (Faza 23 Offline24 fallback) — auto-fallback po 5 retries.

### Recovery
- Faza 23 fallback to Offline24 (MF dopuszcza 7 dni offline) — system działa autonomicznie.
- Po recovery KSeF: `upoRetryStaleJob` (Faza 23) sięga zaległe UPO.

### Comms
- Banner "KSeF chwilowo niedostępny — wystawiamy w trybie Offline24, faktury zostaną zaakceptowane gdy wrócimy do online".

---

## Scenario F: Stripe konto terminated

### Detection
- Webhook Stripe nie dochodzi
- Stripe dashboard → "Account restricted"
- Email z ich compliance

### Immediate
1. Skontaktować się z **Stripe support** (priorytet, w panelu).
2. Pauzować billing — `feature flag billing_paused=true`.
3. Slack `#urgent`.

### Recovery
- Komunikacja z Stripe compliance — providing requested docs.
- W międzyczasie: alternatywa **Tpay/Przelewy24/Paddle** (do badania w Fazie 39 Open Banking) jako backup payment processor.
- Existing subscriptions: customer.subscription.deleted dla active, retroactive refund jeśli nie dostarczyliśmy usługi.

### Comms
- Email do paying customers: "Rozliczenia czasowo wstrzymane, dostęp do produktu działa bez zmian".

---

## Scenario G: Anthropic API rate limit / down

### Detection
- Sentry: OCR job fails `429 Too Many Requests`
- Magic Import (Faza 12) fails

### Immediate
1. Sprawdź **status.anthropic.com**.
2. Inngest `processOcrJob` ma exponential backoff (retries: 3) — czekamy.
3. Jeśli > 1h: feature flag `ocr_enabled=false` + UI message.

### Recovery
- Anthropic recovery: auto-resume.
- Persistent rate limit: contact Anthropic sales, request rate limit increase. Aktualnie default 50 req/min, dla 1000+ paying users można potrzebować upgrade plan.

### Comms
- W UI: "OCR czasowo niedostępny, faktury można dodawać ręcznie".

---

## Monthly Disaster Drill

Co miesiąc, jeden scenariusz testujemy:

| Miesiąc | Scenario | Co testujemy |
|---|---|---|
| Styczeń | A3 (DB restore) | Restore na staging environment |
| Luty | B (Vercel rollback) | Manualny promote poprzedniego deployu |
| Marzec | C (R2 down) | Test fallback layer (TODO przed Fazą 41) |
| Kwiecień | A3 (DB restore) | drugi raz, sprawdź retencję |
| Maj | E (KSeF Offline24) | Real test z mock KSeF down 4h |
| Czerwiec | A3 (DB restore) | trzeci raz, sprawdź verify cron |
| Lipiec | F (Stripe sim) | Tabletop exercise |
| Sierpień | A3 (DB restore) | |
| Wrzesień | D (DNS hijack drill) | Tabletop, NIE faktyczna zmiana |
| Październik | A3 (DB restore) | |
| Listopad | E (KSeF) | |
| Grudzień | A3 (DB restore) | |

DB restore drill jest najczęściej — najbardziej praktyczne i najmniej
ryzykowne. Każdy drill kończy się updatem tego runbooka jeśli coś poszło
nie tak.

---

## Phase 2 (po launch + upgrade do Supabase Pro)

- **PITR włączenie**: Supabase Dashboard → Project ➜ Database ➜ "Enable PITR" (7 dni cofnięcia stanu, $25/mc per project). Drastycznie skraca RTO dla scenariusza A3 (z 1h+ restore z R2 do 5 min point-in-time).
- **AWS Glacier weekly archive**: setup S3 bucket us-east-1 + Inngest cron → kopia tygodniowych snapshotów z R2 do Glacier. Glacier $0.0036/GB/mc, ~10x taniej niż R2.
- **R2 lifecycle policy**: invoice PDFs po 90 dniach → cold tier (Cloudflare wprowadziło "R2 Infrequent Access" w 2024 — sprawdzić aktualną cenę).
