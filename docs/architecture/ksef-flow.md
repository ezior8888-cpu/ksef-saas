# KSeF Flow — Wysyłka faktury

Pełny lifecycle faktury wychodzącej: od formularza do UPO z KSeF.

## Diagram

```mermaid
sequenceDiagram
    actor U as Użytkownik
    participant N as Next.js (Server Action)
    participant DB as Supabase
    participant I as Inngest
    participant X as lib/xml (FA(3))
    participant K as KSeF API (MF)
    participant R as Cloudflare R2

    U->>N: POST /invoices/new/regular (saveAndSendAction)
    N->>X: generateFA3 + walidacja XSD (xmllint-wasm)
    N->>DB: INSERT invoices (status=draft)
    N->>I: event "invoice/submit.requested" {tenantId, invoiceId, invoice, nip}
    N-->>U: 202 + redirect /invoices

    Note over I: concurrency 100 per tenant<br/>throttle 60/min per tenant<br/>(Faza 23)

    I->>K: auth (challenge → token, KSEF_ENV)
    I->>K: sendInvoice (XML)
    K-->>I: reference_number
    I->>DB: UPDATE invoices status=submitted
    I->>R: upload XML do bucketu (path: tenant/{id}/...)

    Note over I: retry 30s→2m→5m→15m→1h<br/>4xx = NonRetriable, 5xx = retry

    loop UPO polling
        I->>K: getStatus(referenceNumber)
        K-->>I: status (Processing / Accepted / Rejected)
    end

    alt Accepted
        I->>K: getUPO
        K-->>I: UPO XML
        I->>R: upload UPO
        I->>DB: UPDATE invoices status=accepted, ksef_number, ksef_accepted_at
        I->>I: event "invoice/submit.succeeded"
        I->>N: notyfikacja userowi (email/in-app)
    else Rejected (4xx KSeF)
        I->>DB: UPDATE status=rejected, ksef_error
        I->>I: event "invoice/submit.failed"
    else Wyczerpane retry (5xx / network)
        I->>DB: INSERT ksef_offline_queue (status=queued, deadline=24h)
        Note over I: Offline24 fallback — user dostaje QR<br/>do złożenia ręcznego w 24h
    end
```

## Klucze do zrozumienia

1. **Server Action TYLKO enqueue'uje event** — UI nie czeka na KSeF. To Inngest robi ciężką robotę, retry, throttle.
2. **`KSEF_ENV=test`** w dev/test, **`production`** w prod. Test env NIE waliduje sumy kontrolnej NIP. NIGDY nie używaj prawdziwych NIP w testach.
3. **XML waliduję lokalnie** (`libxmljs2` / `xmllint-wasm`, XSD FA(3)) **PRZED** wysyłką. Lepiej złapać błąd offline niż dostać `400` od KSeF.
4. **UPO osobny krok** — KSeF najpierw zwraca `reference_number`, UPO trafia dopiero po przetworzeniu (sekundy do minut). Stąd polling.
5. **Offline24** — gdy KSeF padnie na > 1h, faktura ląduje w `ksef_offline_queue` z deadline 24h. User dostaje QR. Po powrocie KSeF cron retry'uje (`upoRetryStaleJob`).

## Powiązany kod

- `lib/inngest/jobs/submit-invoice.ts` — główny job
- `lib/inngest/jobs/download-upo.ts` — pobranie UPO
- `lib/inngest/jobs/process-offline-queue.ts` — retry Offline24
- `lib/ksef/` — klient KSeF (auth, submit, status, UPO)
- `lib/xml/fa3-generator.ts` — generator XML FA(3)
- `lib/xml/validator.ts` — walidacja XSD
- Tabele: `invoices`, `ksef_submissions`, `upo_receipts`, `ksef_offline_queue`, `ksef_sessions`, `xml_documents`

## Retry schedule

| Próba | Po jakim czasie | Powód |
|---|---|---|
| 1 | natychmiast | sieć blip |
| 2 | 30 s | krótki incydent KSeF |
| 3 | 2 min | dłuższy incydent |
| 4 | 5 min | utrzymujący się problem |
| 5 | 15 min | poważna awaria |
| 6 (ostatnia) | 1 h | „już dawno powinno wrócić" |
| Po 6 | — | → `ksef_offline_queue` (Offline24) |
