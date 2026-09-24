'use server';

import { revalidatePath } from 'next/cache';

import { logAuditSystem } from '@/lib/audit/log-system';
import { requireAdmin } from '@/lib/auth/admin-guard';
import { kindStatus } from '@/lib/flo/flags';
import {
  canSetStage,
  readRollout,
  ROLLOUT_ORDER,
  ROLLOUT_STAGES,
  setStage,
  type RolloutStage,
} from '@/lib/flo/rollout';
import { isFloProposalKind } from '@/types/flo';

/**
 * Odsłanianie funkcji agenta z panelu operatora.
 *
 * PO CO TO ISTNIEJE. Do tej pory kanarka dało się przestawić wyłącznie
 * ręcznym SQL-em na produkcyjnej bazie. Panel mówił, która funkcja jest
 * gotowa wyjść z ukrycia, i nie dawał żadnego sposobu, żeby to zrobić —
 * więc decyzja produktowa wymagała dostępu do bazy. To zawężało ją do
 * jednej osoby i zamieniało odwracalny ruch w operację, przy której łatwiej
 * o literówkę niż o pomyłkę w ocenie.
 *
 * CAŁA LOGIKA DECYZJI SIEDZI W `canSetStage` — funkcji czystej, testowanej
 * bez bazy i bez sesji. Tutaj zostaje wyłącznie wiązanie: kto pyta, czy
 * dane są tym, za co się podają, zapis i ślad w audycie.
 */

export type RolloutActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

export async function setRolloutStageAction(
  kind: string,
  stage: number,
): Promise<RolloutActionResult> {
  // PIERWSZA linia i nie do przestawienia. Akcja serwerowa to zwykły
  // endpoint POST pod wygenerowanym adresem — `requireAdmin()` z
  // `app/admin/layout.tsx` chroni RENDEROWANIE strony, nie to wywołanie.
  // Bez tej linii wystarczy znać adres akcji, żeby odsłonić funkcję
  // wszystkim klientom.
  const admin = await requireAdmin();

  // Argumenty przychodzą z przeglądarki, więc są danymi, nie deklaracją.
  // Biała lista z `ROLLOUT_ORDER`, nie sam strażnik typu: kanarek dotyczy
  // rodzajów z planu odsłaniania, a nie wszystkiego, co ma kartę.
  if (!isFloProposalKind(kind) || !ROLLOUT_ORDER.some((e) => e.kind === kind)) {
    return { success: false, error: `Nieznany rodzaj: ${kind}` };
  }

  if (!(ROLLOUT_STAGES as readonly number[]).includes(stage)) {
    return { success: false, error: `Nieznany etap: ${stage}` };
  }

  const target = stage as RolloutStage;
  const status = kindStatus(kind);
  const state = await readRollout(kind);

  const verdict = canSetStage({
    state,
    kind,
    to: target,
    now: new Date(),
    blockedInCode: status.enabled ? null : (status.note ?? status.reason ?? 'brak powodu'),
  });

  if (!verdict.allowed) {
    return { success: false, error: verdict.detail };
  }

  await setStage({ kind, stage: target });

  // Odsłonięcie funkcji dotyka klientów, więc zostawia ślad tak samo jak
  // każda inna operacja admina. `tenantId: null`, bo to decyzja o całej
  // platformie, a nie o jednym koncie.
  await logAuditSystem({
    action: 'admin.flo.rollout.changed',
    tenantId: null,
    userId: admin.userId,
    entityType: 'flo_rollout',
    entityId: kind,
    metadata: {
      adminEmail: admin.email,
      kind,
      from: verdict.from,
      to: verdict.to,
      direction: verdict.direction,
    },
  });

  revalidatePath('/admin/flo');

  const message =
    verdict.direction === 'hide'
      ? `${kind}: schowane (${verdict.from}% → ${verdict.to}%)`
      : `${kind}: ${verdict.from}% → ${verdict.to}% kont`;

  return { success: true, message };
}
