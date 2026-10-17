/**
 * Nazwa zdarzenia otwierającego przełącznik firmy z zewnątrz.
 *
 * Przełącznik (`components/dashboard/org-switcher.tsx`) stoi w nagłówku
 * panelu, a nadawca — menu avatara (`components/dashboard/profile-menu.tsx`,
 * pozycja „Przełącz firmę”) — w innym poddrzewie, do tego przełącznik jest
 * Server Componentem w `Suspense`, przekazywanym do nagłówka jako slot.
 * Zdarzenie na `window` załatwia to bez dostawcy kontekstu (ten sam wzór co
 * `lib/support/open-support-event.ts`), a stała pilnuje, żeby nadawca
 * i odbiorca nie rozjechali się na literówce.
 */
export const OTWORZ_PRZELACZNIK_FIRMY = 'ff-open-org-switcher';
