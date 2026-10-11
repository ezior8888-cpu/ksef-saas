#!/usr/bin/env node
// Audyt 13 (RUN-*): lokalny „sinkhole” udający proxy HTTP dla procesu `next start`.
//
// Procesowi serwera ustawiamy HTTP(S)_PROXY na ten adres. Biblioteki, które
// szanują zmienne proxy (np. transport Sentry dla Node), łączą się tutaj
// zamiast z dostawcą. Sinkhole zapisuje TYLKO rodzaj żądania, docelowy host
// i metodę (bez ścieżki, nagłówków i treści) do pliku JSONL i odpowiada 403 —
// nic nie wychodzi poza maszynę.
//
// Uruchomienie: SINKHOLE_PORT=3199 SINKHOLE_LOG=/ścieżka.jsonl node sinkhole-proxy.mjs
// Narzędzie testowe, nie część aplikacji.
import fs from 'node:fs';
import http from 'node:http';

const PORT = Number(process.env.SINKHOLE_PORT ?? 3199);
const LOG = process.env.SINKHOLE_LOG;

function record(entry) {
  if (!LOG) return;
  try {
    fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch {
    // rejestr pomocniczy
  }
}

const srv = http.createServer((req, res) => {
  let host = 'nieznany';
  try { host = new URL(req.url).host; } catch { host = req.headers.host ?? 'nieznany'; }
  record({ kind: 'http_via_proxy_blocked', host, method: req.method });
  req.resume();
  res.writeHead(403, { 'content-type': 'text/plain' });
  res.end('AUDYT: ruch wychodzacy zablokowany');
});

srv.on('connect', (req, socket) => {
  record({ kind: 'connect_tunnel_blocked', host: req.url });
  socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
});

srv.listen(PORT, '127.0.0.1', () => {
  record({ kind: 'sinkhole_started', port: PORT });
  console.log(`sinkhole-proxy na 127.0.0.1:${PORT}`);
});
