# RTO / RPO Targets (Faza 29)

Definicja **Recovery Time Objective** i **Recovery Point Objective** dla
FaktFlow. Bazuje na business impact analysis dla mikrofirm wystawiających
faktury KSeF.

---

## Definicje

- **RTO (Recovery Time Objective)** — maksymalny czas od momentu awarii
  do przywrócenia usługi.
- **RPO (Recovery Point Objective)** — maksymalna ilość danych jaką
  możemy stracić (window od ostatniego backupu).

---

## Targets

### Tier 1: Krytyczne dane (faktury, KSeF credentials, subscriptions)

| Metric | Target | Aktualne (Maj 2026) | Phase 2 (Pro plan) |
|---|---|---|---|
| **RTO** | < 2h | ~1-2h (R2 restore) | ~5 min (PITR) |
| **RPO** | < 1h | ~24h (daily snapshot) | < 5 min (PITR + WAL) |

### Tier 2: Nice-to-have (audit logs, push subscriptions)

| Metric | Target | Aktualne |
|---|---|---|
| **RTO** | < 4h | ~2h |
| **RPO** | < 24h | ~24h |

Audit logs (Faza 8 + 28 trigger) są append-only — utracone zdarzenia są
nieodtwarzalne, ale dla compliance wystarcza RPO 24h.

---

## Komponenty i ich risk profile

| Komponent | Failure rate | Backup strategy |
|---|---|---|
| Supabase DB | 99.9% SLA (Free), 99.95% (Pro) | Daily R2 snapshot (RPO 24h) + Pro→PITR (Phase 2, RPO 5min) |
| Cloudflare R2 | 99.9% SLA | Multi-region replication wewn., **brak** cross-provider (Phase 2 → AWS Glacier weekly) |
| Vercel | 99.99% SLA | Instant rollback (poprzedni deploy zawsze dostępny) |
| Stripe | 99.99% SLA | Idempotent webhooks (Faza 25), local cache w `stripe_payments` |
| KSeF (gov) | Brak SLA | Offline24 fallback (Faza 23) |
| Resend (email) | 99.9% SLA | Bounces saved in `email_bounces` (Faza 26), retry via Inngest |
| Anthropic API | 99.5% SLA | Inngest retry + degraded mode flag |

---

## Aktualna strategia (free tier, Maj 2026)

```
┌─────────────────────────────────────────────────────────┐
│                    Supabase Postgres                     │
│                  (Free, no PITR)                         │
└──────────────────────────┬──────────────────────────────┘
                           │
                  Daily snapshot 02:00 PL
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Cloudflare R2 backups bucket                │
│         daily: 30 dni  │  weekly (ndz): 8 tygodni        │
│   Verification cron ndz 03:00 PL — SHA-256 + parse       │
│   Cleanup cron daily 04:00 PL — retention enforcement    │
└─────────────────────────────────────────────────────────┘
```

**Max data loss (RPO):**
- Day-after-snapshot: ~24h (snapshot 02:00, awaria 01:59 następnego dnia)
- Worst-case-realistic: 6-18h (rozkład awarii w dobie)

**Max recovery time (RTO):**
- Decyzja "to katastrofa, restore" → 10 min
- Manual snapshot zabezpieczający current state → 5 min
- Download z R2 (max ~50 MB) → 1 min
- Verify checksum + parse → 1 min
- TRUNCATE + INSERT per table → 30-60 min (skaluje z DB size)
- Verification + smoke test → 15 min
- **Total: ~1-2h**

---

## Phase 2 strategia (po launch + Pro upgrade)

```
┌─────────────────────────────────────────────────────────┐
│                  Supabase Postgres (Pro)                 │
│            PITR enabled — 7 dni point-in-time            │
└──────┬──────────────────────────────────────────────────┘
       │
       ├─► Daily snapshot 02:00 PL  ──►  R2 (30 / 8 tyg.)
       │
       └─► Weekly snapshot ndz 02:00  ──►  AWS Glacier
                                          (cross-provider safety)
```

**Po Phase 2 RPO < 5 min** (Supabase WAL ciągle replikowane), **RTO < 10 min**
(PITR point-in-time z dashboardu, bez restore z R2).

R2 snapshoty zostają jako **secondary** defense — gdyby cały Supabase
projekt został utracony (rzadkość, ale plan B musi istnieć).

---

## Monitoring i alerting

| Sygnał | Próg | Akcja |
|---|---|---|
| Daily snapshot failed | 1 wystąpienie | Slack `#urgent` |
| Verify backup found broken | 1 wystąpienie | Slack `#urgent` |
| Backup size dropped > 50% week-over-week | warning | Slack `#metrics` |
| Backup size grew > 100% week-over-week | warning | Slack `#metrics` (rosną dane lub bug) |
| Brak success snapshot > 36h | błąd | Slack `#urgent` |

Pierwsze 3 zaimplementowane w Inngest jobs (Krok 3, 5, 6 Fazy 29).
Pozostałe — dodać w Fazie 27 monitoring (lub uzupełnić w Krok 8).

---

## Testing

Monthly DR drill (z [disaster-recovery.md](../runbooks/disaster-recovery.md)):
1x/mc test restore na staging. Każdy drill aktualizuje ten dokument o
zmierzone actuals.

Last drill: **none yet** — pierwszy planowany po wgraniu migracji 00053 i
udanym uruchomieniu `dailyDbSnapshotJob` w prod.

---

## Compliance

- **RODO art. 32** — zabezpieczenie integralności i poufności danych.
  Daily backup spełnia "zdolność szybkiego przywrócenia dostępności".
- **Faktury — 10 lat retencji prawnej** (RODO art. 17 ust. 3 lit. b).
  Aktualnie utrzymujemy w DB; backup jest dodatkową warstwą bezpieczeństwa.
- **DPA** (subprocessors): Cloudflare R2 jako data processor — uwzględnić
  w docs/legal po Fazie 38 (lawyer package).
