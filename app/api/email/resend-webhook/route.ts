/**
 * Resend webhook handler (Faza 26).
 *
 * Setup w Resend Dashboard → Webhooks → Add endpoint:
 *   URL: https://app.faktflow.pl/api/email/resend-webhook
 *   Events subskrybuj: email.bounced, email.complained, email.delivery_delayed
 *
 * Resend używa **Svix** do signature verification (RFC 8037 / JWS-style).
 * Headers: `svix-id`, `svix-timestamp`, `svix-signature`. Body = raw JSON.
 *
 * Decyzje:
 *   - `email.bounced` z `type='hard'` → INSERT + auto-unsubscribe wszystkich
 *     kategorii poza transactional (te i tak Resend zablokuje przez bounce-list).
 *   - `email.bounced` z `type='soft'` → tylko log, nie deactivate (mailbox full
 *     to często chwilowe).
 *   - `email.complained` → INSERT + INSTANT unsubscribe wszystkich kategorii
 *     (włącznie z transactional — reputacja domeny ważniejsza).
 *
 * Idempotency: `email_bounces.resend_event_id` UNIQUE.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { ALL_CATEGORIES, unsubscribe } from '@/lib/email/preferences';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResendBounceType = 'hard' | 'soft' | 'undetermined';
type ResendEvent =
  | 'email.bounced'
  | 'email.complained'
  | 'email.delivery_delayed';

interface ResendWebhookPayload {
  type: ResendEvent;
  // Event ID dla idempotency (Resend's `svix-id` header, ale też dostępne w body).
  created_at: string;
  data: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    bounce?: {
      type?: ResendBounceType;
      // Free-text reason ("mailbox_full", "blocked", "no_email", etc.)
      message?: string;
    };
  };
}

/**
 * Svix signature verification — Resend używa Svix pod spodem.
 * Format: `v1,<base64-signed>` (multiple sigs space-separated).
 * Sygnujemy: `${id}.${timestamp}.${rawBody}` HMAC-SHA256 + base64.
 *
 * Jeśli `RESEND_WEBHOOK_SECRET` nieustawione → odrzucamy (nie chcemy
 * przetwarzać nieautoryzowanych webhook'ów w prod).
 */
function verifySvixSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): boolean {
  // Secret format z Resend: `whsec_<base64>`. Trzeba pominąć prefix.
  const decodedSecret = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'base64');

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = createHmac('sha256', decodedSecret)
    .update(signedContent)
    .digest('base64');

  // Svix może wysłać kilka signatures (space-separated, format `v1,<b64>`)
  // dla rotation. Wystarczy że jedna pasuje.
  const sigs = svixSignature.split(' ');
  for (const sig of sigs) {
    const parts = sig.split(',');
    if (parts.length !== 2) continue;
    const sigB64 = parts[1];
    if (!sigB64) continue;

    const expected = Buffer.from(expectedSig, 'base64');
    let received: Buffer;
    try {
      received = Buffer.from(sigB64, 'base64');
    } catch {
      continue;
    }
    if (expected.length !== received.length) continue;
    if (timingSafeEqual(expected, received)) return true;
  }
  return false;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  // Resend dropuje email do skrzynki — bierzemy najnowszego usera z tym
  // adresem. Edge case: 2 useri kiedyś mieli ten sam email (po deletion +
  // reuse). Bierzemy ostatnio aktywnego.
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const normalized = email.toLowerCase().trim();
  const match = data?.users
    .filter((u) => u.email?.toLowerCase() === normalized)
    .sort(
      (a, b) =>
        new Date(b.last_sign_in_at ?? b.created_at).getTime() -
        new Date(a.last_sign_in_at ?? a.created_at).getTime(),
    )[0];
  return match?.id ?? null;
}

async function handleBounce(payload: ResendWebhookPayload, eventId: string) {
  const email = payload.data.to?.[0]?.toLowerCase().trim();
  if (!email) return;

  const bounceType: 'hard' | 'soft' =
    payload.data.bounce?.type === 'hard' ? 'hard' : 'soft';

  const supabase = createAdminClient();

  // Idempotency claim — UNIQUE(resend_event_id) zwraca 23505 przy duplikacie.
  const { error } = await supabase.from('email_bounces').insert({
    email,
    bounce_type: bounceType,
    reason: payload.data.bounce?.message ?? null,
    resend_event_id: eventId,
    raw_payload: payload as never,
  });

  if (error && error.code !== '23505') {
    throw new Error(`bounce insert failed: ${error.message}`);
  }
  if (error?.code === '23505') return; // already processed

  if (bounceType === 'hard') {
    // Hard bounce → unsubscribe od product_updates + marketing.
    // Transactional zostają (Resend i tak ich nie wyśle do bounced email'a,
    // ale chcemy żeby user mógł odzyskać konto po naprawie skrzynki).
    const userId = await findUserIdByEmail(email);
    if (userId) {
      await Promise.all([
        unsubscribe({
          userId,
          category: 'product_updates',
          source: 'hard_bounce_auto',
          reason: payload.data.bounce?.message,
        }),
        unsubscribe({
          userId,
          category: 'marketing',
          source: 'hard_bounce_auto',
          reason: payload.data.bounce?.message,
        }),
      ]);
    }
  }
}

async function handleComplaint(payload: ResendWebhookPayload, eventId: string) {
  const email = payload.data.to?.[0]?.toLowerCase().trim();
  if (!email) return;

  const supabase = createAdminClient();
  const { error } = await supabase.from('email_bounces').insert({
    email,
    bounce_type: 'complaint',
    reason: 'Marked as spam by recipient',
    resend_event_id: eventId,
    raw_payload: payload as never,
  });

  if (error && error.code !== '23505') {
    throw new Error(`complaint insert failed: ${error.message}`);
  }
  if (error?.code === '23505') return;

  // Complaint = user kliknął "Spam" → INSTANT total unsubscribe.
  // Transactional też wyłączamy — reputacja domeny > convenience.
  const userId = await findUserIdByEmail(email);
  if (userId) {
    await Promise.all(
      ALL_CATEGORIES.map((cat) =>
        unsubscribe({
          userId,
          category: cat,
          source: 'complaint_auto',
        }),
      ),
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing Svix headers' },
      { status: 400 },
    );
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage('Resend webhook received but RESEND_WEBHOOK_SECRET missing', {
      level: 'error',
    });
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const valid = verifySvixSignature(
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    secret,
  );
  if (!valid) {
    // Zła signature = anty-DOS, bez Sentry capture.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    if (payload.type === 'email.bounced') {
      await handleBounce(payload, svixId);
    } else if (payload.type === 'email.complained') {
      await handleComplaint(payload, svixId);
    } else if (payload.type === 'email.delivery_delayed') {
      // Tylko log do email_bounces dla telemetrii — nie deactivate.
      const email = payload.data.to?.[0]?.toLowerCase().trim();
      if (email) {
        const supabase = createAdminClient();
        await supabase.from('email_bounces').insert({
          email,
          bounce_type: 'delivery_delay',
          reason: 'Delivery delayed by recipient mailbox',
          resend_event_id: svixId,
          raw_payload: payload as never,
        });
      }
    }
    return NextResponse.json({ ok: true, type: payload.type });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { area: 'resend.webhook' },
      extra: { eventType: payload.type, svixId },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
