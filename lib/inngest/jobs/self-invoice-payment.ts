/**
 * Self-invoicing job — odpowiada na `billing/payment.succeeded` (Faza 25 Krok 4).
 *
 * Pipeline:
 *   1. Load `stripe_payments` row — jeśli `vat_invoice_id` już ustawione,
 *      skip (idempotency po retry webhook'a).
 *   2. Load subscription żeby wyciągnąć `plan` (monthly/annual) i tenantId.
 *   3. `buildSelfInvoiceDraft(...)` — Invoice obiekt z poprawnym numerowaniem.
 *   4. `insertSelfInvoice(...)` — INSERT do `invoices` + `invoice_line_items`.
 *      Idempotent przez UNIQUE `(tenant_id, internal_number)`.
 *   5. UPDATE `stripe_payments.vat_invoice_id` + `vat_invoice_submitted_at`.
 *   6. Emit `invoice/submit.requested` do istniejącego pipeline'u Fazy 23
 *      (zwykły submit z retry-policy 5×, Offline24 fallback, audit per call).
 *
 * Concurrency: 1 per `tenantId` — żeby dwa payment'y w tym samym customer'cie
 * w krótkim czasie nie wystawiły 2 faktur na ten sam stripe_invoice_id
 * (idempotency-na-defense, faktyczna jest na poziomie unique constraint).
 *
 * Konfiguracja operatora: `FAKTFLOW_OPERATOR_TENANT_ID` env var. Bez niej
 * job loguje warning i kończy bez fakturowania (Stripe receipt = fallback).
 */

import * as Sentry from '@sentry/nextjs';
import { NonRetriableError } from 'inngest';

import { logAuditSystem } from '@/lib/audit/log-system';
import {
  buildSelfInvoiceDraft,
  insertSelfInvoice,
} from '@/lib/billing/self-invoice';
import { isSelfInvoicingConfigured } from '@/lib/billing/operator-config';
import { createAdminClient } from '@/lib/supabase/admin';

import {
  billingPaymentSucceeded,
  inngest,
  invoiceSubmitRequested,
} from '../client';

export const selfInvoicePaymentJob = inngest.createFunction(
  {
    id: 'billing-self-invoice-payment',
    name: 'Billing: wystaw fakturę VAT przez KSeF za zapłaconą subskrypcję',
    retries: 3,
    // Concurrency per-tenant — chronimy przed duplikacją gdy webhook retry
    // dostarczy `payment.succeeded` 2× nim pierwsza iteracja zaktualizuje
    // `vat_invoice_id`.
    concurrency: { key: 'event.data.tenantId', limit: 1 },
    triggers: [billingPaymentSucceeded],
  },
  async ({ event, step, logger }) => {
    const { tenantId, paymentId, stripeInvoiceId, paidAt } = event.data;

    if (!isSelfInvoicingConfigured()) {
      logger.warn(
        'FAKTFLOW_OPERATOR_TENANT_ID missing — self-invoicing skipped',
        { paymentId },
      );
      return { skipped: true as const, reason: 'operator-not-configured' as const };
    }

    // 1. Load payment + sprawdź idempotency.
    const paymentRow = await step.run('load-payment', async () => {
      const supabase = createAdminClient();
      const { data, error } = await (supabase as unknown as {
        from: (n: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{
                data: {
                  id: string;
                  tenant_id: string;
                  amount_cents: number;
                  paid_at: string | null;
                  vat_invoice_id: string | null;
                  subscription_id: string | null;
                } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from('stripe_payments')
        .select(
          'id, tenant_id, amount_cents, paid_at, vat_invoice_id, subscription_id',
        )
        .eq('id', paymentId)
        .maybeSingle();
      if (error) throw new Error(`load payment failed: ${error.message}`);
      if (!data) throw new NonRetriableError(`Payment ${paymentId} nie istnieje`);
      return data;
    });

    if (paymentRow.vat_invoice_id) {
      logger.info('vat_invoice_id already set — skip', { paymentId });
      return {
        skipped: true as const,
        reason: 'already-invoiced' as const,
        existingInvoiceId: paymentRow.vat_invoice_id,
      };
    }

    // 2. Load subscription żeby dostać plan.
    const plan = await step.run('load-plan', async () => {
      if (!paymentRow.subscription_id) return 'monthly' as const;
      const supabase = createAdminClient();
      const { data } = await (supabase as unknown as {
        from: (n: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{
                data: { plan: 'monthly' | 'annual' } | null;
              }>;
            };
          };
        };
      })
        .from('subscriptions')
        .select('plan')
        .eq('id', paymentRow.subscription_id)
        .maybeSingle();
      return data?.plan ?? 'monthly';
    });

    // 3 + 4. Build draft + insert (idempotent po unique internal_number).
    const insertResult = await step.run('build-and-insert', async () => {
      const draft = await buildSelfInvoiceDraft(tenantId, {
        grossCents: paymentRow.amount_cents,
        paidAt: paymentRow.paid_at ?? paidAt,
        stripeInvoiceId,
        plan,
      });
      if (!draft) {
        throw new NonRetriableError(
          'Nie udało się zbudować draft faktury (operator config lub customer tenant missing)',
        );
      }

      const inserted = await insertSelfInvoice(draft.invoice, draft.operator.tenantId);
      if (!inserted) {
        throw new Error('insertSelfInvoice returned null');
      }

      return {
        invoiceId: inserted.invoiceId,
        internalNumber: inserted.internalNumber,
        operatorTenantId: draft.operator.tenantId,
        operatorNip: draft.operator.nip,
        invoice: draft.invoice,
      };
    });

    // 5. Link payment → faktura. UPDATE jest fail-soft: nawet jak nie zadziała,
    // faktura i tak została wystawiona, link można naprawić ręcznie z admin panelu.
    await step.run('link-payment-to-invoice', async () => {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('stripe_payments')
        .update({
          vat_invoice_id: insertResult.invoiceId,
          vat_invoice_submitted_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      if (error) {
        Sentry.captureException(error, {
          tags: { area: 'billing.self-invoice.link' },
          extra: { paymentId, invoiceId: insertResult.invoiceId },
        });
        // Nie throw — kontynuujemy do emit submit.
      }
    });

    // 6. Emit submit event do istniejącego KSeF pipeline'u (Faza 23).
    await step.sendEvent('emit-ksef-submit', {
      name: 'invoice/submit.requested',
      data: invoiceSubmitRequested.create({
        tenantId: insertResult.operatorTenantId,
        invoiceId: insertResult.invoiceId,
        invoice: insertResult.invoice,
        nip: insertResult.operatorNip,
      }).data,
    });

    // 7. Audit log z prefixem `billing.vat_invoice.queued`.
    await step.run('audit', async () => {
      await logAuditSystem({
        action: 'billing.vat_invoice.queued',
        tenantId: insertResult.operatorTenantId,
        userId: null,
        entityType: 'invoice',
        entityId: insertResult.invoiceId,
        metadata: {
          customerTenantId: tenantId,
          paymentId,
          stripeInvoiceId,
          internalNumber: insertResult.internalNumber,
          plan,
          amountCents: paymentRow.amount_cents,
        },
      });
    });

    return {
      success: true as const,
      invoiceId: insertResult.invoiceId,
      internalNumber: insertResult.internalNumber,
    };
  },
);
