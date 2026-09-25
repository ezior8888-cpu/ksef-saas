/**
 * Minimal Slack incoming-webhook transport.
 * Critical alerts require a confirmed 2xx response; bugs and metrics keep
 * the existing fail-soft behavior so Slack downtime cannot break user flows.
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
  if (url.startsWith('xxx') || !url.startsWith('https://hooks.slack.com/')) {
    return null;
  }
  return url;
}

export interface SlackMessage {
  channel: SlackChannel;
  /** Plain text; Slack accepts mrkdwn. */
  text: string;
  context?: Record<string, string | number | boolean>;
}

async function postSlackAlert(
  msg: SlackMessage,
  requireDelivery: boolean,
): Promise<void> {
  const url = getWebhookUrl(msg.channel);
  if (!url) {
    if (requireDelivery) {
      throw new Error('Critical Slack webhook is not configured');
    }
    return;
  }

  const payload: Record<string, unknown> = { text: msg.text };
  if (msg.context && Object.keys(msg.context).length > 0) {
    payload.attachments = [{
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
    }];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Never include the webhook URL, response body, or provider error in
      // exceptions; each can contain sensitive material.
      throw new Error('Slack delivery HTTP ' + response.status);
    }
  } catch {
    if (requireDelivery) {
      throw new Error('Critical Slack delivery was not confirmed');
    }
    console.error('[slack] webhook delivery was not confirmed');
  } finally {
    clearTimeout(timeout);
  }
}

/** Fail-soft transport for support, bugs, backups and metrics. */
export async function sendSlackAlert(msg: SlackMessage): Promise<void> {
  await postSlackAlert(msg, false);
}

export interface SlackAlertRichContext {
  fields: { label: string; value: string }[];
  link?: { label: string; url: string };
}

/** Strict transport for the critical-alerts monitor. */
export async function alertCritical(
  title: string,
  bodyMrkdwn: string,
  rich: SlackAlertRichContext,
): Promise<void> {
  const text = '*' + title + '*\n' + bodyMrkdwn;
  const context: Record<string, string | number | boolean> = {};
  for (const field of rich.fields) {
    context[field.label] = field.value;
  }
  if (rich.link) {
    context[rich.link.label] = rich.link.url;
  }
  await postSlackAlert({ channel: 'urgent', text, context }, true);
}

export async function alertMetrics(
  title: string,
  bodyMrkdwn: string,
  rows: { label: string; value: string }[],
): Promise<void> {
  const text = '*' + title + '*\n' + bodyMrkdwn;
  const context: Record<string, string | number | boolean> = {};
  for (const row of rows) {
    context[row.label] = row.value;
  }
  await sendSlackAlert({ channel: 'metrics', text, context });
}
