/** Domain denial cannot be fixed by retrying the same consent. Infrastructure
 * failures use ordinary Error and may retry only within the original deadline. */
export class ReminderConsentDenied extends Error {
  constructor(message: string) { super(message); this.name = 'ReminderConsentDenied'; }
}
