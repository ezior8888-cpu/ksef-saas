/**
 * Domyślne wybory formularza eksportu (centrum eksportu).
 *
 * KPiR Excel liczy koszty z `expenses` (faktury otrzymane i paragony), ale
 * pobiera je tylko przy zaznaczonym „Faktury otrzymane”. To pole było
 * domyślnie odznaczone, więc księga wychodziła z samymi przychodami
 * (F-058 w raporcie audytu bloku 1). Wybór KPiR zaznacza koszty; dla innych
 * formatów zostaje wybór użytkownika.
 */
export function includeReceivedAfterFormatChange(format: string, current: boolean): boolean {
  return format === 'kpir_excel' ? true : current;
}

/** Etykieta pola „otrzymane” — przy KPiR to koszty, także paragony. */
export function receivedLabelForFormat(format: string): string {
  return format === 'kpir_excel'
    ? 'Koszty: faktury otrzymane i paragony'
    : 'Faktury otrzymane (zakupowe)';
}
