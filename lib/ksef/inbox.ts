import { ksefFetch } from './client';
import { ksefSessionCache } from './session-cache';
import { ksefRateLimiter } from './rate-limiter';
import type { KsefCredentials } from './auth';
import type {
  QueryInvoicesRequest,
  QueryInvoicesResponse,
  InvoiceMetadata,
  KsefEnvironment,
} from '@/types/ksef';

/**
 * Pobiera metadane faktur otrzymanych (subject2 = nabywca) z danego zakresu dat.
 * Obsługuje paginację automatycznie.
 */
export async function queryReceivedInvoices(
  credentials: KsefCredentials,
  dateFrom: Date,
  dateTo: Date,
  env?: KsefEnvironment
): Promise<InvoiceMetadata[]> {
  return ksefRateLimiter.enqueue(credentials.nip, async () => {
    const authSession = await ksefSessionCache.getSession(credentials, env);
    const accessToken = authSession.accessToken;

    const allInvoices: InvoiceMetadata[] = [];
    let continuationToken: string | undefined = undefined;

    do {
      const req: QueryInvoicesRequest = {
        subjectType: 'subject2',
        dateRange: {
          dateType: 'Acquisition',
          from: dateFrom.toISOString(),
          to: dateTo.toISOString(),
        },
      };

      const headers: Record<string, string> = {};
      if (continuationToken) {
        headers['x-continuation-token'] = continuationToken;
      }

      const response: QueryInvoicesResponse = await ksefFetch<QueryInvoicesResponse>(
        '/invoices/query/metadata',
        {
          method: 'POST',
          accessToken,
          body: req,
          headers,
          env,
        }
      );

      allInvoices.push(...response.invoices);
      continuationToken = response.continuationToken;
    } while (continuationToken);

    return allInvoices;
  });
}

/**
 * Pobiera pojedynczą fakturę po numerze KSeF (jako XML).
 */
export async function downloadInvoiceXml(
  ksefNumber: string,
  credentials: KsefCredentials,
  env?: KsefEnvironment
): Promise<string> {
  return ksefRateLimiter.enqueue(credentials.nip, async () => {
    const authSession = await ksefSessionCache.getSession(credentials, env);
    const accessToken = authSession.accessToken;

    // Endpoint zwraca XML bezpośrednio, nie JSON
    const xml = await ksefFetch<string>(`/invoices/ksef/${ksefNumber}`, {
      accessToken,
      headers: { Accept: 'application/xml' },
      env,
    });

    return xml;
  });
}
