'use server';

import { redirect } from 'next/navigation';

import { logAuditSystem } from '@/lib/audit/log-system';
import { isStripeConfigured } from '@/lib/stripe/client';
import { createCheckoutSession, type CheckoutPlan } from '@/lib/stripe/checkout';
import { createPortalSession } from '@/lib/stripe/portal';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * Server actions dla `/settings/billing` (Faza 25 Krok 2).
 *
 * Wszystkie akcje:
 *   1. `getPageContext()` — auth + tenant guard (redirect na /login/onboarding)
 *   2. Sprawdzają rolę (`owner` lub `admin` mogą zarządzać billingiem — nie
 *      `member` żeby pracownik nie anulował subskrypcji szefa).
 *   3. Wywołują Stripe SDK i robią `redirect()` (NEXT_REDIRECT) na hosted page.
 *
 * Uwaga: w pliku z `'use server'` mogą być eksportowane wyłącznie async
 * funkcje (Server Actions). Type guardy / stałe daj do osobnego modułu
 * (np. `lib/billing/billing-action-errors.ts`).
 */

/** Whitelist ról które mogą touch'ować billing. */
function canManageBilling(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  );
}

/**
 * Sukces = redirect na Stripe Checkout (303). Fail = redirect na
 * `/settings/billing?error=<code>` (kody: not-configured, forbidden, …).
 */
export async function startCheckoutAction(plan: CheckoutPlan): Promise<void> {
  const ctx = await getPageContext();

  if (!canManageBilling(ctx.role)) {
    redirect('/settings/billing?error=forbidden');
  }

  if (!isStripeConfigured()) {
    redirect('/settings/billing?error=not-configured');
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, nip')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  if (!tenant) {
    redirect('/settings/billing?error=tenant-not-found');
  }

  let url: string;
  try {
    const result = await createCheckoutSession({
      tenantId: ctx.tenantId,
      email: ctx.user.email ?? '',
      tenantName: tenant.name,
      nip: tenant.nip,
      plan,
      baseUrl: getBaseUrl(),
    });
    url = result.url;
  } catch (e) {
    // Klient zobaczy "Coś poszło nie tak — spróbuj ponownie" zamiast goly
    // stack trace. Operator widzi w Sentry full kontekst.
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(e, {
      tags: { area: 'billing.checkout' },
      extra: { tenantId: ctx.tenantId, plan },
    });
    redirect('/settings/billing?error=unexpected');
  }

  redirect(url);
}

/**
 * Otwiera Stripe Customer Portal (hosted page do zarządzania subskrypcją:
 * zmiana karty, cancel, view invoices history).
 */
export async function openCustomerPortalAction(): Promise<void> {
  const ctx = await getPageContext();

  if (!canManageBilling(ctx.role)) {
    redirect('/settings/billing?error=forbidden');
  }

  if (!isStripeConfigured()) {
    redirect('/settings/billing?error=not-configured');
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, nip')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  if (!tenant) {
    redirect('/settings/billing?error=tenant-not-found');
  }

  let url: string;
  try {
    const result = await createPortalSession({
      tenantId: ctx.tenantId,
      email: ctx.user.email ?? '',
      tenantName: tenant.name,
      nip: tenant.nip,
      baseUrl: getBaseUrl(),
    });
    url = result.url;
  } catch (e) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(e, {
      tags: { area: 'billing.portal' },
      extra: { tenantId: ctx.tenantId },
    });
    redirect('/settings/billing?error=unexpected');
  }

  // Audit log po sukcesie (Customer Portal może doprowadzić do cancel'a / refund'a).
  try {
    await logAuditSystem({
      action: 'billing.checkout.session_created',
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      entityType: 'stripe_portal',
      metadata: { adminEmail: ctx.user.email },
    });
  } catch {
    // Audit fail nie powinien blokować akcji billing'u.
  }

  redirect(url);
}
