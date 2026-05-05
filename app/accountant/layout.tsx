import type { Metadata } from 'next';

/**
 * Layout dla portalu księgowej (`/accountant/[token]/...`).
 *
 * `metadata.referrer = 'no-referrer'` produkuje `<meta name="referrer" content="no-referrer" />`
 * w wygenerowanym HTML. Bez tego, gdy księgowa kliknie zewnętrzny link
 * z portalu, przeglądarka wysyłałaby Referer z TOKENEM dostępu w URL-u
 * (np. `Referer: https://app/accountant/<long_token>`) — co stanowi
 * trywialny wyciek bearer-tokena na obcy host.
 *
 * Long-term: token z URL-a powinien zostać przeniesiony do httpOnly cookie
 * po pierwszym wejściu (osobny refaktor, patrz audyt #7).
 */
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
