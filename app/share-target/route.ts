import { NextRequest, NextResponse } from 'next/server';

import { uploadExpensePhotoAction } from '@/app/actions/expenses';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Web Share Target (PWA): przeglądarka wysyła POST multipart z polem `photo`.
 * Musi być na liście ścieżek publicznych w middleware — inaczej POST bez sesji
 * traci body przy przekierowaniu na /login.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL('/login', req.url);
    login.searchParams.set('redirect', '/expenses');
    return NextResponse.redirect(login, 303);
  }

  const formData = await req.formData();
  const photo = formData.get('photo');

  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.redirect(new URL('/expenses', req.url), 303);
  }

  const result = await uploadExpensePhotoAction(formData);

  if (result.success) {
    const ok = new URL('/expenses', req.url);
    ok.searchParams.set('ocr_pending', result.ocrJobId);
    return NextResponse.redirect(ok, 303);
  }

  const err = new URL('/expenses', req.url);
  err.searchParams.set('error', result.error);
  return NextResponse.redirect(err, 303);
}
