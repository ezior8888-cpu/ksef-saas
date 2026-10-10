#!/usr/bin/env node
// Audyt 13 „Prywatność i zgodność” — test runtime (RUN-*).
//
// Co robi: otwiera publiczne strony aplikacji w świeżych kontekstach Chromium
// i dla scenariuszy (a) brak wyboru, (b) odmowa, (c) akceptacja,
// (d) wycofanie, (e) kontrole dodatkowe zapisuje:
//   - każde żądanie do innej domeny niż aplikacja (metoda, host, ścieżka BEZ
//     query stringu, typ zasobu, etap) — i PRZERYWA je (`route.abort()`),
//   - żądania do proxy pierwszej strony, które serwer przekazałby dostawcy
//     (`/ingest/*` → PostHog, `/monitoring` → Sentry) — też PRZERYWA,
//     zapisując tylko nazwy zdarzeń / typy elementów koperty i nazwy pól,
//   - nagłówki Set-Cookie z odpowiedzi aplikacji (nazwa + atrybuty, bez wartości),
//   - `context.cookies()`, klucze localStorage / sessionStorage (bez wartości,
//     poza znacznikami zgody), nazwy baz IndexedDB, `caches.keys()`,
//     rejestracje service workera,
//   - połączenia, które ominęłyby przechwytywanie (np. `<link rel=preconnect>`):
//     Chromium dostaje jako proxy lokalny „sinkhole”, który zapisuje host
//     i odrzuca połączenie. Dzięki temu nic nie wychodzi z maszyny.
//
// Uruchomienie (aplikacja musi działać, np. `pnpm start -p 3100`):
//   node docs/audyt/13-prywatnosc-i-zgodnosc/narzedzia/test-cookies-i-sieci.mjs
// Zmienne (opcjonalne): BASE_URL (domyślnie http://localhost:3100),
//   WAIT_MS (5000), OUT (ścieżka JSON), CHROMIUM_PATH (plik wykonywalny).
//
// Wynik nie zawiera wartości cookies ani tokenów. Narzędzie testowe, nie
// część aplikacji.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const APP_ORIGIN = new URL(BASE_URL).origin;
const WAIT_MS = Number(process.env.WAIT_MS ?? 5000);
const OUT = process.env.OUT ?? path.join(HERE, 'wynik-test-cookies.json');

const CONSENT_KEY = 'ff_analytics_consent';
const CONSENT_EVENT = 'ff:analytics-consent';
const BANNER_TEXT = 'Analityka i pomoc w rozwoju produktu';

const STRONY = [
  { id: 'landing', path: '/' },
  { id: 'cennik', path: '/pricing' },
  { id: 'polityka-prywatnosci', path: '/legal/polityka-prywatnosci' },
  { id: 'login', path: '/login' },
  { id: 'register', path: '/register' },
  { id: 'forgot-password', path: '/forgot-password' },
  { id: 'kontakt', path: '/kontakt' },
  { id: 'blog-wpis', path: '/blog/ksef-2-co-warto-wiedziec' },
  { id: 'pomoc', path: '/pomoc' },
  { id: 'blog-404', path: '/blog/nie-istnieje-audyt-13' },
];

// ── stan globalny rejestru ───────────────────────────────────────────────
const zadania = []; // żądania zewnętrzne i do proxy dostawców (przerwane)
const setCookies = []; // nagłówki Set-Cookie z odpowiedzi aplikacji
const migawki = []; // stan magazynów po każdym kroku
const sinkhole = []; // połączenia, które próbowały ominąć przechwytywanie
const uwagi = [];
let etap = { scenariusz: 'init', krok: 'init' };

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort();
    for (const d of dirs.reverse()) {
      const p = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch {
    // brak katalogu — Playwright użyje własnej przeglądarki
  }
  return undefined;
}

// ── klasyfikacja żądań ───────────────────────────────────────────────────
function kategoria(url) {
  const u = new URL(url);
  if (u.origin === APP_ORIGIN) {
    if (u.pathname.startsWith('/ingest')) return 'proxy-1st-party→PostHog (/ingest)';
    if (u.pathname === '/monitoring' || u.pathname.startsWith('/monitoring/')) return 'proxy-1st-party→Sentry (/monitoring)';
    return null; // zwykły zasób aplikacji — przepuszczamy
  }
  const h = u.hostname;
  if (h === '127.0.0.1' && u.port === '54321') return 'Supabase (adres syntetyczny; produkcyjnie własny backend)';
  if (h === 'fonts.googleapis.com') return 'Google Fonts (CSS)';
  if (h === 'fonts.gstatic.com') return 'Google Fonts (pliki fontów)';
  if (h === 'challenges.cloudflare.com') return 'Cloudflare Turnstile';
  if (h.endsWith('stripe.com') || h.endsWith('stripe.network')) return 'Stripe';
  if (h.endsWith('sentry.io')) return 'Sentry (bezpośrednio)';
  if (h.endsWith('posthog.com')) return 'PostHog (bezpośrednio)';
  if (h.endsWith('googleusercontent.com')) return 'Google (awatary)';
  return 'inna domena zewnętrzna';
}

function bezpiecznaSciezka(url) {
  const u = new URL(url);
  // Usuwamy query i fragment; ścieżki Turnstile / fontów nie zawierają danych osoby.
  return u.pathname;
}

function streszczeniePostHog(request) {
  const buf = request.postDataBuffer();
  if (!buf || buf.length === 0) return null;
  let text = null;
  try {
    const u = new URL(request.url());
    const gz = (u.searchParams.get('compression') ?? '').includes('gzip') || (buf[0] === 0x1f && buf[1] === 0x8b);
    text = gz ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    if (text.startsWith('data=')) {
      text = Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString('utf8');
    }
    let parsed = JSON.parse(text);
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.batch)) parsed = parsed.batch;
    const lista = Array.isArray(parsed) ? parsed : [parsed];
    return lista.map((ev) => {
      const props = ev?.properties ?? {};
      const urlProps = {};
      for (const k of ['$current_url', '$pathname', '$referrer', '$initial_current_url', '$initial_referrer']) {
        if (typeof props[k] === 'string') urlProps[k] = props[k];
      }
      return {
        zdarzenie: ev?.event ?? null,
        pola: Object.keys(props).filter((k) => k !== 'token').sort(),
        ma_distinct_id: 'distinct_id' in props,
        wartosci_url: urlProps,
      };
    });
  } catch (err) {
    return [{ nieodczytane: String(err?.message ?? err).slice(0, 80), bajty: buf.length }];
  }
}

const SENTRY_ITEM_HEADER_KEYS = new Set(['type', 'length', 'content_type', 'filename', 'attachment_type', 'item_count', 'platform']);
function streszczenieSentry(request) {
  const buf = request.postDataBuffer();
  if (!buf || buf.length === 0) return null;
  const linie = buf.toString('utf8').split('\n').filter(Boolean);
  const wynik = { naglowek_koperty_pola: [], elementy: [] };
  let oczekujPayload = null;
  linie.forEach((linia, i) => {
    let obj;
    try { obj = JSON.parse(linia); } catch { return; }
    if (i === 0) { wynik.naglowek_koperty_pola = Object.keys(obj).sort(); return; }
    if (oczekujPayload) {
      oczekujPayload.pola_payloadu = obj && typeof obj === 'object' ? Object.keys(obj).sort() : [];
      if (obj?.attrs && typeof obj.attrs === 'object') oczekujPayload.pola_attrs = Object.keys(obj.attrs).sort();
      if (obj?.user && typeof obj.user === 'object') oczekujPayload.pola_user = Object.keys(obj.user).sort();
      oczekujPayload = null;
      return;
    }
    if (obj && typeof obj.type === 'string' && Object.keys(obj).every((k) => SENTRY_ITEM_HEADER_KEYS.has(k))) {
      const el = { typ: obj.type };
      wynik.elementy.push(el);
      oczekujPayload = el;
    }
  });
  return wynik;
}

// ── parsowanie Set-Cookie (bez wartości) ─────────────────────────────────
function parsujSetCookie(linia) {
  const czesci = linia.split(';').map((s) => s.trim());
  const [nazwaWartosc, ...atr] = czesci;
  const nazwa = nazwaWartosc.split('=')[0];
  const wartosc = nazwaWartosc.slice(nazwa.length + 1);
  const a = { nazwa, pusta_wartosc: wartosc === '' };
  for (const at of atr) {
    const [k, ...v] = at.split('=');
    const key = k.toLowerCase();
    const val = v.join('=');
    if (key === 'httponly') a.HttpOnly = true;
    else if (key === 'secure') a.Secure = true;
    else if (key === 'samesite') a.SameSite = val;
    else if (key === 'max-age') a['Max-Age'] = val;
    else if (key === 'expires') a.Expires = val;
    else if (key === 'path') a.Path = val;
    else if (key === 'domain') a.Domain = val;
  }
  return a;
}

// ── migawka magazynów ────────────────────────────────────────────────────
async function migawka(page, context, opis) {
  const ciasteczka = (await context.cookies()).map((c) => ({
    nazwa: c.name,
    domena: c.domain,
    sciezka: c.path,
    wygasa: c.expires === -1 ? 'sesja' : new Date(c.expires * 1000).toISOString(),
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
  }));
  let mag = null;
  try {
    mag = await page.evaluate(async ({ CONSENT_KEY }) => {
      const pokazWartosc = (k) => k === CONSENT_KEY || k.startsWith('__ph_opt_in_out_');
      const ls = [];
      const ss = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          ls.push(pokazWartosc(k) ? { klucz: k, wartosc: localStorage.getItem(k) } : { klucz: k });
        }
      } catch (e) { ls.push({ blad: String(e) }); }
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          ss.push({ klucz: k });
        }
      } catch (e) { ss.push({ blad: String(e) }); }
      let idb = null;
      try { idb = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : 'brak API'; } catch (e) { idb = String(e); }
      let cache = null;
      try {
        if ('caches' in self) {
          cache = [];
          for (const k of await caches.keys()) {
            const c = await caches.open(k);
            const keys = await c.keys();
            const hosty = [...new Set(keys.map((r) => new URL(r.url).host))];
            cache.push({ nazwa: k, wpisow: keys.length, hosty });
          }
        } else cache = 'brak API';
      } catch (e) { cache = String(e); }
      let sw = null;
      try {
        sw = navigator.serviceWorker
          ? (await navigator.serviceWorker.getRegistrations()).map((r) => ({
              scope: new URL(r.scope).pathname,
              skrypt: r.active ? new URL(r.active.scriptURL).pathname : (r.installing || r.waiting) ? 'instalowany' : null,
            }))
          : 'brak API';
      } catch (e) { sw = String(e); }
      const docCookie = document.cookie ? document.cookie.split(';').map((c) => c.trim().split('=')[0]) : [];
      return { localStorage: ls, sessionStorage: ss, indexedDB: idb, cacheStorage: cache, serviceWorker: sw, document_cookie_nazwy: docCookie };
    }, { CONSENT_KEY });
  } catch (err) {
    mag = { blad: String(err?.message ?? err).slice(0, 200) };
  }
  const banner = await page.getByText(BANNER_TEXT).isVisible().catch(() => false);
  const m = { ...etap, opis, url: new URL(page.url()).pathname, banner_widoczny: banner, ciasteczka, ...mag };
  migawki.push(m);
  return m;
}

// ── sinkhole proxy dla Chromium ──────────────────────────────────────────
function uruchomSinkhole() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let host = 'nieznany';
      try { host = new URL(req.url).host; } catch { /* ignore */ }
      sinkhole.push({ ...etap, rodzaj: 'HTTP przez proxy', host, metoda: req.method, ts: new Date().toISOString() });
      res.writeHead(403); res.end();
    });
    srv.on('connect', (req, socket) => {
      sinkhole.push({ ...etap, rodzaj: 'CONNECT (np. preconnect / tunel TLS)', host: req.url, ts: new Date().toISOString() });
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ── kontekst z przechwytywaniem ──────────────────────────────────────────
async function nowyKontekst(browser) {
  const context = await browser.newContext({ locale: 'pl-PL', serviceWorkers: 'allow' });
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (!/^https?:/.test(url)) return route.continue();
    const kat = kategoria(url);
    if (kat === null) return route.continue();
    const u = new URL(url);
    const wpis = {
      ...etap,
      kategoria: kat,
      metoda: req.method(),
      host: u.host,
      sciezka: bezpiecznaSciezka(url),
      typ_zasobu: req.resourceType(),
      z_service_workera: Boolean(req.serviceWorker()),
      ts: new Date().toISOString(),
    };
    if (kat.includes('PostHog') && req.method() === 'POST') wpis.posthog = streszczeniePostHog(req);
    if (kat.includes('Sentry') && req.method() === 'POST') wpis.sentry = streszczenieSentry(req);
    zadania.push(wpis);
    return route.abort('blockedbyclient');
  });
  context.on('response', async (res) => {
    try {
      if (new URL(res.url()).origin !== APP_ORIGIN) return;
      const headers = await res.headersArray();
      for (const h of headers) {
        if (h.name.toLowerCase() !== 'set-cookie') continue;
        for (const linia of h.value.split('\n')) {
          setCookies.push({ ...etap, sciezka: new URL(res.url()).pathname, status: res.status(), ...parsujSetCookie(linia) });
        }
      }
    } catch {
      // odpowiedź zamknięta — pomijamy
    }
  });
  return context;
}

async function odwiedz(page, context, scenariusz, strona) {
  etap = { scenariusz, krok: strona.id };
  let status = null;
  let blad = null;
  try {
    const res = await page.goto(BASE_URL + strona.path, { waitUntil: 'load', timeout: 90_000 });
    status = res?.status() ?? null;
  } catch (err) {
    blad = String(err?.message ?? err).split('\n')[0].slice(0, 200);
  }
  await page.waitForTimeout(WAIT_MS);
  const m = await migawka(page, context, `po wejściu na ${strona.path} i ${WAIT_MS} ms`);
  m.status_http = status;
  if (blad) m.blad_nawigacji = blad;
  return m;
}

async function szukajKontrolekZgody(page) {
  return page.evaluate(() => {
    const re = /cookie|ciasteczk|zgod|preferencj|analityk|prywatno|zarządzaj|ustawienia prywatno/i;
    const out = [];
    for (const el of document.querySelectorAll('a, button, [role="button"]')) {
      const tekst = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const aria = el.getAttribute('aria-label') ?? '';
      if (re.test(tekst) || re.test(aria)) {
        out.push({ element: el.tagName.toLowerCase(), tekst, aria, href: el.getAttribute('href') });
      }
    }
    return out;
  });
}

// ── scenariusze ──────────────────────────────────────────────────────────
async function main() {
  const proxy = await uruchomSinkhole();
  const proxyPort = proxy.address().port;
  const exe = chromiumPath();
  const browser = await chromium.launch({
    headless: true,
    executablePath: exe,
    // Wszystko, co ominie przechwytywanie (preconnect, DNS-prefetch przez
    // proxy), trafia do lokalnego sinkhole i jest odrzucane.
    proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: 'localhost,127.0.0.1' },
  });
  const meta = {
    wygenerowano: new Date().toISOString(),
    base_url: BASE_URL,
    wait_ms: WAIT_MS,
    chromium: browser.version(),
    chromium_sciezka: exe ?? 'domyślna Playwright',
    wersja_kodu: (() => { try { return execSync('git rev-parse --short HEAD', { cwd: HERE }).toString().trim(); } catch { return null; } })(),
    strony: STRONY,
  };

  // (a) brak wyboru — każda strona w ŚWIEŻYM kontekście (pierwsza wizyta),
  // a dodatkowo przejście po kolei w jednym kontekście (ta sama sesja).
  for (const s of STRONY) {
    const ctx = await nowyKontekst(browser);
    const page = await ctx.newPage();
    await odwiedz(page, ctx, 'a-brak-wyboru-pierwsza-wizyta', s);
    await ctx.close();
  }
  {
    const ctx = await nowyKontekst(browser);
    const page = await ctx.newPage();
    for (const s of STRONY) await odwiedz(page, ctx, 'a2-brak-wyboru-sesja', s);
    // (e) błąd JS bez decyzji — czy Sentry wysyła zdarzenie przed zgodą.
    etap = { scenariusz: 'a2-brak-wyboru-sesja', krok: 'blad-js-syntetyczny' };
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => setTimeout(() => { throw new Error('AUDYT_13_SYNTETYCZNY_BLAD'); }, 0));
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'po syntetycznym błędzie JS bez decyzji');
    await ctx.close();
  }

  // (b) odmowa — „Tylko niezbędne”.
  {
    const ctx = await nowyKontekst(browser);
    const page = await ctx.newPage();
    await odwiedz(page, ctx, 'b-odmowa', STRONY[0]);
    etap = { scenariusz: 'b-odmowa', krok: 'klik-tylko-niezbedne' };
    const btn = page.getByRole('button', { name: 'Tylko niezbędne', exact: true });
    const widoczny = await btn.isVisible().catch(() => false);
    if (widoczny) await btn.click(); else uwagi.push('b: brak przycisku „Tylko niezbędne” — banner niewidoczny');
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'po kliknięciu „Tylko niezbędne”');
    for (const s of STRONY) await odwiedz(page, ctx, 'b-odmowa', s);
    etap = { scenariusz: 'b-odmowa', krok: 'blad-js-syntetyczny' };
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => setTimeout(() => { throw new Error('AUDYT_13_SYNTETYCZNY_BLAD'); }, 0));
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'po syntetycznym błędzie JS po odmowie');
    await ctx.close();
  }

  // (b2) zamknięcie bannera krzyżykiem — kod traktuje to jako odmowę.
  {
    const ctx = await nowyKontekst(browser);
    const page = await ctx.newPage();
    await odwiedz(page, ctx, 'b2-zamkniecie-X', STRONY[0]);
    etap = { scenariusz: 'b2-zamkniecie-X', krok: 'klik-X' };
    const x = page.getByRole('button', { name: 'Zamknij — Tylko niezbędne' });
    if (await x.isVisible().catch(() => false)) await x.click(); else uwagi.push('b2: brak przycisku X');
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'po kliknięciu X');
    await odwiedz(page, ctx, 'b2-zamkniecie-X', STRONY[1]);
    await ctx.close();
  }

  // (c) akceptacja + (d) wycofanie w tym samym kontekście.
  {
    const ctx = await nowyKontekst(browser);
    const page = await ctx.newPage();
    await odwiedz(page, ctx, 'c-akceptacja', STRONY[0]);
    etap = { scenariusz: 'c-akceptacja', krok: 'klik-akceptuje' };
    const ok = page.getByRole('button', { name: 'Akceptuję', exact: true });
    if (await ok.isVisible().catch(() => false)) await ok.click(); else uwagi.push('c: brak przycisku „Akceptuję”');
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'po kliknięciu „Akceptuję”');
    for (const s of STRONY.slice(1)) await odwiedz(page, ctx, 'c-akceptacja', s);

    // (d) wycofanie — najpierw szukamy ścieżki w UI na każdej stronie.
    const kontrolki = {};
    for (const s of STRONY) {
      etap = { scenariusz: 'd-wycofanie', krok: `szukanie-kontrolki:${s.id}` };
      await page.goto(BASE_URL + s.path, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      kontrolki[s.path] = await szukajKontrolekZgody(page);
    }
    const kandydaci = Object.values(kontrolki).flat().filter((k) => !(k.href ?? '').startsWith('/legal/'));
    meta.d_kontrolki_zgody_w_ui = kontrolki;
    meta.d_kandydaci_poza_linkami_do_dokumentow = kandydaci;

    // d1: brak kontrolki w UI → wywołujemy DOKŁADNIE to, co robi
    // setAnalyticsConsent(false) (lib/analytics/consent.ts:27-37): zapis
    // 'denied' + zdarzenie ff:analytics-consent — na otwartej stronie, bez przeładowania.
    etap = { scenariusz: 'd-wycofanie', krok: 'd1-symulacja-programowa' };
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'przed wycofaniem (zgoda udzielona, strona /)');
    await page.evaluate(({ CONSENT_KEY, CONSENT_EVENT }) => {
      localStorage.setItem(CONSENT_KEY, 'denied');
      window.dispatchEvent(new Event(CONSENT_EVENT));
    }, { CONSENT_KEY, CONSENT_EVENT });
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'bezpośrednio po programowym wycofaniu (bez przeładowania)');
    // aktywność na stronie po wycofaniu (zmiana historii = $pageview w SDK)
    await page.evaluate(() => { history.pushState({}, '', '/pricing'); });
    await page.waitForTimeout(WAIT_MS);
    for (const s of STRONY.slice(0, 4)) await odwiedz(page, ctx, 'd-wycofanie-d1-po', s);

    // d2: jedyna ścieżka dostępna użytkownikowi bez kodu — wyczyszczenie
    // danych witryny (tu: localStorage) → banner wraca → „Tylko niezbędne”.
    etap = { scenariusz: 'd-wycofanie', krok: 'd2-wyczyszczenie-danych' };
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'po wyczyszczeniu localStorage i przeładowaniu');
    const btn = page.getByRole('button', { name: 'Tylko niezbędne', exact: true });
    if (await btn.isVisible().catch(() => false)) await btn.click(); else uwagi.push('d2: banner nie wrócił po wyczyszczeniu localStorage');
    await page.waitForTimeout(WAIT_MS);
    await migawka(page, ctx, 'd2: po „Tylko niezbędne”');
    for (const s of STRONY.slice(0, 2)) await odwiedz(page, ctx, 'd-wycofanie-d2-po', s);
    await ctx.close();
  }

  await browser.close();
  proxy.close();

  // ── podsumowanie ──
  const scen = [...new Set(migawki.map((m) => m.scenariusz))];
  const podsumowanie = {};
  for (const sc of scen) {
    const z = zadania.filter((r) => r.scenariusz === sc);
    const ms = migawki.filter((m) => m.scenariusz === sc);
    podsumowanie[sc] = {
      domeny_zewnetrzne: [...new Set(z.filter((r) => !r.kategoria.startsWith('proxy-1st')).map((r) => `${r.host} [${r.kategoria}]`))],
      proxy_pierwszej_strony: [...new Set(z.filter((r) => r.kategoria.startsWith('proxy-1st')).map((r) => `${r.metoda} ${r.sciezka} [${r.kategoria}]`))],
      liczba_zadan_przerwanych: z.length,
      sinkhole: [...new Set(sinkhole.filter((r) => r.scenariusz === sc).map((r) => `${r.rodzaj}: ${r.host}`))],
      ciasteczka: [...new Set(ms.flatMap((m) => m.ciasteczka.map((c) => c.nazwa)))],
      set_cookie: [...new Set(setCookies.filter((c) => c.scenariusz === sc).map((c) => c.nazwa))],
      localStorage: [...new Set(ms.flatMap((m) => (Array.isArray(m.localStorage) ? m.localStorage : []).map((k) => k.klucz + (k.wartosc !== undefined ? `=${k.wartosc}` : ''))))],
      sessionStorage: [...new Set(ms.flatMap((m) => (Array.isArray(m.sessionStorage) ? m.sessionStorage : []).map((k) => k.klucz)))],
      indexedDB: [...new Set(ms.flatMap((m) => (Array.isArray(m.indexedDB) ? m.indexedDB : [])))],
      cacheStorage: [...new Set(ms.flatMap((m) => (Array.isArray(m.cacheStorage) ? m.cacheStorage : []).map((c) => c.nazwa)))],
      serviceWorker: [...new Set(ms.flatMap((m) => (Array.isArray(m.serviceWorker) ? m.serviceWorker : []).map((r) => `${r.scope} ${r.skrypt}`)))],
      banner_widoczny_na: [...new Set(ms.filter((m) => m.banner_widoczny).map((m) => m.url))],
    };
  }

  const wynik = { meta, podsumowanie, uwagi, zadania_przerwane: zadania, set_cookie: setCookies, sinkhole, migawki };
  fs.writeFileSync(OUT, JSON.stringify(wynik, null, 2) + '\n');
  console.log(`Zapisano ${OUT}`);
  console.log(JSON.stringify(podsumowanie, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
