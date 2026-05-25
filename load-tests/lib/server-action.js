import http from 'k6/http';
import { BASE_URL } from '../config.js';

// Wywołuje Next.js Server Action po stronie loadtestu.
//
// ID akcji to hash budowany w czasie `next build` i ZMIENIA SIĘ przy każdym
// deployu — dlatego nie da się go zahardkodować. Przekazujemy je przez
// `-e ACTION_<NAZWA>=<hash>`. Sposób wyciągnięcia ID z deployu opisuje runbook
// z Kroku 7 (Network tab → nagłówek `Next-Action`).
//
// Gdy ID nie jest podane, funkcja zwraca null i loguje pominięcie raz —
// scenariusz leci dalej bez wywrotki, a krok mutacji po prostu nie jest
// mierzony. Trzon obciążenia (page loady / RSC) pozostaje wiarygodny.

const warned = {};

export function serverAction(pagePath, actionEnvKey, args, label) {
  const actionId = __ENV[actionEnvKey];
  if (!actionId) {
    if (!warned[actionEnvKey]) {
      console.warn(
        `[server-action] Pomijam "${label}" — brak -e ${actionEnvKey}=<id>. ` +
          'Zob. runbook load-testów (Krok 7).',
      );
      warned[actionEnvKey] = true;
    }
    return null;
  }

  // Server Action wywoływany "po RSC" — Next oczekuje POST na ścieżkę strony
  // z nagłówkiem `Next-Action` i serializowanymi argumentami w body.
  return http.post(`${BASE_URL}${pagePath}`, JSON.stringify(args), {
    headers: {
      'Content-Type': 'application/json',
      'Next-Action': actionId,
      Accept: 'text/x-component',
    },
    tags: { name: label },
  });
}

// Czy dany Server Action jest skonfigurowany (ID podane w env).
export function hasAction(actionEnvKey) {
  return !!__ENV[actionEnvKey];
}
