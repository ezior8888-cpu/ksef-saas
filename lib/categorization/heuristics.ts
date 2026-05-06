// Warstwa 2: heurystyki — słowa kluczowe w nazwie sprzedawcy / pozycjach

import type { ExtractedInvoice } from '@/lib/ocr/schema';

import type { CategorizationResult, KpirColumn } from './rule-engine';

interface HeuristicRule {
  keywords: RegExp;
  kpir_column: KpirColumn;
  category_label: string;
}

const HEURISTIC_RULES: HeuristicRule[] = [
  {
    keywords:
      /\b(benzyna|olej napędowy|on |pb95|pb98|diesel|paliwo|adblue|lpg|gaz lpg)\b/i,
    kpir_column: 'col_13',
    category_label: 'Paliwo',
  },
  {
    keywords:
      /\b(abonament|opłata abonamentowa|usługi telekomunikac|telefon|internet|światłowód)\b/i,
    kpir_column: 'col_13',
    category_label: 'Telekomunikacja',
  },
  {
    keywords:
      /\b(energia elektryczna|prąd|kwh|moc bierna|gaz ziemny|gaz sieciowy)\b/i,
    kpir_column: 'col_13',
    category_label: 'Media',
  },
  {
    keywords:
      /\b(licencja|oprogramowanie|saas|subskrypc|aplikacja|software|cloud|github|figma|notion|slack|jetbrains)\b/i,
    kpir_column: 'col_13',
    category_label: 'Oprogramowanie',
  },
  {
    keywords:
      /\b(restauracja|kawiarnia|catering|pizza|obiad|kolacja|śniadanie|bar |kebab|sushi)\b/i,
    kpir_column: 'col_13',
    category_label: 'Reprezentacja',
  },
  {
    keywords:
      /\b(hotel|nocleg|booking|airbnb|pkp|pociąg|bilet|przelot|samolot|uber|bolt|taxi)\b/i,
    kpir_column: 'col_13',
    category_label: 'Podróże służbowe',
  },
  {
    keywords:
      /\b(reklama|kampania|google ads|facebook ads|meta ads|linkedin|seo|sem|copywriting)\b/i,
    kpir_column: 'col_13',
    category_label: 'Marketing',
  },
  {
    keywords:
      /\b(papier|toner|tusz|drukarka|biurowe|długopis|notatnik|kalendarz)\b/i,
    kpir_column: 'col_13',
    category_label: 'Materiały biurowe',
  },
  {
    keywords:
      /\b(usługi księgowe|biuro rachunkowe|doradztwo|prawnik|kancelaria|adwokat|radca)\b/i,
    kpir_column: 'col_13',
    category_label: 'Usługi obce',
  },
  {
    keywords:
      /\b(prowizja|opłata bankowa|leasing|rata leasingu|odsetki)\b/i,
    kpir_column: 'col_13',
    category_label: 'Usługi finansowe',
  },
  {
    keywords:
      /\b(wynagrodzenie|umowa o pracę|umowa zlecenie|umowa o dzieło|honorarium)\b/i,
    kpir_column: 'col_12',
    category_label: 'Wynagrodzenia',
  },
];

/**
 * Próbuje sklasyfikować na podstawie heurystyk — skanuje seller_name + line_items.
 */
export function classifyByHeuristics(
  data: ExtractedInvoice
): CategorizationResult | null {
  const searchText = [
    data.seller_name,
    ...(data.line_items?.map((l) => l.name) ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const rule of HEURISTIC_RULES) {
    if (rule.keywords.test(searchText)) {
      return {
        kpir_column: rule.kpir_column,
        category_label: rule.category_label,
        confidence: 0.75,
        method: 'ml_heuristic',
      };
    }
  }

  return null;
}
