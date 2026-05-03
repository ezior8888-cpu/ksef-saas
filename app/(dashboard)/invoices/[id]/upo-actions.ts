'use server';

import { createClient } from '@/lib/supabase/server';
import { downloadUpoPdf, downloadUpoXml } from '@/lib/ksef/upo-storage';

function upoPdfFilename(
  internalNumber: string | null | undefined,
  invoiceId: string,
): string {
  const base =
    typeof internalNumber === 'string' && internalNumber.trim() !== ''
      ? internalNumber.trim()
      : invoiceId;
  return `UPO-${base.replace(/[/\\]/g, '-')}.pdf`;
}

export async function getUpoPdfAction(
  invoiceId: string,
): Promise<
  | { success: true; pdfBase64: string; filename: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Niezalogowany' };
  }

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('id, tenant_id, internal_number, ksef_status')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invError || !invoice) {
    return { success: false, error: 'Faktura nie znaleziona' };
  }

  if (invoice.ksef_status !== 'accepted') {
    return {
      success: false,
      error: 'UPO dostępne tylko dla zaakceptowanych faktur',
    };
  }

  const { data: upo, error: upoError } = await supabase
    .from('upo_receipts')
    .select('status')
    .eq('invoice_id', invoiceId)
    .maybeSingle();

  if (upoError || !upo || upo.status !== 'downloaded') {
    return {
      success: false,
      error:
        'UPO jeszcze nie zostało pobrane. Spróbuj za chwilę — KSeF generuje je asynchronicznie.',
    };
  }

  try {
    const pdfBuffer = await downloadUpoPdf(invoice.tenant_id, invoiceId);
    return {
      success: true,
      pdfBase64: pdfBuffer.toString('base64'),
      filename: upoPdfFilename(invoice.internal_number, invoiceId),
    };
  } catch {
    return {
      success: false,
      error: 'Błąd pobierania UPO z storage',
    };
  }
}

export async function getUpoXmlAction(
  invoiceId: string,
): Promise<{ success: true; xml: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('id, tenant_id, ksef_status')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invError || !invoice) return { success: false, error: 'Faktura nie znaleziona' };

  if (invoice.ksef_status !== 'accepted') {
    return {
      success: false,
      error: 'UPO dostępne tylko dla zaakceptowanych faktur',
    };
  }

  const { data: upo, error: upoError } = await supabase
    .from('upo_receipts')
    .select('status')
    .eq('invoice_id', invoiceId)
    .maybeSingle();

  if (upoError || !upo || upo.status !== 'downloaded') {
    return {
      success: false,
      error:
        'UPO jeszcze nie zostało pobrane. Spróbuj za chwilę — KSeF generuje je asynchronicznie.',
    };
  }

  try {
    const xml = await downloadUpoXml(invoice.tenant_id, invoiceId);
    return { success: true, xml };
  } catch {
    return { success: false, error: 'Błąd odczytu UPO XML' };
  }
}
