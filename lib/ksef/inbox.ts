import { ksefFetch } from './client';
import { ksefSessionCache } from './session-cache';
import { ksefRateLimiter } from './rate-limiter';
import type { KsefAuth } from './auth';
import type {
  QueryInvoicesRequest,
  QueryInvoicesResponse,
  InvoiceMetadata,
  KsefEnvironment,
} from '@/types/ksef';

/** Kontekst audytu (Faza 23 sekcja 3) — opcjonalny propagator do `ksefFetch`. */
export interface InboxAuditContext {
  tenantId: string;
}

/**
 * Pobiera metadane faktur otrzymanych (subject2 = nabywca) z danego zakresu dat.
 * Obsługuje paginację automatycznie.
 */
export async function queryReceivedInvoices(
  auth: KsefAuth,
  dateFrom: Date,
  dateTo: Date,
  env?: KsefEnvironment,
  auditContext?: InboxAuditContext,
): Promise<InvoiceMetadata[]> {
  return ksefRateLimiter.enqueue(auth.nip, async () => {
    const authSession = await ksefSessionCache.getSession(auth, env);
    const accessToken = authSession.accessToken;

    const allInvoices: InvoiceMetadata[] = [];
    let continuationToken: string | undefined = undefined;

    do {
      // UWAGA: KSeF 2.0 nie ma już filtru `Acquisition` (date-of-receipt) -
      // API `/invoices/query/metadata` akceptuje tylko `Invoicing`/`Issue`.
      // Polling pracuje z pewnym poślizgiem vs rzeczywiste nadanie w KSeF,
      // ale w praktyce invoicingDate ≈ acquisitionDate (opóźnienie sekund).
      const req: QueryInvoicesRequest = {
        subjectType: 'subject2',
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

      const response: QueryInvoicesResponse = await ksefFetch<QueryInvoicesResponse>(
        '/invoices/query/metadata',
        {
          method: 'POST',
          accessToken,
          body: req,
          headers,
          env,
          audit: auditContext
            ? {
                tenantId: auditContext.tenantId,
                action: 'inbox.poll',
                metadata: {
                  dateFrom: dateFrom.toISOString(),
                  dateTo: dateTo.toISOString(),
                  hasContinuation: Boolean(continuationToken),
                },
              }
            : undefined,
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
  auth: KsefAuth,
  env?: KsefEnvironment,
): Promise<string> {
  return ksefRateLimiter.enqueue(auth.nip, async () => {
    const authSession = await ksefSessionCache.getSession(auth, env);
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
