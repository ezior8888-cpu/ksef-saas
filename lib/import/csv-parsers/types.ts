import type { ParsedInvoice } from '../fa3-parser';

export type CsvDetectedFormat =
  | 'fakturownia'
  | 'infakt'
  | 'wfirma'
  | 'ifirma';

export interface CsvParseResult {
  invoices: ParsedInvoice[];
  warnings: string[];
  detectedFormat: CsvDetectedFormat;
}
