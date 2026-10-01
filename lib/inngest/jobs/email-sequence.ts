import { createAdminClient } from '@/lib/supabase/admin';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import { PRICE_PER_MONTH } from '@/lib/billing/pricing';
import { sendEmail } from '@/lib/email/send';
import {
  emailTrialDay1,
  emailTrialDay12,
  emailTrialDay14,
  emailTrialDay4,
  emailTrialDay8,
  inngest,
  userRegistered,
} from '../client';

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Firma, której danych wolno użyć w mailu: `last_active_tenant_id` TYLKO
 * przy aktywnym członkostwie. Odebranie dostępu nie czyści tego wskaźnika,
 * a mail czyta bazę kluczem serwisowym (bez RLS) — bez tej bramki były
 * członek dostawałby statystyki dawnej firmy. Sprawdzane w każdym kroku
 * od nowa, więc ponowienie też widzi aktualny stan.
 */
async function activeTenantIdOf(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('last_active_tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw userErr;

  const tenantId = userRow?.last_active_tenant_id as string | null | undefined;
  if (!tenantId) return null;

  const { data: member, error: memberErr } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('user_id', userId)
    .eq('organization_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  if (memberErr) throw memberErr;

  return member ? tenantId : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const baseStyle = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #000; color: #fff; padding: 12px 24px;
              text-decoration: none; border-radius: 12px; font-weight: 500; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5;
              font-size: 12px; color: #666; }
  </style>
`;

function WELCOME_TEMPLATE(name: string) {
  const safe = escapeHtml(name);
  return `
${baseStyle}
<h1>Cześć ${safe},</h1>
<p>Cieszę się, że jesteś z nami. Jestem Bartek, founder KSeF SaaS.</p>
<p>W ciągu najbliższych 30 dni możesz przetestować <strong>wszystko</strong> bez ograniczeń. Bez karty kredytowej.</p>
<p>Najszybszy sposób żeby zobaczyć wartość:</p>
<ol>
  <li><a href="${APP_BASE}/invoices/new">Wystaw pierwszą fakturę</a> (30 sekund)</li>
  <li><a href="${APP_BASE}/expenses">Sfotografuj paragon</a> (zobacz OCR w akcji)</li>
  <li><a href="${APP_BASE}/onboarding/import-source">Zaimportuj historię z Fakturownia</a> (5 minut)</li>
</ol>
<p>Pytania? Po prostu odpisz na ten email — czytam wszystko.</p>
<p style="margin-top: 30px;">— Bartek</p>
<div class="footer">
  KSeF SaaS · Poznań · <a href="${APP_BASE}/legal/polityka-prywatnosci">Polityka prywatności</a>
</div>`;
}

function DAY_1_HELP_TEMPLATE(name: string) {
  const safe = escapeHtml(name);
  return `
${baseStyle}
<h1>${safe}, daj sobie 30 sekund</h1>
<p>Wczoraj zarejestrowałeś konto, ale nie wystawiłeś jeszcze pierwszej faktury. Pomogę.</p>
<p><strong>Wystawisz fakturę w 3 krokach:</strong></p>
<ol>
  <li>Wpisz NIP nabywcy → my pobierzemy resztę (nazwa, adres) z VAT API</li>
  <li>Dodaj 1 pozycję (np. &quot;Usługa programistyczna · 1 szt · 1000 PLN netto&quot;)</li>
  <li>Klik &quot;Wystaw&quot; → faktura idzie do KSeF</li>
</ol>
<p style="text-align: center; margin: 30px 0;">
  <a href="${APP_BASE}/invoices/new" class="button">Wystaw pierwszą fakturę →</a>
</p>
<p>Po pierwszej fakturze pokażę Ci OCR — najlepsza funkcja apki.</p>
<p>— Bartek</p>`;
}

function DAY_1_CONGRATS_TEMPLATE(name: string) {
  const safe = escapeHtml(name);
  return `
${baseStyle}
<h1>✓ ${safe}, świetnie</h1>
<p>Pierwsza faktura wysłana. Następny krok: <strong>OCR paragonów</strong>.</p>
<p>Weź najbliższy paragon (np. ze stacji benzynowej) i zrób zdjęcie:</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="${APP_BASE}/expenses" class="button">Otwórz Wydatki →</a>
</p>
<p>Apka rozpozna Orlen / BP / Lotos, kwotę, VAT i automatycznie wpisze do kolumny 13 KPiR. Bez wpisywania.</p>
<p>To jest moment, w którym większość beta-testerów zostaje na zawsze.</p>
<p>— Bartek</p>`;
}

function DAY_4_OCR_TEMPLATE(name: string) {
  const safe = escapeHtml(name);
  return `
${baseStyle}
<h1>${safe}, sprawdź OCR (2 min)</h1>
<p>Czy używasz już funkcji OCR paragonów? To <strong>największa różnica</strong> między KSeF SaaS a Fakturownią.</p>
<p><strong>Krótki demo:</strong></p>
<ol>
  <li>Otwórz apkę na telefonie (zainstaluj jako PWA jeśli jeszcze nie)</li>
  <li>Wydatki → &quot;Dodaj wydatek&quot; → &quot;Zrób zdjęcie&quot;</li>
  <li>Sfotografuj jakikolwiek paragon</li>
  <li>Po 5 sekundach masz: sprzedawcę, kwotę, VAT, kategorię KPiR — wszystko</li>
</ol>
<p>Jeden screenshot z prawdziwego beta-testu (Orlen, paragon na 67.43 PLN):</p>
<p>[screenshot OCR]</p>
<p>Twoje statystyki za 4 dni:</p>
<p><strong>0 minut spędzonych na ręcznym wpisywaniu kosztów</strong></p>
<p>— Bartek</p>`;
}

function DAY_8_STATS_TEMPLATE(name: string, docsCount: number, hoursSaved: string) {
  const safe = escapeHtml(name);
  const hoursNum = parseFloat(hoursSaved);
  const plnSaved = Number.isFinite(hoursNum) ? (hoursNum * 150).toFixed(0) : '0';
  return `
${baseStyle}
<h1>${safe}, w 8 dni…</h1>
<p>Twoje wyniki w KSeF SaaS:</p>
<div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="font-size: 36px; margin: 0; font-weight: 700;">${docsCount} dokumentów</p>
  <p style="margin: 5px 0 0 0; color: #666;">faktur i paragonów</p>
  <p style="font-size: 36px; margin: 20px 0 0 0; font-weight: 700;">≈ ${escapeHtml(hoursSaved)}h</p>
  <p style="margin: 5px 0 0 0; color: #666;">zaoszczędzonego czasu</p>
</div>
<p>Jeśli Twoja stawka godzinowa to 150 PLN, to już <strong>${plnSaved} PLN</strong> oszczędności.</p>
<p>Subskrypcja kosztuje ${PRICE_PER_MONTH}. Już teraz się zwróciła.</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="${APP_BASE}/settings" class="button">Przejdź do rozliczeń / ustawień →</a>
</p>
<p>— Bartek</p>`;
}

/** Email 1: Welcome — zaraz po rejestracji (`user/registered`). */
/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runEmailWelcome(data: Parameters<typeof userRegistered.create>[0], { step }: JobContext) {
    const { userId, email, firstName } = userRegistered.parse(data);

    await step.run('send-welcome', async () => {
      await sendEmail({
        to: email,
        subject: 'Witaj w KSeF SaaS — pierwsze kroki',
        html: WELCOME_TEMPLATE(firstName),
      });
    });

    await step.scheduleAfter('schedule-day-1', '1d', emailTrialDay1.create({ userId, email, firstName }));

    return { sent: 'welcome' as const };
}

export const emailWelcome = inngest.createFunction(
  {
    id: 'email-trial-welcome',
    name: 'Email: trial — powitalny',
    retries: 2,
    triggers: [userRegistered],
  },
  async ({ event, step, logger, attempt }) =>
    runEmailWelcome(event.data as Parameters<typeof userRegistered.create>[0], toJobContext({ step, logger, attempt })),
);

/** Email 2: dzień 1 — pierwsze kroki lub gratulacje. */
/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runEmailDay1(data: Parameters<typeof emailTrialDay1.create>[0], { step }: JobContext) {
    const { email, firstName, userId } = emailTrialDay1.parse(data);

    const firstInvoice = await step.run('check-first-invoice', async () => {
      const supabase = createAdminClient();
      // `users.tenant_id` NIE ISTNIEJE od migracji 00036 (model wielu firm:
      // powiązanie idzie przez `memberships`). Następcą jest
      // `last_active_tenant_id` — migracja wypełniła je z usuwanej kolumny,
      // a założenie firmy (akcja i RPC `create_organization_with_owner`)
      // ustawia je od razu. Do 25.09 te zapytania padały błędem 42703 przy
      // KAŻDYM nowym koncie, więc maile próbne z tego pliku nie wychodziły.
      const tenantId = await activeTenantIdOf(supabase, userId);
      if (!tenantId) return null;

      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (invErr) throw invErr;
      return inv;
    });

    if (!firstInvoice) {
      await step.run('send-help', async () => {
        await sendEmail({
          to: email,
          subject: 'Wystawisz pierwszą fakturę w 30 sekund. Krok po kroku.',
          html: DAY_1_HELP_TEMPLATE(firstName),
        });
      });
    } else {
      await step.run('send-congrats', async () => {
        await sendEmail({
          to: email,
          subject: '✓ Pierwsza faktura wysłana. Teraz spróbuj OCR.',
          html: DAY_1_CONGRATS_TEMPLATE(firstName),
        });
      });
    }

    await step.scheduleAfter('schedule-day-4', '3d', emailTrialDay4.create({ userId, email, firstName }));
}

export const emailDay1 = inngest.createFunction(
  {
    id: 'email-trial-day-1',
    name: 'Email: trial — dzień 1',
    retries: 2,
    triggers: [emailTrialDay1],
  },
  async ({ event, step, logger, attempt }) =>
    runEmailDay1(event.data as Parameters<typeof emailTrialDay1.create>[0], toJobContext({ step, logger, attempt })),
);

/** Email 3: dzień 4 — OCR. */
/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runEmailDay4(data: Parameters<typeof emailTrialDay4.create>[0], { step }: JobContext) {
    const { email, firstName, userId } = emailTrialDay4.parse(data);

    await step.run('send-ocr-demo', async () => {
      await sendEmail({
        to: email,
        subject: '[Demo 2 min] Zdjęcie paragonu → wpis do KPiR',
        html: DAY_4_OCR_TEMPLATE(firstName),
      });
    });

    await step.scheduleAfter('schedule-day-8', '4d', emailTrialDay8.create({ userId, email, firstName }));
}

export const emailDay4 = inngest.createFunction(
  {
    id: 'email-trial-day-4',
    name: 'Email: trial — dzień 4 (OCR)',
    retries: 2,
    triggers: [emailTrialDay4],
  },
  async ({ event, step, logger, attempt }) =>
    runEmailDay4(event.data as Parameters<typeof emailTrialDay4.create>[0], toJobContext({ step, logger, attempt })),
);

/** Email 4: dzień 8 — statystyki z bazy. */
/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runEmailDay8(data: Parameters<typeof emailTrialDay8.create>[0], { step }: JobContext) {
    const { email, firstName, userId } = emailTrialDay8.parse(data);

    const stats = await step.run('compute-stats', async () => {
      const supabase = createAdminClient();
      const tenantId = await activeTenantIdOf(supabase, userId);
      if (!tenantId) return { invoicesCount: 0, expensesCount: 0 };

      const { count: invoicesCount, error: invCountErr } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      if (invCountErr) throw invCountErr;

      const { count: expensesCount, error: expCountErr } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      if (expCountErr) throw expCountErr;

      return { invoicesCount: invoicesCount ?? 0, expensesCount: expensesCount ?? 0 };
    });

    const totalDocs = stats.invoicesCount + stats.expensesCount;
    const minutesSaved = totalDocs * 6.5;
    const hoursSaved = (minutesSaved / 60).toFixed(1);

    await step.run('send-stats', async () => {
      await sendEmail({
        to: email,
        subject: `${firstName}, w 8 dni zaoszczędziłeś ${hoursSaved}h pracy`,
        html: DAY_8_STATS_TEMPLATE(firstName, totalDocs, hoursSaved),
      });
    });

    // Dzień 8 kończy sekwencję. Maile z dnia 12 i 14 („2 dni do końca
    // trialu”, „trial zakończony, konto read-only, dane usuwane po 30 dniach”)
    // przeczyły regulaminowi (§3 ust. 3: trial 30 dni), retencji faktur
    // (10 lat) i aplikacji (nie ma trybu tylko do odczytu); szły też do
    // płacących, bo `subscription_tier` nikt nie aktualizuje. Koniec trialu
    // z kartą zapowiada `trial-countdown-emails` (Stripe). Wstrzymane 01.10.2026.
}

export const emailDay8 = inngest.createFunction(
  {
    id: 'email-trial-day-8',
    name: 'Email: trial — dzień 8 (statystyki)',
    retries: 2,
    triggers: [emailTrialDay8],
  },
  async ({ event, step, logger, attempt }) =>
    runEmailDay8(event.data as Parameters<typeof emailTrialDay8.create>[0], toJobContext({ step, logger, attempt })),
);

/**
 * Email 5 (dzień 12) — WSTRZYMANY 01.10.2026, powód przy `runEmailDay8`.
 * Kolejka zostaje: zdarzenia zaplanowane przed wstrzymaniem (rejestracje
 * z ostatnich dni) muszą zostać odebrane i pominięte, a nie wysłane.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runEmailDay12(rawData: Parameters<typeof emailTrialDay12.create>[0]) {
    emailTrialDay12.parse(rawData);
    return { skipped: 'wstrzymany' as const };
}

export const emailDay12 = inngest.createFunction(
  {
    id: 'email-trial-day-12',
    name: 'Email: trial — dzień 12',
    retries: 2,
    triggers: [emailTrialDay12],
  },
  async ({ event }) =>
    runEmailDay12(event.data as Parameters<typeof emailTrialDay12.create>[0]),
);

/**
 * Email 6 (dzień 14, „trial zakończony”) — WSTRZYMANY 01.10.2026, powód przy
 * `runEmailDay8`. Kolejka zostaje dla zdarzeń zaplanowanych wcześniej.
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runEmailDay14(data: Parameters<typeof emailTrialDay14.create>[0]) {
    emailTrialDay14.parse(data);
    return { skipped: 'wstrzymany' as const };
}

export const emailDay14 = inngest.createFunction(
  {
    id: 'email-trial-day-14',
    name: 'Email: trial — dzień 14',
    retries: 2,
    triggers: [emailTrialDay14],
  },
  async ({ event }) =>
    runEmailDay14(event.data as Parameters<typeof emailTrialDay14.create>[0]),
);
