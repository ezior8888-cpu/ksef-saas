/**
 * Local-only production browser smoke. Requires an existing synthetic-env build.
 * Run: node scripts/security/smoke-local-browser.mjs
 * No .env files are read, all browser egress is intercepted, /ingest is mocked.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { chromium, devices, expect } from '@playwright/test';

const BASE = 'http://localhost:3100';
const serverOutput = [];
const checks = [];
const cspViolations = [];
const pageErrors = [];
const blocked = [];
const envelopes = [];
const parseErrors = [];
const ingestRequests = [];
let server;
let browser;

function decodePosthog(request) {
  const data = request.postDataBuffer();
  if (!data?.length) return [];
  const parse = (value) => {
    const parsed = JSON.parse(value);
    const events = Array.isArray(parsed) ? parsed : [parsed];
    assert.ok(events.every((event) => typeof event.event === 'string' && event.properties && typeof event.properties === 'object'), 'Decoded analytics items are SDK events');
    return events;
  };
  if (data[0] === 0x1f && data[1] === 0x8b) return parse(gunzipSync(data).toString());
  const text = data.toString();
  if (/^\s*[\[{]/.test(text)) return parse(text);
  const encoded = new URLSearchParams(text).get('data');
  if (encoded) {
    const decoded = Buffer.from(encoded, 'base64');
    return parse(decoded[0] === 0x1f && decoded[1] === 0x8b ? gunzipSync(decoded).toString() : decoded.toString());
  }
  throw new Error('Unrecognized analytics payload encoding');
}

async function isolatedContext() {
  const context = await browser.newContext({ ...devices['Desktop Chrome'], locale: 'pl-PL', serviceWorkers: 'block' });
  // Apply before the first page exists: even bootstrap and third-party scripts
  // cannot reach the network, and the Next /ingest rewrite never executes.
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== BASE && url.origin !== 'http://127.0.0.1:3100') {
      blocked.push({ origin: url.origin, type: request.resourceType() });
      await route.abort('blockedbyclient');
      return;
    }
    if (url.pathname.startsWith('/ingest')) {
      ingestRequests.push({ path: url.pathname, method: request.method(), bytes: request.postDataBuffer()?.length ?? 0 });
      try { envelopes.push(...decodePosthog(request)); }
      catch (error) { parseErrors.push(error.message); }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
      return;
    }
    // No POST route other than the mocked analytics transport is needed.
    if (!['GET', 'HEAD'].includes(request.method())) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.addInitScript(() => {
    // Simulate an unsupported PWA environment instead of rejecting register()
    // after Serwist starts; that artificial rejection crashes its own library.
    delete Navigator.prototype.serviceWorker;
    // PostHog intentionally drops automation. Exercise the human browser path
    // without weakening the application configuration or contacting PostHog.
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
    window.__smokeCsp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__smokeCsp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
  context.on('page', (page) => {
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });
  return context;
}

async function recordCsp(page, scenario) {
  const entries = await page.evaluate(() => window.__smokeCsp ?? []);
  cspViolations.push(...entries.map((entry) => ({ scenario, ...entry })));
}

async function visit(page, path) {
  const response = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, `${path}: HTTP 200`);
  const headers = response.headers();
  assert.ok(headers['content-security-policy'], `${path}: CSP is enforced`);
  assert.equal(headers['content-security-policy-report-only'], undefined);
  assert.equal(headers['x-powered-by'], undefined);
  return response;
}

async function main() {
  assert.ok(existsSync('.next/BUILD_ID'), 'Build the application first using synthetic env');
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    assert.equal(existsSync(file), false, `Refusing to start Next with ${file}; this smoke requires only synthetic process env`);
  }
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(1000) });
    throw new Error('Port 3100 is already serving HTTP; refusing to use or stop another server');
  } catch (error) {
    if (error.message.includes('already serving')) throw error;
  }

  const environment = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  Object.assign(environment, {
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-build-placeholder',
    SUPABASE_SERVICE_ROLE_KEY: 'local-build-placeholder',
    NEXT_PUBLIC_APP_URL: BASE,
    NEXT_PUBLIC_POSTHOG_KEY: 'phc_local_test_placeholder',
    SENTRY_AUTH_TOKEN: '', SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '',
    NEXT_TELEMETRY_DISABLED: '1',
  });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3100'], {
    cwd: process.cwd(), env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()));
  server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()));
  await expect.poll(async () => {
    if (server.exitCode !== null) throw new Error('Local server exited before readiness');
    try { return (await fetch(BASE, { signal: AbortSignal.timeout(2000) })).status; }
    catch { return 0; }
  }, { timeout: 45000 }).toBe(200);

  browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
  });

  const deniedContext = await isolatedContext();
  const deniedPage = await deniedContext.newPage();
  await visit(deniedPage, '/');
  await expect(deniedPage.locator('h1').first()).toBeVisible();
  await expect(deniedPage.getByRole('button', { name: 'Akceptuję', exact: true })).toBeVisible();
  await deniedPage.waitForTimeout(4000);
  assert.equal(ingestRequests.length, 0, 'No SDK requests before consent');
  checks.push('home hydration and enforced CSP/no X-Powered-By', 'no analytics before consent');
  await recordCsp(deniedPage, 'home');

  await deniedPage.getByRole('button', { name: 'Tylko niezbędne', exact: true }).click();
  assert.equal(await deniedPage.evaluate(() => localStorage.getItem('ff_analytics_consent')), 'denied');
  await visit(deniedPage, '/login');
  await expect(deniedPage.locator('input[type=email]').first()).toBeVisible();
  await expect(deniedPage.getByRole('button', { name: 'Akceptuję', exact: true })).toHaveCount(0);
  await deniedPage.waitForTimeout(4000);
  assert.equal(ingestRequests.length, 0, 'No SDK requests after denial, including new navigation');
  checks.push('login hydration and security headers', 'denial persists across navigation');
  await recordCsp(deniedPage, 'login-denied');
  await deniedContext.close();

  const context = await isolatedContext();
  const page = await context.newPage();
  await visit(page, '/login?token=SMOKE_PRIVATE_QUERY#access_token=SMOKE_PRIVATE_HASH');
  await expect(page.getByRole('button', { name: 'Akceptuję', exact: true })).toBeVisible();
  await page.locator('input[type=email]').first().fill('smoke.private@example.invalid');
  await page.locator('input[type=password]').first().fill('SMOKE_PRIVATE_PASSWORD');
  await page.getByRole('button', { name: 'Akceptuję', exact: true }).click();
  await expect.poll(() => envelopes.length, { timeout: 15000 }).toBeGreaterThan(0);
  assert.equal(await page.evaluate(() => localStorage.getItem('ff_analytics_consent')), 'granted');
  checks.push('explicit consent starts actual SDK event transport');
  await page.waitForTimeout(4000);
  assert.equal(envelopes.filter((event) => event.event === '$pageview').length, 1, 'Consent emits exactly one initial pageview');
  checks.push('exactly one initial pageview after consent');
  assert.ok(envelopes.every((event) => event.properties?.token === 'phc_local_test_placeholder'), 'SDK transport retains only the configured public project token');

  await page.evaluate(() => history.pushState(null, '', '/accountant/SMOKE_PRIVATE_PORTAL?token=SMOKE_PRIVATE_QUERY#SMOKE_PRIVATE_HASH'));
  await expect.poll(() => envelopes.some((event) => event.properties?.$current_url === '/accountant/[redacted]'), { timeout: 15000 }).toBe(true);
  assert.equal(parseErrors.length, 0, 'Every analytics payload was decoded');
  assert.doesNotMatch(JSON.stringify(envelopes), /SMOKE_PRIVATE|smoke\.private@example\.invalid/);
  assert.ok(envelopes.every((event) => !['$snapshot', '$autocapture', '$exception'].includes(event.event)));
  checks.push('actual SDK payloads exclude input values and query/hash/portal tokens');
  await recordCsp(page, 'consent-granted');

  // Flush any previous pageview first, then revoke from another same-origin tab.
  await page.waitForTimeout(4000);
  const other = await context.newPage();
  await visit(other, '/login');
  await other.waitForTimeout(4000);
  await other.evaluate(() => {
    localStorage.setItem('ff_analytics_consent', 'denied');
    window.dispatchEvent(new Event('ff:analytics-consent'));
  });
  await page.waitForTimeout(1000);
  const countAtRevocation = envelopes.length;
  await page.evaluate(() => history.pushState(null, '', '/invoices/SMOKE_PRIVATE_DOCUMENT?token=SMOKE_PRIVATE_QUERY'));
  await page.waitForTimeout(5000);
  assert.equal(envelopes.length, countAtRevocation, 'No transport after revocation in another tab');
  await visit(page, '/login');
  await page.waitForTimeout(4000);
  assert.equal(envelopes.length, countAtRevocation, 'Revocation persists after reload');
  checks.push('cross-tab revocation stops capture and persists after reload');
  await recordCsp(page, 'consent-revoked');
  await recordCsp(other, 'other-tab');
  await context.close();

  assert.equal(pageErrors.length, 0, 'No uncaught client/hydration errors');
  assert.deepEqual(cspViolations, [], 'No enforced CSP violations on exercised pages');
  console.log(JSON.stringify({ status: 'PASS', checks, analyticsEvents: envelopes.length, cspViolations, blockedExternalRequests: blocked, pageErrors }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message, checks, analyticsEvents: envelopes.length, ingestRequests, parseErrors, pageErrors, cspViolations, blockedExternalRequests: blocked, serverOutput: serverOutput.join('').slice(-6000) }, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
}
