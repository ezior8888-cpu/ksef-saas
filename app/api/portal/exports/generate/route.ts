// app/api/portal/exports/generate/route.ts
// Synchronous endpoint dla portalu księgowej (zwraca plik bezpośrednio, bez kolejki Inngest).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { hashToken } from '@/lib/accountant/tokens';
import { logAuditSystem } from '@/lib/audit/log-system';
import { fetchInvoicesForExport } from '@/lib/exports/data-fetcher';
import { generateJpkFa } from '@/lib/exports/jpk-fa-generator';
import { generateKpirXlsx } from '@/lib/exports/kpir-generator';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  format: z.enum(['jpk_fa', 'kpir_excel']),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** NIP + nazwy plików — tylko bezpieczne znaki. */
function safeNipSegment(nip: string): string {
  return nip.replace(/\D/g, '').slice(0, 14) || 'braknip';
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  try {
    const accountantToken =
      req.headers.get('x-accountant-token')?.trim() ??
      req.headers.get('X-Accountant-Token')?.trim();

    if (!accountantToken) {
      return NextResponse.json({ error: 'Brak tokenu' }, { status: 401 });
    }

    const tokenHash = hashToken(accountantToken);

    const { data: accessRow, error: accessErr } = await supabase
      .from('accountant_access')
      .select('id, tenant_id, access_level, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (accessErr || !accessRow) {
      return NextResponse.json({ error: 'Token nieprawidłowy' }, { status: 403 });
    }

    // Schemat: `revoked_at` (nullable), nie `is_revoked`.
    if (accessRow.revoked_at != null) {
      return NextResponse.json({ error: 'Token nieprawidłowy' }, { status: 403 });
    }

    if (
      accessRow.expires_at &&
      new Date(accessRow.expires_at as string) < new Date()
    ) {
      return NextResponse.json({ error: 'Token wygasł' }, { status: 403 });
    }

    if ((accessRow.access_level as string) !== 'download') {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Niepoprawne JSON body' }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.flatten().formErrors.join(', ') || parsed.error.message,
        },
        { status: 400 },
      );
    }

    const { tenantId, format, periodStart, periodEnd } = parsed.data;

    if (periodEnd < periodStart) {
      return NextResponse.json(
        { error: 'Okres nieprawidłowy — data końcowa przed początkiem' },
        { status: 400 },
      );
    }

    if (tenantId !== accessRow.tenant_id) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    const fwd = req.headers.get('x-forwarded-for');
    const clientIp =
      fwd?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null;
    const userAgent = req.headers.get('user-agent') ?? '';

    const data = await fetchInvoicesForExport({
      tenantId,
      periodStart,
      periodEnd,
      direction: 'both',
      includeCorrections: true,
    });

    const nipSeg = safeNipSegment(data.issuer.nip);

    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    if (format === 'jpk_fa') {
      const xml = generateJpkFa({
        issuer: data.issuer,
        periodStart,
        periodEnd,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      buffer = Buffer.from(xml, 'utf8');
      filename = `JPK_FA_${nipSeg}_${periodStart}_${periodEnd}.xml`;
      contentType = 'application/xml; charset=utf-8';
    } else {
      // `generateKpirXlsx` przyjmuje issued + received osobno (nie pojedyncza tablica invoices).
      buffer = await generateKpirXlsx({
        issuer: data.issuer,
        periodStart,
        periodEnd,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      filename = `KPiR_${nipSeg}_${periodStart}_${periodEnd}.xlsx`;
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    await logAuditSystem({
      action: 'accountant.portal_export',
      tenantId,
      entityType: 'accountant_access',
      entityId: accessRow.id as string,
      metadata: {
        kind: 'export_download',
        format,
        periodStart,
        periodEnd,
        ip_address: clientIp ?? 'unknown',
        user_agent: userAgent,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Filename': filename,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('Portal export error:', e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : 'Nieznany błąd generowania pliku',
      },
      { status: 500 },
    );
  }
}
