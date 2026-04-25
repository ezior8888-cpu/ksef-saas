import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint.
 * Sprawdza: Supabase DB, environment variables.
 *
 * Wywołuje np. UptimeRobot co kilka minut.
 */
export async function GET() {
  const checks: Record<string, { status: 'ok' | 'fail'; message?: string }> =
    {};

  const requiredEnvs = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'KSEF_CREDENTIALS_ENCRYPTION_KEY',
    'INNGEST_EVENT_KEY',
  ];
  const missing = requiredEnvs.filter((env) => !process.env[env]);
  checks.env =
    missing.length === 0
      ? { status: 'ok' }
      : { status: 'fail', message: `Missing: ${missing.join(', ')}` };

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('tenants').select('id').limit(1);
    checks.database = error
      ? { status: 'fail', message: error.message }
      : { status: 'ok' };
  } catch (error) {
    checks.database = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'unknown',
    };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
