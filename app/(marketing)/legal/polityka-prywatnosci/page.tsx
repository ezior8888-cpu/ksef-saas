import type { Metadata } from 'next';

import { LegalDocumentView } from '@/components/legal/legal-document';
import { POLITYKA_PRYWATNOSCI } from '@/lib/legal/documents';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Polityka prywatności',
  description: 'Jak FaktFlow przetwarza dane osobowe: cele, podstawy prawne, odbiorcy, okresy przechowywania i Twoje prawa.',
};

export default function PrivacyPage() {
  return <LegalDocumentView doc={POLITYKA_PRYWATNOSCI} />;
}
