// Audyt 13 (RUN-*): blokada i rejestr połączeń wychodzących procesu `next start`.
//
// Ładowany przez NODE_OPTIONS="--require <ta ścieżka>". Każde połączenie TCP
// procesu serwera do adresu innego niż pętla zwrotna (localhost/127.0.0.0/8/::1)
// jest ZAPISYWANE (host, port, czas, stos wywołań skrócony do 3 ramek)
// do pliku JSONL wskazanego w AUDYT_EGRESS_LOG i PRZERYWANE, zanim cokolwiek
// wyjdzie z maszyny. Nie zapisuje treści żądań ani nagłówków.
//
// To narzędzie testowe. Nie jest częścią aplikacji i nie trafia do obrazu.
'use strict';

const fs = require('node:fs');
const net = require('node:net');

const LOG = process.env.AUDYT_EGRESS_LOG;
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0|::)$/i;

function record(entry) {
  if (!LOG) return;
  try {
    fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...entry }) + '\n');
  } catch {
    // Rejestr jest pomocniczy; brak zapisu nie może zmienić zachowania testu.
  }
}

function target(args) {
  let first = args[0];
  // net.connect() przekazuje do Socket#connect znormalizowaną tablicę [options, cb].
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === 'object') {
    if (first.path) return { path: String(first.path) };
    return { host: first.host ?? 'localhost', port: first.port };
  }
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(first) };
  }
  if (typeof first === 'string') return { path: first };
  return { host: 'nieznany' };
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function auditedConnect(...args) {
  const t = target(args);
  if (t.path || LOOPBACK.test(String(t.host))) {
    return originalConnect.apply(this, args);
  }
  const stack = (new Error().stack ?? '')
    .split('\n')
    .slice(2)
    .filter((line) => !line.includes('node:') && !line.includes('blokada-egress'))
    .slice(0, 3)
    .map((line) => line.trim().replace(/\(.*node_modules\//, '(node_modules/'));
  record({ kind: 'tcp_connect_blocked', host: String(t.host), port: t.port ?? null, stack });
  const socket = this;
  process.nextTick(() => {
    socket.destroy(Object.assign(new Error(`AUDYT: polaczenie wychodzace zablokowane (${t.host})`), { code: 'EAUDITBLOCKED' }));
  });
  return socket;
};

record({ kind: 'guard_loaded', node: process.version });
