import type { CsvDetectedFormat, CsvParseResult } from './types';
import { parseFakturowniaCsv } from './fakturownia';
import { parseIfirmaCsv } from './ifirma';
import { parseInfaktCsv } from './infakt';
import { parseWfirmaCsv } from './wfirma';

export type { CsvDetectedFormat, CsvParseResult } from './types';

export { parseFakturowniaCsv } from './fakturownia';
export { parseInfaktCsv } from './infakt';
export { parseWfirmaCsv } from './wfirma';
export { parseIfirmaCsv } from './ifirma';
export { parseAmount, parseDate, cleanNip } from './csv-helpers';

/** Źródło CSV (bez sufiksu `_csv` w evencie importu). */
export type CsvSource = CsvDetectedFormat;

export function parseCsv(content: string, source: CsvSource): CsvParseResult {
  switch (source) {
    case 'fakturownia':
      return parseFakturowniaCsv(content);
    case 'infakt':
      return parseInfaktCsv(content);
    case 'wfirma':
      return parseWfirmaCsv(content);
    case 'ifirma':
      return parseIfirmaCsv(content);
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}
