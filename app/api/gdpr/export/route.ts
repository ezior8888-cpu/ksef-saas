import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { collectUserData } from '@/lib/gdpr/data-collector';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/gdpr/export → JSON download wszystkich danych zalogowanego usera.
 *
 * Format: JSON (zamiast ZIP) — prostsze do parsowania, brak deps poza
 * stdlib. ~1MB dla typowego usera z 1000 audit logs + listą faktur.
 *
 * RODO art. 15 ust. 1 — prawo dostępu do swoich danych. Zgodnie z prawem
 * musimy umożliwić "w postaci powszechnie używanej, nadającej się do
 * odczytu maszynowego" — JSON spełnia.
 *
 * Format pliku: `faktflow-export-{userId}-{timestamp}.json`.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  try {
    const data = await collectUserData(user.id);

    await logAudit({
      action: 'gdpr.export_requested',
      tenantId: null,
      userId: user.id,
      metadata: {
        invoices_count: data.invoices_count,
        audit_logs_count: data.audit_logs.length,
      },
    });

    const json = JSON.stringify(data, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `faktflow-export-${user.id.slice(0, 8)}-${timestamp}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Cache disabled — kazdy export to świeży snapshot.
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (err) {
    console.error('[gdpr/export]', err);
    return NextResponse.json(
      { error: 'export_failed' },
      { status: 500 },
    );
  }
}
