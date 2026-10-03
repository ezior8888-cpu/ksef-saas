/**
 * K4: faktura pierwotna z otwartą korektą (każdą poza odrzuconą przez KSeF)
 * nie jest kandydatem na rodzica kolejnej — do czasu łańcucha korekt
 * liczącego „stan przed” po ostatniej przyjętej KOR. Ta sama reguła
 * w akcjach (`findOpenCorrection`) i w wyzwalaczu 00133.
 */

export interface CorrectionRef {
  parent_invoice_id: string | null;
  ksef_status: string | null;
}

export function parentsWithOpenCorrection(corrections: ReadonlyArray<CorrectionRef>): Set<string> {
  const blocked = new Set<string>();
  for (const c of corrections) {
    if (c.parent_invoice_id && c.ksef_status !== 'rejected') blocked.add(c.parent_invoice_id);
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
  return `Faktura ${parentNumber ?? 'pierwotna'} ma już korektę ${open.internal_number ?? ''} (${status}). `
    + 'Kolejną korektę tej samej faktury (łańcuch korekt) obsłużymy w następnym wydaniu — '
    + 'do tego czasu popraw istniejącą korektę albo skontaktuj się z nami.';
}
