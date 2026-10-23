import '@/styles/zova.css';

/**
 * Strony O nas i Blog w motywie szablonu Zova, poza `(marketing)`.
 *
 * Powód: `(marketing)/layout.tsx` narzuca ciemny nagłówek, stopkę i tło
 * z gradientem, wspólne dla pozostałych stron. Zova ma własną pływającą
 * nawigację i jasny motyw, więc te strony muszą wyjść spod tamtego
 * layoutu, inaczej dostalibyśmy dwie nawigacje jedna nad drugą.
 *
 * Strona główna wyszła stąd 23.10.2026 do `app/(home)` (motyw aplikacji),
 * razem ze swoim tytułem i opisem dla wyszukiwarek.
 */
export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="zova min-h-screen overflow-x-clip">{children}</div>;
}
