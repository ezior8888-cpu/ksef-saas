'use client';

import { useEffect, useRef } from 'react';

/**
 * Rysunek animowany (plik wideo) z pewnym startem odtwarzania.
 *
 * Sam atrybut `autoPlay` bywa zawodny: React ustawia `muted` jako właściwość,
 * a przeglądarka sprawdza atrybut w chwili wczytania, więc nagranie potrafi
 * zostać uznane za dźwiękowe i zablokowane. Efekt jest zdradliwy — plik
 * wczytuje się w całości, nie ma błędu, a film stoi na pierwszej klatce.
 * Ponieważ te rysunki animują się OD PUSTEJ KARTKI, pierwsza klatka jest
 * biała i wygląda to jak brak ilustracji.
 *
 * Dlatego ustawiamy `muted` przez referencję i wołamy `play()` sami, także
 * po `canplay` i po powrocie do karty.
 */
export function DrawnVideo({
  src,
  width,
  height,
  className,
}: {
  src: string;
  width: number;
  height: number;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    v.muted = true;
    v.defaultMuted = true;

    const odpal = () => {
      const p = v.play();
      if (p) p.catch(() => {});
    };

    odpal();
    v.addEventListener('canplay', odpal);
    document.addEventListener('visibilitychange', odpal);

    return () => {
      v.removeEventListener('canplay', odpal);
      document.removeEventListener('visibilitychange', odpal);
    };
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      width={width}
      height={height}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className={className}
      /* BEZ wymuszania warstwy GPU i BEZ trybu mieszania — obie rzeczy
         dodałem wcześniej i obie szkodziły:

         `translateZ(0)` i `backface-visibility` promują element do osobnej
         warstwy kompozycji. Jej krawędź zaokrągla się do pikseli urządzenia
         niezależnie od tła, więc przy przewijaniu widać migoczącą obramówkę.

         `mix-blend-mode: multiply` znikało całkiem: rodzic animowany przez
         framer-motion tworzy własny kontekst nakładania, a mnożenie przez
         przezroczyste tło daje przezroczystość.

         Bez obojga film maluje się w normalnym przepływie razem ze stroną.
         Tło rysunków jest białe, a gradient w tym miejscu też, więc żadna
         krawędź się nie odcina. */
    />
  );
}
