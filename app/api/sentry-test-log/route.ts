import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Jednorazowy test Sentry Logs (`Sentry.logger` + enableLogs).
 *
 * - Działa sensownie tylko gdy `NODE_ENV=production` (tak masz w sentry.*.config).
 * - Na prod ustaw `SENTRY_LOG_TEST_SECRET` i wołaj `?token=<secret>`,
 *   żeby nikt nie spamował Twojego konta Sentry.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json(
      {
        ok: false,
        message:
          'Sentry ma `enabled` tylko w production. Uruchom `pnpm build && pnpm start` albo wywołaj ten URL na deployu Vercel.',
      },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const expected = process.env.SENTRY_LOG_TEST_SECRET;
  if (expected && token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  Sentry.logger.info('User triggered test log', {
    log_source: 'sentry_test',
  });

  return NextResponse.json({
    ok: true,
    hint: 'W Sentry: Logs (lub Explore → Logs), szukaj atrybutu log_source = sentry_test',
  });
}
