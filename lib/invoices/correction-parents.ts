/**
 * K4: faktura pierwotna z korektą W TOKU (szkic, kolejka, wysyłka, offline,
 * błąd) nie jest kandydatem na rodzica kolejnej. Przyjęte korekty tworzą
 * łańcuch — kolejna liczy „stan przed” po ostatniej z nich
 * (`correctionBaseline` w akcjach); odrzucone nie liczą się wcale.
 * Ta sama reguła w wyzwalaczu 00133/00135.
 */

export interface CorrectionRef {
  parent_invoice_id: string | null;
  ksef_status: string | null;
}

/** Korekta w drodze (szkic, kolejka, wysyłka, offline, błąd) — przyjęta ani odrzucona nie blokuje. */
export function isInFlightCorrectionStatus(status: string | null | undefined): boolean {
  return status !== 'accepted' && status !== 'rejected';
}

export function parentsWithOpenCorrection(corrections: ReadonlyArray<CorrectionRef>): Set<string> {
  const blocked = new Set<string>();
  for (const c of corrections) {
    if (c.parent_invoice_id && isInFlightCorrectionStatus(c.ksef_status)) blocked.add(c.parent_invoice_id);
  }
  return blocked;
}

export function excludeParentsWithOpenCorrection<T extends { id: string }>(
  parents: ReadonlyArray<T>,
  corrections: ReadonlyArray<CorrectionRef>,
): T[] {
  const blocked = parentsWithOpenCorrection(corrections);
  return parents.filter((p) => !blocked.has(p.id));
}

export interface OpenCorrectionRef {
  internal_number: string | null;
  ksef_status: string | null;
}

const CORRECTION_STATUS_LABEL: Record<string, string> = {
  draft: 'szkic',
  queued: 'w kolejce do KSeF',
  sending: 'w trakcie wysyłki',
  offline_queued: 'w kolejce offline',
  failed: 'z błędem wysyłki',
  accepted: 'przyjęta przez KSeF',
};

/** Komunikat K4 — wspólny dla akcji i (pośrednio) wyzwalacza 00133. */
export function openCorrectionMessage(parentNumber: string | null, open: OpenCorrectionRef): string {
  const status = CORRECTION_STATUS_LABEL[open.ksef_status ?? ''] ?? (open.ksef_status ?? 'w toku');
  return `Faktura ${parentNumber ?? 'pierwotna'} ma korektę w toku: ${open.internal_number ?? ''} (${status}). `
    + 'Dokończ jej wysyłkę albo wróć nią do szkicu i usuń, zanim wystawisz kolejną korektę.';
}

/** Stan faktury po przyjętych korektach (K4) — budowany w akcjach (`correctionBaseline`). */
export interface CorrectionBaselineOf<TLine> {
  lines: TLine[];
  totals: { net: number; vat: number; gross: number };
  latest: { id: string; internalNumber: string | null; correctionType: string | null } | null;
  /** Po korekcie kwotowej tylko kwotowa; po anulowaniu nic. */
  allowed: 'all' | 'amount_change_only' | 'none';
}

/** Komunikat odmowy wg stanu po korektach (K4); `null` = typ korekty dozwolony. */
export function correctionNotAllowedMessage(
  parentNumber: string | null,
  baseline: Pick<CorrectionBaselineOf<unknown>, 'allowed' | 'latest'>,
  requested: string,
): string | null {
  if (baseline.allowed === 'none') {
    return `Faktura ${parentNumber ?? 'pierwotna'} została w całości anulowana korektą ${baseline.latest?.internalNumber ?? ''} — nie ma już czego korygować.`;
  }
  if (baseline.allowed === 'amount_change_only' && requested !== 'amount_change') {
    return `Po korekcie kwotowej ${baseline.latest?.internalNumber ?? ''} stan pozycji faktury ${parentNumber ?? 'pierwotnej'} nie jest jednoznaczny — kolejna korekta może być tylko kwotowa.`;
  }
  return null;
}
