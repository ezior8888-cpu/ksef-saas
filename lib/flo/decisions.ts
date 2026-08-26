/**
 * Pamięć decyzji i wyciszanie rodzajów spraw (krok 12 planu agenta FLO).
 *
 * PO CO: agent, który wraca z tym samym pytaniem po trzecim „nie”, uczy
 * ludzi ignorowania wszystkich powiadomień — także tych trafnych. Dwa
 * odrzucenia z rzędu znaczą „nie pisz mi o tym”, i tyle.
 *
 * WYCISZENIE JEST SPRAWDZANE PRZED UTWORZENIEM PROPOZYCJI, nie przy
 * wyświetlaniu. Inaczej baza puchłaby od kart, których nikt nigdy nie
 * zobaczy, a licznik trafności w trybie cichym liczyłby propozycje, które
 * i tak były niewidoczne.
 *
 * `dismissed` to licznik ODRZUCEŃ Z RZĘDU, nie suma z całego życia konta:
 * przyjęcie propozycji tego rodzaju zeruje go. Ktoś, kto raz odrzucił,
 * potem skorzystał, a po pół roku odrzucił znowu, nie zasługuje na ciszę —
 * zasługuje na nią ten, kto mówi „nie” dwa razy pod rząd.
 */

import { floDb, type FloDbClient, type FloDecisionRow } from '@/lib/flo/db-types';
import type { FloProposalKind } from '@/types/flo';

/** Po tylu odrzuceniach z rzędu agent milknie w danej sprawie. */
export const MUTE_AFTER_DISMISSALS = 2;

/** Na jak długo. Kwartał to dość, żeby sytuacja klienta zdążyła się zmienić. */
export const MUTE_DAYS = 90;

export type FloDecision = 'accepted' | 'dismissed';

export interface DecisionState {
  accepted: number;
  dismissed: number;
  mutedUntil: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Reguła (funkcja czysta — całe sedno, testowalne bez bazy)
// ═══════════════════════════════════════════════════════════════

export function nextDecisionState(
  current: DecisionState | null,
  decision: FloDecision,
  now: Date = new Date(),
): DecisionState {
  const state: DecisionState = current ?? {
    accepted: 0,
    dismissed: 0,
    mutedUntil: null,
  };

  if (decision === 'accepted') {
    return {
      accepted: state.accepted + 1,
      // Seria odrzuceń przerwana — licznik od zera.
      dismissed: 0,
      // Skoro klient właśnie z tego skorzystał, cisza traci sens.
      mutedUntil: null,
    };
  }

  const dismissed = state.dismissed + 1;
  const shouldMute = dismissed >= MUTE_AFTER_DISMISSALS;

  return {
    accepted: state.accepted,
    dismissed,
    mutedUntil: shouldMute
      ? new Date(now.getTime() + MUTE_DAYS * 86_400_000).toISOString()
      : state.mutedUntil,
  };
}

export function isMutedAt(
  state: DecisionState | null,
  now: Date = new Date(),
): boolean {
  const until = state?.mutedUntil;
  return typeof until === 'string' && Date.parse(until) > now.getTime();
}

// ═══════════════════════════════════════════════════════════════
// Zapis i odczyt
// ═══════════════════════════════════════════════════════════════

export async function recordDecision(
  tenantId: string,
  kind: string,
  decision: FloDecision,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<DecisionState> {
  const current = await readState(tenantId, kind, db);
  const next = nextDecisionState(current, decision, now);

  const { error } = await db.from('flo_decisions').upsert(
    {
      tenant_id: tenantId,
      kind,
      accepted: next.accepted,
      dismissed: next.dismissed,
      muted_until: next.mutedUntil,
      last_at: now.toISOString(),
    },
    { onConflict: 'tenant_id,kind' },
  );

  if (error) throw new Error(error.message);
  return next;
}

/**
 * Wyciszenie na życzenie — przycisk „nigdy więcej takich”.
 *
 * Osobne od `recordDecision`, bo to nie jest drugie odrzucenie z rzędu,
 * tylko jasna prośba. Czekanie z ciszą do kolejnego razu byłoby ignorowaniem
 * tego, co człowiek właśnie powiedział.
 */
export async function muteKind(
  tenantId: string,
  kind: string,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<void> {
  const current = await readState(tenantId, kind, db);
  const { error } = await db.from('flo_decisions').upsert(
    {
      tenant_id: tenantId,
      kind,
      accepted: current?.accepted ?? 0,
      dismissed: Math.max(current?.dismissed ?? 0, MUTE_AFTER_DISMISSALS),
      muted_until: new Date(
        now.getTime() + MUTE_DAYS * 86_400_000,
      ).toISOString(),
      last_at: now.toISOString(),
    },
    { onConflict: 'tenant_id,kind' },
  );
  if (error) throw new Error(error.message);
}

/** Przywrócenie z ekranu ustawień — cisza musi być odwracalna. */
export async function unmuteKind(
  tenantId: string,
  kind: string,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<void> {
  const { error } = await db
    .from('flo_decisions')
    .upsert(
      {
        tenant_id: tenantId,
        kind,
        dismissed: 0,
        muted_until: null,
        last_at: now.toISOString(),
      },
      { onConflict: 'tenant_id,kind' },
    );
  if (error) throw new Error(error.message);
}

export async function isMuted(
  tenantId: string,
  kind: FloProposalKind | string,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<boolean> {
  return isMutedAt(await readState(tenantId, kind, db), now);
}

/** Wyciszone rodzaje — do ekranu ustawień (tor interfejsu, krok 21). */
export async function listMutedKinds(
  tenantId: string,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<string[]> {
  const { data, error } = await db
    .from('flo_decisions')
    .select('kind, muted_until')
    .eq('tenant_id', tenantId)
    .gt('muted_until', now.toISOString());

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.kind);
}

async function readState(
  tenantId: string,
  kind: string,
  db: FloDbClient,
): Promise<DecisionState | null> {
  const { data, error } = await db
    .from('flo_decisions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as FloDecisionRow;
  return {
    accepted: row.accepted,
    dismissed: row.dismissed,
    mutedUntil: row.muted_until,
  };
}
