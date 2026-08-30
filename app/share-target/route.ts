import { NextRequest, NextResponse } from 'next/server';

import { uploadExpensePhotoAction } from '@/app/actions/expenses';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Web Share Target (PWA): przeglądarka wysyła POST multipart z polem `photo`.
 * Musi być na liście ścieżek publicznych w middleware — inaczej POST bez sesji
 * traci body przy przekierowaniu na /login.
 *
 * WYNIK LĄDUJE W WĄTKU AGENTA, nie w Wydatkach (krok 22 toru B). Klient
 * udostępnia zdjęcie paragonu i ma zobaczyć gotowy koszt tam, gdzie agent
 * mówi wszystko inne — bez wchodzenia w menu. Parametr `paragon` niesie
 * identyfikator zadania OCR, żeby wątek mógł pokazać stan przetwarzania.
 *
 * Gdy odczyt utknie, kartę z drogą wyjścia tworzy silnik po trzech minutach
 * (`findStuckOcrJobs`) — interfejs jej nie wymyśla, tylko wyświetla.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL('/login', req.url);
    login.searchParams.set('redirect', '/flo');
    return NextResponse.redirect(login, 303);
  }

  const formData = await req.formData();
  const photo = formData.get('photo');

  if (!(photo instanceof File) || photo.size === 0) {
    const empty = new URL('/flo', req.url);
    empty.searchParams.set('paragon', 'brak-zdjecia');
    return NextResponse.redirect(empty, 303);
  }

  const result = await uploadExpensePhotoAction(formData);

  if (result.success) {
    const ok = new URL('/flo', req.url);
    ok.searchParams.set('paragon', result.ocrJobId);
    return NextResponse.redirect(ok, 303);
  }

  const err = new URL('/flo', req.url);
  err.searchParams.set('paragon', 'blad');
  return NextResponse.redirect(err, 303);
}
