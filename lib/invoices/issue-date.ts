/**
 * Data wystawienia a dzień wysyłki do KSeF — jedna reguła dla wszystkich
 * dokumentów (plan „zero zgubionych faktur”, A1; W5 z rewizji 03.10.2026).
 *
 * Faktura w KSeF jest wystawiona w dniu przesłania (art. 106na ust. 1). KSeF
 * odrzuca datę wystawienia późniejszą niż dzień przyjęcia, a wcześniejszą
 * traktuje jak fakturę offline — bez trybu i oznaczeń, które taki dokument
 * musi mieć (F-092). Dlatego każda akcja, która tworzy dokument i od razu
 * zleca wysyłkę (FA, ZAL, KOR, ROZ) albo wysyła szkic, przyjmuje tylko
 * dzisiejszą datę w Polsce i odmawia, zanim cokolwiek zapisze.
 *
 * Ponowienie po północy faktury, która nie wyszła w dniu wystawienia, to
 * osobna decyzja (B1/B2 planu) — ten moduł jej nie podejmuje.
 *
 * Czysty moduł: plik `'use server'` eksportuje wyłącznie akcje.
 */

import { todayInWarsaw } from '@/lib/format/warsaw-date';

/** Skąd klient wysyła — od tego zależy, co może zrobić z inną datą. */
export type IssueDateSendSource =
  /** Formularz zwykłej faktury: inną datę zapisze jako szkic. */
  | 'form'
  /** Wysyłka zapisanego szkicu: datę zmienia się, wystawiając fakturę od nowa. */
  | 'draft'
  /** ZAL, KOR, ROZ: szkic takiego dokumentu nie wyśle się później, więc tylko zmiana daty. */
  | 'special';

/**
 * Komunikat odmowy, gdy data wystawienia nie jest dzisiejszą datą w Polsce;
 * `null`, gdy wysyłka może iść dalej.
 */
export function issueDateNotTodayError(
  issueDate: unknown,
  source: IssueDateSendSource,
  now: Date = new Date(),
): string | null {
  const today = todayInWarsaw(now);
  if (issueDate === today) return null;
  const given = typeof issueDate === 'string' && issueDate ? issueDate : 'brak';
  switch (source) {
    case 'form':
      return `Do KSeF wysyłamy fakturę z dzisiejszą datą wystawienia (${today}). Zmień datę albo zapisz fakturę jako szkic.`;
    case 'draft':
      return `Szkic ma datę wystawienia ${given}, a fakturę w KSeF wystawia się w dniu wysyłki (${today}). Usuń szkic i wystaw fakturę ponownie z dzisiejszą datą.`;
    case 'special':
      return `Do KSeF wysyłamy fakturę z dzisiejszą datą wystawienia (${today}), a ten dokument ma datę ${given}. Zmień datę wystawienia na dzisiejszą i wyślij dokument jeszcze raz.`;
  }
}
