/**
 * Faktura rozliczająca (ROZ) — hamulec wysyłki.
 *
 * Do 03.10.2026 ROZ była wstrzymana WSZĘDZIE (warstwa 1, bez rozróżnienia
 * środowiska): treść XML i rozliczenie zaliczek szły z eventu kolejki, bez
 * dowodu, że odwołane zaliczki są naprawdę przyjęte w TYM SAMYM środowisku
 * KSeF co wysyłka. Warstwa 1 ZDJĘTA (C-10) — `lib/ksef/submit-reference-boundary.ts`
 * czyta teraz treść ROZ (`finalEnvelope`) i rozliczenie zaliczek PRZY KAŻDEJ
 * wysyłce z bazy, nie z eventu, tak samo jak ZAL (`advanceEnvelope`).
 *
 * Zostaje tylko warstwa 2 — PROD, do domknięcia:
 *   - C-16 — kwota do zapłaty ROZ liczona z `payments`, nie tylko z zaliczek
 *     wskazanych w `advance_invoice_ids` (osobny PR),
 *   - I9/C-17 — pozycje zamówienia zaliczki i `P_6` w generatorze FA(3).
 *
 * Sprawdzana w dwóch miejscach: kolejkowanie (`lib/invoices/ksef-submit-enqueue.ts`)
 * i strażnik referencji tuż przed wysyłką (`lib/ksef/submit-reference-boundary.ts`).
 */
export const ROZ_PRODUCTION_HOLD_MESSAGE =
  'Wysyłka faktury rozliczającej w PROD jest wstrzymana do czasu domknięcia C-16 (kwota do zapłaty w płatnościach) i I9/C-17 (pozycje zamówienia zaliczki, P_6). Dokument zapisano jako szkic.';
