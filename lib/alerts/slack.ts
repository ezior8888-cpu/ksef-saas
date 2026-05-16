/**
 * Minimalna integracja z Slack incoming webhooks. Faza 27 planowała
 * pełen `lib/alerts/slack.ts` z 3 kanałami — tu implementuję podstawową
 * wersję dla Fazy 29 (backup alerts).
 *
 * Trzy kanały (każdy z osobnym webhookiem):
 *   - urgent: critical errors, DB / KSeF down, backup failure
 *   - bugs:   non-critical errors grouped
 *   - metrics: daily summaries, MRR, signups
 *
 * Tryb degradacji: jeśli `SLACK_WEBHOOK_*` nie skonfigurowany — no-op.
 * Sentry i tak złapie wyjątek przez `Sentry.captureMessage` w callerze.
 */

export type SlackChannel = 'urgent' | 'bugs' | 'metrics';

function getWebhookUrl(channel: SlackChannel): string | null {
  const envKey =
    channel === 'urgent'
      ? 'SLACK_WEBHOOK_URGENT'
      : channel === 'bugs'
        ? 'SLACK_WEBHOOK_BUGS'
        : 'SLACK_WEBHOOK_METRICS';
  const url = process.env[envKey]?.trim();
  if (!url) return null;
  if (url.startsWith('xxx') || !url.startsWith('https://hooks.slack.com/'))
    return null;
  return url;
}

export interface SlackMessage {
  channel: SlackChannel;
  /** Plain text (Slack akceptuje mrkdwn — np. `*bold*`, `_italic_`). */
  text: string;
  /** Opcjonalny header w `attachments[]` — wzbogaca preview. */
  context?: Record<string, string | number | boolean>;
}

/**
 * Wysyła wiadomość na Slack. Nigdy nie rzuca — jeśli Slack pada, polegamy
 * na Sentry (callerze).
 *
 * Timeout 3s — backup job nie może czekać minutami na Slack downtime.
 */
export async function sendSlackAlert(msg: SlackMessage): Promise<void> {
  const url = getWebhookUrl(msg.channel);
  if (!url) return;

  const payload: Record<string, unknown> = { text: msg.text };
  if (msg.context && Object.keys(msg.context).length > 0) {
    payload.attachments = [
      {
        color:
          msg.channel === 'urgent'
            ? '#dc2626'
            : msg.channel === 'bugs'
              ? '#f59e0b'
              : '#3b82f6',
        fields: Object.entries(msg.context).map(([title, value]) => ({
          title,
          value: String(value),
          short: String(value).length < 30,
        })),
      },
    ];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    console.error('[slack] webhook failed:', err);
  }
}

/** Opcje dla `alertCritical` — zgodne z wywołaniami z `critical-alerts-monitor`. */
export interface AlertCriticalOptions {
  fields?: Array<{ label: string; value: string }>;
  link?: { label: string; url: string };
}

/**
 * Krytyczny alert na kanał `urgent` (wrapper dla jobów observability).
 * Mapuje pola i link na `context` + tekst — ten sam transport co `sendSlackAlert`.
 */
export async function alertCritical(
  title: string,
  message: string,
  opts: AlertCriticalOptions = {},
): Promise<void> {
  let text = `🚨 *${title}*\n${message}`;
  if (opts.link?.url) {
    text += `\n<${opts.link.url}|${opts.link.label}>`;
  }
  const context: Record<string, string | number | boolean> = {};
  for (const f of opts.fields ?? []) {
    context[f.label] = f.value;
  }
  await sendSlackAlert({
    channel: 'urgent',
    text,
    context: Object.keys(context).length > 0 ? context : undefined,
  });
}

/**
 * Podsumowanie metryk na kanał `metrics` (np. weekly business review).
 */
export async function alertMetrics(
  title: string,
  message: string,
  fields: Array<{ label: string; value: string }> = [],
): Promise<void> {
  const context: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    context[f.label] = f.value;
  }
  await sendSlackAlert({
    channel: 'metrics',
    text: `📈 *${title}*\n${message}`,
    context: Object.keys(context).length > 0 ? context : undefined,
  });
}
