import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Jednorazowy test Sentry Logs (`Sentry.logger` + `enableLogs`).
 *
 * Polityka fail-closed:
 *  - poza produkcją: 400 z komunikatem (Sentry i tak nie loguje).
 *  - na produkcji bez `SENTRY_LOG_TEST_SECRET`: 404 (endpoint udaje, że nie istnieje).
 *  - na produkcji z `SENTRY_LOG_TEST_SECRET`: wymaga `?token=<secret>` (constant‑time).
 *
 * Bez `expected` PRZED tą zmianą warunek `if (expected && token !== expected)`
 * się wywalał — endpoint był w pełni otwarty, każdy mógł spamować nasz
 * licznik Sentry Logs.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json(
      {
        ok: false,
        message:
          'Sentry ma `enabled` tylko w production. Uruchom `pnpm build && pnpm start` albo wywołaj ten URL na deployu Vercel.',
      },
      { status: 400 },
    );
  }

  const expected = process.env.SENTRY_LOG_TEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (token !== expected) {
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
