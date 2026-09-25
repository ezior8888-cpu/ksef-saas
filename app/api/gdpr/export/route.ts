import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { getVerifiedUserContext } from '@/lib/auth/verified-user';
import { collectUserData } from '@/lib/gdpr/data-collector';

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store, must-revalidate',
  'Referrer-Policy': 'no-referrer',
};

/** Download a bounded account snapshot; organization invoices have a separate export. */
export async function GET(): Promise<NextResponse> {
  try {
    const context = await getVerifiedUserContext();
    if (!context.ok) {
      const status = context.reason === 'unauthenticated' ? 401
        : context.reason === 'mfa_required' ? 403 : 503;
      return NextResponse.json({ error: context.reason }, { status, headers: PRIVATE_HEADERS });
    }
    const data = await collectUserData(context.user.id);
    await logAudit({
      action: 'gdpr.export_requested',
      tenantId: null,
      userId: context.user.id,
      metadata: {
        format_version: data.format_version,
        audit_logs_count: data.audit_logs.length,
        audit_logs_truncated: data.coverage.audit_logs.truncated,
        memberships_truncated: data.coverage.memberships.truncated,
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `faktflow-export-${context.user.id.slice(0, 8)}-${timestamp}.json`;
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    // SDK errors can contain private rows or identifiers. Keep the diagnostic constant.
    console.error('[gdpr/export] account_export_failed');
    return NextResponse.json({ error: 'export_failed' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
