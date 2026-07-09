'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import {
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Save,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  triggerCoPilotNowAction,
  updateAccountantSettingsAction,
} from '@/app/actions/exports';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Tables } from '@/types/database';

type SettingsRow = Tables<'accountant_settings'>;

export type ExportJobPreviewRow = Pick<
  Tables<'export_jobs'>,
  | 'id'
  | 'format'
  | 'status'
  | 'period_start'
  | 'period_end'
  | 'created_at'
  | 'invoices_count'
  | 'emailed_at'
>;

export type CoPilotSettingsFormProps = {
  initialSettings: SettingsRow | null;
  recentJobs: ExportJobPreviewRow[];
};

type ExportFormat = Tables<'export_jobs'>['format'];

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  desc: string;
}[] = [
  { value: 'jpk_fa', label: 'JPK_FA(4)', desc: 'Oficjalny format MF do US' },
  {
    value: 'kpir_excel',
    label: 'KPiR Excel',
    desc: 'Książka Przychodów i Rozchodów',
  },
  {
    value: 'comarch_optima',
    label: 'Comarch Optima',
    desc: 'XML do programu Optima',
  },
  {
    value: 'insert_subiekt',
    label: 'Insert Subiekt',
    desc: 'CSV dla Insert Subiekt',
  },
  {
    value: 'symfonia',
    label: 'Symfonia',
    desc: 'CSV dla Symfonii',
  },
  { value: 'wapro', label: 'Wapro Mag', desc: 'CSV dla Wapro Mag' },
  {
    value: 'csv_universal',
    label: 'CSV uniwersalny',
    desc: 'Ogólny eksport CSV',
  },
];

const ALLOWED_VALUES = new Set(FORMAT_OPTIONS.map((o) => o.value));

function normalizePreferredFormats(fromDb: unknown): ExportFormat[] {
  const arr = Array.isArray(fromDb) ? fromDb : [];
  const picked = [...new Set(arr.filter((v): v is ExportFormat =>
    typeof v === 'string' && ALLOWED_VALUES.has(v as ExportFormat)))];
  return picked.length > 0 ? picked : ['jpk_fa', 'kpir_excel'];
}

export function CoPilotSettingsForm({
  initialSettings,
  recentJobs,
}: CoPilotSettingsFormProps) {
  const router = useRouter();
  const [settings, setSettings] = useState(() => ({
    co_pilot_enabled: initialSettings?.co_pilot_enabled ?? false,
    accountant_email: initialSettings?.accountant_email ?? '',
    accountant_name: initialSettings?.accountant_name ?? '',
    accountant_company: initialSettings?.accountant_company ?? '',
    preferred_formats:
      normalizePreferredFormats(initialSettings?.preferred_formats ?? null),
    send_day_of_month: initialSettings?.send_day_of_month ?? 5,
    include_issued_invoices:
      initialSettings?.include_issued_invoices ?? true,
    include_received_invoices:
      initialSettings?.include_received_invoices ?? true,
    include_corrections: initialSettings?.include_corrections ?? true,
    cc_emails: (initialSettings?.cc_emails ?? []).filter(
      (e): e is string => typeof e === 'string' && e.includes('@'),
    ),
  }));

  const [isSaving, startSave] = useTransition();
  const [isTriggering, startTrigger] = useTransition();

  const saveDisabled = isSaving;
  const triggerDisabled =
    isTriggering ||
    !settings.co_pilot_enabled ||
    !settings.accountant_email.trim();

  const handleSave = () => {
    startSave(async () => {
      const result = await updateAccountantSettingsAction({
        co_pilot_enabled: settings.co_pilot_enabled,
        accountant_email: settings.accountant_email,
        accountant_name: settings.accountant_name,
        accountant_company: settings.accountant_company.trim()
          ? settings.accountant_company.trim()
          : undefined,
        preferred_formats: settings.preferred_formats,
        send_day_of_month: settings.send_day_of_month,
        include_issued_invoices: settings.include_issued_invoices,
        include_received_invoices: settings.include_received_invoices,
        include_corrections: settings.include_corrections,
        cc_emails:
          settings.cc_emails.length > 0 ? settings.cc_emails : undefined,
      });
      if (result.success) {
        toast.success('Ustawienia zapisane');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Błąd zapisu');
      }
    });
  };

  const handleTriggerNow = () => {
    if (!settings.co_pilot_enabled || !settings.accountant_email.trim()) {
      toast.error('Najpierw skonfiguruj księgowego i włącz Co-Pilota');
      return;
    }

    startTrigger(async () => {
      // `triggerCoPilotNowAction` czyta ustawienia z bazy — bez zapisu
      // przełącznik/email w UI nie trafiały do DB i ręczne wysłanie kończyło się błędem.
      const saveResult = await updateAccountantSettingsAction({
        co_pilot_enabled: settings.co_pilot_enabled,
        accountant_email: settings.accountant_email,
        accountant_name: settings.accountant_name,
        accountant_company: settings.accountant_company.trim()
          ? settings.accountant_company.trim()
          : undefined,
        preferred_formats: settings.preferred_formats,
        send_day_of_month: settings.send_day_of_month,
        include_issued_invoices: settings.include_issued_invoices,
        include_received_invoices: settings.include_received_invoices,
        include_corrections: settings.include_corrections,
        cc_emails:
          settings.cc_emails.length > 0 ? settings.cc_emails : undefined,
      });
      if (!saveResult.success) {
        toast.error(saveResult.error ?? 'Nie udało się zapisać ustawień');
        return;
      }

      const today = new Date();
      const previousMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1,
      );
      const result = await triggerCoPilotNowAction(
        previousMonth.getMonth() + 1,
        previousMonth.getFullYear(),
      );
      if (result.success) {
        toast.success(
          'Paczka jest generowana w tle — email pójdzie za chwilę',
        );
        router.refresh();
      } else {
        toast.error(result.error ?? 'Błąd');
      }
    });
  };

  const toggleFormat = (format: ExportFormat) => {
    setSettings((prev) => ({
      ...prev,
      preferred_formats: prev.preferred_formats.includes(format)
        ? prev.preferred_formats.filter((f) => f !== format)
        : [...prev.preferred_formats, format],
    }));
  };

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h2 className="text-4xl font-display font-semibold tracking-tighter-display">
          Co-Pilot Księgowego
        </h2>
        <p className="mt-2 text-muted-foreground">
          Automatycznie wysyłamy paczkę dokumentów księgowych do Twojego biura
          rachunkowego
        </p>
      </div>

      <section className="rounded-3xl ff-glass-pane p-7 lg:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-display font-semibold tracking-tighter-text">
              {settings.co_pilot_enabled
                ? 'Co-Pilot aktywny'
                : 'Co-Pilot wyłączony'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {settings.co_pilot_enabled
                ? `Paczka wysyłana automatycznie ${settings.send_day_of_month}. dnia każdego miesiąca`
                : 'Włącz aby zacząć automatyczne wysyłki'}
            </p>
          </div>
          <GlassToggle
            checked={settings.co_pilot_enabled}
            onChange={(v) => setSettings((s) => ({ ...s, co_pilot_enabled: v }))}
            disabled={saveDisabled}
          />
        </div>
      </section>

      <section className="rounded-3xl ff-glass-pane p-7 lg:p-8 space-y-5">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tighter-text">
            Dane księgowego
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Imię i nazwisko
            </Label>
            <Input
              value={settings.accountant_name}
              disabled={saveDisabled}
              onChange={(e) =>
                setSettings({ ...settings, accountant_name: e.target.value })
              }
              placeholder="Anna Kowalska"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Nazwa biura (opcjonalnie)
            </Label>
            <Input
              value={settings.accountant_company}
              disabled={saveDisabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  accountant_company: e.target.value,
                })
              }
              placeholder="Biuro Rachunkowe Kowalska"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Email księgowego
          </Label>
          <Input
            type="email"
            autoComplete="email"
            value={settings.accountant_email}
            disabled={saveDisabled}
            onChange={(e) =>
              setSettings({ ...settings, accountant_email: e.target.value })
            }
            placeholder="anna@biuro.pl"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Na ten adres lecą wszystkie paczki
          </p>
        </div>
      </section>

      <section className="rounded-3xl ff-glass-pane p-7 lg:p-8 space-y-5">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tighter-text">
            Formaty plików
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Wybierz formaty zgodne z programem Twojego księgowego
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saveDisabled}
              onClick={() => toggleFormat(opt.value)}
              className={`text-left rounded-2xl border p-4 transition-all duration-200 ease-apple active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
                settings.preferred_formats.includes(opt.value)
                  ? 'bg-foreground/5 border-foreground/30'
                  : 'bg-[var(--ff-surface-container-low)] border-[var(--ff-glass-border)] hover:bg-[var(--ff-surface-hover)]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                {settings.preferred_formats.includes(opt.value) ? (
                  <CheckCircle2 className="h-4 w-4 text-foreground shrink-0" />
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl ff-glass-pane p-7 lg:p-8 space-y-5">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tighter-text">
            Harmonogram
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Kiedy wysyłać paczkę z poprzedniego miesiąca
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Label className="text-sm">Wysyłaj</Label>
          <Input
            type="number"
            min={1}
            max={28}
            disabled={saveDisabled}
            value={settings.send_day_of_month}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              setSettings({
                ...settings,
                send_day_of_month: Number.isNaN(n) ? 5 : n,
              });
            }}
            className="w-20 text-center"
          />
          <Label className="text-sm whitespace-nowrap">
            dnia każdego miesiąca o 8:00
          </Label>
        </div>

        <div className="rounded-2xl bg-foreground/5 p-4 text-xs text-muted-foreground leading-relaxed">
          <strong>Przykład:</strong> jeśli wybierzesz 5. dzień, to{' '}
          <strong>5 maja</strong> wyślemy paczkę za <strong>kwiecień</strong>.{' '}
          Domyślnie ustawione na 5 — daje Ci to bufor na ostatnie korekty na koniec miesiąca.
        </div>
      </section>

      <section className="rounded-3xl ff-glass-pane p-7 lg:p-8 space-y-4">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tighter-text">
            Co dołączać do paczki
          </h3>
        </div>

        <CheckboxRow
          label="Faktury wystawione (sprzedażowe)"
          desc="Twoja sprzedaż — faktury które wystawiasz klientom"
          checked={settings.include_issued_invoices}
          disabled={saveDisabled}
          onChange={(v) =>
            setSettings({ ...settings, include_issued_invoices: v })
          }
        />

        <CheckboxRow
          label="Faktury otrzymane (zakupowe)"
          desc="Faktury kosztowe pobrane z inboxa KSeF"
          checked={settings.include_received_invoices}
          disabled={saveDisabled}
          onChange={(v) =>
            setSettings({ ...settings, include_received_invoices: v })
          }
        />

        <CheckboxRow
          label="Faktury korygujące"
          desc="Korekty wystawione i otrzymane w okresie"
          checked={settings.include_corrections}
          disabled={saveDisabled}
          onChange={(v) => setSettings({ ...settings, include_corrections: v })}
        />
      </section>

      <section className="rounded-3xl ff-glass-pane p-7 lg:p-8 space-y-4">
        <div>
          <h3 className="text-lg font-display font-semibold tracking-tighter-text">
            Kopia do innych
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Dodatkowe adresy które dostają paczkę (np. Twój własny email do
            archiwum)
          </p>
        </div>

        <CcEmailsInput
          emails={settings.cc_emails}
          disabled={saveDisabled}
          onChange={(emails) => setSettings({ ...settings, cc_emails: emails })}
        />
      </section>

      {recentJobs.length > 0 ? (
        <section className="rounded-3xl ff-glass-pane p-7 lg:p-8 space-y-4">
          <div>
            <h3 className="text-lg font-display font-semibold tracking-tighter-text">
              Ostatnie paczki
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Historia 5 ostatnich automatycznych wysyłek
            </p>
          </div>

          <div className="space-y-2">
            {recentJobs.map((job) => (
              <RecentJobRow key={job.id} job={job} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 lg:left-[280px] z-30 px-6 py-4 bg-[var(--ff-surface-container-low)]  border-t border-[var(--ff-glass-border)]">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-3">
          <Button
            variant="glass"
            size="lg"
            type="button"
            onClick={handleTriggerNow}
            disabled={triggerDisabled}
          >
            {isTriggering ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Wyślij teraz (za poprzedni miesiąc)
          </Button>

          <Button
            variant="glass-primary"
            size="lg"
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Zapisz ustawienia
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function GlassToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      aria-label={checked ? 'Wyłącz Co-Pilot' : 'Włącz Co-Pilot'}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 disabled:opacity-50 ${
        checked ? 'bg-foreground' : 'bg-foreground/15'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-background transition-transform shadow-sm ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function CheckboxRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 p-3 rounded-2xl hover:bg-foreground/2 transition-colors text-left disabled:opacity-50 disabled:pointer-events-none"
    >
      <div
        className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
          checked
            ? 'bg-foreground border-foreground'
            : 'border-foreground/20 bg-transparent'
        }`}
      >
        {checked ? (
          <CheckCircle2 className="h-3 w-3 text-background" aria-hidden />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}

function CcEmailsInput({
  emails,
  onChange,
  disabled,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const email = input.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Nieprawidłowy email');
      return;
    }
    if (emails.includes(email)) {
      toast.error('Już dodany');
      return;
    }
    onChange([...emails, email]);
    setInput('');
  };

  const handleRemove = (email: string) => {
    onChange(emails.filter((e) => e !== email));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="email"
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="dodaj@email.pl i naciśnij Enter"
        />
        <Button
          variant="glass"
          size="lg"
          type="button"
          onClick={handleAdd}
          disabled={disabled || !input.trim()}
        >
          Dodaj
        </Button>
      </div>

      {emails.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {emails.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-[var(--ff-glass-border)]"
            >
              <Mail className="h-3 w-3 shrink-0" aria-hidden />
              {email}
              <button
                type="button"
                aria-label={`Usuń ${email}`}
                onClick={() => handleRemove(email)}
                disabled={disabled}
                className="ml-1 text-muted-foreground hover:text-foreground disabled:pointer-events-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RecentJobRow({ job }: { job: ExportJobPreviewRow }) {
  const statusDefaults = {
    completed: {
      label: 'Wysłane',
      className:
        'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    },
    failed: {
      label: 'Błąd',
      className:
        'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    },
    generating: {
      label: 'Generowanie...',
      className:
        'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
    },
    pending: {
      label: 'Oczekuje',
      className: 'bg-foreground/5 text-muted-foreground border-[var(--ff-glass-border)]',
    },
    expired: {
      label: 'Wygasłe',
      className: 'bg-foreground/5 text-muted-foreground border-[var(--ff-glass-border)]',
    },
  } as const;

  const cfg =
    statusDefaults[job.status as keyof typeof statusDefaults] ??
    ({
      label: job.status,
      className: 'bg-foreground/5 text-muted-foreground border-[var(--ff-glass-border)]',
    } as const);

  const formatLabel =
    FORMAT_OPTIONS.find((o) => o.value === job.format)?.label ??
    job.format.toUpperCase().replaceAll('_', ' ');

  const periodLabel = job.period_start.slice(0, 7);
  const emailed = job.emailed_at
    ? formatDateTimePl(job.emailed_at)
    : null;

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-foreground/2 border border-[var(--ff-glass-border)]/50">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-9 w-9 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">
            {formatLabel} • {periodLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {job.invoices_count} faktur
            {emailed ? ` • wysłano ${emailed}` : ''}
          </p>
        </div>
      </div>
      <span
        className={`inline-flex shrink-0 items-center px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.className}`}
      >
        {cfg.label}
      </span>
    </div>
  );
}

function formatDateTimePl(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
