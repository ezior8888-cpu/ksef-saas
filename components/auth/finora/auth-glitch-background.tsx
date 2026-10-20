'use client'

// Plan Finora P15 (E10b): tło prawej połowy ekranów logowania. Finora woła
// `<LetterGlitch />` z zielenią `#5ee9b5`/`#00bc7d`/`#009966` na czarnym.
// U nas (plan §5 P15, §10.4): trzy odcienie wykresów presetu D2
// (`--chart-1..3` z `app/globals.css` — od jaśniejszego do ciemniejszego, jak
// zielenie Finory), znaki od „zł”, tło `#000000` i winieta jak w Finorze
// (na sztywno w obu motywach).

// Component Imports
import LetterGlitch from '@/components/ui/letter-glitch'

/** Zestaw Finory (`र€£¥₽₩₺₴₦₱₲₵₡₢₭`) z „zł” na początku zamiast rupii. */
export const AUTH_GLITCH_CHARACTERS = 'zł€£¥₽₩₺₴₦₱₲₵₡₢₭'

export const AUTH_GLITCH_COLOR_VARS = ['--chart-1', '--chart-2', '--chart-3'] as const

/**
 * Te same trzy odcienie w hex — na pierwszą klatkę (zanim przeczytamy
 * zmienne) i dla przeglądarki, która nie zna `oklch()`. Wartości to
 * `--chart-1..3` presetu z `app/globals.css` przeliczone na sRGB (pilnuje
 * tego `tests/unit/finora-logowanie.test.tsx`).
 */
export const AUTH_GLITCH_FALLBACK = {
  light: ['#3981f6', '#2463ef', '#1d4eda'],
  dark: ['#61a4f7', '#3981f6', '#2463ef']
} as const

const toHex = (value: number) => value.toString(16).padStart(2, '0')

/** RGBA z `getImageData` → `#rrggbb`; piksel przezroczysty = brak koloru. */
export function pixelToHex(pixel: ArrayLike<number>): string | null {
  if (pixel.length < 4 || pixel[3] === 0) return null

  return `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`
}

const SENTINEL = '#010203'

/**
 * Zamienia dowolny kolor CSS (np. `oklch(0.62 0.19 259.76)`) na hex przez
 * kanwę 1×1. Gdy przeglądarka nie zna zapisu, `fillStyle` zostaje przy
 * poprzedniej wartości — wtedy zwracamy `null`.
 */
export function resolveCssColor(ctx: CanvasRenderingContext2D, value: string): string | null {
  const color = value.trim()

  if (!color) return null

  ctx.fillStyle = SENTINEL
  ctx.fillStyle = color

  if (String(ctx.fillStyle).toLowerCase() === SENTINEL && color.toLowerCase() !== SENTINEL) return null

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)

  return pixelToHex(ctx.getImageData(0, 0, 1, 1).data)
}

// Finora ma tło ekranów logowania na sztywno czarne (`#000000`) i ciemną
// winietę w OBU motywach, więc zawsze bierzemy ciemny zestaw kolorów presetu
// (jaśniejsze odcienie czytelne na czerni), bez czytania motywu.
export function AuthGlitchBackground() {
  return <LetterGlitch glitchColors={[...AUTH_GLITCH_FALLBACK.dark]} characters={AUTH_GLITCH_CHARACTERS} />
}
