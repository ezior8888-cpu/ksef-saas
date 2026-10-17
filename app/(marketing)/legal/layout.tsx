import Link from 'next/link';

import { LEGAL_DOCUMENTS } from '@/lib/legal/documents';

/**
 * Wspólna nawigacja dokumentów prawnych — klient przed zawarciem umowy ma
 * widzieć komplet (regulamin, umowa powierzenia, polityki) w jednym miejscu.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav aria-label="Dokumenty prawne" className="mx-auto max-w-3xl px-6 pb-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {LEGAL_DOCUMENTS.map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="underline-offset-2 hover:underline">
                {d.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}
