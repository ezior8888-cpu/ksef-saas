// lib/reminders/templates.ts
// Default templates (po polsku) + personalizacja z variables

export interface TemplateVariables {
  numerFaktury: string;
  kwota: string; // formatted "1 234,56 PLN"
  kwotaDoZaplaty: string; // jeśli częściowo zapłacona
  dataWystawienia: string; // "15.04.2026"
  terminPlatnosci: string;
  dniPoTerminie: number;
  nazwaFirmy: string; // tenant name
  nazwaKontrahenta: string;
  rachunekBankowy?: string;
  linkPlatnosci?: string; // jeśli skonfigurowany
  imieNadawcy: string;
}

export interface ResolvedTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

// ============================================================================
// DEFAULT TEMPLATES (po polsku)
// ============================================================================

export const DEFAULT_TEMPLATES: Record<
  'stage_1' | 'stage_2' | 'stage_3' | 'stage_4',
  { subject: string; body: string }
> = {
  // === ETAP 1: 3 dni po terminie - uprzejmy ===
  stage_1: {
    subject: 'Przypomnienie o płatności faktury {numerFaktury}',
    body: `Dzień dobry,

Może umknęło Państwu w skrzynce — wystawiona przez nas faktura **{numerFaktury}** z dnia {dataWystawienia} jest po terminie płatności (termin: {terminPlatnosci}, {dniPoTerminie} dni temu).

**Kwota do zapłaty: {kwotaDoZaplaty}**

Rachunek bankowy: \`{rachunekBankowy}\`

Jeśli płatność jest już w drodze — proszę zignorować ten email. W razie pytań lub problemów z płatnością, prosimy o kontakt zwrotny.

Pozdrawiam,
{imieNadawcy}
{nazwaFirmy}`,
  },

  // === ETAP 2: 7 dni po terminie - stanowczy ===
  stage_2: {
    subject:
      'Pilne przypomnienie - faktura {numerFaktury} po terminie ({dniPoTerminie} dni)',
    body: `Dzień dobry,

Niestety nadal nie odnotowaliśmy zapłaty za fakturę **{numerFaktury}** wystawioną {dataWystawienia}. Termin płatności minął **{dniPoTerminie} dni temu**.

**Pozostała kwota do zapłaty: {kwotaDoZaplaty}**

Bardzo prosimy o pilne uregulowanie należności na rachunek:
\`{rachunekBankowy}\`

W tytule przelewu prosimy podać numer faktury: **{numerFaktury}**

Jeśli wystąpiły problemy z płatnością lub potrzebujecie Państwo dłuższego terminu, prosimy o kontakt — wspólnie znajdziemy rozwiązanie.

Pozdrawiam,
{imieNadawcy}
{nazwaFirmy}`,
  },

  // === ETAP 3: 14 dni po terminie - przedsądowe wezwanie ===
  stage_3: {
    subject: 'Przedsądowe wezwanie do zapłaty - faktura {numerFaktury}',
    body: `Dzień dobry,

Mimo wcześniejszych przypomnień, faktura **{numerFaktury}** z dnia {dataWystawienia} pozostaje nieuregulowana od **{dniPoTerminie} dni** po terminie płatności.

**Kwota do zapłaty: {kwotaDoZaplaty}**

W załączniku znajduje się **przedsądowe wezwanie do zapłaty** zgodne z art. 187 § 1 pkt 3 Kodeksu postępowania cywilnego.

W przypadku braku wpłaty w terminie **7 dni** od daty otrzymania niniejszego pisma, sprawa zostanie skierowana na drogę sądową, co wiązać się będzie z dodatkowymi kosztami obciążającymi dłużnika (koszty postępowania, odsetki ustawowe, koszty zastępstwa procesowego).

**Numer rachunku bankowego do wpłaty:**
\`{rachunekBankowy}\`

Tytuł przelewu: **{numerFaktury}**

Mamy nadzieję na polubowne rozwiązanie sprawy. W razie pytań prosimy o pilny kontakt.

Z poważaniem,
{imieNadawcy}
{nazwaFirmy}`,
  },

  // === ETAP 4: 30+ dni - finalne (escalation) ===
  stage_4: {
    subject: 'OSTATECZNE wezwanie do zapłaty - faktura {numerFaktury}',
    body: `Dzień dobry,

To jest **ostateczne wezwanie do zapłaty**. Faktura **{numerFaktury}** pozostaje nieuregulowana od **{dniPoTerminie} dni** po terminie.

**Kwota: {kwotaDoZaplaty}**

W przypadku braku wpłaty w ciągu **3 dni roboczych** od otrzymania tego emaila:
- sprawa zostanie skierowana do sądu w trybie elektronicznego postępowania upominawczego (e-EPU)
- zostaną naliczone odsetki ustawowe za opóźnienie
- koszty postępowania sądowego obciążą dłużnika

To ostatnia szansa na polubowne rozwiązanie. Prosimy o pilny kontakt lub zapłatę.

Z poważaniem,
{imieNadawcy}
{nazwaFirmy}`,
  },
};

// ============================================================================
// MAIN: resolve template z variables
// ============================================================================

export function resolveTemplate(
  template: { subject: string; body: string },
  variables: TemplateVariables,
): ResolvedTemplate {
  const subject = replaceVariables(template.subject, variables);
  const bodyMarkdown = replaceVariables(template.body, variables);

  return {
    subject,
    bodyHtml: markdownToHtml(bodyMarkdown),
    bodyText: bodyMarkdown,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function replaceVariables(text: string, variables: TemplateVariables): string {
  return text
    .replace(/{numerFaktury}/g, variables.numerFaktury)
    .replace(/{kwota}/g, variables.kwota)
    .replace(/{kwotaDoZaplaty}/g, variables.kwotaDoZaplaty)
    .replace(/{dataWystawienia}/g, variables.dataWystawienia)
    .replace(/{terminPlatnosci}/g, variables.terminPlatnosci)
    .replace(/{dniPoTerminie}/g, String(variables.dniPoTerminie))
    .replace(/{nazwaFirmy}/g, variables.nazwaFirmy)
    .replace(/{nazwaKontrahenta}/g, variables.nazwaKontrahenta)
    .replace(/{rachunekBankowy}/g, variables.rachunekBankowy ?? '')
    .replace(/{linkPlatnosci}/g, variables.linkPlatnosci ?? '')
    .replace(/{imieNadawcy}/g, variables.imieNadawcy);
}

function markdownToHtml(markdown: string): string {
  // Lekka konwersja markdown → HTML (bez external library)
  const html = markdown
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code (rachunki bankowe etc.)
    .replace(
      /`(.+?)`/g,
      '<code style="font-family: monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 4px;">$1</code>',
    )
    // Newlines → paragraphs
    .split('\n\n')
    .map((para) =>
      `<p style="margin: 0 0 16px 0; line-height: 1.6;">${para.replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; }
  p { margin: 0 0 16px 0; line-height: 1.6; }
  strong { font-weight: 600; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, monospace; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

// ============================================================================
// Helper: format kwoty PLN
// ============================================================================

export function formatPln(amount: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDatePl(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL');
}
