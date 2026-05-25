import { check } from 'k6';

// Standardowy zestaw asercji dla odpowiedzi API. `label` trafia do nazw checków
// w summary k6, więc po teście widać dokładnie, który endpoint zawiódł.
export function checkApi(res, label) {
  return check(res, {
    [`${label}: status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${label}: body niepusty`]: (r) => !!r.body && r.body.length > 0,
  });
}

// Asercje dla odpowiedzi zwracających pełną stronę HTML (SSR / RSC).
export function checkPage(res, label) {
  return check(res, {
    [`${label}: status 200`]: (r) => r.status === 200,
    [`${label}: typ HTML`]: (r) =>
      (r.headers['Content-Type'] || '').includes('text/html'),
  });
}

// Asercja dla endpointów akceptujących pracę asynchronicznie (np. enqueue do
// Inngest) — oczekujemy 2xx LUB 202 Accepted.
export function checkAccepted(res, label) {
  return check(res, {
    [`${label}: status 2xx/202`]: (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 202,
  });
}
