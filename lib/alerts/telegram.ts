/**
 * Telegram Bot API transport dla alertów operatora i raportu dziennego.
 *
 * Dlaczego obok Slacka: Slack nie budzi nikogo w nocy, a obaj operatorzy mają
 * Telegrama w telefonie. Bot tylko WYSYŁA — nie odbiera komend i nie ma
 * publicznego webhooka, więc nie poszerza powierzchni ataku aplikacji.
 *
 * Konfiguracja (obie zmienne wymagane, inaczej kanał jest wyłączony):
 *   - `TELEGRAM_BOT_TOKEN` — token z @BotFather,
 *   - `TELEGRAM_ALERT_CHAT_IDS` — identyfikatory czatów prywatnych po przecinku.
 *
 * Treść musi być już pozbawiona danych osobowych: regulamin botów Telegrama
 * wymaga minimalizacji, a wiadomość ląduje na serwerach poza naszą kontrolą.
 */

const TELEGRAM_API = 'https://api.telegram.org';
const TIMEOUT_MS = 3000;
/** Limit Bot API dla `sendMessage` to 4096 znaków po sparsowaniu encji. */
const MAX_MESSAGE_LENGTH = 4000;

interface TelegramConfig {
  token: string;
  chatIds: string[];
}

function getConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatIds = (process.env.TELEGRAM_ALERT_CHAT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    // Czat prywatny ma dodatnie ID, grupy ujemne — przyjmujemy oba formaty liczbowe.
    .filter((id) => /^-?\d+$/.test(id));
  if (!token || chatIds.length === 0) return null;
  return { token, chatIds };
}

export function isTelegramConfigured(): boolean {
  return getConfig() !== null;
}

/** Escapowanie dla `parse_mode: HTML` — Telegram wymaga tylko tych trzech znaków. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface TelegramSendOptions {
  /** Krytyczne: rzuć wyjątek, jeśli żaden czat nie potwierdził odbioru. */
  requireDelivery?: boolean;
  /** Bez dźwięku — dla raportów, nie dla alarmów. */
  silent?: boolean;
}

async function postToChat(
  config: TelegramConfig,
  chatId: string,
  html: string,
  silent: boolean,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: silent,
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Wysyła gotowy HTML (już escapowany) do wszystkich skonfigurowanych czatów.
 * Zwraca liczbę czatów, które potwierdziły odbiór. Bez konfiguracji: 0, bez
 * wyjątku — chyba że `requireDelivery`.
 */
export async function sendTelegramMessage(
  html: string,
  options: TelegramSendOptions = {},
): Promise<number> {
  const config = getConfig();
  if (!config) {
    if (options.requireDelivery) {
      throw new Error('Telegram alert channel is not configured');
    }
    return 0;
  }

  const body =
    html.length > MAX_MESSAGE_LENGTH ? `${html.slice(0, MAX_MESSAGE_LENGTH)}\n…` : html;
  const results = await Promise.all(
    config.chatIds.map((chatId) => postToChat(config, chatId, body, options.silent ?? false)),
  );
  const delivered = results.filter(Boolean).length;

  if (delivered === 0) {
    // Nigdy nie wypisujemy tokenu ani odpowiedzi dostawcy — URL zawiera sekret.
    if (options.requireDelivery) {
      throw new Error('Telegram delivery was not confirmed');
    }
    console.error('[telegram] delivery was not confirmed');
  }
  return delivered;
}
