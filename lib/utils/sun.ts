// Oblicza godzinę wschodu i zachodu słońca dla danej szerokości/długości geograficznej.
// Algorytm: uproszczony NOAA Solar Calculations (kąt godzinny + deklinacja).

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

export function calculateSunTimes(
  date: Date,
  latitude: number,
  longitude: number
): SunTimes {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );

  // Solar declination (°)
  const declination =
    23.45 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);

  const latRad = (latitude * Math.PI) / 180;
  const decRad = (declination * Math.PI) / 180;

  // Hour angle for sunset/sunrise
  const cosH = -Math.tan(latRad) * Math.tan(decRad);
  if (cosH > 1 || cosH < -1) {
    // Polar day/night — przybliżone godziny lokalne
    return {
      sunrise: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        7,
        0
      ),
      sunset: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        17,
        0
      ),
    };
  }

  const hourAngle = (Math.acos(cosH) * (180 / Math.PI)) / 15; // hours

  // Solar noon (UTC)
  const noonUTC = 12 - longitude / 15;

  const sunriseUTC = noonUTC - hourAngle;
  const sunsetUTC = noonUTC + hourAngle;

  const tzOffset = -date.getTimezoneOffset() / 60;

  const toDate = (utcHours: number) => {
    const localHours = utcHours + tzOffset;
    const h = Math.floor(localHours);
    const m = Math.floor((localHours - h) * 60);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  };

  return {
    sunrise: toDate(sunriseUTC),
    sunset: toDate(sunsetUTC),
  };
}

/** Domyślne współrzędne — środek Polski (okolice Łodzi). */
export const POLAND_CENTER = { lat: 52.07, lng: 19.48 };
