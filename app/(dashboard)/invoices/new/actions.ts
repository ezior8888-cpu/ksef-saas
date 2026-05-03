/**
 * Barrel: Server Actions przy tworzeniu dokumentów (`/invoices/new/*`).
 *
 * **Uwaga architektoniczna:** ta warstwa zapisuje szkic w DB i uruchamia
 * kolejkę wysyłki (`enqueueKsefSubmitAfterDraft` w `@/lib/invoices/ksef-submit-enqueue`).
 * Generacja XML FA(3), walidacja XSD, upload do R2 i wywołanie API KSeF odbywa się
 * w jobie Inngest (`submitInvoiceFullFlow`) — tak samo dla faktury zwykłej, zaliczki,
 * rozliczenia i korekty.
 */
'use server';

export {
  lookupBuyerAction,
  saveDraftAction,
  saveAndSendInvoiceAction,
  type InvoiceActionResult,
  type LookupBuyerResult,
} from '@/components/invoices/actions';

export {
  getCorrectionParentContextAction,
  saveCorrectionDraftAction,
  saveAndSendCorrectionAction,
  type CorrectionActionResult,
} from '@/components/invoices/correction-actions';

export { saveAdvanceAction, saveAndSendAdvanceAction } from '@/components/invoices/advance-actions';

export { saveFinalAction, saveAndSendFinalAction } from '@/components/invoices/final-actions';
