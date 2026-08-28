import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Strażnik zasady: NIC NIE WYCHODZI NA ZEWNĄTRZ BEZ KLIKNIĘCIA CZŁOWIEKA
 * (krok 6 planu agenta FLO).
 *
 * Do 24.08.2026 produkt wysyłał maile do kontrahentów z crona. Ten test
 * pilnuje, żeby to nie wróciło — bo wróci nie przez czyjąś złą wolę, tylko
 * przez zwykłe „dodam tu szybko wysyłkę, przecież i tak mamy dane”.
 *
 * Test czyta źródła zamiast wykonywać kod: chodzi o kształt zależności,
 * a nie o zachowanie w czasie wykonania. To celowo tani i szybki strażnik,
 * a nie zamiennik dla testu architektonicznego z kroku 9, który obejmie całe
 * drzewo wywołań.
 */

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('zasada zgody — ponaglenia', () => {
  const scheduler = readSource('lib/inngest/jobs/reminder-scheduler.ts');
  const sender = readSource('lib/inngest/jobs/send-reminder.ts');
  const client = readSource('lib/inngest/client.ts');

  it('cron nie emituje zdarzenia wysyłki ponaglenia', () => {
    // Sedno sprawy: harmonogram wolno mu układać, wysyłać — nie.
    expect(scheduler).not.toContain('remindersSendRequested');
    expect(scheduler).not.toContain('sendEvent');
  });

  it('cron tworzy propozycję do zatwierdzenia', () => {
    // Treść karty buduje `buildChaseProposal` (krok 23) — jedno źródło
    // prawdy dla tekstu, progów i bezpieczników.
    expect(scheduler).toContain('buildChaseProposal');
    expect(scheduler).toContain('createProposal');
  });

  it('cron nie zapisuje już wierszy do payment_reminders', () => {
    // Wiersz przypomnienia powstaje dopiero przy zatwierdzeniu przez
    // człowieka — inaczej w bazie rosłaby kolejka „pending”, której nikt
    // nigdy nie wyśle.
    expect(scheduler).not.toContain('payment_reminders');
  });

  it('zdarzenie wysyłki wymaga identyfikatora zgody w schemacie', () => {
    const eventBlock = client.slice(
      client.indexOf("eventType('reminders/send.requested'"),
      client.indexOf("eventType('reminders/send.requested'") + 400,
    );
    expect(eventBlock).toContain('approvalId: string');
  });

  it('wysyłka odmawia działania bez zgody człowieka', () => {
    expect(sender).toContain('approvalId');
    expect(sender).toContain('NonRetriableError');
    // Odmowa musi być nieponawialna: brak zgody nie naprawi się przy
    // kolejnej próbie, bo to nie jest awaria sieci.
    const guard = sender.slice(
      sender.indexOf('const { reminderId, approvalId }'),
      sender.indexOf('const supabase = createAdminClient()'),
    );
    expect(guard).toContain('NonRetriableError');
    expect(guard.length).toBeGreaterThan(0);
  });

  it('nigdzie nie ma przełącznika automatycznej wysyłki', () => {
    // Nie ma i nie będzie opcji „wysyłaj automatycznie” — także w ustawieniach.
    for (const source of [scheduler, sender]) {
      expect(source.toLowerCase()).not.toContain('auto_send');
      expect(source.toLowerCase()).not.toContain('autosend');
    }
  });
});
