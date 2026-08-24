/**
 * Atrapy propozycji agenta FLO.
 *
 * PO CO TO JEST: dzięki temu plikowi tor interfejsu (Masło) buduje cały
 * ekran agenta, zanim powstanie jakikolwiek prawdziwy silnik — i nigdy na
 * niego nie czeka. Podmiana atrap na prawdziwe dane to jedna linijka
 * w jednym miejscu.
 *
 * ZAWARTOŚĆ: po jednej propozycji każdego z sześciu wariantów karty,
 * wszystkie cztery rodzaje podglądu oraz komplet przypadków brzegowych,
 * na których interfejs zwykle się wykłada:
 *
 *   · tytuł 120 znaków i treść 400 znaków        → przepełnienie
 *   · propozycja bez dowodów (evidence: [])      → pusty stan sekcji
 *   · propozycja wygasająca za 4 minuty          → odliczanie
 *   · paczka 10 faktur, 3 odznaczone             → najcięższa karta
 *   · kwota 1 234 567,89 zł                      → formatowanie liczb
 *   · nazwa kontrahenta bez spacji na 60 znaków  → łamanie tekstu
 *
 * UWAGA DLA INTERFEJSU: wszystkie kwoty przychodzą jako gotowe napisy.
 * Interfejs ich nie przelicza i nie formatuje — to robi serwer.
 *
 * Znaczniki czasu liczone są przy załadowaniu modułu, żeby odliczanie do
 * `expiresAt` działało w podglądzie na żywo.
 */

import type {
  FloAction,
  FloListItem,
  FloProposalView,
  FloScheduledView,
} from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Pomocnicze
// ═══════════════════════════════════════════════════════════════

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const BASE = Date.now();

/** Znacznik czasu przesunięty względem załadowania modułu. */
const at = (offsetMs: number): string => new Date(BASE + offsetMs).toISOString();

/** Dwie standardowe akcje drugorzędne, obecne prawie na każdej karcie. */
const STD_SECONDARY: FloAction[] = [
  { label: 'Nie teraz', intent: 'snooze' },
  { label: 'Nigdy więcej takich', intent: 'mute' },
];

/** Kontrahent bez spacji — 60 znaków, test łamania długiego wyrazu. */
const LONG_CONTRACTOR =
  'PrzedsiebiorstwoWielobranzoweHandlowoUslugoweNowakowscySpZoo';

/** Tytuł 120 znaków — test przepełnienia nagłówka karty. */
const LONG_TITLE =
  'Trzy faktury kosztowe za sierpień czekają na Twoją decyzję, bo nie rozpoznałem sprzedawców ani kolumny księgi przychodów';

/** Treść 410 znaków — test przepełnienia opisu karty. */
const LONG_BODY =
  'Dokumenty przyszły ze skrzynki KSeF w nocy z wtorku na środę i nie pasują do żadnej z Twoich dotychczasowych reguł: sprzedawca nie występował wcześniej, a kwoty odbiegają od tego, co zwykle księgujesz w tej kategorii. Nie przypisałem ich samodzielnie, bo przy nieznanym sprzedawcy wolę zapytać niż zgadywać. Otwórz listę, przypisz kolumnę raz, a przy kolejnym takim dokumencie zrobię to już bez pytania Ciebie.';

// ═══════════════════════════════════════════════════════════════
// Paczka faktur (P-02) — 10 pozycji, 3 odstające
// ═══════════════════════════════════════════════════════════════

const BATCH_ITEMS: FloListItem[] = [
  {
    id: 'b1',
    label: 'ACME Sp. z o.o.',
    sublabel: 'Usługi programistyczne · 14 dni',
    amount: '22 140,00 zł',
    preselected: true,
    needsPreview: false,
  },
  {
    id: 'b2',
    label: 'Nowak Sp. z o.o.',
    sublabel: 'Opieka nad serwisem · 7 dni',
    amount: '3 690,00 zł',
    preselected: true,
    needsPreview: false,
  },
  {
    id: 'b3',
    label: 'Kowalski Design',
    sublabel: 'Projekt graficzny · 14 dni',
    amount: '4 305,00 zł',
    preselected: true,
    needsPreview: false,
  },
  {
    id: 'b4',
    label: 'Studio Wnętrz Marta K.',
    sublabel: 'Konsultacje · 7 dni',
    amount: '1 845,00 zł',
    preselected: true,
    needsPreview: false,
  },
  {
    id: 'b5',
    label: 'Bistro Pod Lipą',
    sublabel: 'Obsługa strony · 14 dni',
    amount: '984,00 zł',
    preselected: true,
    needsPreview: false,
  },
  {
    id: 'b6',
    label: 'Fundacja Krok Dalej',
    sublabel: 'Hosting i domena · 21 dni',
    amount: '615,00 zł',
    preselected: true,
    needsPreview: false,
  },
  {
    id: 'b7',
    label: 'Trans-Bud Michalski',
    sublabel: 'Audyt techniczny · 14 dni',
    amount: '2 460,00 zł',
    preselected: true,
    needsPreview: false,
  },
  // ── trzy pozycje odstające: odznaczone, wymagają obejrzenia podglądu ──
  {
    id: 'b8',
    label: 'Grupa Wschód S.A.',
    sublabel: 'Kwota o 340% wyższa niż zwykle — sprawdź',
    amount: '1 234 567,89 zł',
    preselected: false,
    needsPreview: true,
  },
  {
    id: 'b9',
    label: LONG_CONTRACTOR,
    sublabel: 'Pierwsza faktura dla tego kontrahenta',
    amount: '7 380,00 zł',
    preselected: false,
    needsPreview: true,
  },
  {
    id: 'b10',
    label: 'Meblex Serwis',
    sublabel: 'Zmieniona stawka jednostkowej ceny',
    amount: '5 043,00 zł',
    preselected: false,
    needsPreview: true,
  },
];

// ═══════════════════════════════════════════════════════════════
// Propozycje
// ═══════════════════════════════════════════════════════════════

export const FLO_FIXTURES: FloProposalView[] = [
  // ── 1. wariant `info` (X-01) ────────────────────────────────
  {
    id: 'fx-info-ksef',
    kind: 'ksef.status',
    variant: 'info',
    title: 'Faktura 7/2026 przyjęta przez KSeF',
    body: 'UPO pobrane i schowane w archiwum. Klient dostał PDF na maila o 19:33.',
    evidence: [
      { label: 'Faktura 7/2026', href: '/invoices/fx-inv-7' },
      { label: 'UPO w archiwum', href: '/invoices/fx-inv-7#upo' },
    ],
    primary: { label: 'Pokaż fakturę', intent: 'open' },
    secondary: [{ label: 'Ukryj', intent: 'dismiss' }],
    expiresAt: at(7 * DAY),
    priority: 70,
    createdAt: at(-16 * HOUR),
  },

  // ── 2. wariant `single` + pasek cofnięcia (W-01) ─────────────
  {
    id: 'fx-single-expense',
    kind: 'expense.review',
    variant: 'single',
    title: 'Orlen, 312,40 zł — paliwo',
    body: 'Zaksięgowałem w kolumnie 13. Sprawdź, jeśli to nie był firmowy zakup.',
    evidence: [
      { label: 'Paragon z 22.08', href: '/expenses/fx-exp-1' },
      { label: 'Reguła: Orlen → paliwo', href: '/settings/flo#reguly' },
    ],
    primary: { label: 'Zgadza się', intent: 'approve' },
    secondary: [
      { label: 'Zmień kategorię', intent: 'open' },
      { label: 'To był prywatny zakup', intent: 'dismiss' },
    ],
    expiresAt: at(30 * DAY),
    priority: 60,
    createdAt: at(-40 * MINUTE),
    undoableUntil: at(9 * MINUTE),
  },

  // ── 3. wariant `preview`, podgląd `message` (K-02) ───────────
  {
    id: 'fx-preview-chase',
    kind: 'payment.chase',
    variant: 'preview',
    title: 'Nowak Sp. z o.o. — 4 300,00 zł, 8 dni po terminie',
    body: 'To już trzeci raz, kiedy płacą po czasie. Napisałem wiadomość — przeczytaj ją, zanim wyślę.',
    evidence: [
      { label: 'Faktura 5/2026', href: '/invoices/fx-inv-5' },
      { label: 'Historia płatności kontrahenta', href: '/contractors/fx-nowak' },
    ],
    primary: {
      label: 'Wyślij wiadomość',
      intent: 'approve',
      requiresPreview: true,
    },
    secondary: [
      { label: 'Poczekaj tydzień', intent: 'snooze' },
      { label: 'Odpuść temu klientowi', intent: 'mute' },
    ],
    preview: {
      type: 'message',
      to: 'ksiegowosc@nowak.example',
      subject: 'Przypomnienie o płatności — faktura 5/2026',
      bodyText:
        'Dzień dobry,\n\nprzypominam o fakturze 5/2026 na kwotę 4 300,00 zł, której termin płatności minął 16 sierpnia.\n\nJeśli płatność już wyszła, proszę potraktować tę wiadomość jako nieaktualną.\n\nPozdrawiam',
      editable: true,
    },
    expiresAt: at(2 * DAY),
    priority: 10,
    createdAt: at(-3 * HOUR),
  },

  // ── 4. wariant `choice` z trzecią opcją kwotową (K-01) ───────
  {
    id: 'fx-choice-payment',
    kind: 'payment.confirm',
    variant: 'choice',
    title: 'Nowak zapłacił za fakturę 5/2026?',
    body: '4 300,00 zł, termin minął wczoraj. Pytam raz — potem się już nie odezwę w tej sprawie.',
    evidence: [{ label: 'Faktura 5/2026', href: '/invoices/fx-inv-5' }],
    primary: { label: 'Tak, zapłacił', intent: 'approve' },
    secondary: [
      { label: 'Jeszcze nie', intent: 'dismiss' },
      {
        label: 'Częściowo',
        intent: 'input',
        inputLabel: 'Ile wpłynęło?',
        inputKind: 'amount',
      },
    ],
    expiresAt: at(30 * DAY),
    priority: 20,
    createdAt: at(-2 * HOUR),
  },

  // ── 5. wariant `list` (P-02) ─────────────────────────────────
  {
    id: 'fx-list-batch',
    kind: 'invoice.batch',
    variant: 'list',
    title: 'Jutro 1-go — przygotowałem 10 faktur',
    body: 'Siedem jest gotowych do wysyłki. Trzy odbiegają od tego, co zwykle wystawiasz — zaznaczysz je dopiero po obejrzeniu.',
    evidence: [
      { label: 'Twoje faktury z lipca', href: '/invoices?month=2026-07' },
    ],
    primary: {
      label: 'Wyślij zaznaczone',
      intent: 'approve',
      requiresPreview: true,
    },
    secondary: STD_SECONDARY,
    items: BATCH_ITEMS,
    expiresAt: at(7 * DAY),
    priority: 15,
    createdAt: at(-90 * MINUTE),
  },

  // ── 6. wariant `input` (B-01) ────────────────────────────────
  {
    id: 'fx-input-accountant',
    kind: 'accountant.package',
    variant: 'input',
    title: 'Sierpień domknięty — wysłać paczkę księgowej?',
    body: '22 faktury, 34 koszty, JPK_V7 w środku. Nie mam jeszcze adresu Twojej księgowej.',
    evidence: [
      { label: 'Zawartość paczki', href: '/reports/exports/fx-pack-08' },
      { label: 'Checklista domknięcia', href: '/flo/fx-pack-08' },
    ],
    primary: {
      label: 'Wyślij paczkę',
      intent: 'input',
      requiresPreview: true,
      inputLabel: 'Adres e-mail księgowej',
      inputKind: 'email',
    },
    secondary: [{ label: 'Nie teraz', intent: 'snooze' }],
    preview: {
      type: 'file',
      label: 'FaktFlow_sierpien_2026.zip',
      href: '/reports/exports/fx-pack-08/download',
      sizeLabel: '4,2 MB',
    },
    expiresAt: at(14 * DAY),
    priority: 25,
    createdAt: at(-5 * HOUR),
  },

  // ── 7. podgląd `invoice` (P-02 pojedynczy szkic) ─────────────
  {
    id: 'fx-preview-invoice',
    kind: 'invoice.draft',
    variant: 'preview',
    title: 'Faktura dla ACME gotowa — jak co miesiąc',
    body: 'Dwudziesty drugi raz z rzędu, te same pozycje i ta sama kwota. Numer nadam przy wysyłce.',
    evidence: [
      { label: 'Poprzednia faktura 6/2026', href: '/invoices/fx-inv-6' },
      { label: 'Kontrahent ACME', href: '/contractors/fx-acme' },
    ],
    primary: { label: 'Wyślij do KSeF', intent: 'approve', requiresPreview: true },
    secondary: [
      { label: 'Zmień', intent: 'open' },
      { label: 'Nie teraz', intent: 'snooze' },
    ],
    preview: {
      type: 'invoice',
      invoiceId: 'fx-draft-8',
      lines: [
        {
          name: 'Usługi programistyczne',
          qty: '1 usł.',
          net: '18 000,00 zł',
          vat: '4 140,00 zł',
          gross: '22 140,00 zł',
        },
      ],
      total: '22 140,00 zł',
      due: '14 dni · 14.09.2026',
    },
    expiresAt: at(7 * DAY),
    priority: 30,
    createdAt: at(-75 * MINUTE),
  },

  // ── 8. podgląd `diff` + wygasa za 4 minuty (X-02) ────────────
  {
    id: 'fx-diff-ksef-fix',
    kind: 'ksef.fix',
    variant: 'preview',
    title: 'KSeF odrzucił fakturę 8/2026 — poprawiłem NIP',
    body: 'NIP nabywcy miał 9 cyfr zamiast 10. Wziąłem poprawny z rejestru GUS. Zobacz różnicę i wyślij ponownie.',
    evidence: [
      { label: 'Odrzucenie z KSeF', href: '/invoices/fx-inv-8#ksef' },
      { label: 'Dane z GUS', href: '/contractors/fx-grupa-wschod' },
    ],
    primary: {
      label: 'Wyślij poprawioną',
      intent: 'approve',
      requiresPreview: true,
    },
    secondary: [{ label: 'Poprawię sam', intent: 'open' }],
    preview: {
      type: 'diff',
      rows: [
        {
          field: 'NIP nabywcy',
          before: '525244576',
          after: '5252445767',
        },
      ],
    },
    expiresAt: at(4 * MINUTE),
    priority: 5,
    createdAt: at(-20 * MINUTE),
  },

  // ── 9. podgląd `file` — gotowy JPK (T-01) ────────────────────
  {
    id: 'fx-file-jpk',
    kind: 'tax.deadline',
    variant: 'single',
    title: 'JPK_V7 za sierpień — do 25.09',
    body: 'Z Twoich dokumentów wychodzi 4 140,00 zł VAT do zapłaty. Policzone z 56 dokumentów, stan na dziś. To nie jest deklaracja podatkowa — plik wysyła Twoja księgowa albo Ty.',
    evidence: [
      { label: '22 faktury sprzedaży', href: '/invoices?month=2026-08' },
      { label: '34 koszty', href: '/expenses?month=2026-08' },
    ],
    primary: { label: 'Pobierz plik', intent: 'open' },
    secondary: [{ label: 'Wyślij księgowej', intent: 'approve' }],
    preview: {
      type: 'file',
      label: 'JPK_V7M_2026-08.xml',
      href: '/reports/exports/fx-jpk-08/download',
      sizeLabel: '184 KB',
    },
    expiresAt: at(30 * DAY),
    priority: 35,
    createdAt: at(-1 * DAY),
  },

  // ── 10. przepełnienie: tytuł 120 znaków, treść 400 znaków ────
  {
    id: 'fx-overflow',
    kind: 'expense.review',
    variant: 'list',
    title: LONG_TITLE,
    body: LONG_BODY,
    evidence: [{ label: 'Skrzynka odbiorcza KSeF', href: '/inbox' }],
    primary: { label: 'Przejrzyj koszty', intent: 'open' },
    secondary: STD_SECONDARY,
    items: [
      {
        id: 'o1',
        label: LONG_CONTRACTOR,
        sublabel: 'Nieznany sprzedawca · faktura 445/08/2026',
        amount: '1 234 567,89 zł',
        preselected: false,
        needsPreview: true,
      },
      {
        id: 'o2',
        label: 'Hurtownia Elektryczna Wschód',
        sublabel: 'Nieznana kolumna KPiR',
        amount: '2 214,90 zł',
        preselected: false,
        needsPreview: false,
      },
      {
        id: 'o3',
        label: 'Biuro Podróży Azymut',
        sublabel: 'Kategoria wątpliwa — wyjazd służbowy?',
        amount: '3 890,00 zł',
        preselected: false,
        needsPreview: false,
      },
    ],
    expiresAt: at(21 * DAY),
    priority: 45,
    createdAt: at(-6 * HOUR),
  },

  // ── 11. bez dowodów: pusty stan sekcji „dlaczego to widzę” ───
  {
    id: 'fx-no-evidence',
    kind: 'feature.hint',
    variant: 'single',
    title: 'Możesz wrzucać paragony zdjęciem z telefonu',
    body: 'Piąty koszt w tym miesiącu wpisujesz ręcznie. Udostępnij zdjęcie do FaktFlow, a resztę zrobię sam.',
    evidence: [],
    primary: { label: 'Pokaż jak', intent: 'open' },
    secondary: STD_SECONDARY,
    expiresAt: at(14 * DAY),
    priority: 80,
    createdAt: at(-2 * DAY),
  },

  // ── 12. próg pieniężny — najniższy priorytet (S-04) ──────────
  {
    id: 'fx-milestone',
    kind: 'milestone.money',
    variant: 'info',
    title: 'Przekroczyłeś 100 000 zł opłaconych faktur',
    body: 'Od założenia konta wpłynęło do Ciebie 1 234 567,89 zł. Zapisz obrazek, jeśli chcesz go gdzieś wrzucić.',
    evidence: [{ label: 'Twoje przychody', href: '/przeplywy' }],
    primary: { label: 'Zapisz obrazek', intent: 'open' },
    secondary: [{ label: 'Ukryj', intent: 'dismiss' }],
    expiresAt: at(30 * DAY),
    priority: 95,
    createdAt: at(-4 * DAY),
  },
];

// ═══════════════════════════════════════════════════════════════
// Panel „Zatwierdzone — czeka na wykonanie”
// ═══════════════════════════════════════════════════════════════

/**
 * KAŻDA pozycja ma `approvedAtLabel` — do tego panelu nie trafia nic,
 * czego człowiek wcześniej nie zatwierdził kliknięciem. „Wstrzymaj” jest
 * hamulcem na coś, na co klient już się zgodził, nigdy mechanizmem zgody.
 */
export const FLO_SCHEDULED_FIXTURES: FloScheduledView[] = [
  {
    id: 'sch-1',
    label: 'Faktura ACME → KSeF',
    whenLabel: 'jutro, 08:00',
    approvedAtLabel: 'zatwierdzone dziś 11:42',
    cancelLabel: 'Wstrzymaj',
  },
  {
    id: 'sch-2',
    label: 'Ponaglenie do Nowaka',
    whenLabel: 'piątek, 10:00',
    approvedAtLabel: 'zatwierdzone dziś 09:07',
    cancelLabel: 'Wstrzymaj',
  },
  {
    id: 'sch-3',
    label: 'JPK_V7 za sierpień → księgowa',
    whenLabel: '20.09, 09:00',
    approvedAtLabel: 'zatwierdzone 18.08 o 14:20',
    cancelLabel: 'Wstrzymaj',
  },
];
