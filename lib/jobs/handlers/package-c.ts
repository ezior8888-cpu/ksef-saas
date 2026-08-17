/**
 * Paczka C (Etap 7.5): 8 jobów OCR / importy / eksporty.
 *
 * Runnery żyją w lib/inngest/jobs/* (jedno źródło prawdy).
 *
 * Parytet 1:1 z konfiguracją Inngest:
 *   - retries: OCR 2, auto-kategoryzacja 2, bulk-import 1, walidacja
 *     kontrahentów 1, magic-import 2, eksporty 2, co-pilot 2,
 *   - `concurrency: { limit: N }` (globalne) → `batchSize: N` — worker
 *     pobiera do N jobów naraz z tej kolejki,
 *   - `concurrency: { key: 'event.data.nip' }` (magic-import) →
 *     `groupConcurrency` pg-boss; grupę ustawia nadawca (Etap 7 planu),
 *   - `onFailure` → `onExhausted` (wspólne funkcje w plikach jobów):
 *     oznaczenie zadania jako nieudanego, żeby UI nie wisiało na
 *     „przetwarzanie".
 */

import { runAutoCategorizeInbox } from '../../inngest/jobs/auto-categorize-inbox';
import {
  onBulkImportExhausted,
  runBulkImportFile,
} from '../../inngest/jobs/bulk-import';
import { runBulkValidateContractors } from '../../inngest/jobs/bulk-validate-contractors';
import {
  runCoPilotMonthly,
  runCoPilotSendPackage,
} from '../../inngest/jobs/co-pilot-monthly';
import { runExportsGenerate } from '../../inngest/jobs/exports-generate';
import {
  onMagicImportExhausted,
  runMagicImportKsef,
} from '../../inngest/jobs/magic-import-ksef';
import {
  onProcessOcrExhausted,
  runProcessOcr,
} from '../../inngest/jobs/process-ocr';
import { registerJob, type JobContext } from '../registry';

// ── Cron: miesięczne paczki dla księgowego ──
registerJob<Record<string, never>>({
  queue: 'cron.co-pilot-monthly',
  maxRetries: 4, // default Inngest (job nie deklaruje własnego)
  handler: (_data, ctx: JobContext) => runCoPilotMonthly(ctx),
});

// ── OCR paragonów ──
registerJob<Parameters<typeof runProcessOcr>[0]>({
  queue: 'ocr.process-photo',
  maxRetries: 2,
  batchSize: 5,
  handler: (data, ctx) => runProcessOcr(data, ctx),
  onExhausted: onProcessOcrExhausted,
});

// ── Auto-kategoryzacja faktur ze skrzynki ──
registerJob<Parameters<typeof runAutoCategorizeInbox>[0]>({
  queue: 'inbox.invoice.received',
  maxRetries: 2,
  batchSize: 10,
  handler: (data, ctx) => runAutoCategorizeInbox(data, ctx),
});

// ── Import pliku (CSV/XML) ──
registerJob<Parameters<typeof runBulkImportFile>[0]>({
  queue: 'import.file.uploaded',
  maxRetries: 1,
  batchSize: 5,
  handler: (data, ctx) => runBulkImportFile(data, ctx),
  onExhausted: onBulkImportExhausted,
});

// ── Masowa walidacja kontrahentów (Biała Lista / VIES) ──
registerJob<Parameters<typeof runBulkValidateContractors>[0]>({
  queue: 'validation.bulk-contractors.requested',
  maxRetries: 1,
  batchSize: 3,
  handler: (data, ctx) => runBulkValidateContractors(data, ctx),
});

// ── Magic Import historii z KSeF (limit per NIP) ──
registerJob<Parameters<typeof runMagicImportKsef>[0]>({
  queue: 'import.ksef-history.requested',
  maxRetries: 2,
  groupConcurrency: 3, // odpowiednik concurrency { key: 'event.data.nip', limit: 3 }
  handler: (data, ctx) => runMagicImportKsef(data, ctx),
  onExhausted: onMagicImportExhausted,
});

// ── Generowanie eksportów (JPK, KPiR, Optima) ──
registerJob<Parameters<typeof runExportsGenerate>[0]>({
  queue: 'exports.generate.requested',
  maxRetries: 2,
  batchSize: 5,
  handler: (data, ctx) => runExportsGenerate(data, ctx),
});

// ── Wysyłka paczki do księgowego ──
registerJob<Parameters<typeof runCoPilotSendPackage>[0]>({
  queue: 'exports.co-pilot.send-package',
  maxRetries: 2,
  batchSize: 3,
  handler: (data, ctx) => runCoPilotSendPackage(data, ctx),
});
