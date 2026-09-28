import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateXML } from 'xmllint-wasm';

/**
 * Walidacja JPK_FA względem oficjalnego XSD MF — JPK_FA(4), wzór
 * `http://jpk.mf.gov.pl/wzor/2022/02/17/02171/`. Pliki w
 * `lib/exports/schemas/jpk-fa4/`, pobrane 28.09.2026 (schemat z gov.pl,
 * typy wspólne z crd.gov.pl), BEZ zmian:
 *
 *   schemat.xsd
 *     └── StrukturyDanych_v5-0E.xsd
 *           └── ElementarneTypyDanych_v5-0E.xsd
 *                 ├── KodyKrajow_v5-0E.xsd
 *                 └── KodyUrzedowSkarbowych_v5-0E.xsd
 *
 * Pliki MF wskazują się nawzajem pełnymi adresami crd.gov.pl, a xmllint-wasm
 * nie chodzi do sieci — prefiks adresu zdejmujemy przy wczytaniu, żeby każdy
 * import trafiał w plik z `preload`. Treść schematów zostaje oryginalna.
 */
const SCHEMA_DIR = resolve(process.cwd(), 'lib/exports/schemas/jpk-fa4');
const MAIN = 'schemat.xsd';
const PRELOAD = [
  'StrukturyDanych_v5-0E.xsd',
  'ElementarneTypyDanych_v5-0E.xsd',
  'KodyKrajow_v5-0E.xsd',
  'KodyUrzedowSkarbowych_v5-0E.xsd',
];
const REMOTE_PREFIX = 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2018/08/24/eD/DefinicjeTypy/';

export interface JpkFaValidationResult {
  valid: boolean;
  /** Komunikaty xmllint — do pokazania człowiekowi przy odrzuceniu pliku. */
  errors: string[];
}

let cached: { main: string; preload: { fileName: string; contents: string }[] } | null = null;

function localSchema(fileName: string): string {
  // Tylko `schemaLocation` — przestrzeń nazw (`namespace=`) zostaje bez zmian.
  return readFileSync(resolve(SCHEMA_DIR, fileName), 'utf8')
    .split(`schemaLocation="${REMOTE_PREFIX}`)
    .join('schemaLocation="');
}

function schema() {
  if (cached) return cached;
  cached = {
    main: localSchema(MAIN),
    preload: PRELOAD.map((fileName) => ({ fileName, contents: localSchema(fileName) })),
  };
  return cached;
}

export async function validateJpkFa(xml: string): Promise<JpkFaValidationResult> {
  const { main, preload } = schema();
  const result = await validateXML({
    xml: [{ fileName: 'jpk_fa.xml', contents: xml }],
    schema: [{ fileName: MAIN, contents: main }],
    preload,
  });
  return {
    valid: result.valid,
    errors: result.errors.map((e) => e.rawMessage ?? e.message),
  };
}
