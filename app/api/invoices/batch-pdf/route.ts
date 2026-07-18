import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { packageZip, type PackagedFile } from '@/lib/exports/zip-packager';
import { resolveApiUserAndActiveOrg } from '@/lib/supabase/auth-context';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/invoices/batch-pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 * — ZIP z PDF wszystkich faktur wystawionych w okresie (Faza 33 Krok 7).
 *
 * Limit 100 faktur na paczkę — przy większej liczbie generowanie
 * przekroczyłoby timeout funkcji serverless. Cache PDF w R2 (Krok 3)
 * sprawia, że kolejne pobranie tego samego miesiąca jest szybkie.
 *
 * KRYTYCZNE: lista faktur idzie przez admin client (omija RLS), więc tenant
 * MUSI być zweryfikowany membership (`resolveApiUserAndActiveOrg`), nie samym
 * formatem cookie — inaczej spreparowane cookie z obcym org_id pozwoliłoby
 * pobrać WSZYSTKIE faktury cudzej organizacji z danego okresu.
 */
const MAX_INVOICES = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface InvoiceRow {
  id: string;
  internal_number: string | null;
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await resolveApiUserAndActiveOrg();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const tenantId = ctx.tenantId;

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const res = await (
      admin as unknown as {
        from: (n: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              eq: (
                k: string,
                v: string,
              ) => {
                gte: (
                  k: string,
                  v: string,
                ) => {
                  lte: (
                    k: string,
                    v: string,
                  ) => {
                    limit: (n: number) => Promise<{
                      data: InvoiceRow[] | null;
                      error: { message: string } | null;
                    }>;
                  };
                };
              };
            };
          };
        };
      }
    )
      .from('invoices')
      .select('id, internal_number')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .gte('issue_date', from)
      .lte('issue_date', to)
      .limit(MAX_INVOICES + 1);

    if (res.error) {
      throw new Error(`invoices query: ${res.error.message}`);
    }
    const invoices = res.data ?? [];
    if (invoices.length === 0) {
      return NextResponse.json({ error: 'no_invoices' }, { status: 404 });
    }
    if (invoices.length > MAX_INVOICES) {
      return NextResponse.json(
        { error: 'too_many', limit: MAX_INVOICES },
        { status: 413 },
      );
    }

    const files: PackagedFile[] = [];
    for (const inv of invoices) {
      const result = await generateInvoicePdf(inv.id, tenantId);
      if (result.success) {
        files.push({ filename: result.filename, content: result.pdf });
      }
      // Pojedyncza faktura, której nie da się wyrenderować, nie blokuje
      // całej paczki — pomijamy ją po cichu (rzadkie, np. niespójne dane).
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'generation_failed' },
        { status: 500 },
      );
    }

    const zip = await packageZip(files);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Faktury_${from}_${to}.zip"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'invoices/batch-pdf' } });
    return NextResponse.json({ error: 'batch_failed' }, { status: 500 });
  }
}
