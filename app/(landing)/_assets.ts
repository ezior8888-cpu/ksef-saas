/**
 * Mapa zasobów landing page (szablon Zova, Lunis Design — licencja darmowa).
 *
 * Pliki zachowują oryginalne nazwy z Framera. Celowo: nazwy są losowe, ale
 * dzięki temu nie ma ryzyka pomylenia grafik przy przenoszeniu, a ten plik
 * daje im czytelne znaczenie. Wszystko leży u nas w `public/landing/`,
 * nic nie jest doładowywane z cudzego CDN-u.
 */

const IMG = '/landing/img';
const VID = '/landing/video';

export const asset = {
  logo: `${IMG}/oKmGzYlWFu13ruJRasum68wrh5Y.png`,

  hero: {
    /** Zrzut pulpitu pod hero — 969×579. */
    dashboard: `${IMG}/yy9Th00CLJit9boMtM5QSv5E.png`,
    /** Animowana ilustracja obok nagłówka — 365×274, to film, nie obrazek. */
    illustration: `${VID}/txJ5fZhOzNG9U4PHx7M8fWUdhmk.mp4`,
    doodle: `${IMG}/3hp2PhQEvuzet4mrhD2hYwztwQ.png`,
    /** Logotypy klientów w pasku pod hero — wysokość 26. */
    clientLogos: [
      `${IMG}/R2OYvPZhdcTBwh7SRH0mvzywjI.png`,
      `${IMG}/DWm8NxN5l4qOWkTkdZ1Q1rLXnDc.png`,
      `${IMG}/Dh1WasrtFb5FjG7c7ba7QktYpA.png`,
      `${IMG}/EvXJBu5zcC2UE2s1wSux4dNJvxA.png`,
    ],
  },

  whyUs: {
    shotA: `${IMG}/gzTQVUFwwf0la0bQKwIBZJdJ65g.png`,
    shotB: `${IMG}/GP1XZZQyaRya51s1iLAIPu3YI4I.png`,
    avatar: `${IMG}/94kzGZvBIAxtoOwhtMd3TIlJYEs.jpg`,
  },

  process: {
    stepA: `${IMG}/q63C3feF1T07ao8J6pXYGKq90cw.png`,
    stepB: `${IMG}/bwXI14UXIRLJ0oCk4pIx5OPE38.png`,
    stepC: `${IMG}/t7gIcXBwjoSXGYRjNn9WLwpULeg.png`,
  },

  integrations: {
    video: `${VID}/PB1ADLoEDoMOhwSkq96JzDDWlxo.mp4`,
    logos: [
      `${IMG}/Wo1avshHOsmlgXizFitfgPgrM.png`,
      `${IMG}/m7Dg9uyi7iZZXeom1aAT0HNaLuo.png`,
      `${IMG}/kdSRwwUBLTr3qoCktInSsPrAsY.png`,
      `${IMG}/gPEzEKsNKBusglCCgdohBhJTkLQ.png`,
      `${IMG}/d4zw59yiCvizhPBrX6XR1a3i0g.png`,
      `${IMG}/mRPVggevTajUi56CB7BsPw4Zu8.png`,
      `${IMG}/qX19pHwcGLkQazkSVSnd0NBbuOw.png`,
      `${IMG}/43XC4sMRfmz2QjPEqnLMuzcHn4.png`,
      `${IMG}/HWO53n84YoZks8jiMsjlhjouwA.png`,
    ],
  },

  testimonial: {
    portrait: `${IMG}/yRgu0hHKYUucboWBEXOHrK0vOU.png`,
    logo: `${IMG}/DWm8NxN5l4qOWkTkdZ1Q1rLXnDc.png`,
  },

  faq: { video: `${VID}/oTTB3qH2bsYMEyFZzUfN4A39uhc.mp4` },

  blog: [
    `${IMG}/R68oiXEuFsP2L3K2FOSqywEJsa4.png`,
    `${IMG}/3JpXcZ5EkSA0ODYl2R5anZWBvjc.png`,
    `${IMG}/BJT53IKNztUmssqXvvkrTpHFEhY.png`,
    `${IMG}/ds5iNL0LI0ZFRiRxqvtdHUBal8o.png`,
    `${IMG}/lCeNvnyGCctiMifPsHYWkdKYlYY.png`,
  ],

  /** Film w nagłówku listy wpisów — 400×325. */
  blogHero: `${VID}/Fkym4xUSeFPyCLvy4nYh2QRALcU.mp4`,

  contact: { video: `${VID}/xFa8xTukUIggR8hGr7JxZKUlRQ.mp4` },

  wave: `${IMG}/wGAHOWhVswEtWkOKTJN6s2CW0.svg`,

  about: {
    /** Film w nagłówku — 400×254. */
    hero: `${VID}/XsbctVRtvLemldF50MdIUZxBXCc.mp4`,
    /** Cztery kadry z biura, 400×400, pas pod nagłówkiem. */
    gallery: [
      `${IMG}/UjLAh1s7ty7HJE28FnWk0qZpa0.png`,
      `${IMG}/R7NNtI35yeDmaQ9rAAcL9kqWN0U.png`,
      `${IMG}/ML2EhspDjOewlhR4Mu5rf8vIXMA.png`,
      `${IMG}/wq2CMg89ksSqdwtxzKjT0Ao2al4.png`,
    ],
    /** Portret przy cytacie założyciela — 240×240. */
    founder: `${IMG}/4TmSrJCJHuEEY04elzA6KYDiaSA.png`,
    /** Zespół — 271×316 każdy. */
    team: [
      `${IMG}/4TmSrJCJHuEEY04elzA6KYDiaSA.png`,
      `${IMG}/USUEObF0JUZGvWprdX8VTUWdTo.png`,
      `${IMG}/F7jTygFOl6jyyaVIUj2INGsM0qw.png`,
      `${IMG}/jz6BDhx2KT1f30lh8rGYsW9Fo.png`,
    ],
    /** Film w sekcji rekrutacyjnej — 250×150. */
    career: `${VID}/ppmjq0EWXJtY5Ch0Zwzoeg7j1s.mp4`,
  },
} as const;
