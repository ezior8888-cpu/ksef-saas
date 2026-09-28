import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateXML } from 'xmllint-wasm';

/**
 * Walidacja JPK_V7M względem oficjalnego XSD MF — wzór CRWDE 2025/12/19/14090
 * (JPK_V7M(3), obowiązuje od rozliczenia za luty 2026). Pliki w
 * `lib/exports/schemas/jpk-v7m3/`, pobrane 27.09.2026 z crd.gov.pl.
 *
 *   schemat-local.xsd
 *     ├── StrukturyDanych_v12-0E.xsd
 *     ├── KodyKrajow_v13-0E.xsd
 *     └── KodyUrzedowSkarbowych_v8-0E.xsd
 *
 * xmllint-wasm wymaga pełnego preload (żadnych requestów sieciowych).
 */
const SCHEMA_DIR = resolve(process.cwd(), 'lib/exports/schemas/jpk-v7m3');
const MAIN = 'schemat-local.xsd';
const PRELOAD = ['StrukturyDanych_v12-0E.xsd', 'KodyKrajow_v13-0E.xsd', 'KodyUrzedowSkarbowych_v8-0E.xsd'];

export interface JpkValidationResult {
  valid: boolean;
  /** Komunikaty xmllint — do pokazania człowiekowi przy odrzuceniu pliku. */
  errors: string[];
}

let cached: { main: string; preload: { fileName: string; contents: string }[] } | null = null;

function schema() {
  if (cached) return cached;
  cached = {
    main: readFileSync(resolve(SCHEMA_DIR, MAIN), 'utf8'),
    preload: PRELOAD.map((fileName) => ({ fileName, contents: readFileSync(resolve(SCHEMA_DIR, fileName), 'utf8') })),
  };
  return cached;
}

export async function validateJpkV7m(xml: string): Promise<JpkValidationResult> {
  const { main, preload } = schema();
  const result = await validateXML({
    xml: [{ fileName: 'jpk_v7m.xml', contents: xml }],
    schema: [{ fileName: MAIN, contents: main }],
    preload,
  });
  return {
    valid: result.valid,
    errors: result.errors.map((e) => e.rawMessage ?? e.message),
  };
}
