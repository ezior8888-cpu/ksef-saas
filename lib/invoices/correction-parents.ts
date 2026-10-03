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
