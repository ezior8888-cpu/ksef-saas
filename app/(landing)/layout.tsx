import type { Metadata } from 'next';

import { PRICE_PER_MONTH, TRIAL_DAYS } from '@/lib/billing/pricing';
import '@/styles/zova.css';

/**
 * Landing page stoi w osobnej grupie tras, poza `(marketing)`.
 *
 * Powód: `(marketing)/layout.tsx` narzuca ciemny nagłówek, stopkę i tło
 * z gradientem, wspólne dla 15 pozostałych stron. Zova ma własną pływającą
 * nawigację i jasny motyw, więc strona główna musi wyjść spod tamtego
 * layoutu — inaczej dostalibyśmy dwie nawigacje jedna nad drugą.
 */
export const metadata: Metadata = {
  title:
    'FaktFlow — faktury KSeF 2026 dla mikrofirm | Zdjęcie paragonu = wpis do KPiR',
  description:
    `Wystawiaj faktury i wysyłaj do KSeF jednym kliknięciem. Zdjęcie paragonu trafia automatycznie do KPiR. ${TRIAL_DAYS} dni za darmo, potem ${PRICE_PER_MONTH}.`,
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="zova min-h-screen overflow-x-clip">{children}</div>;
}
