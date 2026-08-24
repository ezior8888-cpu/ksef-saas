import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FLO_FIXTURES, FLO_SCHEDULED_FIXTURES } from '@/lib/flo/fixtures';
import { FLO_KIND_VARIANT } from '@/lib/flo/kind-variant';
import {
  FLO_CARD_VARIANTS,
  FLO_PROPOSAL_KINDS,
  isFloProposalKind,
} from '@/types/flo';

/**
 * Test kontraktowy agenta FLO (krok 5 planu).
 *
 * PO CO: dwie osoby budują agenta równolegle z dwóch domów, bez ustaleń.
 * Kontrakt danych (`types/flo.ts` + atrapy) jest jedynym uzgodnieniem między
 * torem silnika a torem interfejsu. Ten test zamienia zmianę kontraktu
 * w czerwony wynik w CI — czyli w komunikat, który dociera do drugiej osoby
 * szybciej i pewniej niż wiadomość.
 *
 * Sprawdzamy cztery rzeczy:
 *   1. każda atrapa zgadza się ze schematem `FloProposalView`,
 *   2. wszystkie sześć wariantów karty ma reprezentanta (interfejs ma na
 *      czym pracować),
 *   3. każdy z rodzajów propozycji ma przypisany wariant (nowa funkcja nie
 *      zostawi interfejsu bez instrukcji, jak ją narysować),
 *   4. atrapy zawierają przypadki brzegowe, na których interfejs się wykłada.
 */

// ═══════════════════════════════════════════════════════════════
// Schemat — odpowiednik FloProposalView w czasie wykonania
// ═══════════════════════════════════════════════════════════════

const isoString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'oczekiwano daty ISO 8601',
});

const actionSchema = z.object({
  label: z.string().min(1),
  intent: z.enum(['approve', 'dismiss', 'snooze', 'mute', 'input', 'open']),
  requiresPreview: z.boolean().optional(),
  inputLabel: z.string().optional(),
  inputKind: z.enum(['email', 'text', 'amount']).optional(),
});

const previewSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('invoice'),
    invoiceId: z.string().min(1),
    lines: z
      .array(
        z.object({
          name: z.string().min(1),
          qty: z.string().min(1),
          net: z.string().min(1),
          vat: z.string().min(1),
          gross: z.string().min(1),
        }),
      )
      .min(1),
    total: z.string().min(1),
    due: z.string().min(1),
  }),
  z.object({
    type: z.literal('message'),
    to: z.string().min(1),
    subject: z.string().min(1),
    bodyText: z.string().min(1),
    editable: z.literal(true),
  }),
  z.object({
    type: z.literal('diff'),
    rows: z
      .array(
        z.object({
          field: z.string().min(1),
          before: z.string(),
          after: z.string(),
        }),
      )
      .min(1),
  }),
  z.object({
    type: z.literal('file'),
    label: z.string().min(1),
    href: z.string().min(1),
    sizeLabel: z.string().min(1),
  }),
]);

const proposalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(FLO_PROPOSAL_KINDS),
  variant: z.enum(FLO_CARD_VARIANTS),
  title: z.string().min(1),
  body: z.string().min(1),
  evidence: z.array(
    z.object({ label: z.string().min(1), href: z.string().min(1) }),
  ),
  primary: actionSchema,
  secondary: z.array(actionSchema),
  preview: previewSchema.optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        sublabel: z.string(),
        amount: z.string().min(1),
        preselected: z.boolean(),
        needsPreview: z.boolean(),
      }),
    )
    .optional(),
  expiresAt: isoString,
  priority: z.number().int().min(0),
  createdAt: isoString,
  undoableUntil: isoString.optional(),
});

const scheduledSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  whenLabel: z.string().min(1),
  approvedAtLabel: z.string().min(1),
  cancelLabel: z.string().min(1),
});

// ═══════════════════════════════════════════════════════════════
// Testy
// ═══════════════════════════════════════════════════════════════

describe('kontrakt FLO — atrapy', () => {
  it('każda atrapa zgadza się ze schematem FloProposalView', () => {
    for (const fixture of FLO_FIXTURES) {
      const result = proposalSchema.safeParse(fixture);
      expect(
        result.success,
        `atrapa ${fixture.id}: ${result.success ? '' : JSON.stringify(result.error.issues)}`,
      ).toBe(true);
    }
  });

  it('identyfikatory atrap są unikalne', () => {
    const ids = FLO_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('każdy wpis panelu zatwierdzonych ma ślad zgody', () => {
    // INWARIANT: do panelu „Zatwierdzone — czeka na wykonanie" nie trafia nic,
    // czego człowiek wcześniej nie kliknął. Brak `approvedAtLabel` oznaczałby
    // zgodę przez milczenie — dokładnie ten model, który został odrzucony.
    for (const item of FLO_SCHEDULED_FIXTURES) {
      const result = scheduledSchema.safeParse(item);
      expect(result.success, `wpis ${item.id}`).toBe(true);
      expect(item.approvedAtLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('kontrakt FLO — warianty kart', () => {
  it('wszystkie sześć wariantów ma reprezentanta w atrapach', () => {
    const used = new Set(FLO_FIXTURES.map((f) => f.variant));
    for (const variant of FLO_CARD_VARIANTS) {
      expect(used.has(variant), `brak atrapy dla wariantu ${variant}`).toBe(
        true,
      );
    }
  });

  it('wszystkie cztery rodzaje podglądu mają reprezentanta', () => {
    const used = new Set(
      FLO_FIXTURES.filter((f) => f.preview).map((f) => f.preview!.type),
    );
    for (const type of ['invoice', 'message', 'diff', 'file'] as const) {
      expect(used.has(type), `brak atrapy z podglądem ${type}`).toBe(true);
    }
  });

  it('każdy rodzaj propozycji ma przypisany wariant karty', () => {
    for (const kind of FLO_PROPOSAL_KINDS) {
      expect(
        FLO_KIND_VARIANT[kind],
        `rodzaj ${kind} nie ma wariantu — interfejs nie wie, czym go narysować`,
      ).toBeTruthy();
      expect(FLO_CARD_VARIANTS).toContain(FLO_KIND_VARIANT[kind]);
    }
  });

  it('mapa wariantów nie zawiera rodzajów spoza listy', () => {
    for (const kind of Object.keys(FLO_KIND_VARIANT)) {
      expect(isFloProposalKind(kind), `nieznany rodzaj w mapie: ${kind}`).toBe(
        true,
      );
    }
  });

  it('wariant preview zawsze ma podgląd i wymaga jego otwarcia', () => {
    // Promień rażenia 4: dokument w rejestrze państwowym albo wiadomość
    // u obcej osoby. Karta bez podglądu pozwoliłaby kliknąć w ciemno.
    for (const fixture of FLO_FIXTURES.filter((f) => f.variant === 'preview')) {
      expect(fixture.preview, `atrapa ${fixture.id} bez podglądu`).toBeTruthy();
      expect(
        fixture.primary.requiresPreview,
        `atrapa ${fixture.id} nie wymusza podglądu`,
      ).toBe(true);
    }
  });

  it('pozycje listy wymagające podglądu są domyślnie odznaczone', () => {
    // Odwrotność też musi być prawdziwa: pozycja odznaczona bez wymogu
    // podglądu byłaby dla klienta niezrozumiała.
    for (const fixture of FLO_FIXTURES.filter((f) => f.items)) {
      for (const item of fixture.items!) {
        if (item.needsPreview) {
          expect(
            item.preselected,
            `pozycja ${item.id} wymaga podglądu, a jest zaznaczona`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('kontrakt FLO — przypadki brzegowe w atrapach', () => {
  it('jest atrapa z bardzo długim tytułem i treścią', () => {
    expect(FLO_FIXTURES.some((f) => f.title.length >= 110)).toBe(true);
    expect(FLO_FIXTURES.some((f) => f.body.length >= 380)).toBe(true);
  });

  it('jest atrapa bez dowodów', () => {
    expect(FLO_FIXTURES.some((f) => f.evidence.length === 0)).toBe(true);
  });

  it('jest atrapa wygasająca w ciągu kilku minut', () => {
    const soon = FLO_FIXTURES.filter(
      (f) => Date.parse(f.expiresAt) - Date.now() < 10 * 60_000,
    );
    expect(soon.length).toBeGreaterThan(0);
  });

  it('jest paczka z co najmniej dziesięcioma pozycjami i trzema odstającymi', () => {
    const batch = FLO_FIXTURES.find((f) => f.kind === 'invoice.batch');
    expect(batch?.items?.length ?? 0).toBeGreaterThanOrEqual(10);
    const odd = batch?.items?.filter((i) => !i.preselected) ?? [];
    expect(odd.length).toBeGreaterThanOrEqual(3);
  });

  it('jest atrapa z długą nazwą kontrahenta bez spacji', () => {
    const labels = FLO_FIXTURES.flatMap((f) => f.items?.map((i) => i.label) ?? []);
    expect(labels.some((l) => l.length >= 50 && !/\s/.test(l))).toBe(true);
  });

  it('jest atrapa z paskiem cofnięcia', () => {
    // Czynność, którą FLO zrobił sam: odwracalna, wewnątrz konta, z oknem
    // dziesięciu minut na cofnięcie jednym kliknięciem.
    expect(FLO_FIXTURES.some((f) => f.undoableUntil)).toBe(true);
  });
});

describe('kontrakt FLO — zasada zgody', () => {
  it('żadna atrapa nie deklaruje poziomu ani trybu autonomii', () => {
    // Zachowanie agenta jest identyczne u każdego klienta. Gdyby ktoś kiedyś
    // przemycił z powrotem „TRYB 3", ten test to złapie.
    const serialized = JSON.stringify(FLO_FIXTURES).toLowerCase();
    for (const forbidden of ['autonomy', 'autonomia', 'tryb 3', 'poziom 3']) {
      expect(serialized.includes(forbidden), `znaleziono „${forbidden}"`).toBe(
        false,
      );
    }
  });
});
