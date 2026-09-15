/**
 * Nazwa zdarzenia otwierającego panel pomocy z zewnątrz.
 *
 * Panel (`components/support/support-widget.tsx`) mieszka w layoucie panelu,
 * a nadawca — dolna nawigacja telefonu — w zupełnie innym poddrzewie. Kontekst
 * Reacta wymagałby opakowania całego layoutu tylko po to, żeby przekazać jedno
 * `setOpen(true)`. Zdarzenie na `window` załatwia to bez dostawcy, a stała tutaj
 * pilnuje, żeby nadawca i odbiorca nie rozjechali się na literówce.
 *
 * Po co w ogóle: na telefonie pływający bąbelek pomocy jest ukryty, bo siadał
 * na przyklejonym pasku akcji formularzy (przycisk „Zapisz”).
 */
export const OTWORZ_POMOC = 'ff-open-support';
