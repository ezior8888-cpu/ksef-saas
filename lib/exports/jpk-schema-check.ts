import { validateJpkFa } from '@/lib/exports/jpk-fa-validator';
import { validateJpkV7m } from '@/lib/exports/jpk-v7m-validator';

/**
 * Plik JPK przed wydaniem człowiekowi przechodzi oficjalny XSD MF (AUD-121).
 *
 * Do 02.10 walidatory działały tylko w testach: generator, który dla
 * nietypowych danych zbudował plik niezgodny ze schematem, oddawał go bez
 * słowa — a urząd odrzuca taki plik dopiero po wysyłce.
 */
export type JpkKind = 'JPK_V7M' | 'JPK_FA';

export class JpkSchemaError extends Error {
  constructor(
    readonly kind: JpkKind,
    /** Komunikaty xmllint — do logów, nie do interfejsu. */
    readonly details: readonly string[],
  ) {
    super(
      `Plik ${kind} nie jest zgodny ze schematem Ministerstwa Finansów, więc go nie wydajemy. Napisz do nas — sprawdzimy dane z tego okresu.`,
    );
    this.name = 'JpkSchemaError';
  }
}

/** Komunikaty z interfejsu: stałe, po jednym na rodzaj pliku. */
export const JPK_SCHEMA_ERROR_MESSAGES: readonly string[] = (['JPK_V7M', 'JPK_FA'] as const).map(
  (kind) => new JpkSchemaError(kind, []).message,
);

/**
 * Komunikat xmllint bez wartości pól: „The value '…'” niesie dane faktury
 * (nazwy, NIP-y), a do diagnozy wystarczy element i reguła.
 */
export function redactXsdMessage(message: string): string {
  return message.replace(/(value\s+)'[^']*'/gi, "$1'…'");
}

export async function assertJpkMatchesSchema(kind: JpkKind, xml: string): Promise<void> {
  const result = kind === 'JPK_V7M' ? await validateJpkV7m(xml) : await validateJpkFa(xml);
  if (!result.valid) {
    throw new JpkSchemaError(kind, result.errors.slice(0, 20).map(redactXsdMessage));
  }
}
