/**
 * Pobieranie historii metadanych faktur z KSeF 2.x API (wydane vs odebrane).
 * Endpointy jak w `inbox.ts`: POST `/invoices/query/metadata`,
 * pobranie XML: GET `/invoices/ksef/{numer}`.
 */

import type {
  InvoiceMetadata,
  KsefEnvironment,
  QueryInvoicesRequest,
  QueryInvoicesResponse,
} from '@/types/ksef';

import { ksefFetch } from './client';
import { ksefRateLimiter } from './rate-limiter';
import { getValidSession, ksefSessionCache } from './session-cache';

const MAX_IMPORT_INVOICES = 5000;

export interface FetchHistoryParams {
  tenantId: string;
  /** YYYY-MM-DD */
  dateFrom: string;
  /** YYYY-MM-DD */
  dateTo: string;
  /** `issued` = subject1 (nasze wystawione), `received` = subject2 (otrzymane). */
  direction: 'issued' | 'received';
  env?: KsefEnvironment;
}

export interface KsefInvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  acquisitionDate?: string;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  sellerNip?: string;
  buyerNip?: string;
}

export interface FetchHistoryResult {
  invoices: KsefInvoiceMetadata[];
  totalCount: number;
  /** Ucięcie po MAX_IMPORT_INVOICES lub znacznik `isTruncated` z API. */
  truncated?: boolean;
}

function resolveEnv(env?: KsefEnvironment): KsefEnvironment {
  return env ?? (process.env.KSEF_ENV as KsefEnvironment) ?? 'test';
}

function mapInvoiceMetadata(metadata: InvoiceMetadata): KsefInvoiceMetadata {
  const buyer =
    metadata.buyer.identifier.type === 'Nip'
      ? metadata.buyer.identifier.value.replace(/\D/g, '').slice(0, 10) ||
        metadata.buyer.identifier.value
      : undefined;

  return {
    ksefNumber: metadata.ksefNumber,
    invoiceNumber: metadata.invoiceNumber,
    issueDate: metadata.issueDate.slice(0, 10),
    acquisitionDate: metadata.acquisitionDate?.slice(0, 10),
    netTotal: metadata.netAmount,
    vatTotal: metadata.vatAmount,
    grossTotal: metadata.grossAmount,
    sellerNip: metadata.seller?.nip ?? undefined,
    buyerNip: buyer,
  };
}

/** Metadane faktur dla zakresu dat (paginacja `continuationToken` jak w bibliotece MF). */
export async function fetchInvoicesMetadata(
  params: FetchHistoryParams,
): Promise<FetchHistoryResult> {
  const conn = await getValidSession(params.tenantId, resolveEnv(params.env));
  if (!conn) {
    throw new Error('Brak aktywnej sesji KSeF');
  }

  const env = resolveEnv(params.env);
  const dateFrom = new Date(`${params.dateFrom}T00:00:00.000Z`);
  const dateTo = new Date(`${params.dateTo}T23:59:59.999Z`);

  const subjectType =
    params.direction === 'issued' ? ('subject1' as const) : ('subject2' as const);

  return ksefRateLimiter.enqueue(conn.auth.nip, async () => {
    const allInvoices: KsefInvoiceMetadata[] = [];
    let truncated = false;
    let continuationToken: string | undefined;

    do {
      const req: QueryInvoicesRequest = {
        subjectType,
        dateRange: {
          dateType: 'Invoicing',
          from: dateFrom.toISOString(),
          to: dateTo.toISOString(),
        },
      };

      const headers: Record<string, string> = {};
      if (continuationToken) {
        headers['x-continuation-token'] = continuationToken;
      }

      const session = await ksefSessionCache.getSession(conn.auth, env);

      const response: QueryInvoicesResponse = await ksefFetch<QueryInvoicesResponse>(
        '/invoices/query/metadata',
        {
          method: 'POST',
          accessToken: session.accessToken,
          body: req,
          headers,
          env,
        },
      );

      if (response.isTruncated) truncated = true;

      for (const item of response.invoices) {
        allInvoices.push(mapInvoiceMetadata(item));
        if (allInvoices.length >= MAX_IMPORT_INVOICES) {
          truncated = true;
          break;
        }
      }

      continuationToken =
        allInvoices.length >= MAX_IMPORT_INVOICES ? undefined : response.continuationToken;
    } while (continuationToken);

    return {
      invoices: allInvoices,
      totalCount: allInvoices.length,
      truncated: truncated || undefined,
    };
  });
}

/** Pełny XML FA pojedynczej faktury (numer KSeF). */
export async function fetchInvoiceXml(
  tenantId: string,
  ksefNumber: string,
  env?: KsefEnvironment,
): Promise<string> {
  const conn = await getValidSession(tenantId, resolveEnv(env));
  if (!conn) {
    throw new Error('Brak aktywnej sesji KSeF');
  }

  const resolved = resolveEnv(env);

  return ksefRateLimiter.enqueue(conn.auth.nip, async () => {
    const session = await ksefSessionCache.getSession(conn.auth, resolved);

    return ksefFetch<string>(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
      accessToken: session.accessToken,
      headers: { Accept: 'application/xml' },
      env: resolved,
    });
  });
}
