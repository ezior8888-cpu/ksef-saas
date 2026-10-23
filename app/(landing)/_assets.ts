/**
 * Mapa zasobów landing page (szablon Zova, Lunis Design).
 *
 * LICENCJA (sprawdzone 15.10.2026): Zova to szablon PŁATNY z Framer
 * Marketplace (19 USD), nie darmowy, jak było tu napisane. Warunki Framera
 * (Community Terms) dają licencję na jeden projekt, pod warunkiem zapłaty.
 * Bez dowodu zakupu ilustracje, filmy i zdjęcia z tego pliku naruszają prawa
 * autorskie twórcy — przed startem potwierdź zakup (faktura/e-mail z Framera)
 * albo kup szablon, i trzymaj dowód. Zrzuty „produktu” z szablonu (panel
 * inwestycyjny Zova AI) nie są renderowane — pokazywały cudzy produkt.
 *
 * Pliki zachowują oryginalne nazwy z Framera. Celowo: nazwy są losowe, ale
 * dzięki temu nie ma ryzyka pomylenia grafik przy przenoszeniu, a ten plik
 * daje im czytelne znaczenie. Wszystko leży u nas w `public/landing/`,
 * nic nie jest doładowywane z cudzego CDN-u.
 */

const IMG = '/landing/img';
const VID = '/landing/video';

export const asset = {
  // Strona główna od 23.10.2026 nie korzysta z tych plików (app/(home)),
  // zostały tylko grafiki stron O nas i Blog.

  blog: [
    `${IMG}/R68oiXEuFsP2L3K2FOSqywEJsa4.png`,
    `${IMG}/3JpXcZ5EkSA0ODYl2R5anZWBvjc.png`,
    `${IMG}/BJT53IKNztUmssqXvvkrTpHFEhY.png`,
    `${IMG}/ds5iNL0LI0ZFRiRxqvtdHUBal8o.png`,
    `${IMG}/lCeNvnyGCctiMifPsHYWkdKYlYY.png`,
  ],

  /** Film w nagłówku listy wpisów: 400×325. */
  blogHero: `${VID}/Fkym4xUSeFPyCLvy4nYh2QRALcU.mp4`,

  about: {
    /** Film w nagłówku: 400×254. */
    hero: `${VID}/XsbctVRtvLemldF50MdIUZxBXCc.mp4`,
    /** Zespół: 271×316 każdy (TeamGrid, nierenderowany od 15.10.2026). */
    team: [
      `${IMG}/4TmSrJCJHuEEY04elzA6KYDiaSA.png`,
      `${IMG}/USUEObF0JUZGvWprdX8VTUWdTo.png`,
      `${IMG}/F7jTygFOl6jyyaVIUj2INGsM0qw.png`,
      `${IMG}/jz6BDhx2KT1f30lh8rGYsW9Fo.png`,
    ],
    /** Film w sekcji rekrutacyjnej: 250×150. */
    career: `${VID}/ppmjq0EWXJtY5Ch0Zwzoeg7j1s.mp4`,
  },
} as const;
