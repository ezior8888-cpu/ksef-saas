/**
 * Wykonawca propozycji (krok 11 planu agenta FLO).
 *
 * JEDNO MIEJSCE, PRZEZ KTÓRE PRZECHODZI KAŻDE WYKONANIE. Nie ma drugiej
 * drogi: test architektoniczny pilnuje, żeby żadne zadanie w tle nie
 * dosięgło funkcji wychodzącej z pominięciem tej ścieżki.
 *
 * KOLEJNOŚĆ KROKÓW JEST NIENEGOCJOWALNA — każdy z nich zamyka inną klasę
 * awarii i zamiana miejscami otwiera ją z powrotem:
 *
 *   1. świeżość danych   — czy świat nie zmienił się od czasu propozycji
 *   2. atomowe przejęcie — czy to my wykonujemy, a nie drugie kliknięcie
 *   3. zużycie żetonu    — czy zgoda człowieka istnieje i jest ważna
 *   4. wykonawca         — dopiero teraz cokolwiek się dzieje
 *   5. dziennik          — ślad, kto, na co i na jakiej podstawie się zgodził
 *
 * Świeżość PRZED przejęciem, bo nieaktualnej propozycji nie chcemy nawet
 * blokować pod siebie. Przejęcie PRZED zużyciem żetonu, bo inaczej dwa
 * równoległe kliknięcia spaliłyby żeton, zanim ustaliłoby się, kto wykonuje.
 */

import { consumeApproval, FloApprovalError } from '@/lib/flo/approval';
import { floDb, type FloDbClient, type FloProposalRow } from '@/lib/flo/db-types';
import { assertFresh, FloStaleError } from '@/lib/flo/fingerprint';
import { getFloHandler } from '@/lib/flo/handlers';
import { recordDecision } from '@/lib/flo/decisions';
import { logAuditSystem } from '@/lib/audit/log-system';
import type { AuditAction } from '@/lib/audit/log';
import { isFloProposalKind, type FloApproveInput, type FloApproveResult } from '@/types/flo';

export interface ExecuteProposalInput {
  proposalId: string;
  userId: string;
  approvalId: string;
  input?: FloApproveInput;
}

/** Stany, z których wolno wystartować wykonanie. */
const CLAIMABLE = ['open', 'approved'] as const;

/**
 * `db` jest wstrzykiwalne wyłącznie po to, żeby dało się przetestować wyścig
 * pięćdziesięciu równoległych kliknięć bez stawiania Postgresa. Produkcyjnie
 * zawsze idzie tu prawdziwy klient.
 */
export async function executeProposal(
  args: ExecuteProposalInput,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<FloApproveResult> {
  const { proposalId, userId, approvalId } = args;

  const loaded = await db
    .from('flo_proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle();

  if (loaded.error) throw new Error(loaded.error.message);

  const proposal = loaded.data;
  if (!proposal) {
    return {
      ok: false,
      reason: 'expired',
      message: 'Tej propozycji już nie ma.',
    };
  }

  // Powtórka po wykonaniu nie jest błędem — człowiek mógł kliknąć drugi raz
  // na starym ekranie. Mówimy „zrobione”, bo to jest prawda.
  if (proposal.status === 'done') return { ok: true };

  if (proposal.status === 'executing') {
    // Wykonanie trwa w innym wątku. Nie ma powodu straszyć człowieka
    // błędem — jego kliknięcie doprowadziło do działania.
    return { ok: true };
  }

  if (!CLAIMABLE.includes(proposal.status as (typeof CLAIMABLE)[number])) {
    return {
      ok: false,
      reason: 'expired',
      message: 'Ta propozycja jest już nieaktualna.',
    };
  }

  if (Date.parse(proposal.expires_at) <= now.getTime()) {
    await db
      .from('flo_proposals')
      .update({ status: 'expired', dismissed_reason: 'auto_expired' })
      .eq('id', proposalId);
    return {
      ok: false,
      reason: 'expired',
      message: 'Minął termin tej propozycji. Przygotuję ją od nowa.',
    };
  }

  if (!isFloProposalKind(proposal.kind)) {
    return {
      ok: false,
      reason: 'blocked',
      message: 'Nie rozpoznaję tego rodzaju sprawy — zgłosiłem to zespołowi.',
    };
  }

  // ── 1. Świeżość danych ──────────────────────────────────────
  try {
    await assertFresh(proposal, now);
  } catch (e) {
    if (e instanceof FloStaleError) {
      await db
        .from('flo_proposals')
        .update({ status: 'expired', dismissed_reason: 'stale' })
        .eq('id', proposalId);
      return { ok: false, reason: 'stale', message: e.changes };
    }
    throw e;
  }

  // ── 2. Atomowe przejęcie ────────────────────────────────────
  //
  // Klucz idempotencji to samo przejście statusu. Pięćdziesiąt równoległych
  // kliknięć wykona ten UPDATE, ale warunek `status IN ('open','approved')`
  // spełni dokładnie jedno — reszta dostanie pustą odpowiedź i odpadnie.
  // Nie potrzeba osobnej tabeli blokad ani zewnętrznego zamka.
  const claimed = await db
    .from('flo_proposals')
    .update({ status: 'executing', approved_at: now.toISOString(), approved_by: userId })
    .eq('id', proposalId)
    .in('status', [...CLAIMABLE])
    .select('*');

  if (claimed.error) throw new Error(claimed.error.message);
  const claimedRow = (claimed.data ?? [])[0];
  if (!claimedRow) return { ok: true }; // przegraliśmy wyścig — ktoś już wykonuje

  const previousStatus = proposal.status;

  // ── 3. Zużycie żetonu zgody ─────────────────────────────────
  let snapshot: Record<string, unknown>;
  try {
    snapshot = await consumeApproval(approvalId, proposalId, now, db);
  } catch (e) {
    await release(db, proposalId, previousStatus);
    if (e instanceof FloApprovalError) {
      return { ok: false, reason: 'blocked', message: e.message };
    }
    throw e;
  }

  // ── 4. Wykonawca ────────────────────────────────────────────
  const handler = getFloHandler(proposal.kind);
  if (!handler) {
    await release(db, proposalId, previousStatus);
    return {
      ok: false,
      reason: 'blocked',
      message: 'Tego jeszcze nie umiem wykonać — dam znać, gdy będę umiał.',
    };
  }

  try {
    const result = await handler({
      proposal: claimedRow,
      userId,
      approvalId,
      snapshot,
      input: args.input,
    });

    await db
      .from('flo_proposals')
      .update({ status: 'done', executed_at: now.toISOString() })
      .eq('id', proposalId);

    await audit(claimedRow, userId, approvalId, 'flo.proposal.executed', {
      summary: result.summary,
      ...result.details,
    });

    await recordDecision(proposal.tenant_id, proposal.kind, 'accepted', now, db);

    return { ok: true };
  } catch (e) {
    // Wykonanie padło PO zużyciu żetonu. Świadomie nie odtwarzamy żetonu:
    // jeśli funkcja wychodząca zdążyła zadziałać, drugie podejście wysłałoby
    // to samo dwa razy. Człowiek dostaje propozycję do ponownego
    // zatwierdzenia, czyli świadomą decyzję zamiast cichego powtórzenia.
    await release(db, proposalId, 'approved');

    const message = e instanceof Error ? e.message : 'nieznany błąd';
    await audit(claimedRow, userId, approvalId, 'flo.proposal.failed', {
      error: message.slice(0, 500),
    });

    return {
      ok: false,
      reason: 'blocked',
      message: 'Nie udało mi się tego dokończyć. Zajmujemy się tym.',
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Pomocnicze
// ═══════════════════════════════════════════════════════════════

async function release(
  db: FloDbClient,
  proposalId: string,
  status: string,
): Promise<void> {
  const { error } = await db
    .from('flo_proposals')
    .update({ status: status as FloProposalRow['status'] })
    .eq('id', proposalId);
  if (error) {
    // Propozycja utknie w stanie „executing” i zostanie podniesiona przez
    // strażnika zadań. Lepsze to niż przykrycie pierwotnego błędu drugim.
    console.error('[flo/execute] nie udało się zwolnić propozycji:', error.message);
  }
}

async function audit(
  proposal: FloProposalRow,
  userId: string,
  approvalId: string,
  action: AuditAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  await logAuditSystem({
    tenantId: proposal.tenant_id,
    userId,
    action,
    entityType: 'flo_proposal',
    entityId: proposal.id,
    metadata: {
      ...metadata,
      kind: proposal.kind,
      topicKey: proposal.topic_key,
      approvalId,
      // Tytuł zapisujemy dosłownie: przy reklamacji „ja tego nie klikałem”
      // dziennik ma pokazywać to, co człowiek widział na karcie.
      titleShown: proposal.title,
      actor: 'flo',
    },
  });
}
