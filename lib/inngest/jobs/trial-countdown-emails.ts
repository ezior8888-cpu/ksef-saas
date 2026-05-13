/**
 * Trial countdown cron (Faza 25 Krok 5).
 *
 * Codziennie o 09:00 Europe/Warsaw skanuje `subscriptions` w statusie
 * `trialing` i wysyła emaile gdy `trial_end - now()` mieści się w oknie:
 *   - 14 dni  → `trial_14d` notification
 *   - 7 dni   → `trial_7d`
 *   - 3 dni   → `trial_3d`
 *   - 1 dzień → `trial_1d`
 *
 * Idempotency: `billing_notifications` z UNIQUE(entity_id, kind). INSERT
 * przed wysyłką = duplikat się nie wpisze, więc kolejne dni nie wyślą
 * tego samego stage.
 *
 * Email recipient: właściciel pierwszej organizacji (owner role) — bierzemy
 * z `memberships` najwcześniejszego `joined_at` z `role='owner'`.
 */

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { sendTrialEndingEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';

import { inngest } from '../client';

interface TrialingSubscription {
  id: string;
  tenant_id: string;
  plan: 'monthly' | 'annual';
  trial_end: string | null;
}

const PLAN_LABELS: Record<TrialingSubscription['plan'], { plan: string; price: string }> = {
  monthly: { plan: 'Miesięczny', price: '59 zł / miesiąc (+ VAT 23%)' },
  annual: { plan: 'Roczny', price: '588 zł / rok (49 zł / mc + VAT 23%)' },
};

type Stage = { days: 14 | 7 | 3 | 1; kind: string; min: number; max: number };

// Stage'e w godzinach — gdy `trial_end - now()` mieści się w danym oknie,
// odpalamy odpowiedni stage. Okna 24-godzinne pozwalają wykryć stage
// niezależnie od godziny w której cron się uruchomił (zwykle 09:00 PL).
const STAGES: Stage[] = [
  { days: 14, kind: 'trial_14d', min: 13 * 24, max: 14 * 24 },
  { days: 7, kind: 'trial_7d', min: 6 * 24, max: 7 * 24 },
  { days: 3, kind: 'trial_3d', min: 2 * 24, max: 3 * 24 },
  { days: 1, kind: 'trial_1d', min: 0, max: 1 * 24 },
];

function pickStage(trialEnd: Date): Stage | null {
  const hoursLeft = (trialEnd.getTime() - Date.now()) / (60 * 60 * 1000);
  return STAGES.find((s) => hoursLeft >= s.min && hoursLeft < s.max) ?? null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export const trialCountdownEmailsJob = inngest.createFunction(
  {
    id: 'billing-trial-countdown-emails',
    name: 'Billing: trial countdown emails (14/7/3/1 dni)',
    concurrency: { limit: 1 },
    // 09:00 PL = sensowna pora na business email (nie spamuje o 3 nad ranem).
    triggers: [cron('TZ=Europe/Warsaw 0 9 * * *')],
  },
  async ({ step, logger }) => {
    const supabase = createAdminClient();

    // 1. Znajdź wszystkie trialing subscriptions z trial_end w ciągu 15 dni.
    const cutoffIso = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

    const subscriptions = await step.run('find-trialing', async () => {
      const result = (await (supabase as unknown as {
        from: (n: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              not: (k: string, op: string, v: string) => {
                lte: (k: string, v: string) => Promise<{
                  data: TrialingSubscription[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      })
        .from('subscriptions')
        .select('id, tenant_id, plan, trial_end')
        .eq('status', 'trialing')
        .not('trial_end', 'is', 'null')
        .lte('trial_end', cutoffIso));

      if (result.error) {
        throw new Error(`trialing lookup failed: ${result.error.message}`);
      }
      return result.data ?? [];
    });

    logger.info('trial-countdown scan', { count: subscriptions.length });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      if (!sub.trial_end) continue;
      const stage = pickStage(new Date(sub.trial_end));
      if (!stage) {
        skipped++;
        continue;
      }

      // Per-subscription step — Inngest zapisuje state, więc retry tylko
      // tej iteracji bez powtarzania całego scanu.
      try {
        const dispatched = await step.run(`send-${sub.id}-${stage.kind}`, () =>
          dispatchTrialEmail(sub, stage),
        );
        if (dispatched === 'sent') sent++;
        else if (dispatched === 'duplicate') skipped++;
        else failed++;
      } catch (e) {
        failed++;
        Sentry.captureException(e, {
          tags: { area: 'billing.trial-countdown' },
          extra: { subscriptionId: sub.id, stage: stage.kind },
        });
      }
    }

    return { processed: subscriptions.length, sent, skipped, failed };
  },
);

async function dispatchTrialEmail(
  sub: TrialingSubscription,
  stage: Stage,
): Promise<'sent' | 'duplicate' | 'failed'> {
  const supabase = createAdminClient();

  // 1. Resolve owner email z memberships.
  const { data: membership } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', sub.tenant_id)
    .eq('role', 'owner')
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return 'failed';

  const { data: userData } = await supabase.auth.admin.getUserById(membership.user_id);
  const email = userData.user?.email;
  if (!email) return 'failed';

  // 2. Resolve tenant name.
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', sub.tenant_id)
    .maybeSingle();

  // 3. Idempotency claim: INSERT przed wysyłką. UNIQUE(entity_id, kind)
  //    zwróci 23505 przy duplikacie = dziś już wysłaliśmy ten stage.
  const claimRes = await supabase.from('billing_notifications').insert({
    tenant_id: sub.tenant_id,
    entity_id: sub.id,
    kind: stage.kind as 'trial_14d' | 'trial_7d' | 'trial_3d' | 'trial_1d',
    recipient_email: email,
    status: 'sending',
  });

  if (claimRes.error) {
    if (claimRes.error.code === '23505') return 'duplicate';
    throw new Error(`notification claim failed: ${claimRes.error.message}`);
  }

  // 4. Wysyłka.
  const labels = PLAN_LABELS[sub.plan];
  const result = await sendTrialEndingEmail(email, {
    tenantName: tenant?.name ?? email,
    daysRemaining: stage.days,
    trialEndDate: fmtDate(sub.trial_end!),
    planLabel: labels.plan,
    monthlyPriceLabel: labels.price,
  });

  // 5. Update status.
  await supabase
    .from('billing_notifications')
    .update({
      status: result.sent ? 'sent' : 'failed',
      resend_message_id: result.messageId ?? null,
      error_message: result.sent ? null : result.reason ?? null,
    })
    .eq('entity_id', sub.id)
    .eq('kind', stage.kind);

  return result.sent ? 'sent' : 'failed';
}
