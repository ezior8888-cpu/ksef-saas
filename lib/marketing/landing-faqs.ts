/** FAQ strony głównej (marketing) — treść jak wcześniej w `FaqSection`. */
export const LANDING_FAQ_ITEMS: { q: string; a: string }[] = [
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
    a: 'Eksport pełnych danych (wszystkie faktury PDF + JPK_FA + KPiR Excel + raw XML) dostępny w 30 dni po anulowaniu. Po 30 dniach dane są permanentnie usuwane. Hosting we Frankfurcie (UE), zgodnie z RODO.',
  },
  {
    q: 'Czy mogę dodać moją księgową?',
    a: 'Tak. Generujesz token portalu księgowego — księgowa wchodzi przez własny URL, pobiera JPK_FA / KPiR / faktury w wybranym formacie (Comarch Optima, Symfonia, Insert, Wapro Mag). Co-Pilot Księgowego automatycznie wysyła pakiet 25. każdego miesiąca.',
  },
  {
    q: 'OCR działa po polsku?',
    a: 'Tak — używamy modeli wizyjnych pod polskie faktury i paragony. Rozpoznaje polskie NIP-y, nazwy firm, formaty dat, stawki VAT (23/8/5/0/zw/oo). Confidence score dla każdego pola — wiesz, co wymaga sprawdzenia.',
  },
  {
    q: 'Jak działa 60-day money-back?',
    a: 'Przez pierwsze 60 dni płatnej subskrypcji możesz zażądać pełnego zwrotu bez podawania powodu. Pisz na support@ksef-saas.pl — zwracamy w 5 dni roboczych. Po 60 dniach zwrot proporcjonalny do niewykorzystanego okresu.',
  },
  {
    q: 'Mam niezaksięgowane 50 faktur sprzed lutego 2026 — co z nimi?',
    a: 'Wystawione przed obowiązkową datą KSeF zostają w dotychczasowym trybie. Zaakceptowane faktury kosztowe możesz importować przez Magiczny Import — trafią do KPiR zgodnie z zasadami księgowania.',
  },
];
