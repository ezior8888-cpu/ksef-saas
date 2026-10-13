// Audyt 13 (RUN-*): blokada i rejestr połączeń wychodzących procesu `next start`.
//
// Ładowany przez NODE_OPTIONS="--require <ta ścieżka>" (dziedziczą go też
// procesy potomne Node). Każde połączenie TCP procesu serwera:
//   - do adresu innego niż pętla zwrotna (localhost / 127.0.0.0/8 / ::1) albo
//   - do pętli zwrotnej na porcie lokalnego proxy wyjściowego (porty wzięte ze
//     zmiennych *_PROXY w chwili startu oraz z AUDYT_BLOCKED_PORTS) —
//     bo proxy na 127.0.0.1 wypuściłoby ruch dalej,
// jest ZAPISYWANE (host, port, czas, skrócony stos wywołań) do pliku JSONL
// wskazanego w AUDYT_EGRESS_LOG i PRZERYWANE, zanim cokolwiek wyjdzie z maszyny.
// Bezpośrednie zapytania DNS o nazwy spoza pętli zwrotnej też są zapisywane
// i odrzucane (ENOTFOUND), żeby nazwy hostów nie trafiały do resolvera.
// Wyjątek: port z AUDYT_SINKHOLE_PORT (narzedzia/sinkhole-proxy.mjs) — lokalny
// rejestrator, który niczego nie przekazuje dalej; ustawiony jako HTTP(S)_PROXY
// procesu serwera pozwala zobaczyć docelowy host bibliotek używających proxy.
// Nie zapisuje treści żądań, wartości nagłówków ani wartości zmiennych
// (dla żądań przychodzących do /ingest i /monitoring — tylko NAZWY nagłówków
// i ciasteczek).
//
// To narzędzie testowe. Nie jest częścią aplikacji i nie trafia do obrazu.
'use strict';

const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');

const LOG = process.env.AUDYT_EGRESS_LOG;
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|::ffff:127\.\d+\.\d+\.\d+|0\.0\.0\.0|::)$/i;

// Porty proxy na pętli zwrotnej — tunel przez nie wychodzi poza maszynę.
const BLOCKED_LOOPBACK_PORTS = new Set();
for (const [k, v] of Object.entries(process.env)) {
  if (!/_proxy$/i.test(k) || !v) continue;
  try {
    const u = new URL(v.includes('://') ? v : `http://${v}`);
    if (LOOPBACK.test(u.hostname) && u.port) BLOCKED_LOOPBACK_PORTS.add(Number(u.port));
  } catch {
    // wartość nie jest adresem URL (np. lista NO_PROXY) — pomijamy
  }
}
for (const p of (process.env.AUDYT_BLOCKED_PORTS ?? '').split(',')) {
  if (/^\d+$/.test(p.trim())) BLOCKED_LOOPBACK_PORTS.add(Number(p.trim()));
}
// Lokalny sinkhole (narzedzia/sinkhole-proxy.mjs) wolno osiągnąć: niczego nie
// przekazuje dalej, tylko zapisuje docelowy host i odpowiada 403.
if (/^\d+$/.test(process.env.AUDYT_SINKHOLE_PORT ?? '')) {
  BLOCKED_LOOPBACK_PORTS.delete(Number(process.env.AUDYT_SINKHOLE_PORT));
}

function record(entry) {
  if (!LOG) return;
  try {
    fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...entry }) + '\n');
  } catch {
    // Rejestr jest pomocniczy; brak zapisu nie może zmienić zachowania testu.
  }
}

function shortStack() {
  return (new Error().stack ?? '')
    .split('\n')
    .slice(3)
    .filter((line) => !line.includes('node:') && !line.includes('blokada-egress'))
    .slice(0, 4)
    .map((line) => line.trim().replace(/\(.*node_modules\//, '(node_modules/').replace(/\(.*\.next\//, '(.next/'));
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
  if (t.path) return originalConnect.apply(this, args); // gniazdo uniksowe (IPC) — lokalne
  const host = String(t.host);
  const isLoopback = LOOPBACK.test(host);
  const viaProxy = isLoopback && BLOCKED_LOOPBACK_PORTS.has(Number(t.port));
  if (isLoopback && !viaProxy) return originalConnect.apply(this, args);
  record({
    kind: viaProxy ? 'tcp_connect_blocked_loopback_proxy' : 'tcp_connect_blocked',
    host,
    port: t.port ?? null,
    stack: shortStack(),
  });
  const socket = this;
  process.nextTick(() => {
    socket.destroy(Object.assign(new Error(`AUDYT: polaczenie wychodzace zablokowane (${host}:${t.port ?? '?'})`), { code: 'EAUDITBLOCKED' }));
  });
  return socket;
};

function dnsBlocked(hostname) {
  return Object.assign(new Error(`AUDYT: zapytanie DNS zablokowane (${hostname})`), { code: 'ENOTFOUND', hostname });
}

const originalLookup = dns.lookup;
dns.lookup = function auditedLookup(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  if (typeof hostname !== 'string' || LOOPBACK.test(hostname) || net.isIP(hostname)) {
    return originalLookup.apply(this, arguments);
  }
  record({ kind: 'dns_lookup_blocked', host: hostname, stack: shortStack() });
  if (typeof cb === 'function') process.nextTick(() => cb(dnsBlocked(hostname)));
  return {};
};

const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = async function auditedPromisesLookup(hostname, options) {
  if (typeof hostname !== 'string' || LOOPBACK.test(hostname) || net.isIP(hostname)) {
    return originalPromisesLookup.call(this, hostname, options);
  }
  record({ kind: 'dns_lookup_blocked', host: hostname, stack: shortStack() });
  throw dnsBlocked(hostname);
};

// Rejestr żądań PRZYCHODZĄCYCH do proxy pierwszej strony, które serwer
// przekazuje dostawcom (`/ingest/*` → PostHog, `/monitoring` → Sentry).
// Pozwala zobaczyć żądania, których przeglądarka nie dała przechwycić
// (np. wysyłane przy zamykaniu strony albo przez service workera).
// Zapisuje tylko metodę, ścieżkę BEZ query, nagłówki Sec-Fetch-*, NAZWY
// nagłówków i NAZWY ciasteczek (bez wartości) — żeby sprawdzić, co proxy
// pierwszej strony (httpxy kopiuje nagłówki żądania przychodzącego do żądania
// do dostawcy) przekazałoby dalej.
const http = require('node:http');
const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function auditedEmit(event, req) {
  if (event === 'request' && req && typeof req.url === 'string') {
    const pathname = req.url.split('?')[0];
    if (pathname.startsWith('/ingest') || pathname === '/monitoring' || pathname.startsWith('/monitoring/')) {
      const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
      record({
        kind: 'incoming_vendor_proxy_request',
        method: req.method,
        path: pathname,
        sec_fetch_mode: req.headers['sec-fetch-mode'] ?? null,
        sec_fetch_dest: req.headers['sec-fetch-dest'] ?? null,
        service_worker: req.headers['service-worker'] ?? null,
        header_names: Object.keys(req.headers).sort(),
        cookie_names: cookieHeader.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean),
      });
    }
  }
  return originalEmit.apply(this, arguments);
};

record({ kind: 'guard_loaded', node: process.version, blocked_loopback_ports: [...BLOCKED_LOOPBACK_PORTS] });
