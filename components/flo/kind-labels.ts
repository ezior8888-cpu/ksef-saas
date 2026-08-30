import { type FloProposalKind } from '@/types/flo';

/**
 * Nazwy rodzajów spraw po ludzku — do ekranu wyciszeń (krok 21 toru B).
 *
 * Klient, który wyciszył „nigdy więcej takich”, musi umieć znaleźć tę sprawę
 * na liście i ją przywrócić. `payment.chase` mu w tym nie pomoże.
 *
 * `Record<FloProposalKind, string>` wymusza komplet: nowy rodzaj po stronie
 * silnika zatrzyma kompilację tutaj, zamiast pokazać klientowi surowy klucz
 * z bazy.
 */
export const FLO_KIND_LABELS: Record<FloProposalKind, string> = {
  'invoice.draft': 'Szkice faktur',
  'invoice.batch': 'Paczki faktur na początek miesiąca',
  'invoice.final': 'Faktury końcowe po zaliczce',
  'invoice.raise': 'Propozycje podwyżki stawki',
  'contractor.check': 'Ostrzeżenia o kontrahentach',
  'contractor.foreign': 'Transakcje zagraniczne',
  'payment.confirm': 'Pytania „czy zapłacił?”',
  'payment.chase': 'Ponaglenia o płatność',
  'payment.score': 'Oceny rzetelności kontrahentów',
  'payment.interest': 'Odsetki za opóźnienie',
  'expense.review': 'Koszty do decyzji',
  'expense.rule': 'Nauka reguł księgowania',
  'expense.missing': 'Zgubione dokumenty kosztowe',
  'ksef.status': 'Informacje o wysyłce do KSeF',
  'ksef.fix': 'Poprawki po odrzuceniu przez KSeF',
  'ksef.cert': 'Certyfikat KSeF',
  'ksef.outage': 'Awarie po stronie Ministerstwa',
  'ksef.audit': 'Audyt porządku w dokumentach',
  'tax.deadline': 'Terminy podatkowe',
  'tax.limit': 'Limity (VAT, ryczałt)',
  'tax.relief': 'Ulgi i odliczenia',
  'tax.simulate': 'Symulacje formy opodatkowania',
  'tax.setaside': 'Odkładanie pieniędzy na podatek',
  'accountant.package': 'Paczki dla księgowej',
  'accountant.delivery': 'Potwierdzenia doręczenia do księgowej',
  'accountant.format': 'Format eksportu dla biura',
  'onboarding.step': 'Pierwsze kroki w aplikacji',
  'import.done': 'Import historii',
  'feature.hint': 'Podpowiedzi funkcji',
  'chat.draft': 'Szkice z rozmowy',
  'wrapped.ready': 'Podsumowanie roku',
  'milestone.money': 'Progi przychodu',
};

/** Nazwa rodzaju albo sam klucz, gdy baza pamięta coś starszego niż kod. */
export function floKindLabel(kind: string): string {
  return (FLO_KIND_LABELS as Record<string, string>)[kind] ?? kind;
}
