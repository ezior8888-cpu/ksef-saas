import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { getPostHogNodeClient } from '@/lib/analytics/posthog-node-client';

/**
 * Jednorazowy test serwerowego PostHog (posthog-node) — tylko development.
 * Otwórz w przeglądarce lub: curl http://localhost:3000/api/dev/posthog-test
 *
 * NIE używaj proxy.ts — tam działa Edge + sesja Supabase, bez posthog-node.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const client = getPostHogNodeClient();
    if (!client) {
      return NextResponse.json(
        {
          ok: false,
          error: 'PostHog not configured — set NEXT_PUBLIC_POSTHOG_KEY in .env.local',
        },
        { status: 503 },
      );
    }

    console.log('=== PROXY: Próba wysłania eventu do PostHog ===');
    client.capture({
      distinctId: 'test_user_backend',
      event: 'test_proxy_event_v2',
      properties: {
        info: 'Jesli to widzisz w konsoli, to funkcja sie wykonuje',
      },
    });

    console.log('=== PROXY: Metoda client.capture() wywołana pomyślnie ===');

    await client.flush();

    return NextResponse.json({
      ok: true,
      message: 'Event wysłany (sprawdź terminal dev + PostHog Live events)',
      event: 'test_proxy_event_v2',
    });
  } catch (error) {
    const errorId = Sentry.captureException(error, {
      tags: { area: 'dev.posthog_test' },
    });
    return NextResponse.json(
      { ok: false, error: 'PostHog test failed', errorId },
      { status: 500 },
    );
  }
}
