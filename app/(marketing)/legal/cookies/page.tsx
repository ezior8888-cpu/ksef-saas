import type { Metadata } from 'next';

import { CookieSettings } from '@/components/legal/cookie-settings';
import { LegalDocumentView } from '@/components/legal/legal-document';
import { POLITYKA_COOKIES } from '@/lib/legal/documents';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Polityka cookies',
  description: 'Jakie pliki cookies i dane w przeglądarce zapisuje FaktFlow oraz jak zmienić zgodę na analitykę.',
};

export default function CookiesPage() {
  return (
    <LegalDocumentView doc={POLITYKA_COOKIES}>
      <section id="ustawienia" className="not-prose my-8 scroll-mt-32 rounded-2xl border border-[var(--z-300,#e5e5e5)] px-5 py-4">
        <h2 className="mb-3 text-base font-semibold">Twoje ustawienia</h2>
        <CookieSettings />
      </section>
    </LegalDocumentView>
  );
}
