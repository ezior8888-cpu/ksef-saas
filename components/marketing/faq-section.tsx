'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'Co to jest KSeF i czy muszę go używać?',
    a: 'KSeF (Krajowy System e-Faktur) to ministerski system odbioru faktur w Polsce. Od lutego 2026 jest obowiązkowy dla wszystkich firm wystawiających faktury VAT. Bez integracji z KSeF Twoja faktura jest nieważna.',
  },
  {
    q: 'Czy migracja z Fakturownia / inFakt jest skomplikowana?',
    a: 'Nie. Magiczny Import pobiera Twoją historię z KSeF (wszystkie faktury z ostatnich 2 lat) i z plików CSV / XML eksportowanych przez konkurencję. Cały proces zajmuje 5-10 minut. Bez ręcznego przepisywania.',
  },
  {
    q: 'Co dzieje się gdy MF/KSeF jest niedostępny?',
    a: 'Mamy tryb Offline24 — zapisujemy fakturę lokalnie i kolejkujemy do wysyłki gdy KSeF wróci. Generujemy QR Code dla nabywcy zgodny z rozporządzeniem MF. Klient nie widzi żadnej różnicy.',
  },
  {
    q: 'Co się dzieje z moimi danymi po anulowaniu subskrypcji?',
    a: 'Eksport pełnych danych (wszystkie faktury PDF + JPK_FA + KPiR Excel + raw XML) dostępny w 30 dni po anulowaniu. Po 30 dniach dane są permanentnie usuwane. Hosting we Frankfurcie 🇪🇺, GDPR-compliant.',
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

export function FaqSection() {
  return (
    <section className="border-t border-glass-border py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">FAQ</p>
          <h2 className="font-display text-4xl font-semibold tracking-tighter-display md:text-5xl">
            Pytania, które dostajemy najczęściej
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <FaqItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface FaqItemProps {
  question: string;
  answer: string;
}

function FaqItem({ question, answer }: FaqItemProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="overflow-hidden rounded-2xl border border-glass-border bg-glass-white backdrop-blur-glass">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-glass-white-strong"
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="text-sm font-medium">{question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="px-5 pb-5" id={contentId} role="region">
          <p className="text-sm leading-relaxed text-muted-foreground">{answer}</p>
        </div>
      ) : null}
    </div>
  );
}
