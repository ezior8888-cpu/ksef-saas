/**
 * Wysyłka emaili notyfikacyjnych przez Resend + React Email.
 *
 * Zachowanie:
 *   - `RESEND_API_KEY` nieustawiony / placeholder `re_xxxx...` → log do
 *     stdout + `{ sent: false, reason: 'not-configured' }` (DEV UX: nie
 *     wyrzucamy błędu, bo Inngest by retrywał w kółko przez 5 minut).
 *   - `RESEND_API_KEY` poprawny → prawdziwy send; błąd Resend = throw,
 *     żeby Inngest retryował (retries: 2 w notify-user jobach).
 *
 * Templatki żyją w `lib/email/templates/*.tsx` (React Email) i są
 * renderowane przez `@react-email/render` do stringa HTML.
 */
import { render } from '@react-email/render';
import { Resend } from 'resend';

import CertExpiry from './templates/CertExpiry';
import InvoiceAccepted from './templates/InvoiceAccepted';
import InvoiceFailed from './templates/InvoiceFailed';
import PaymentFailed from './templates/PaymentFailed';
import RefundIssued from './templates/RefundIssued';
import TrialEnding from './templates/TrialEnding';

// ═══════════════════════════════════════════════════════════════
// KONFIGURACJA
// ═══════════════════════════════════════════════════════════════

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const DEFAULT_FROM = 'KSeF SaaS <onboarding@resend.dev>';

/**
 * DEV-only override: Resend na FREE planie (bez weryfikowanej domeny)
 * akceptuje tylko jeden adres odbiorcy - email właściciela konta Resend.
 * Jeśli ta zmienna jest ustawiona, KAŻDY notify trafia tam zamiast na
 * prawdziwego odbiorcę. W produkcji ZOSTAW PUSTĄ - inaczej wszyscy
 * klienci dostaną mail na Twój adres.
 */
const DEV_TO_OVERRIDE = process.env.RESEND_DEV_TO_OVERRIDE?.trim() || null;

// Cache klienta - `new Resend()` jest lightweight, ale nie chcemy tworzyć
// instancji na każdy email (jeden proces = jeden klient).
let cachedResend: Resend | null = null;

function isResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY;
  // `re_xxxx...` to placeholder z .env.example, NIE jest prawdziwym kluczem.
  return !!key && !key.startsWith('re_xxxx');
}

function getResend(): Resend {
  if (cachedResend) return cachedResend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  cachedResend = new Resend(apiKey);
  return cachedResend;
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════

export interface EmailStubResult {
  sent: boolean;
  /** Id wiadomości Resend (tylko przy `sent: true`). */
  messageId?: string;
  /** Powód pominięcia / niepowodzenia (tylko przy `sent: false`). */
  reason?: string;
}

interface InvoiceAcceptedPayload {
  ksefNumber: string;
  invoiceId: string;
}

interface InvoiceFailedPayload {
  invoiceId: string;
  errorMessage: string;
}

interface CertExpiryPayload {
  tenantName: string;
  daysRemaining: number;
  expiryDate: string | null;
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: wrapper nad `resend.emails.send`
// ═══════════════════════════════════════════════════════════════

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailStubResult> {
  const finalTo = DEV_TO_OVERRIDE ?? opts.to;
  const finalSubject = DEV_TO_OVERRIDE
    ? `[DEV → ${opts.to}] ${opts.subject}`
    : opts.subject;

  const { data, error } = await getResend().emails.send({
    from: getFromEmail(),
    to: [finalTo],
    subject: finalSubject,
    html: opts.html,
  });
  if (error) {
    // Inngest potrzebuje rzuconego błędu żeby ruszyć retry. Serializujemy
    // cały obiekt - Resend wpakowuje tam `name/message/statusCode`.
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }
  return { sent: true, messageId: data?.id };
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

export async function sendInvoiceAcceptedEmail(
  email: string,
  payload: InvoiceAcceptedPayload,
): Promise<EmailStubResult> {
  if (!isResendConfigured()) {
    console.log(
      `[email:stub] sendInvoiceAcceptedEmail → ${email}:`,
      `faktura ${payload.invoiceId} zaakceptowana. Nr KSeF: ${payload.ksefNumber}`,
    );
    return { sent: false, reason: 'not-configured' };
  }
  const html = await render(
    InvoiceAccepted({ ...payload, appUrl: APP_URL }),
  );
  return sendViaResend({
    to: email,
    subject: `Faktura ${payload.ksefNumber} wysłana do KSeF`,
    html,
  });
}

export async function sendInvoiceFailedEmail(
  email: string,
  payload: InvoiceFailedPayload,
): Promise<EmailStubResult> {
  if (!isResendConfigured()) {
    console.log(
      `[email:stub] sendInvoiceFailedEmail → ${email}:`,
      `faktura ${payload.invoiceId} ODRZUCONA. Błąd: ${payload.errorMessage}`,
    );
    return { sent: false, reason: 'not-configured' };
  }
  const html = await render(InvoiceFailed({ ...payload, appUrl: APP_URL }));
  return sendViaResend({
    to: email,
    subject: 'Faktura odrzucona przez KSeF',
    html,
  });
}

/**
 * Generyczna wysyłka maila — używana przez moduły, które same komponują
 * HTML (np. zaproszenia do organizacji). Zachowuje tę samą semantykę
 * "fail-soft" jak pozostałe helpery: brak `RESEND_API_KEY` → log do stdout.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailStubResult> {
  if (!isResendConfigured()) {
    console.log(`[email:stub] sendEmail → ${opts.to}: ${opts.subject}`);
    return { sent: false, reason: 'not-configured' };
  }
  return sendViaResend(opts);
}

export async function sendCertExpiryAlert(
  email: string,
  payload: CertExpiryPayload,
): Promise<EmailStubResult> {
  if (!isResendConfigured()) {
    console.log(
      `[email:stub] sendCertExpiryAlert → ${email}:`,
      `certyfikat KSeF dla '${payload.tenantName}' wygasa za ${payload.daysRemaining} dni (${payload.expiryDate ?? 'brak daty'})`,
    );
    return { sent: false, reason: 'not-configured' };
  }
  // CertExpiry template wymaga ISO string - jeśli DB zwróciła null, fallback
  // na "nieznana data" (rzadki case, ale lepszy niż crash templatki).
  const html = await render(
    CertExpiry({
      tenantName: payload.tenantName,
      daysRemaining: payload.daysRemaining,
      expiryDate: payload.expiryDate ?? 'nieznana',
    }),
  );
  return sendViaResend({
    to: email,
    subject: `⚠ Certyfikat KSeF wygasa za ${payload.daysRemaining} dni`,
    html,
  });
}

// ═══════════════════════════════════════════════════════════════
// FAZA 25 KROK 5 — BILLING EMAILS
// ═══════════════════════════════════════════════════════════════

export interface TrialEndingPayload {
  tenantName: string;
  daysRemaining: 14 | 7 | 3 | 1;
  trialEndDate: string;
  planLabel: string;
  monthlyPriceLabel: string;
}

export async function sendTrialEndingEmail(
  email: string,
  payload: TrialEndingPayload,
): Promise<EmailStubResult> {
  if (!isResendConfigured()) {
    console.log(
      `[email:stub] sendTrialEndingEmail → ${email}: trial kończy się za ${payload.daysRemaining} dni`,
    );
    return { sent: false, reason: 'not-configured' };
  }
  const html = await render(
    TrialEnding({
      ...payload,
      appUrl: APP_URL,
    }),
  );
  const isFinalDay = payload.daysRemaining === 1;
  const subject = isFinalDay
    ? '⏰ Twój trial FaktFlow kończy się jutro'
    : `Twój trial FaktFlow kończy się za ${payload.daysRemaining} dni`;
  return sendViaResend({ to: email, subject, html });
}

export interface PaymentFailedPayload {
  tenantName: string;
  amountLabel: string;
  failureReason: string | null;
}

export async function sendPaymentFailedEmail(
  email: string,
  payload: PaymentFailedPayload,
): Promise<EmailStubResult> {
  if (!isResendConfigured()) {
    console.log(
      `[email:stub] sendPaymentFailedEmail → ${email}: ${payload.amountLabel} (${payload.failureReason ?? 'unknown'})`,
    );
    return { sent: false, reason: 'not-configured' };
  }
  const html = await render(PaymentFailed({ ...payload, appUrl: APP_URL }));
  return sendViaResend({
    to: email,
    subject: 'Nie udało się pobrać płatności FaktFlow',
    html,
  });
}

export interface RefundIssuedPayload {
  tenantName: string;
  amountLabel: string;
  reason: string | null;
}

export async function sendRefundIssuedEmail(
  email: string,
  payload: RefundIssuedPayload,
): Promise<EmailStubResult> {
  if (!isResendConfigured()) {
    console.log(
      `[email:stub] sendRefundIssuedEmail → ${email}: ${payload.amountLabel}`,
    );
    return { sent: false, reason: 'not-configured' };
  }
  const html = await render(RefundIssued(payload));
  return sendViaResend({
    to: email,
    subject: `Zwrot ${payload.amountLabel} przetworzony`,
    html,
  });
}
