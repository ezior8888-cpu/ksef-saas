'use client';

import { useEffect, useRef } from 'react';

/**
 * Siatka kropek reagująca na kursor.
 *
 * Każda kropka ma swój dom w regularnej siatce. Gdy kursor się zbliża,
 * kropka wypada z siatki i zaczyna krążyć po elipsie wokół domu — elipsa
 * jest nachylona pod losowym kątem, przez co ruch czyta się jak orbitowanie
 * w różnych płaszczyznach, mimo że rysujemy na płaskim płótnie.
 *
 * Im bliżej kursora, tym większy promień orbity, jaśniejszy kolor i większa
 * kropka. Powrót do domu jest sprężynowy, więc siatka „oddycha” za myszą.
 *
 * Rysowane na canvasie, bo przy ~600 kropkach osobne elementy DOM zabiłyby
 * płynność. Kolory z palety landingu: neutralne w spoczynku, nasz błękit
 * przy kursorze.
 */
const ODSTEP = 26; // rozstaw siatki w px
const ZASIEG = 130; // promień oddziaływania kursora
const KOLOR_SPOCZYNEK = [187, 187, 187] as const; // między --z-500 a --z-600
const KOLOR_AKTYWNY = [64, 150, 255] as const; // --z-blue

type Kropka = {
  x: number;
  y: number;
  faza: number;
  tempo: number;
  nachylenie: number;
  sila: number;
};

export function AuthDotGrid() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const redukcja = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    let kropki: Kropka[] = [];
    let szer = 0;
    let wys = 0;
    let klatka = 0;
    let t = 0;

    // Kursor trzymamy poza kadrem, żeby siatka startowała w spoczynku.
    const mysz = { x: -9999, y: -9999 };

    const zbuduj = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      szer = r.width;
      wys = r.height;
      canvas.width = Math.round(szer * dpr);
      canvas.height = Math.round(wys * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      kropki = [];
      for (let y = ODSTEP / 2; y < wys; y += ODSTEP) {
        for (let x = ODSTEP / 2; x < szer; x += ODSTEP) {
          kropki.push({
            x,
            y,
            faza: Math.random() * Math.PI * 2,
            tempo: 0.8 + Math.random() * 1.4,
            nachylenie: Math.random() * Math.PI,
            sila: 0,
          });
        }
      }
    };

    // Rysowanie oddzielone od pętli: dzięki temu siatka pojawia się od razu
    // po zbudowaniu, nawet jeśli przeglądarka dławi klatki animacji (tak jest
    // np. w karcie w tle). Bez tego prawa połowa bywała po prostu pusta.
    // Kropki w spoczynku rysujemy JEDNĄ ścieżką i jednym kolorem, a osobno
    // tylko te w zasięgu kursora. Wcześniej każda z ~950 kropek dostawała
    // własną ścieżkę i własny łańcuch koloru, czyli kilkadziesiąt tysięcy
    // alokacji na sekundę. To była główna przyczyna zacinania.
    //
    // Gdy nic się nie rusza i kursor jest poza zasięgiem, klatkę pomijamy
    // w całości — statyczna siatka została już namalowana.
    let bylRuch = true;

    const rysuj = () => {
      let aktywnych = 0;
      for (const k of kropki) {
        const dx = mysz.x - k.x;
        const dy = mysz.y - k.y;
        const cel =
          Math.abs(dx) > ZASIEG || Math.abs(dy) > ZASIEG
            ? 0
            : Math.max(0, 1 - Math.hypot(dx, dy) / ZASIEG);
        k.sila += (cel - k.sila) * 0.12;
        if (k.sila > 0.004) aktywnych++;
      }

      if (aktywnych === 0 && !bylRuch) return;
      bylRuch = aktywnych > 0;

      t += redukcja ? 0 : 0.016;
      ctx.clearRect(0, 0, szer, wys);

      // warstwa spoczynkowa — jedna ścieżka, jeden kolor
      ctx.beginPath();
      ctx.fillStyle = `rgba(${KOLOR_SPOCZYNEK[0]},${KOLOR_SPOCZYNEK[1]},${KOLOR_SPOCZYNEK[2]},0.7)`;
      for (const k of kropki) {
        if (k.sila > 0.004) continue;
        ctx.moveTo(k.x + 1.7, k.y);
        ctx.arc(k.x, k.y, 1.7, 0, Math.PI * 2);
      }
      ctx.fill();

      // warstwa aktywna — tylko kropki w zasięgu kursora
      for (const k of kropki) {
        if (k.sila <= 0.004) continue;
        const kat = t * k.tempo + k.faza;
        const orbita = k.sila * 16;
        const ox = Math.cos(kat) * orbita;
        const oy = Math.sin(kat) * orbita * 0.45;
        const px = k.x + ox * Math.cos(k.nachylenie) - oy * Math.sin(k.nachylenie);
        const py = k.y + ox * Math.sin(k.nachylenie) + oy * Math.cos(k.nachylenie);
        const m = k.sila;
        const r = Math.round(KOLOR_SPOCZYNEK[0] + (KOLOR_AKTYWNY[0] - KOLOR_SPOCZYNEK[0]) * m);
        const g = Math.round(KOLOR_SPOCZYNEK[1] + (KOLOR_AKTYWNY[1] - KOLOR_SPOCZYNEK[1]) * m);
        const b = Math.round(KOLOR_SPOCZYNEK[2] + (KOLOR_AKTYWNY[2] - KOLOR_SPOCZYNEK[2]) * m);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${0.7 + m * 0.3})`;
        ctx.arc(px, py, 1.7 + m * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const petla = () => {
      rysuj();
      klatka = requestAnimationFrame(petla);
    };

    // Nasłuch na OKNIE, nie na płótnie. Nad kanwą leży kolumna z treścią
    // i to ona dostawała zdarzenia myszy, przez co kropki nigdy nie widziały
    // kursora. Współrzędne przeliczamy względem prostokąta płótna, a gdy
    // kursor jest poza nim, odsuwamy punkt oddziaływania poza kadr.
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const poza = x < -ZASIEG || y < -ZASIEG || x > r.width + ZASIEG || y > r.height + ZASIEG;
      mysz.x = poza ? -9999 : x;
      mysz.y = poza ? -9999 : y;
    };
    const onLeave = () => {
      mysz.x = -9999;
      mysz.y = -9999;
    };

    zbuduj();
    rysuj(); // pierwsza klatka natychmiast
    klatka = requestAnimationFrame(petla);

    const obs = new ResizeObserver(() => {
      zbuduj();
      rysuj();
    });
    obs.observe(canvas);
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(klatka);
      obs.disconnect();
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 size-full" />;
}
