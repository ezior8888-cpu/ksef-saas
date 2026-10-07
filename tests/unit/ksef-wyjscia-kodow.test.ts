import { describe, expect, it } from 'vitest';

import { operatorInvoiceButtons } from '@/lib/admin/ksef-operator-policy';
import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import { failedInvoiceButtons } from '@/lib/invoices/ksef-send-policy';
import { isKindHeldForEnv } from '@/lib/ksef/kind-holds';
import {
  isAutoRequeueable,
  SEND_ERROR_CODES,
  sendErrorClassOf,
  type SendErrorCode,
} from '@/lib/ksef/send-error-classes';
import type { KsefEnvironment } from '@/types/ksef';

/**
 * A4 z planu „zero zgubionych faktur” (definicja sukcesu nr 1): każdy stan
 * końcowy faktury wychodzącej ma WYJŚCIE — automat (cron), klient (przycisk)
 * albo operator (`/admin/ksef`). Macierz (od A4b PR2a): każdy kod katalogu
 * × rodzaj dokumentu (FA/KOR/ZAL/ROZ) × dane do ponowienia (kopia na
 * wierszu: ZAL `fa3_data.advanceEnvelope`, KOR/ROZ `special_data`, 00137)
 * × środowisko KSeF (TEST/PROD) × data wystawienia dokumentu specjalnego
 * (dziś / wcześniej) × dowód kontaktu z KSeF × otwarty wpis (`sent`/`intent`).
 * Zwykła faktura ma zawsze dane i „dzisiejszą” datę (reguła daty dotyczy
 * tylko dokumentów specjalnych, decyzja b z 06.10.2026).
 *
 * Wyjścia liczone tymi samymi czystymi modułami, z których korzystają
 * przyciski i akcje (operator: fakty + `environmentKnown`; rodzaj wstrzymany
 * — prawdziwe `isKindHeldForEnv`); reguły RPC i crona odwzorowane niżej
 * (komentarz = źródło). Klient do A4b PR2b zostaje przy starej sygnaturze
 * (bez faktów). Lista ŚLEPYCH ULICZEK jest jawna: każda pozycja ma sesję
 * albo decyzję, która ją zamknie. Nowa ślepa uliczka (albo zamknięta,
 * a niewykreślona) czerwieni test.
 */

type Kind = 'regular' | 'correction' | 'advance' | 'final';
type Env = Extract<KsefEnvironment, 'test' | 'production'>;
interface Scenario {
  code: SendErrorCode;
  kind: Kind;
  /** Czy wiersz ma kopię danych do odtworzenia zdarzenia wysyłki. */
  sendData: KsefResendFacts['sendData'];
  /** KSEF_ENV aplikacji i workera (operator zna środowisko: `environmentKnown`). */
  env: Env;
  /** Dokument specjalny z datą wystawienia sprzed dzisiaj (00147, decyzja b). */
  issueDatePassed: boolean;
  evidence: boolean;
  openSubmission: boolean;
}

/** Fakty ponowienia z `ksefResendFacts` — tu z wymiarów scenariusza i prawdziwego hamulca rodzaju. */
function factsOf(s: Scenario): KsefResendFacts {
  return { sendData: s.sendData, kindHeld: isKindHeldForEnv(s.kind, s.env), issueDatePassed: s.issueDatePassed };
}

const STORED: KsefResendFacts = { sendData: 'stored', kindHeld: false, issueDatePassed: false };

/** `reset_ksef_send` (00131): odmowa przy dowodzie kontaktu i przy klasie reconcile. */
function resetAllowedByRpc(s: Scenario): boolean {
  return !s.evidence && sendErrorClassOf(s.code) !== 'reconcile';
}

/**
 * Cron `ksef-lifecycle-reconcile` (A4b PR2a): I6 (kody `AUTO_REQUEUE_CODES`)
 * i I7 (`KSEF_PAUSED`) wysyłają od nowa — dokument specjalny tylko z danymi,
 * rodzajem niewstrzymanym w tym środowisku (KOR nie na PROD, ROZ nigdy — C4)
 * i w dniu wystawienia; I5 (A3: otwarty wpis > 48 h, failed/rejected)
 * uzgadnia — z danymi i niewstrzymanym rodzajem, bez względu na datę.
 */
function automaticExit(s: Scenario): boolean {
  const special = s.kind !== 'regular';
  const { kindHeld } = factsOf(s);
  const canRebuild = s.sendData === 'stored' && !kindHeld;
  const canSend = canRebuild && !(special && s.issueDatePassed);
  return (canSend && (isAutoRequeueable(s.code) || s.code === SEND_ERROR_CODES.KSEF_PAUSED))
    || (canRebuild && s.openSubmission);
}

/** Klient do A4b PR2b: stara sygnatura (bez faktów) — dokument specjalny tylko „Wróć do szkicu”. */
function clientExit(s: Scenario): boolean {
  const b = failedInvoiceButtons({ status: 'failed', errorCode: s.code, invoiceKind: s.kind, canManage: true });
  if (!b) return false;
  // „Wyślij ponownie” klienta idzie przez `requeue_ksef_send` (klasa terminal odmawia — przycisk jej nie pokazuje).
  return b.resend || (b.reset && resetAllowedByRpc(s));
}

function operatorExit(s: Scenario): boolean {
  const b = operatorInvoiceButtons({
    direction: 'outgoing', status: 'failed', errorCode: s.code, invoiceKind: s.kind,
    openSent: s.openSubmission, evidence: s.evidence, facts: factsOf(s), environmentKnown: true,
  });
  return b.requeue.enabled || b.reconcile.enabled || (b.reset.enabled && resetAllowedByRpc(s));
}

const KINDS: readonly Kind[] = ['regular', 'correction', 'advance', 'final'];
const ENVS: readonly Env[] = ['test', 'production'];

function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const code of Object.values(SEND_ERROR_CODES)) {
    for (const kind of KINDS) {
      const special = kind !== 'regular';
      for (const env of ENVS) {
        for (const sendData of special ? (['stored', 'missing'] as const) : (['stored'] as const)) {
          for (const issueDatePassed of special ? [false, true] : [false]) {
            // Otwarty wpis jest dowodem kontaktu (00131/00136), więc open ⇒ evidence.
            for (const [evidence, openSubmission] of [[false, false], [true, false], [true, true]] as const) {
              out.push({ code, kind, sendData, env, issueDatePassed, evidence, openSubmission });
            }
          }
        }
      }
    }
  }
  return out;
}

const label = (s: Scenario) =>
  `${s.code} ${s.kind} ${s.env}${s.sendData === 'missing' ? ' bez-danych' : ''}${s.issueDatePassed ? ' po-dacie' : ''}`
  + `${s.evidence ? ' +dowód' : ''}${s.openSubmission ? ' +otwarty' : ''}`;

/**
 * Znane ślepe uliczki — każda z sesją albo decyzją, która ją zamknie.
 * `noReset`: szkic odmówiony (dowód kontaktu albo klasa reconcile, 00131).
 *  - dokument specjalny bez danych do ponowienia albo rodzaju wstrzymanego
 *    w tym środowisku, bez szkicu: KOR — runbook „Stary dokument specjalny”,
 *    potem TEST, na PROD C4 (KOR_HOLD); ROZ — runbook, potem C4 (hamulec ROZ
 *    wszędzie); ZAL bez koperty po przejęciu — brak wyjścia (00132), decyzja
 *    Bartosza per faktura; wstrzymany rodzaj — C4;
 *  - otwarty wpis przy danych i niewstrzymanym rodzaju: zawsze „Tylko
 *    uzgodnij” operatora i I5;
 *  - dokument specjalny po dacie wystawienia bez otwartego wpisu, bez szkicu:
 *    pełnej wysyłki nie zlecamy (decyzja b) — B2;
 *  - KSEF_DUPLICATE_RECONCILE bez otwartego wpisu: automat (D-A4-1a) porównał
 *    treść i nie rozstrzygnął (oryginał z FaktFlow o innym pliku, numer KSeF
 *    w innej fakturze) — wyjściem będzie ręczny werdykt operatora (D-A4-1b).
 *    Z otwartym wpisem „Tylko uzgodnij” powtarza weryfikację;
 *  - kod treści (terminal) przy dowodzie kontaktu bez otwartego wpisu — w
 *    praktyce zamknięty wpis `duplicate` po nierozstrzygniętym 440 w historii
 *    (rozstrzygnięty „numer zajęty” przenosi wpisy na `number_taken`, które
 *    nie są dowodem); wyjście: ręczny werdykt D-A4-1b.
 */
function knownDeadEnd(s: Scenario): boolean {
  const errorClass = sendErrorClassOf(s.code);
  const special = s.kind !== 'regular';
  const { kindHeld } = factsOf(s);
  const noReset = s.evidence || errorClass === 'reconcile';
  if (special && (s.sendData === 'missing' || kindHeld)) return noReset; // runbook / C4 / decyzja Bartosza (ZAL, 00132)
  if (s.openSubmission) return false;
  if (special && s.issueDatePassed) return noReset; // B2
  if (s.code === SEND_ERROR_CODES.KSEF_DUPLICATE_RECONCILE) return true; // D-A4-1b
  return s.evidence && errorClass === 'terminal'; // D-A4-1b
}

describe('A4: każdy kod katalogu ma wyjście (automat, klient albo operator)', () => {
  it('ślepe uliczki to dokładnie znana lista z sesją albo decyzją', () => {
    // Wymiary: FA 2 środowiska × 3 (dowód, wpis) + KOR/ZAL/ROZ × 2 dane × 2 środowiska × 2 daty × 3 = 78 na kod.
    expect(scenarios()).toHaveLength(Object.values(SEND_ERROR_CODES).length * 78);
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
        facts: STORED, environmentKnown: true,
      });
      expect(b.requeue, `${code} evidence=${evidence}`).toEqual({ enabled: true, reason: null });
    }
  });

  it.each([SEND_ERROR_CODES.KSEF_DUPLICATE_RECONCILE, SEND_ERROR_CODES.ENV_MISMATCH])(
    '%s: ponowienie nadal zablokowane (decyzja D-A4), z powodem dla operatora',
    (code) => {
      const b = operatorInvoiceButtons({
        direction: 'outgoing', status: 'failed', errorCode: code, invoiceKind: 'regular', openSent: false, evidence: true,
        facts: STORED, environmentKnown: true,
      });
      expect(b.requeue.enabled).toBe(false);
      expect(b.requeue.reason).toBeTruthy();
    },
  );

  it('A4b PR2a: ZAL z danymi w dniu wystawienia, RESULT_UNCERTAIN z dowodem bez otwartego wpisu — operator „Wyślij ponownie” (A4), nie ślepa uliczka', () => {
    const s: Scenario = {
      code: SEND_ERROR_CODES.RESULT_UNCERTAIN, kind: 'advance', sendData: 'stored', env: 'production',
      issueDatePassed: false, evidence: true, openSubmission: false,
    };
    expect(operatorExit(s)).toBe(true);
    expect(knownDeadEnd(s)).toBe(false);
  });
});
