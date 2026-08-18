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
  ],

  contact: { video: `${VID}/xFa8xTukUIggR8hGr7JxZKUlRQ.mp4` },

  wave: `${IMG}/wGAHOWhVswEtWkOKTJN6s2CW0.svg`,
} as const;
