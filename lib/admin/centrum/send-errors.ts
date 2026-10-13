/**
 * Centrum dowodzenia — błędy wysyłki (`/admin/centrum/bledy`). CZYSTY moduł:
 * filtry z adresu, status efektywny, odcisk wzorca, grupowanie w incydenty
 * i świeżość workera. Dane czyta `lib/admin/centrum/attempts.ts`.
 *
 * Źródło: dziennik prób `ksef_send_attempts` (A5, 00150) — wiersz na każde
 * wykonanie joba wysyłki i na każdą odmowę przed kolejką. Centrum tylko
 * czyta i tłumaczy (brief C-22, §1): stan faktur zmieniają akcje w
 * `/admin/ksef`.
 */

import { sendErrorClassOf, type SendErrorClass } from '@/lib/ksef/send-error-classes';

export const ERROR_PERIODS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;
export type ErrorPeriod = keyof typeof ERROR_PERIODS;
export const DEFAULT_PERIOD: ErrorPeriod = '7d';

/**
 * `errors` = porażki, odmowy przed kolejką i wykonania przerwane (worker
 * padł w trakcie). Oczekiwanie (`waiting`) nie jest błędem — osobny filtr.
 */
export const STATUS_FILTERS = ['errors', 'failed', 'refused', 'interrupted', 'waiting', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export interface SendErrorFilters {
  period: ErrorPeriod;
  status: StatusFilter;
  code: string | null;
  errorClass: string | null;
  stage: string | null;
}

/**
 * Wykonanie `started` bez wyniku dłużej niż dzierżawa wysyłki (15 min,
 * `KSEF_SEND_LEASE_SECONDS`) plus zapas — worker padł albo został zabity
 * w trakcie (deploy, OOM). To błąd, choć nikt nie zapisał jego kodu.
 */
export const INTERRUPTED_AFTER_MS = 20 * 60 * 1000;

export type AttemptStatus = 'started' | 'succeeded' | 'failed' | 'waiting' | 'refused';
export type EffectiveStatus = AttemptStatus | 'interrupted';

export const STATUS_LABELS: Record<EffectiveStatus, string> = {
  started: 'w toku',
  succeeded: 'sukces',
  failed: 'błąd',
  waiting: 'oczekiwanie',
  refused: 'odmowa przed kolejką',
  interrupted: 'przerwane (worker)',
};

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  errors: 'wszystkie błędy',
  failed: 'błędy wykonania',
  refused: 'odmowy przed kolejką',
  interrupted: 'przerwane',
  waiting: 'oczekiwania',
  all: 'wszystkie wykonania',
};

export const STAGE_LABELS: Record<string, string> = {
  start: 'zdarzenie',
  guard: 'stan i hamulce',
  offline: 'Offline24',
  credentials: 'poświadczenia',
  health: 'sonda KSeF',
  claim: 'przejęcie',
  reconcile: 'uzgodnienie',
  submit: 'wysyłka',
  xml: 'XML',
  ksef: 'odpowiedź KSeF',
  save: 'zapis numeru',
  finalize: 'po przyjęciu',
  enqueue: 'przed kolejką',
};

export const CLASS_LABELS: Record<SendErrorClass, string> = {
  terminal: 'treść',
  transient: 'przejściowy',
  hold: 'hamulec',
  reconcile: 'uzgodnienie',
  setup: 'ustawienia',
};

const CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/;
const STAGE_RE = /^[a-z]{2,32}$/;

function one(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

/** Filtry z `searchParams`; nieznane wartości wracają do domyślnych (bez wstrzyknięć do zapytania). */
export function parseSendErrorFilters(params: Record<string, string | string[] | undefined>): SendErrorFilters {
  const period = one(params.period);
  const status = one(params.status);
  const code = one(params.code);
  const errorClass = one(params.class);
  const stage = one(params.stage);
  return {
    period: period && period in ERROR_PERIODS ? (period as ErrorPeriod) : DEFAULT_PERIOD,
    status: status && (STATUS_FILTERS as readonly string[]).includes(status) ? (status as StatusFilter) : 'errors',
    code: code && CODE_RE.test(code) ? code : null,
    errorClass: errorClass && errorClass in CLASS_LABELS ? errorClass : null,
    stage: stage && STAGE_RE.test(stage) && stage in STAGE_LABELS ? stage : null,
  };
}

export function periodStart(period: ErrorPeriod, now: Date): Date {
  return new Date(now.getTime() - ERROR_PERIODS[period]);
}

export interface AttemptRow {
  id: string;
  tenantId: string;
  tenantName: string | null;
  invoiceId: string;
  internalNumber: string | null;
  /** Bieżący `invoices.ksef_status` — czy błąd został potem odzyskany. */
  invoiceStatus: string | null;
  sendAttemptId: string | null;
  jobId: string | null;
  execution: number;
  environment: string | null;
  workerSha: string | null;
  status: AttemptStatus;
  stage: string;
  result: string | null;
  errorCode: string | null;
  errorClass: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  ksefCode: number | null;
  retryable: boolean | null;
  startedAt: string;
  finishedAt: string | null;
}

export function effectiveStatus(row: Pick<AttemptRow, 'status' | 'startedAt' | 'finishedAt'>, now: Date): EffectiveStatus {
  if (row.status !== 'started' || row.finishedAt) return row.status;
  const started = Date.parse(row.startedAt);
  return Number.isFinite(started) && now.getTime() - started > INTERRUPTED_AFTER_MS ? 'interrupted' : 'started';
}

const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Szablon komunikatu do odcisku: UUID, liczby, numery referencyjne i daty
 * zamienione na symbole — dwa błędy różniące się tylko numerem faktury
 * czy sesji dają ten sam wzorzec (brief C-22, §6.4).
 */
export function messageTemplate(message: string | null): string {
  if (!message) return '';
  return message
    .replace(UUID_G, '<uuid>')
    .replace(/\b\d{8}-[A-Z]{2}-[0-9A-F]{10}-[0-9A-F]{10}-[0-9A-F]{2}\b/gi, '<ref>')
    .replace(/\d+/g, '<n>')
    .replace(/(<n>[-./: ]?)+<n>/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** Odcisk wzorca: status, kod, etap, HTTP, kod KSeF i szablon komunikatu. */
export function fingerprint(row: AttemptRow, now: Date): string {
  return [
    effectiveStatus(row, now),
    row.errorCode ?? '-',
    row.stage,
    row.httpStatus ?? '-',
    row.ksefCode ?? '-',
    messageTemplate(row.errorMessage),
  ].join('|');
}

/** Bieżący stan faktury po błędzie — skąd wiemy, czy automat ją odzyskał. */
export type RecoveryState = 'accepted' | 'open' | 'in_progress' | 'draft' | 'unknown';

export function recoveryState(invoiceStatus: string | null): RecoveryState {
  switch (invoiceStatus) {
    case 'accepted':
      return 'accepted';
    case 'failed':
    case 'rejected':
      return 'open';
    case 'queued':
    case 'sending':
    case 'offline_queued':
      return 'in_progress';
    case 'draft':
      return 'draft';
    default:
      return 'unknown';
  }
}

export const RECOVERY_LABELS: Record<RecoveryState, string> = {
  accepted: 'przyjęte',
  open: 'nadal z błędem',
  in_progress: 'w toku',
  draft: 'szkic',
  unknown: 'nieznany stan',
};

export interface SendErrorIncident {
  key: string;
  status: EffectiveStatus;
  errorCode: string | null;
  errorClass: string | null;
  stage: string;
  httpStatus: number | null;
  ksefCode: number | null;
  template: string;
  sampleMessage: string | null;
  sampleInvoiceId: string;
  count: number;
  invoices: number;
  tenants: number;
  firstAt: string;
  lastAt: string;
  /** Bieżący stan dotkniętych faktur (każda liczona raz). */
  recovery: Record<RecoveryState, number>;
}

/**
 * Wiersze → incydenty według odcisku. Każde wykonanie liczy się w `count`
 * (grupowanie nie kasuje prób); faktury i firmy liczone raz. Najliczniejsze
 * i najświeższe na górze.
 */
export function groupIncidents(rows: readonly AttemptRow[], now: Date): SendErrorIncident[] {
  const groups = new Map<string, { incident: SendErrorIncident; invoices: Map<string, RecoveryState>; tenants: Set<string> }>();
  for (const row of rows) {
    const key = fingerprint(row, now);
    let group = groups.get(key);
    if (!group) {
      group = {
        incident: {
          key,
          status: effectiveStatus(row, now),
          errorCode: row.errorCode,
          errorClass: row.errorClass ?? sendErrorClassOf(row.errorCode),
          stage: row.stage,
          httpStatus: row.httpStatus,
          ksefCode: row.ksefCode,
          template: messageTemplate(row.errorMessage),
          sampleMessage: row.errorMessage,
          sampleInvoiceId: row.invoiceId,
          count: 0,
          invoices: 0,
          tenants: 0,
          firstAt: row.startedAt,
          lastAt: row.startedAt,
          recovery: { accepted: 0, open: 0, in_progress: 0, draft: 0, unknown: 0 },
        },
        invoices: new Map(),
        tenants: new Set(),
      };
      groups.set(key, group);
    }
    const { incident } = group;
    incident.count += 1;
    if (row.startedAt < incident.firstAt) incident.firstAt = row.startedAt;
    if (row.startedAt > incident.lastAt) {
      incident.lastAt = row.startedAt;
      incident.sampleMessage = row.errorMessage;
      incident.sampleInvoiceId = row.invoiceId;
    }
    group.invoices.set(row.invoiceId, recoveryState(row.invoiceStatus));
    group.tenants.add(row.tenantId);
  }
  const out: SendErrorIncident[] = [];
  for (const { incident, invoices, tenants } of groups.values()) {
    incident.invoices = invoices.size;
    incident.tenants = tenants.size;
    for (const state of invoices.values()) incident.recovery[state] += 1;
    out.push(incident);
  }
  return out.sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
}

/**
 * Crony, bez których pusta lista błędów nic nie znaczy: worker mógł stanąć.
 * Budżet = termin kompletnego przebiegu z kontraktu F0 (contracts.md,
 * „Due i terminy cronów”).
 */
export const WATCHED_CRONS = [
  { queue: 'cron.ops-heartbeat', label: 'puls workera', budgetMs: 2 * 60 * 1000 },
  { queue: 'cron.critical-alerts-monitor', label: 'monitor alarmów', budgetMs: 10 * 60 * 1000 },
  { queue: 'cron.ksef-lifecycle-reconcile', label: 'strażnik cyklu życia', budgetMs: 30 * 60 * 1000 },
] as const;

export interface CronFreshness {
  queue: string;
  label: string;
  lastAt: string | null;
  ageMs: number | null;
  stale: boolean;
}

export function cronFreshness(
  lastRuns: ReadonlyMap<string, string | null>,
  now: Date,
): CronFreshness[] {
  return WATCHED_CRONS.map((cron) => {
    const lastAt = lastRuns.get(cron.queue) ?? null;
    const at = lastAt ? Date.parse(lastAt) : NaN;
    const ageMs = Number.isFinite(at) ? Math.max(0, now.getTime() - at) : null;
    return { queue: cron.queue, label: cron.label, lastAt, ageMs, stale: ageMs === null || ageMs > cron.budgetMs };
  });
}
