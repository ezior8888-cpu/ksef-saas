import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL } from './config.js';
import { checkApi } from './lib/checks.js';

// Smoke test — minimalny scenariusz weryfikujący, że harness k6 działa i
// środowisko docelowe (BASE_URL) odpowiada. NIE obciąża; uruchamiany przez
// `pnpm load:smoke` zanim odpalimy właściwe profile obciążenia.
export const options = {
  vus: 3,
  duration: '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`, { tags: { name: 'health' } });
  checkApi(res, 'health');
  sleep(1);
}
