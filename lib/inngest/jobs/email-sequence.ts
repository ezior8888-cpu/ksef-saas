import { createAdminClient } from '@/lib/supabase/admin';
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
<p>Subskrypcja KSeF SaaS to 49 zł/mc. Pełny rok = 588 PLN. Już teraz zwróciło się.</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="${APP_BASE}/settings" class="button">Przejdź do rozliczeń / ustawień →</a>
</p>
<p>— Bartek</p>`;
}

function DAY_12_PUSH_TEMPLATE(name: string) {
  const safe = escapeHtml(name);
  return `
${baseStyle}
<h1>${safe}, 2 dni do końca trialu</h1>
<p>Nie chcę, żebyś stracił dostęp. Co dalej?</p>
<p><strong>Opcja A: Aktywuj subskrypcję</strong></p>
<p>49 zł/mc rocznie (588 PLN/rok) lub 59 zł/mc miesięcznie (708 PLN/rok). Wszystkie funkcje. Bez upgrade&apos;ów.</p>
<p style="text-align: center; margin: 20px 0;">
  <a href="${APP_BASE}/settings" class="button">Aktywuj →</a>
</p>
<p><strong>Opcja B: Zostaw mi feedback</strong></p>
<p>Czego brakuje? Co byś zmienił? Po prostu odpisz na ten email — czytam wszystko sam.</p>
<p><strong>Opcja C: Pamiętaj o 60 dni money-back</strong></p>
<p>Jeśli coś nie zagra po aktywacji — pełny zwrot bez pytań. Wystarczy email.</p>
<p>— Bartek</p>`;
}

function DAY_14_END_TEMPLATE(name: string) {
  const safe = escapeHtml(name);
  return `
${baseStyle}
<h1>${safe}, trial zakończony</h1>
<p>Twoje konto jest teraz w trybie read-only. Możesz pobrać wszystkie dane (faktury, JPK_FA, KPiR Excel), ale nie wystawisz nowych faktur ani nie dodasz wydatków.</p>
<p><strong>Co możesz zrobić teraz:</strong></p>
<ul>
  <li><a href="${APP_BASE}/settings">Aktywuj subskrypcję</a> i kontynuuj</li>
  <li><a href="${APP_BASE}/reports/exports">Pobierz wszystkie dane</a> (30 dni dostęp)</li>
  <li>Po 30 dniach dane są usuwane permanentnie (RODO)</li>
</ul>
<p>Może niedługo wrócisz. KSeF i tak będzie obowiązkowy w 2026 — mamy jeszcze rok żeby wybrać apkę, do której się przyzwyczaisz.</p>
<p>— Bartek</p>`;
}

/** Email 1: Welcome — zaraz po rejestracji (`user/registered`). */
export const emailWelcome = inngest.createFunction(
  {
    id: 'email-trial-welcome',
    name: 'Email: trial — powitalny',
    retries: 2,
    triggers: [userRegistered],
  },
  async ({ event, step }) => {
    const { userId, email, firstName } = userRegistered.parse(event.data);

    await step.run('send-welcome', async () => {
      await sendEmail({
        to: email,
        subject: 'Witaj w KSeF SaaS — pierwsze kroki',
        html: WELCOME_TEMPLATE(firstName),
      });
    });

    await step.sleep('wait-day-1', '1d');

    await step.sendEvent('schedule-day-1', emailTrialDay1.create({ userId, email, firstName }));

    return { sent: 'welcome' as const };
  },
);

/** Email 2: dzień 1 — pierwsze kroki lub gratulacje. */
export const emailDay1 = inngest.createFunction(
  {
    id: 'email-trial-day-1',
    name: 'Email: trial — dzień 1',
    retries: 2,
    triggers: [emailTrialDay1],
  },
  async ({ event, step }) => {
    const { email, firstName, userId } = emailTrialDay1.parse(event.data);

    const firstInvoice = await step.run('check-first-invoice', async () => {
      const supabase = createAdminClient();
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle();

      if (userErr) throw userErr;
      if (!userRow?.tenant_id) return null;

      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id')
        .eq('tenant_id', userRow.tenant_id)
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

    await step.sleep('wait-day-4', '3d');
    await step.sendEvent('schedule-day-4', emailTrialDay4.create({ userId, email, firstName }));
  },
);

/** Email 3: dzień 4 — OCR. */
export const emailDay4 = inngest.createFunction(
  {
    id: 'email-trial-day-4',
    name: 'Email: trial — dzień 4 (OCR)',
    retries: 2,
    triggers: [emailTrialDay4],
  },
  async ({ event, step }) => {
    const { email, firstName, userId } = emailTrialDay4.parse(event.data);

    await step.run('send-ocr-demo', async () => {
      await sendEmail({
        to: email,
        subject: '[Demo 2 min] Zdjęcie paragonu → wpis do KPiR',
        html: DAY_4_OCR_TEMPLATE(firstName),
      });
    });

    await step.sleep('wait-day-8', '4d');
    await step.sendEvent('schedule-day-8', emailTrialDay8.create({ userId, email, firstName }));
  },
);

/** Email 4: dzień 8 — statystyki z bazy. */
export const emailDay8 = inngest.createFunction(
  {
    id: 'email-trial-day-8',
    name: 'Email: trial — dzień 8 (statystyki)',
    retries: 2,
    triggers: [emailTrialDay8],
  },
  async ({ event, step }) => {
    const { email, firstName, userId } = emailTrialDay8.parse(event.data);

    const stats = await step.run('compute-stats', async () => {
      const supabase = createAdminClient();
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle();

      if (userErr) throw userErr;
      if (!userRow?.tenant_id) return { invoicesCount: 0, expensesCount: 0 };

      const { count: invoicesCount, error: invCountErr } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', userRow.tenant_id);

      if (invCountErr) throw invCountErr;

      const { count: expensesCount, error: expCountErr } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', userRow.tenant_id);

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

    await step.sleep('wait-day-12', '4d');
    await step.sendEvent('schedule-day-12', emailTrialDay12.create({ userId, email, firstName }));
  },
);

/** Email 5: dzień 12 — konwersja. */
export const emailDay12 = inngest.createFunction(
  {
    id: 'email-trial-day-12',
    name: 'Email: trial — dzień 12',
    retries: 2,
    triggers: [emailTrialDay12],
  },
  async ({ event, step }) => {
    const data = emailTrialDay12.parse(event.data);

    await step.run('send-push', async () => {
      await sendEmail({
        to: data.email,
        subject: '2 dni do końca trialu — co dalej?',
        html: DAY_12_PUSH_TEMPLATE(data.firstName),
      });
    });

    await step.sleep('wait-day-14', '2d');
    await step.sendEvent('schedule-day-14', emailTrialDay14.create(data));
  },
);

/**
 * Email 6: dzień 14 — koniec trialu.
 * Płatność: `tenants.subscription_tier !== 'basic'` traktujemy jako aktywną subskrypcję
 * (do podmiany, gdy pojawi się dedykowany billing / Stripe).
 */
export const emailDay14 = inngest.createFunction(
  {
    id: 'email-trial-day-14',
    name: 'Email: trial — dzień 14',
    retries: 2,
    triggers: [emailTrialDay14],
  },
  async ({ event, step }) => {
    const { email, firstName, userId } = emailTrialDay14.parse(event.data);

    const subscribed = await step.run('check-subscription', async () => {
      const supabase = createAdminClient();
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle();

      if (userErr) throw userErr;
      if (!userRow?.tenant_id) return false;

      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .select('subscription_tier')
        .eq('id', userRow.tenant_id)
        .maybeSingle();

      if (tenantErr) throw tenantErr;
      const tier = tenant?.subscription_tier ?? 'basic';
      return tier !== 'basic';
    });

    if (subscribed) {
      return { skipped: true as const };
    }

    await step.run('send-trial-ended', async () => {
      await sendEmail({
        to: email,
        subject: 'Trial zakończony. Chcesz kontynuować?',
        html: DAY_14_END_TEMPLATE(firstName),
      });
    });

    return { sent: true as const };
  },
);
