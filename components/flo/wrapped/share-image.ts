/**
 * Obraz do zapisania — 9:16, ten sam kod dla podsumowania roku (krok 37)
 * i dla progów pieniężnych (krok 38).
 *
 * DWIE ZASADY, KTÓRE TU RZĄDZĄ:
 *
 * 1. ZAPIS NIE ZALEŻY OD ANIMACJI. Obraz powstaje z opisu tekstowego (SVG),
 *    a nie ze zrzutu ekranu — więc działa tak samo na telefonie, który
 *    animacji nie odtworzył, jak i przy włączonym „ogranicz ruch”.
 *
 * 2. CO WIDAĆ W PODGLĄDZIE, TO WYJDZIE W PLIKU. Podgląd rysuje DOKŁADNIE ten
 *    sam napis SVG, który potem trafia na płótno. Nie ma tu dwóch ścieżek,
 *    które mogłyby się rozjechać — a to jest ekran, z którego ludzie robią
 *    wpisy w mediach społecznościowych i nie mogą się dowiedzieć po fakcie,
 *    że w pliku była nazwa klienta.
 *
 * Kolory zapisujemy WPROST, nie zmiennymi `--ff-*`: płótno nie ma dostępu do
 * arkusza stylów strony, a obraz ma wyglądać tak samo u każdego.
 */

export interface ShareImageInput {
  /** Nagłówek nad liczbą, np. „Wystawione faktury”. Przy progach pusty. */
  label?: string;
  /** Jedna liczba jako gotowy napis. */
  value: string;
  /** Podpis pod liczbą. */
  caption: string;
  /** Stopka, np. „FaktFlow · 2026”. */
  footer: string;
}

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1920;

const BG = '#0d1117';
const TEXT = '#f4f6f8';
const MUTED = '#8a94a3';
const ACCENT = '#2563eb';

/** Znaki, które w XML muszą być zapisane bytem — inaczej SVG się nie sparsuje. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Dzieli długi napis na wiersze o zadanej liczbie znaków. Prymitywne, ale
 * przewidywalne — SVG nie zawija tekstu samo, a mierzenie szerokości czcionki
 * na serwerze wymagałoby wciągnięcia biblioteki dla jednego ekranu.
 */
function wrap(text: string, perLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > perLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

/** Rozmiar liczby dobrany do jej długości — „22 140,00 zł” i „7” mają zmieścić się tak samo. */
function valueSize(value: string): number {
  if (value.length <= 6) return 190;
  if (value.length <= 10) return 140;
  if (value.length <= 16) return 104;
  return 78;
}

export function buildShareSvg(input: ShareImageInput): string {
  const captionLines = wrap(input.caption, 34).slice(0, 3);

  // Długi napis w miejscu liczby (próg pieniężny podaje całe zdanie) łamiemy
  // na dwa wiersze zamiast zmniejszać go do nieczytelności.
  const valueLines = input.value.length > 18 ? wrap(input.value, 18).slice(0, 2) : [input.value];
  const size = valueLines.length > 1 ? 96 : valueSize(input.value);

  const caption = captionLines
    .map(
      (line, index) =>
        `<text x="${SHARE_WIDTH / 2}" y="${1180 + index * 62}" fill="${MUTED}" font-size="44" text-anchor="middle" font-family="system-ui, sans-serif">${escapeXml(line)}</text>`,
    )
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}">`,
    `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="${BG}"/>`,
    `<circle cx="${SHARE_WIDTH / 2}" cy="760" r="14" fill="${ACCENT}"/>`,
    input.label
      ? `<text x="${SHARE_WIDTH / 2}" y="880" fill="${MUTED}" font-size="46" text-anchor="middle" font-family="system-ui, sans-serif" letter-spacing="6">${escapeXml(input.label.toUpperCase())}</text>`
      : '',
    valueLines
      .map(
        (line, index) =>
          `<text x="${SHARE_WIDTH / 2}" y="${1060 + index * (size + 14)}" fill="${TEXT}" font-size="${size}" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif">${escapeXml(line)}</text>`,
      )
      .join(''),
    caption,
    `<text x="${SHARE_WIDTH / 2}" y="1780" fill="${MUTED}" font-size="38" text-anchor="middle" font-family="system-ui, sans-serif">${escapeXml(input.footer)}</text>`,
    `</svg>`,
  ].join('');
}

/** SVG jako adres danych — do podglądu w `<img>` i do narysowania na płótnie. */
export function shareSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Zamienia SVG na PNG w przeglądarce.
 *
 * Świadomie przez płótno, a nie przez `<a download>` z adresem SVG: część
 * telefonów zapisuje wtedy plik, którego galeria nie otwiera. PNG otwiera się
 * wszędzie, a o to w tym ekranie chodzi.
 */
export async function shareSvgToPngBlob(svg: string): Promise<Blob> {
  const image = new Image();
  image.decoding = 'sync';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Nie udało się przygotować obrazu.'));
    image.src = shareSvgDataUrl(svg);
  });

  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Ta przeglądarka nie umie zapisać obrazu.');

  context.drawImage(image, 0, 0, SHARE_WIDTH, SHARE_HEIGHT);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Nie udało się zapisać obrazu.'));
    }, 'image/png');
  });
}
