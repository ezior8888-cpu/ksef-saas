import { describe, expect, it } from 'vitest';

import { operatorInvoiceButtons } from '@/lib/admin/ksef-operator-policy';
import { failedInvoiceButtons } from '@/lib/invoices/ksef-send-policy';
import {
  isAutoRequeueable,
  SEND_ERROR_CODES,
  sendErrorClassOf,
  type SendErrorCode,
} from '@/lib/ksef/send-error-classes';

/**
 * A4 z planu „zero zgubionych faktur” (definicja sukcesu nr 1): każdy stan
 * końcowy faktury wychodzącej ma WYJŚCIE — automat (cron), klient (przycisk)
 * albo operator (`/admin/ksef`). Macierz: każdy kod katalogu × rodzaj
 * dokumentu × dowód kontaktu z KSeF × otwarty wpis (`sent`/`intent`).
 *
 * Wyjścia liczone tymi samymi czystymi modułami, z których korzystają
 * przyciski i akcje; reguły RPC i crona odwzorowane niżej (komentarz = źródło).
 * Lista ŚLEPYCH ULICZEK jest jawna: każda pozycja ma sesję albo decyzję,
 * która ją zamknie. Nowa ślepa uliczka (albo zamknięta, a niewykreślona)
 * czerwieni test.
 */

type Kind = 'regular' | 'correction';
interface Scenario {
  code: SendErrorCode;
  kind: Kind;
  evidence: boolean;
  openSubmission: boolean;
}

/** `reset_ksef_send` (00131): odmowa przy dowodzie kontaktu i przy klasie reconcile. */
function resetAllowedByRpc(s: Scenario): boolean {
  return !s.evidence && sendErrorClassOf(s.code) !== 'reconcile';
}

/**
 * Cron `ksef-lifecycle-reconcile`: I6 (kody `auto_requeue`), I7 (`KSEF_PAUSED`)
 * i I5 (A3: otwarty wpis > 48 h, failed/rejected) — tylko zwykłe faktury,
 * bo zdarzenia dokumentu specjalnego nie da się odtworzyć z wiersza.
 */
function automaticExit(s: Scenario): boolean {
  if (s.kind !== 'regular') return false;
  return isAutoRequeueable(s.code) || s.code === SEND_ERROR_CODES.KSEF_PAUSED || s.openSubmission;
}

function clientExit(s: Scenario): boolean {
  const b = failedInvoiceButtons({ status: 'failed', errorCode: s.code, invoiceKind: s.kind, canManage: true });
  if (!b) return false;
  // „Wyślij ponownie” klienta idzie przez `requeue_ksef_send` (klasa terminal odmawia — przycisk jej nie pokazuje).
  return b.resend || (b.reset && resetAllowedByRpc(s));
}

function operatorExit(s: Scenario): boolean {
  const b = operatorInvoiceButtons({
    direction: 'outgoing', status: 'failed', errorCode: s.code, invoiceKind: s.kind,
    openSent: s.openSubmission, evidence: s.evidence,
  });
  return b.requeue.enabled || b.reconcile.enabled || (b.reset.enabled && resetAllowedByRpc(s));
}

function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const code of Object.values(SEND_ERROR_CODES)) {
    for (const kind of ['regular', 'correction'] as const) {
      // Otwarty wpis jest dowodem kontaktu (00131/00136), więc open ⇒ evidence.
      for (const [evidence, openSubmission] of [[false, false], [true, false], [true, true]] as const) {
        out.push({ code, kind, evidence, openSubmission });
      }
    }
  }
  return out;
}

const label = (s: Scenario) =>
  `${s.code} ${s.kind}${s.evidence ? ' +dowód' : ''}${s.openSubmission ? ' +otwarty' : ''}`;

/**
 * Znane ślepe uliczki — każda z sesją albo decyzją, która ją zamknie.
 *  - KSEF_DUPLICATE_RECONCILE bez otwartego wpisu: automat (D-A4-1a) porównał
 *    treść i nie rozstrzygnął (oryginał z FaktFlow o innym pliku, numer KSeF
 *    w innej fakturze) — wyjściem będzie ręczny werdykt operatora (D-A4-1b).
 *    Z otwartym wpisem „Tylko uzgodnij” powtarza weryfikację.
 *  - ENV_MISMATCH: ponowienie wysłałoby fakturę w innym środowisku niż to, w
 *    którym ją zlecono (np. faktura z TEST na PROD) — decyzja D-A4-2 (F1, go-live).
 *  - kod treści (terminal) przy dowodzie kontaktu bez otwartego wpisu — w
 *    praktyce zamknięty wpis `duplicate` po nierozstrzygniętym 440 w historii
 *    (rozstrzygnięty „numer zajęty” przenosi wpisy na `number_taken`, które
 *    nie są dowodem); wyjście: ręczny werdykt D-A4-1b.
 *  - dokument specjalny z dowodem kontaktu albo z kodem reconcile: zdarzenia
 *    nie da się odtworzyć z wiersza — A4b (00137, dane specjalne na wierszu).
 */
function knownDeadEnd(s: Scenario): boolean {
  const errorClass = sendErrorClassOf(s.code);
  if (s.kind === 'regular') {
    if (s.openSubmission) return false;
    if (s.code === SEND_ERROR_CODES.KSEF_DUPLICATE_RECONCILE || s.code === SEND_ERROR_CODES.ENV_MISMATCH) return true;
    return s.evidence && errorClass === 'terminal';
  }
  return errorClass === 'reconcile' || s.evidence;
}

describe('A4: każdy kod katalogu ma wyjście (automat, klient albo operator)', () => {
  it('ślepe uliczki to dokładnie znana lista z sesją albo decyzją', () => {
    const deadEnds = scenarios()
      .filter((s) => !automaticExit(s) && !clientExit(s) && !operatorExit(s))
      .map(label)
      .sort();
    const expected = scenarios().filter(knownDeadEnd).map(label).sort();
    expect(deadEnds).toEqual(expected);
  });

  it.each([
    SEND_ERROR_CODES.ENQUEUE_LOST,
    SEND_ERROR_CODES.INVALID_EVENT,
    SEND_ERROR_CODES.RESULT_UNCERTAIN,
  ])('%s (zwykła faktura, bez otwartego wpisu): operator może „Wyślij ponownie”', (code) => {
    for (const evidence of [false, true]) {
      const b = operatorInvoiceButtons({
        direction: 'outgoing', status: 'failed', errorCode: code, invoiceKind: 'regular', openSent: false, evidence,
      });
      expect(b.requeue, `${code} evidence=${evidence}`).toEqual({ enabled: true, reason: null });
    }
  });

  it.each([SEND_ERROR_CODES.KSEF_DUPLICATE_RECONCILE, SEND_ERROR_CODES.ENV_MISMATCH])(
    '%s: ponowienie nadal zablokowane (decyzja D-A4), z powodem dla operatora',
    (code) => {
      const b = operatorInvoiceButtons({
        direction: 'outgoing', status: 'failed', errorCode: code, invoiceKind: 'regular', openSent: false, evidence: true,
      });
      expect(b.requeue.enabled).toBe(false);
      expect(b.requeue.reason).toBeTruthy();
    },
  );
});
