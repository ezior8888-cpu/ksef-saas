import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalDraftBanner } from '@/components/legal/legal-document';
import { CONTRACT_VERSION } from '@/lib/legal/versions';
import { SUBPROCESSORS } from '@/lib/legal/subprocessors';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Podmioty przetwarzające',
  description: 'Lista dostawców, którym FaktWay powierza przetwarzanie danych osobowych.',
};

/**
 * Lista z art. 28 ust. 2 RODO (ogólna zgoda na podprocesorów wymaga
 * informowania o zmianach) — ta sama, co w polityce prywatności i załączniku
 * do umowy powierzenia (`lib/legal/subprocessors.ts`).
 */
export default function SubprocessorsPage() {
  return (
    <article className="pb-16 lg:pb-24">
      <div className="prose prose-neutral mx-auto max-w-3xl px-6 dark:prose-invert">
        <LegalDraftBanner />
        <h1 className="mb-2">Podmioty przetwarzające dane</h1>
        <p className="mt-0 text-sm">Stan na dzień {CONTRACT_VERSION}</p>
        <p>
          Poniżej są dostawcy, z których usług korzystamy przy świadczeniu FaktWay. Kolumna „Dane klientów”
          wskazuje, czy dostawca może przetwarzać dane, które powierzają nam klienci (np. dane kontrahentów
          w fakturach) — ci dostawcy są dalszymi podmiotami przetwarzającymi w rozumieniu{' '}
          <Link href="/legal/umowa-powierzenia#podprocesorzy">umowy powierzenia</Link>. O planowanej zmianie
          informujemy klientów e-mailem co najmniej 14 dni wcześniej.
        </p>
        <div className="my-4 overflow-x-auto">
          <table className="my-0 min-w-[720px] text-sm">
            <thead>
              <tr>
                <th>Dostawca</th>
                <th>Zakres</th>
                <th>Lokalizacja danych</th>
                <th>Przekazanie poza EOG</th>
                <th>Dane klientów</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <td className="align-top">
                    {s.name}
                    <br />
                    <span className="text-xs">({s.seat})</span>
                  </td>
                  <td className="align-top">{s.purpose}</td>
                  <td className="align-top">{s.location}</td>
                  <td className="align-top">{s.transfer}</td>
                  <td className="align-top">{s.roles.includes('client_data') ? 'tak' : 'nie'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
