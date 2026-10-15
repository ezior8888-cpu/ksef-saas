import type { Metadata } from 'next';

import { LegalDocumentView } from '@/components/legal/legal-document';
import { UMOWA_POWIERZENIA } from '@/lib/legal/documents';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Umowa powierzenia przetwarzania danych',
  description: 'Umowa powierzenia przetwarzania danych osobowych (art. 28 RODO) zawierana z każdym klientem FaktFlow.',
};

export default function DpaPage() {
  return <LegalDocumentView doc={UMOWA_POWIERZENIA} />;
}
