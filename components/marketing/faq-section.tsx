const FAQS = [
  {
    q: 'Co to jest KSeF i czy muszę go używać?',
    a: 'KSeF (Krajowy System e-Faktur) to ministerski system odbioru faktur w Polsce. Od lutego 2026 jest obowiązkowy dla wszystkich firm wystawiających faktury VAT. Bez integracji z KSeF Twoja faktura jest nieważna.',
  },
  {
    q: 'Czy migracja z innych apek jest skomplikowana?',
    a: 'Nie. Magiczny Import pobiera Twoją historię z KSeF (wszystkie faktury z ostatnich 2 lat) i z plików CSV / XML eksportowanych przez konkurencję. Cały proces zajmuje 5-10 minut. Bez ręcznego przepisywania.',
  },
  {
    q: 'Co dzieje się gdy MF/KSeF jest niedostępny?',
    a: 'Mamy tryb Offline24 — zapisujemy fakturę lokalnie i kolejkujemy do wysyłki gdy KSeF wróci. Generujemy QR Code dla nabywcy zgodny z rozporządzeniem MF. Klient nie widzi żadnej różnicy.',
  },
  {
    q: 'Co się dzieje z moimi danymi po anulowaniu subskrypcji?',
    a: 'Eksport pełnych danych (wszystkie faktury PDF + JPK_FA + KPiR Excel + raw XML) dostępny w 30 dni po anulowaniu. Po 30 dniach dane są permanentnie usuwane. Hosting we Frankfurcie, GDPR-compliant.',
  },
  {
    q: 'Czy mogę dodać moją księgową?',
    a: 'Tak. Generujesz token portalu księgowego — księgowa wchodzi przez własny URL, pobiera JPK_FA / KPiR / faktury w wybranym formacie (Comarch Optima, Symfonia, Insert, Wapro Mag). Co-Pilot Księgowego automatycznie wysyła pakiet 25. każdego miesiąca.',
  },
  {
    q: 'OCR działa po polsku?',
    a: 'Tak — używamy Claude Vision API specjalnie wytrenowanego pod polskie faktury i paragony. Rozpoznaje polskie NIP-y, polskie nazwy firm, formaty dat, polskie stawki VAT (23/8/5/0/zw/oo). Confidence score dla każdego pola — wiesz co wymaga sprawdzenia.',
  },
  {
    q: 'Jak działa 60-day money-back?',
    a: 'Przez pierwsze 60 dni płatnej subskrypcji możesz zażądać pełnego zwrotu bez podawania powodu. Pisz na support@ksef-saas.pl — zwracamy w 5 dni roboczych. Po 60 dniach zwrot proporcjonalny do niewykorzystanego okresu.',
  },
  {
    q: 'Mam nieuczynione 50 faktur sprzed lutego 2026 - co z nimi?',
    a: 'Wystawione przed obowiązkową datą KSeF? Zostają w starym systemie - nie wpadają do KSeF. Zaakceptowane faktury kosztowe sprzed lutego 2026 możesz importować przez Magiczny Import - trafią do Twojego KPiR ale bez wysyłki do KSeF.',
  },
];

/**
 * FAQ — dark+emerald accordion. Natywny <details>/<summary> bez JS state.
 * Plus glow na hover + emerald chevron z rotacją przy open.
 */
export function FaqSection() {
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div className="mb-16 text-center">
          <p className="marketing-section-label mb-3">FAQ</p>
          <h2 className="marketing-hero-title text-4xl md:text-5xl">
            Częste{' '}
            <span className="font-editorial italic marketing-gradient-emerald">
              pytania
            </span>
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <details className="group marketing-glass-card overflow-hidden rounded-xl [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-[var(--marketing-text)] transition-colors hover:text-[var(--marketing-accent)]">
        <span className="text-sm font-medium leading-snug">{question}</span>
        <span
          className="marketing-icon-chip flex h-7 w-7 shrink-0 transition-transform duration-300 group-open:rotate-180"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </summary>
      <div className="border-t border-white/10 bg-white/[0.03] px-5 py-4">
        <p className="text-sm leading-relaxed text-[var(--marketing-muted)]">
          {answer}
        </p>
      </div>
    </details>
  );
}
