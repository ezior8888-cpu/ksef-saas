/**
 * O-01 — producent w pulsie: pierwsze kroki na nowym koncie (plan FLO 2, K1.11).
 *
 * Funkcje czyste (`nextOnboardingStep`, `buildOnboardingProposal`) istniały
 * od kroku 49 i nie miały wywołania. Ten plik je spina.
 *
 * ZASADA Z TAMTEGO PLIKU OBOWIĄZUJE TU TAK SAMO: sukces onboardingu NIE MOŻE
 * ZALEŻEĆ OD CERTYFIKATU KSeF. Dlatego producent nie sprawdza certyfikatu
 * przy wyborze kroku — bierze go tylko po to, żeby opisać stan konta.
 *
 * TRZY ZASADY:
 *
 * 1. TYLKO MŁODE KONTA. Po trzydziestu dniach klient wie, gdzie co jest.
 *    Kreator przypominający się w trzecim miesiącu to już wyrzut sumienia,
 *    a nie pomoc.
 * 2. JEDNA KARTA, PODMIENIANA. Klucz tematu jest stały (`onboarding.step`),
 *    więc kolejny krok zastępuje poprzedni zamiast dokładać się do wątku.
 * 3. KONIEC ŚCIEŻKI ZAMYKA KARTĘ. Gdy pierwsza faktura jest doręczona,
 *    otwarty kreator znika — wisząca instrukcja przy zrobionej robocie
 *    wygląda, jakby agent nie zauważył sukcesu.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { unlimitedCap, type DailyCap } from '@/lib/flo/daily-cap';
import { floDb, type FloDbClient, type FloProposalRow } from '@/lib/flo/db-types';
import { isMuted } from '@/lib/flo/decisions';
import {
  buildOnboardingProposal,
  nextOnboardingStep,
  type AccountState,
} from '@/lib/flo/functions/onboarding';
import { isKindEnabledForTenant, shouldCompute } from '@/lib/flo/kind-switch';
import { createProposal } from '@/lib/flo/proposals';
import { runSweep, type FloSweepResult } from '@/lib/flo/sweep';
import type { JobLogger } from '@/lib/jobs/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

const KIND = 'onboarding.step' as const;
const TOPIC = KIND;

/** Do ilu dni od założenia konta agent prowadzi za rękę. */
export const GUIDE_FOR_DAYS = 30;

export interface OnboardingAccount extends AccountState {
  /** Kiedy powstało konto (ISO). */
  createdAt: string;
}

export interface OnboardingSources {
  readAccount: (tenantId: string) => Promise<OnboardingAccount | null>;
  /** Globalny wyłącznik — wstrzykiwany tylko w testach. */
  readGlobalKill?: () => Promise<boolean>;
}

export function productionOnboardingSources(): OnboardingSources {
  return { readAccount };
}

/** Wiek konta w dniach — funkcja czysta. */
export function accountAgeDays(createdAt: string, now: Date): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - created) / 86_400_000);
}

async function readAccount(tenantId: string): Promise<OnboardingAccount | null> {
  const client: SupabaseClient<Database> = createAdminClient();

  const [tenant, prefs, contractor, invoice] = await Promise.all([
    client
      .from('tenants')
      .select('created_at, nip, ksef_credentials_encrypted')
      .eq('id', tenantId)
      .maybeSingle(),
    // Tabele agenta idą przez `floDb()`: `types/database.ts` jest sprzed
    // migracji 00061 i o `flo_prefs` nie wie, więc typowany klient odrzuciłby
    // to zapytanie. Ręczne typy z `db-types.ts` są tu jedyną prawdą.
    floDb().from('flo_prefs').select('tax_profile').eq('tenant_id', tenantId).maybeSingle(),
    client.from('contractors').select('id').eq('tenant_id', tenantId).limit(1),
    client
      .from('invoices')
      .select('id, pdf_generated_at, ksef_accepted_at')
      .eq('tenant_id', tenantId)
      .eq('direction', 'issued')
      .limit(50),
  ]);

  if (tenant.error) throw new Error(`konto: ${tenant.error.message}`);
  if (prefs.error) throw new Error(`ustawienia: ${prefs.error.message}`);
  if (contractor.error) throw new Error(`kontrahenci: ${contractor.error.message}`);
  if (invoice.error) throw new Error(`faktury: ${invoice.error.message}`);
  if (!tenant.data) return null;

  const invoices = invoice.data;

  return {
    // Konto bez daty założenia traktujemy jak stare: lepiej nie prowadzić za
    // rękę kogoś, kto jest z nami od roku, niż prowadzić na ślepo.
    createdAt: tenant.data.created_at ?? '',
    hasNip: Boolean(tenant.data.nip?.trim()),
    hasKsefCertificate: tenant.data.ksef_credentials_encrypted !== null,
    hasTaxProfile: prefs.data?.tax_profile != null,
    hasContractor: contractor.data.length > 0,
    hasFirstInvoice: invoices.length > 0,
    // PRZYBLIŻENIE, ŚWIADOME: wysyłka PDF-a mailem nie zostawia dziś śladu
    // w bazie (nie ma tabeli wysyłek). Bierzemy najbliższe dostępne sygnały:
    // poświadczenie z KSeF albo wygenerowany PDF. Fałszywe „doręczona" kosztuje
    // zniknięcie ostatniej karty kreatora; fałszywe „nie doręczona" kazałoby
    // agentowi powtarzać instrukcję przy zrobionej robocie.
    firstInvoiceDelivered: invoices.some(
      (row) => row.ksef_accepted_at !== null || row.pdf_generated_at !== null,
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
// Jedno konto
// ═══════════════════════════════════════════════════════════════

export type OnboardingOutcome =
  /** Wyłącznik, blokada, kanarek albo wyciszenie. */
  | 'disabled'
  /** Konto starsze niż `GUIDE_FOR_DAYS` — kreator milczy. */
  | 'too_old'
  /** Konta nie ma (skasowane w międzyczasie). */
  | 'missing'
  | 'created'
  /** Karta kreatora zaktualizowana w miejscu (kolejny krok). */
  | 'refreshed'
  /** Ścieżka skończona — otwarty kreator zamknięty. */
  | 'finished'
  | 'nothing';

export async function produceOnboardingStep(
  tenantId: string,
  now: Date,
  db: FloDbClient,
  sources: OnboardingSources,
  /** Dzienny limit nowych kart na konto — patrz `daily-cap.ts`. */
  cap: DailyCap = unlimitedCap(),
): Promise<OnboardingOutcome> {
  const verdict = await isKindEnabledForTenant(
    KIND,
    tenantId,
    db,
    sources.readGlobalKill,
  );
  if (!shouldCompute(verdict)) return 'disabled';
  if (await isMuted(tenantId, KIND, now, db)) return 'disabled';

  const account = await sources.readAccount(tenantId);
  if (!account) return 'missing';
  if (accountAgeDays(account.createdAt, now) > GUIDE_FOR_DAYS) return 'too_old';

  const live = await readLiveCard(tenantId, db);

  if (nextOnboardingStep(account) === 'done') {
    // Pierwsza faktura doręczona. Instrukcja wisząca przy zrobionej robocie
    // wygląda, jakby agent nie zauważył sukcesu.
    if (live?.status === 'open' && (await closeFinished(live.id, db))) {
      return 'finished';
    }
    return 'nothing';
  }

  const proposal = buildOnboardingProposal({ tenantId, state: account, now });
  if (!proposal) return 'nothing';

  // Limit obejmuje NOWĄ kartę; odświeżenie istniejącej już nie — to ta sama
  // sprawa, o którą raz już zapytaliśmy, a cisza w połowie rozmowy byłaby
  // gorsza niż jedna karta ponad limit.
  if (!live && !cap.canAsk(tenantId)) return 'nothing';

  const result = await createProposal(
    // Termin ważności ustala pierwsza karta. Odświeżanie go przy każdym
    // kroku sprawiłoby, że kreator na porzuconym koncie nie wygaśnie nigdy.
    live ? { ...proposal, expiresAt: new Date(live.expires_at) } : proposal,
    db,
    sources.readGlobalKill,
  );

  switch (result.status) {
    case 'created':
      cap.spend(tenantId);
      return 'created';
    case 'updated':
      return 'refreshed';
    default:
      return 'disabled';
  }
}

type LiveCard = Pick<FloProposalRow, 'id' | 'status' | 'expires_at'>;

async function readLiveCard(
  tenantId: string,
  db: FloDbClient,
): Promise<LiveCard | null> {
  const { data, error } = await db
    .from('flo_proposals')
    .select('id, status, expires_at')
    .eq('tenant_id', tenantId)
    .eq('topic_key', TOPIC)
    .in('status', ['open', 'approved'])
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as LiveCard | null) ?? null;
}

/**
 * Zamyka kreatora po dojściu do końca ścieżki.
 *
 * Powód `stale`: dane zmieniły się po pokazaniu karty. Warunek
 * `status = 'open'` chroni przed wyścigiem z klientem, który właśnie klika.
 */
async function closeFinished(id: string, db: FloDbClient): Promise<boolean> {
  const { data, error } = await db
    .from('flo_proposals')
    .update({ status: 'expired', dismissed_reason: 'stale' })
    .eq('id', id)
    .eq('status', 'open')
    .select('id');

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// ═══════════════════════════════════════════════════════════════
// Wszystkie konta
// ═══════════════════════════════════════════════════════════════


export async function runOnboardingSweep(
  tenantIds: readonly string[],
  now: Date = new Date(),
  db: FloDbClient = floDb(),
  sources: OnboardingSources = productionOnboardingSources(),
  logger?: Pick<JobLogger, 'error'>,
  cap: DailyCap = unlimitedCap(),
): Promise<FloSweepResult> {
  return runSweep(
    KIND,
    tenantIds,
    async (tenantId) => {
      const outcome = await produceOnboardingStep(tenantId, now, db, sources, cap);
      // „Skończony kreator" to karta zamknięta, bo sprawa się rozwiązała —
      // to samo, co zamknięcie pytania o zapłaconą fakturę.
      return {
        asked: outcome === 'created' ? 1 : 0,
        closed: outcome === 'finished' ? 1 : 0,
      };
    },
    logger,
  );
}
