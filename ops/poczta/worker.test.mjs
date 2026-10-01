import assert from 'node:assert/strict';
import test from 'node:test';

import { classify, formatNotice, handleEmail, shouldNotify } from './worker.mjs';

function fakeMessage({ to = 'pomoc@faktflow.pl', from = 'klient@example.com', subject = '' } = {}) {
  const calls = { forward: [], reject: null };
  return {
    calls,
    to,
    from,
    headers: new Map([['subject', subject]]),
    forward: async (addr) => { calls.forward.push(addr); },
    setReject: (reason) => { calls.reject = reason; },
  };
}

function fakeCtx() {
  const waits = [];
  return { waits, waitUntil: (p) => waits.push(p) };
}

const ENV = { FORWARD_TO: 'bartosz@example.com, igor@example.com', TELEGRAM_CHAT_IDS: '111,222', TELEGRAM_BOT_TOKEN: 'test-token' };

test('kategorie i pilność z tematu', () => {
  assert.equal(classify('Prośba o usunięcie danych osobowych').id, 'RODO');
  assert.equal(classify('Faktura odrzucona przez KSeF').id, 'KSEF');
  assert.equal(classify('Zwrot za abonament').id, 'ZWROT');
  assert.equal(classify('Nie mogę się zalogować').id, 'DOSTEP');
  assert.equal(classify('Ile kosztuje dla biura rachunkowego?').id, 'SPRZEDAZ');
  assert.equal(classify('Dzień dobry').id, 'INNE');
  assert.equal(classify(undefined).id, 'INNE');
  assert.equal(classify('RODO').urgent, true);
});

test('powiadomienie nie zawiera nadawcy, tematu ani treści', () => {
  const text = formatNotice({ recipient: 'pomoc@faktflow.pl', category: classify('Usunięcie danych Jan Kowalski NIP 1234567890') });
  assert.match(text, /^🔴 Nowa wiadomość na pomoc@faktflow\.pl/);
  assert.match(text, /RODO \/ dane osobowe · pilne/);
  assert.match(text, /1 miesiąc/);
  assert.doesNotMatch(text, /Kowalski|1234567890/);
});

test('raporty DMARC i odbicia nie budzą nikogo', () => {
  assert.equal(shouldNotify({ recipient: 'dmarc@faktflow.pl', sender: 'reports@google.com' }), false);
  assert.equal(shouldNotify({ recipient: 'pomoc@faktflow.pl', sender: 'MAILER-DAEMON@example.com' }), false);
  assert.equal(shouldNotify({ recipient: 'pomoc@faktflow.pl', sender: 'klient@example.com' }), true);
});

test('wiadomość: przekazanie do wszystkich skrzynek i powiadomienie do każdego czatu', async () => {
  const msg = fakeMessage({ subject: 'Faktura nie wysłana do KSeF' });
  const ctx = fakeCtx();
  const sent = [];
  await handleEmail(msg, ENV, ctx, async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; });
  await Promise.all(ctx.waits);
  assert.deepEqual(msg.calls.forward, ['bartosz@example.com', 'igor@example.com']);
  assert.deepEqual(sent.map((s) => s.body.chat_id), ['111', '222']);
  assert.match(sent[0].body.text, /KSeF \/ faktury · pilne/);
  assert.doesNotMatch(sent[0].body.text, /klient@example\.com|wysłana/);
});

test('brak skrzynek docelowych: wiadomość odrzucona z informacją, nie zgubiona po cichu', async () => {
  const msg = fakeMessage();
  await handleEmail(msg, { ...ENV, FORWARD_TO: '' }, fakeCtx(), async () => ({ ok: true }));
  assert.equal(msg.calls.forward.length, 0);
  assert.match(msg.calls.reject, /niedostępna/);
});

test('awaria Telegrama nie blokuje przekazania poczty', async () => {
  const msg = fakeMessage({ subject: 'Zwrot' });
  const ctx = fakeCtx();
  await handleEmail(msg, ENV, ctx, async () => { throw new Error('Telegram niedostępny'); });
  await Promise.all(ctx.waits);
  assert.equal(msg.calls.forward.length, 2);
});
