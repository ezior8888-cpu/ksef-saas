/**
 * X-05 — audyt porządku w dokumentach (krok 30 planu).
 *
 * Raz w miesiącu i po imporcie historii agent przegląda papiery: faktury bez
 * poświadczenia, luki w numeracji, kontrahenci bez NIP, koszty bez dokumentu.
 *
 * DWIE RZECZY, KTÓRE ROBIĄ RÓŻNICĘ MIĘDZY POMOCĄ A LISTĄ ZARZUTÓW:
 *
 * 1. MAKSYMALNIE PIĘĆ POZYCJI. Lista czterdziestu siedmiu problemów po
 *    imporcie historii to nie audyt, tylko paraliż — klient zamyka kartę
 *    i nie wraca. Reszta jest zwinięta i czeka.
 *
 * 2. SPRAWY ZASTANE OZNACZONE OSOBNO. Dokumenty sprzed rejestracji
 *    w FaktFlow to nie są zaniedbania klienta wobec nas — to jego historia,
 *    którą nam przyniósł. Mieszanie ich z bieżącymi sprawami brzmi jak
 *    zarzut wobec kogoś, kto właśnie zaufał nowemu narzędziu.
 *
 * A także: kontrola ciągłości numeracji obejmuje WYŁĄCZNIE numery nadane
 * przez nas. Klient, który wcześniej fakturował w innym programie, ma tam
 * własną numerację i własne anulowane dokumenty — zgłaszanie „luk" w cudzej
 * numeracji to fałszywy alarm, który każe mu tłumaczyć się z niczego.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

/** Ile pozycji pokazujemy wprost. */
export const MAX_AUDIT_ITEMS = 5;

export type AuditIssueKind =
  | 'missing_upo'
  | 'numbering_gap'
  | 'contractor_without_nip'
  | 'expense_without_document';

export interface AuditIssue {
  kind: AuditIssueKind;
  /** Identyfikator dokumentu albo kontrahenta, którego dotyczy. */
  entityId: string;
  label: string;
  /** Waga sprawy: 0 = najpilniejsza. */
  severity: number;
  /** Sprawa sprzed rejestracji w FaktFlow — historia, nie zaniedbanie. */
  legacy: boolean;
  /** Czy da się to naprawić automatycznie (wyłącznie metadane). */
  repairable: boolean;
}

export interface AuditInput {
  /** Data pierwszej faktury wystawionej U NAS — granica „zastane / bieżące". */
  firstOwnInvoiceDate: string | null;
  invoices: Array<{
    id: string;
    number: string | null;
    /** Numer nadany przez nas czy przyniesiony z importu. */
    ownNumbering: boolean;
    issueDate: string;
    status: string;
    hasUpo: boolean;
  }>;
  contractors: Array<{ id: string; name: string; nip: string | null }>;
  expenses: Array<{ id: string; label: string; hasDocument: boolean; issueDate: string }>;
}

const SEVERITY: Record<AuditIssueKind, number> = {
  // Brak poświadczenia to brak dowodu przyjęcia faktury — najgorsza rzecz
  // z tej listy przy kontroli.
  missing_upo: 0,
  expense_without_document: 1,
  numbering_gap: 2,
  contractor_without_nip: 3,
};

function isLegacy(date: string, firstOwn: string | null): boolean {
  if (!firstOwn) return false;
  return Date.parse(date) < Date.parse(firstOwn);
}

/**
 * Znajduje sprawy do posprzątania — funkcja czysta.
 *
 * Kolejność wyniku: najpierw waga sprawy, potem bieżące przed zastanymi.
 * Klient ma najpierw zobaczyć to, co dotyczy jego dzisiejszej pracy.
 */
export function findAuditIssues(input: AuditInput): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (const invoice of input.invoices) {
    if (invoice.status === 'accepted' && !invoice.hasUpo) {
      issues.push({
        kind: 'missing_upo',
        entityId: invoice.id,
        label: `Faktura ${invoice.number ?? 'bez numeru'} bez poświadczenia odbioru`,
        severity: SEVERITY.missing_upo,
        legacy: isLegacy(invoice.issueDate, input.firstOwnInvoiceDate),
        repairable: true,
      });
    }
  }

  for (const gap of findNumberingGaps(input)) {
    issues.push(gap);
  }

  for (const contractor of input.contractors) {
    if (!contractor.nip) {
      issues.push({
        kind: 'contractor_without_nip',
        entityId: contractor.id,
        label: `${contractor.name} — brak NIP-u`,
        severity: SEVERITY.contractor_without_nip,
        legacy: false,
        repairable: true,
      });
    }
  }

  for (const expense of input.expenses) {
    if (!expense.hasDocument) {
      issues.push({
        kind: 'expense_without_document',
        entityId: expense.id,
        label: `${expense.label} — koszt bez dokumentu`,
        severity: SEVERITY.expense_without_document,
        legacy: isLegacy(expense.issueDate, input.firstOwnInvoiceDate),
        repairable: false,
      });
    }
  }

  return issues.sort(
    (a, b) => a.severity - b.severity || Number(a.legacy) - Number(b.legacy),
  );
}

/**
 * Luki w numeracji — WYŁĄCZNIE w numerach nadanych przez nas.
 *
 * Dokumenty z importu mają cudzą numerację i cudze anulowania. Zgłaszanie
 * w nich „luk" to fałszywy alarm, po którym klient przestaje czytać cokolwiek
 * od agenta — i słusznie, bo kazaliśmy mu tłumaczyć się z niczego.
 */
function findNumberingGaps(input: AuditInput): AuditIssue[] {
  const ours = input.invoices
    .filter((inv) => inv.ownNumbering && inv.number)
    .map((inv) => ({ invoice: inv, seq: sequenceOf(inv.number!) }))
    .filter((entry) => entry.seq !== null)
    .sort((a, b) => a.seq! - b.seq!);

  const gaps: AuditIssue[] = [];

  for (let i = 1; i < ours.length; i++) {
    const previous = ours[i - 1]!;
    const current = ours[i]!;
    if (current.seq! - previous.seq! > 1) {
      gaps.push({
        kind: 'numbering_gap',
        entityId: current.invoice.id,
        label: `Brakuje numerów między ${previous.invoice.number} a ${current.invoice.number}`,
        severity: SEVERITY.numbering_gap,
        legacy: false,
        repairable: false,
      });
    }
  }

  return gaps;
}

/** Numer kolejny z formatu „7/2026" albo „FV/7/2026". */
function sequenceOf(number: string): number | null {
  const parts = number.split('/');
  for (const part of parts) {
    const value = Number.parseInt(part, 10);
    if (Number.isInteger(value) && String(value) === part.trim()) return value;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

export function buildAuditProposal(input: {
  tenantId: string;
  issues: readonly AuditIssue[];
  periodKey: string;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  if (input.issues.length === 0) return null;

  const shown = input.issues.slice(0, MAX_AUDIT_ITEMS);
  const hidden = input.issues.length - shown.length;
  const legacyCount = input.issues.filter((i) => i.legacy).length;

  return {
    tenantId: input.tenantId,
    kind: 'ksef.audit',
    topicKey: `ksef.audit:${input.periodKey}`,
    title:
      input.issues.length === 1
        ? 'Jedna rzecz do posprzątania w dokumentach'
        : 'Kilka rzeczy do posprzątania w dokumentach',
    body:
      legacyCount > 0
        ? `Zebrałem, co warto uporządkować. ${legacyCount} z tych spraw pochodzi sprzed założenia konta — to Twoja historia, nie zaniedbanie.`
        : 'Zebrałem, co warto uporządkować. Nic pilnego, ale przy kontroli robi różnicę.',
    fingerprint: fingerprintOf({
      period: input.periodKey,
      count: input.issues.length,
      top: shown.map((i) => i.entityId).join('|'),
    }),
    expiresAt: new Date(now.getTime() + 60 * 86_400_000),
    priority: 85,
    // Wariant listy: klient zaznacza, co chce naprawić. Nie ma przycisku
    // „napraw wszystko" bez pokazania listy — hurtowa naprawa dokumentów
    // o wartości dowodowej to nie jest rzecz do zrobienia w ciemno.
    payload: {
      periodKey: input.periodKey,
      hiddenCount: hidden,
      legacyCount,
      items: shown.map((issue) => ({
        id: issue.entityId,
        label: issue.label,
        sublabel: issue.legacy ? 'sprzed założenia konta' : rodzaj(issue.kind),
        amount: '—',
        // Nic nie jest zaznaczone z góry: każda naprawa to osobna decyzja.
        preselected: false,
        needsPreview: !issue.repairable,
      })),
    },
    evidence: [
      { label: 'Faktury', href: '/invoices' },
      { label: 'Kontrahenci', href: '/contractors' },
    ],
  };
}

function rodzaj(kind: AuditIssueKind): string {
  switch (kind) {
    case 'missing_upo':
      return 'brak poświadczenia';
    case 'numbering_gap':
      return 'luka w numeracji';
    case 'contractor_without_nip':
      return 'brak NIP-u';
    case 'expense_without_document':
      return 'koszt bez dokumentu';
  }
}

/**
 * Czy tę sprawę wolno naprawić automatycznie.
 *
 * Naprawy dotyczą WYŁĄCZNIE metadanych: pobrania brakującego poświadczenia,
 * uzupełnienia NIP-u z rejestru. Nigdy treści faktury, kwot ani stron
 * transakcji — tam każda zmiana jest zmianą dokumentu o wartości dowodowej.
 */
export function isAutoRepairable(issue: AuditIssue): boolean {
  return (
    issue.repairable &&
    (issue.kind === 'missing_upo' || issue.kind === 'contractor_without_nip')
  );
}
