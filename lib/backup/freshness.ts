/**
 * Świeżość kopii bazy (AUD-37, krok 6 planu automatyzacji).
 *
 * Nocny snapshot startuje o 02:00. Dawniej nic nie sprawdzało, czy nowa kopia
 * w ogóle powstała: tygodniowa weryfikacja brała 7 ostatnich udanych kopii bez
 * względu na wiek i przy zatrzymanym cronie raportowała „OK”. Próg 26 h łapie
 * pierwszą opuszczoną noc, a zostawia zapas na wolny przebieg i zmianę czasu.
 */

export const MAX_BACKUP_AGE_HOURS = 26;

/** Wiek najnowszej udanej kopii w godzinach; `null`, gdy kopii nie ma. */
export function backupAgeHours(
  newestSuccessAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!newestSuccessAt) return null;
  const at = Date.parse(newestSuccessAt);
  if (Number.isNaN(at)) return null;
  return (now.getTime() - at) / 3_600_000;
}

/** Brak kopii albo kopia starsza niż próg — w obu przypadkach alarm. */
export function isBackupStale(
  newestSuccessAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const age = backupAgeHours(newestSuccessAt, now);
  return age === null || age > MAX_BACKUP_AGE_HOURS;
}
