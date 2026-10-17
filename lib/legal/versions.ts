/**
 * Wersje dokumentów i DOKŁADNE brzmienie oświadczeń, które klient zaznacza.
 *
 * Po co brzmienie w kodzie: administrator musi umieć WYKAZAĆ, że zgoda została
 * wyrażona i na co (art. 7 ust. 1 RODO). Zapis „zgoda: tak” bez treści, na
 * którą ją dano, tego nie wykazuje. Każdy zapis zgody niesie więc `textVersion`,
 * a tu leży tekst każdej wersji. Starych wersji NIE usuwamy — dopisujemy nowe.
 *
 * Zmiana treści regulaminu albo umowy powierzenia = nowa `CONTRACT_VERSION`.
 * Bramka (lib/legal/acceptance.ts) poprosi wtedy każdego o akceptację; zasady
 * zmiany wobec klientów opisuje regulamin (§ 15) — powiadomienie z wyprzedzeniem.
 */

/** Regulamin + umowa powierzenia są akceptowane razem — jedna wersja. */
export const CONTRACT_VERSION = '2026-10-15';
export const PRIVACY_POLICY_VERSION = '2026-10-15';
export const COOKIE_POLICY_VERSION = '2026-10-15';

/**
 * Oświadczenie przy rejestracji / w bramce (obowiązkowe). Znaczniki linków
 * (`[…](…)`) są częścią brzmienia — formularz pokazuje je jako odnośniki
 * (components/legal/legal-document.tsx, `LegalInline`).
 */
export const TERMS_STATEMENT = {
  version: '2026-10-15',
  text:
    'Akceptuję [Regulamin](/legal/regulamin) FaktFlow i [Umowę powierzenia przetwarzania danych osobowych](/legal/umowa-powierzenia) ' +
    'oraz potwierdzam, że zapoznałem(-am) się z [Polityką prywatności](/legal/polityka-prywatnosci).',
} as const;

/**
 * Zgoda na e-maile o produkcie i ofertach (dobrowolna, art. 398 ust. 1 Prawa
 * komunikacji elektronicznej + art. 6 ust. 1 lit. a RODO).
 */
export const MARKETING_STATEMENT = {
  version: '2026-10-15',
  text:
    'Chcę otrzymywać e-mailem od FaktFlow porady dotyczące korzystania z serwisu, ' +
    'informacje o nowościach i oferty. Zgodę mogę wycofać w każdej chwili ' +
    '(link w każdej wiadomości albo Ustawienia → Powiadomienia).',
} as const;

/**
 * Żądanie rozpoczęcia świadczenia przed upływem terminu na odstąpienie
 * (art. 15 ust. 3 i art. 35 ustawy o prawach konsumenta). Dotyczy tylko
 * konsumenta i przedsiębiorcy na prawach konsumenta — dla pozostałych jest
 * bez znaczenia, więc zaznacza je każdy.
 */
export const CHECKOUT_STATEMENT = {
  version: '2026-10-15',
  text:
    'Zamawiam subskrypcję z obowiązkiem zapłaty po okresie próbnym i akceptuję [Regulamin](/legal/regulamin). ' +
    'Jeśli zawieram umowę jako konsument lub przedsiębiorca na prawach konsumenta: żądam ' +
    'rozpoczęcia świadczenia przed upływem 14 dni na odstąpienie od umowy i przyjmuję do ' +
    'wiadomości, że w razie odstąpienia zapłacę za usługę świadczoną do chwili odstąpienia ' +
    '(okres próbny jest bezpłatny).',
} as const;
