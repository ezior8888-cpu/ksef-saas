import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/invoices/[id]/pdf — pobranie PDF faktury (Faza 33 Krok 4).
 *
 * PDF generowany z cache R2 (lub świeżo renderowany pdfkit przy cache miss).
 * Ownership weryfikuje `generateInvoicePdf` przez `tenantId` z aktywnej org.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) {
    return NextResponse.json({ error: 'no_active_org' }, { status: 400 });
  }

  try {
    const result = await generateInvoicePdf(id, tenantId);

    if (!result.success) {
      const status =
        result.code === 'NOT_FOUND'
          ? 404
          : result.code === 'FORBIDDEN'
            ? 403
            : result.code === 'KSEF_NOT_VERIFIED'
              ? 403
              : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return new NextResponse(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        // PDF faktury to dane wrażliwe — nie cache'ujemy w przeglądarce.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'invoices/pdf', invoice_id: id },
    });
    return NextResponse.json(
      { error: 'pdf_generation_failed' },
      { status: 500 },
    );
  }
}
