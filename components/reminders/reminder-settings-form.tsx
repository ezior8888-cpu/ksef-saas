'use client';

import { useState, useTransition } from 'react';
import { Clock, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import {
  type ReminderSettingsPayload,
  updateReminderSettingsAction,
} from '@/app/actions/reminders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Database } from '@/types/database';

type SettingsRow = Database['public']['Tables']['reminder_settings']['Row'] | null;

export interface Settings {
  enabled: boolean;
  stage_1_enabled: boolean;
  stage_1_days_after_due: number;
  stage_2_enabled: boolean;
  stage_2_days_after_due: number;
  stage_3_enabled: boolean;
  stage_3_days_after_due: number;
  sender_name: string | null;
  /** Adres From (Resend) — wymagany do wysyłki; brak w DB = null */
  sender_email: string | null;
  reply_to_email: string | null;
  pause_on_reply: boolean;
  pause_on_partial_payment: boolean;
  send_on_weekdays_only: boolean;
  send_hour: number;
  max_reminders_per_invoice: number;
}

interface Props {
  initialSettings: SettingsRow;
  tenantName: string;
}

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  stage_1_enabled: true,
  stage_1_days_after_due: 3,
  stage_2_enabled: true,
  stage_2_days_after_due: 7,
  stage_3_enabled: true,
  stage_3_days_after_due: 14,
  sender_name: null,
  sender_email: null,
  reply_to_email: null,
  pause_on_reply: true,
  pause_on_partial_payment: true,
  send_on_weekdays_only: true,
  send_hour: 9,
  max_reminders_per_invoice: 3,
};

function rowToSettings(row: SettingsRow, tenantName: string): Settings {
  const nameFallback = tenantName.trim() || null;
  if (!row) {
    return { ...DEFAULT_SETTINGS, sender_name: nameFallback };
  }
  return {
    enabled: row.enabled,
    stage_1_enabled: row.stage_1_enabled,
    stage_1_days_after_due: row.stage_1_days_after_due,
    stage_2_enabled: row.stage_2_enabled,
    stage_2_days_after_due: row.stage_2_days_after_due,
    stage_3_enabled: row.stage_3_enabled,
    stage_3_days_after_due: row.stage_3_days_after_due,
    sender_name:
      typeof row.sender_name === 'string' && row.sender_name.trim()
        ? row.sender_name.trim()
        : nameFallback,
    sender_email: row.sender_email?.trim() || null,
    reply_to_email: row.reply_to_email?.trim() || null,
    pause_on_reply: row.pause_on_reply,
    pause_on_partial_payment: row.pause_on_partial_payment,
    send_on_weekdays_only: row.send_on_weekdays_only,
    send_hour: Math.min(18, Math.max(6, row.send_hour ?? 9)),
    max_reminders_per_invoice: Math.min(
      20,
      Math.max(1, row.max_reminders_per_invoice ?? 3),
    ),
  };
}

function toPayload(s: Settings): ReminderSettingsPayload {
  const days = (n: number) => Math.min(90, Math.max(1, n));
  return {
    enabled: s.enabled,
    stage_1_enabled: s.stage_1_enabled,
    stage_1_days_after_due: days(s.stage_1_days_after_due),
    stage_2_enabled: s.stage_2_enabled,
    stage_2_days_after_due: days(s.stage_2_days_after_due),
    stage_3_enabled: s.stage_3_enabled,
    stage_3_days_after_due: days(s.stage_3_days_after_due),
    sender_name: s.sender_name?.trim() || null,
    sender_email: s.sender_email?.trim() || null,
    reply_to_email: s.reply_to_email?.trim() || null,
    pause_on_reply: s.pause_on_reply,
    pause_on_partial_payment: s.pause_on_partial_payment,
    send_on_weekdays_only: s.send_on_weekdays_only,
    send_hour: Math.min(18, Math.max(6, s.send_hour)),
    max_reminders_per_invoice: Math.min(
      20,
      Math.max(1, s.max_reminders_per_invoice),
    ),
  };
}

const STAGE_META = [
  {
    enabled: 'stage_1_enabled',
    days: 'stage_1_days_after_due',
    name: 'Etap 1: Uprzejme przypomnienie',
    desc: 'Wczesne, miłe pytanie',
  },
  {
    enabled: 'stage_2_enabled',
    days: 'stage_2_days_after_due',
    name: 'Etap 2: Stanowcze przypomnienie',
    desc: 'Bardziej formalne wezwanie',
  },
  {
    enabled: 'stage_3_enabled',
    days: 'stage_3_days_after_due',
    name: 'Etap 3: Przedsądowe wezwanie',
    desc: 'Z PDF, ostrzeżenie o sądzie',
  },
] as const;

export function ReminderSettingsForm({
  initialSettings,
  tenantName,
}: Props) {
  const [settings, setSettings] = useState<Settings>(() =>
    rowToSettings(initialSettings, tenantName),
  );
  const [isSaving, startSave] = useTransition();

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    startSave(async () => {
      const result = await updateReminderSettingsAction(toPayload(settings));
      if (result.success) {
        toast.success('Ustawienia zapisane');
      } else {
        toast.error(result.error ?? 'Błąd zapisu');
      }
    });
  };

  const parseBoundedInt = (raw: string, fallback: number, min: number, max: number) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
          Wkurzacz Dłużników
        </h1>
        <p className="mt-2 text-muted-foreground">
          Automatyczne przypomnienia o płatności dla przeterminowanych faktur
        </p>
      </div>

      <section className="rounded-3xl ff-glass-pane p-7 lg:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-display font-semibold tracking-tighter-text">
              {settings.enabled ? 'Wkurzacz włączony' : 'Wkurzacz wyłączony'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings.enabled
                ? 'Automatycznie wysyłamy przypomnienia o przeterminowanych fakturach'
                : 'Żadne przypomnienia nie są wysyłane'}
            </p>
          </div>
          <Toggle
            checked={settings.enabled}
            onChange={(v) => update('enabled', v)}
          />
        </div>
      </section>

      <section className="space-y-5 rounded-3xl ff-glass-pane p-7 lg:p-8">
        <div>
          <h2 className="text-lg font-display font-semibold tracking-tighter-text">
            Etapy przypomnień
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Skonfiguruj kiedy i jakie przypomnienia wysyłać
          </p>
        </div>

        {STAGE_META.map((meta, idx) => (
          <div
            key={meta.enabled}
            className="flex flex-col gap-4 rounded-2xl border border-[var(--ff-glass-border)] bg-foreground/2 p-4 sm:flex-row sm:items-start"
          >
            <Toggle
              checked={settings[meta.enabled]}
              onChange={(v) => update(meta.enabled, v)}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{meta.name}</p>
              <p className="text-xs text-muted-foreground">{meta.desc}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:justify-end">
              <Label htmlFor={`days-${idx}`} className="text-xs text-muted-foreground whitespace-nowrap">
                Dni po terminie:
              </Label>
              <Input
                id={`days-${idx}`}
                type="number"
                min={1}
                max={90}
                value={settings[meta.days]}
                onChange={(e) =>
                  update(
                    meta.days,
                    parseBoundedInt(e.target.value, settings[meta.days], 1, 90),
                  )
                }
                className="h-9 w-20"
                disabled={!settings[meta.enabled]}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-5 rounded-3xl ff-glass-pane p-7 lg:p-8">
        <div>
          <h2 className="text-lg font-display font-semibold tracking-tighter-text">
            Inteligentne reguły
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Anti-spam i smart pauzy
          </p>
        </div>

        <SmartToggle
          label="Pauza po odpowiedzi klienta"
          desc="Wstrzymaj przypomnienia jeśli klient odpisał na email"
          checked={settings.pause_on_reply}
          onChange={(v) => update('pause_on_reply', v)}
        />

        <SmartToggle
          label="Pauza po częściowej płatności"
          desc="Wstrzymaj jeśli klient zapłacił choć część (negocjacja w toku)"
          checked={settings.pause_on_partial_payment}
          onChange={(v) => update('pause_on_partial_payment', v)}
        />

        <SmartToggle
          label="Wysyłaj tylko w dni robocze"
          desc="Pomijaj soboty i niedziele"
          checked={settings.send_on_weekdays_only}
          onChange={(v) => update('send_on_weekdays_only', v)}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              Godzina wysyłki
            </p>
            <p className="text-xs text-muted-foreground">
              Najlepiej rano przed godzinami pracy (6–18)
            </p>
          </div>
          <Input
            type="number"
            min={6}
            max={18}
            value={settings.send_hour}
            onChange={(e) =>
              update(
                'send_hour',
                parseBoundedInt(e.target.value, settings.send_hour, 6, 18),
              )
            }
            className="h-9 w-20 sm:text-right"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Maks. przypomnień na fakturę</p>
            <p className="text-xs text-muted-foreground">
              Limit etapów w kolejce (scheduler)
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={20}
            value={settings.max_reminders_per_invoice}
            onChange={(e) =>
              update(
                'max_reminders_per_invoice',
                parseBoundedInt(
                  e.target.value,
                  settings.max_reminders_per_invoice,
                  1,
                  20,
                ),
              )
            }
            className="h-9 w-20 sm:text-right"
          />
        </div>
      </section>

      <section className="space-y-5 rounded-3xl ff-glass-pane p-7 lg:p-8">
        <div>
          <h2 className="text-lg font-display font-semibold tracking-tighter-text">
            Dane nadawcy
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pojawi się w stopce emaila i jako „Od:”
          </p>
        </div>

        <div>
          <Label
            htmlFor="sender-name"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Imię i nazwisko / nazwa nadawcy
          </Label>
          <Input
            id="sender-name"
            value={settings.sender_name ?? ''}
            onChange={(e) =>
              update(
                'sender_name',
                e.target.value === '' ? null : e.target.value,
              )
            }
            placeholder={tenantName}
          />
        </div>

        <div>
          <Label
            htmlFor="sender-email"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Adres From (email wysyłki)
          </Label>
          <Input
            id="sender-email"
            type="email"
            autoComplete="off"
            value={settings.sender_email ?? ''}
            onChange={(e) =>
              update(
                'sender_email',
                e.target.value === '' ? null : e.target.value,
              )
            }
            placeholder="faktury@twoja-firma.pl"
          />
        </div>

        <div>
          <Label
            htmlFor="reply-to"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Email do odpowiedzi (Reply-To)
          </Label>
          <Input
            id="reply-to"
            type="email"
            autoComplete="off"
            value={settings.reply_to_email ?? ''}
            onChange={(e) =>
              update(
                'reply_to_email',
                e.target.value === '' ? null : e.target.value,
              )
            }
            placeholder="kontakt@twoja-firma.pl"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Klient odpisuje tu, nie na nasz email systemowy
          </p>
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--ff-glass-border)] bg-[var(--ff-surface-container-low)] px-6 py-4  lg:left-[280px]">
        <div className="mx-auto flex max-w-7xl justify-end">
          <Button
            variant="glass-primary"
            size="lg"
            type="button"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Zapisz ustawienia
          </Button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-foreground' : 'bg-foreground/15'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function SmartToggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
