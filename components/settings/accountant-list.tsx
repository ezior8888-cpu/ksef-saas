'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  UserCog,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { FfDataTableCard, ffTable } from '@/components/dashboard/ff-data-table';
import {
  createAccountantTokenAction,
  revokeAccountantTokenAction,
} from '@/components/settings/accountant-actions';
import { ffSettingsPanelPadded } from '@/lib/dashboard/ff-surface-classes';
import { cn } from '@/lib/utils';

/** Row z serwera (bez pola `token`). */
export interface AccountantAccessPublicRow {
  id: string;
  accountant_name: string;
  accountant_email: string;
  access_level: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
}

type AccountantAccess = AccountantAccessPublicRow;

export function AccountantAccessList({
  accesses,
}: {
  accesses: AccountantAccessPublicRow[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header z CTA */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Aktywne tokeny:{' '}
          <span className="font-medium text-foreground">
            {accesses.filter((a) => !a.revoked_at && new Date(a.expires_at) > new Date()).length}
          </span>
        </div>
        <Button
          variant="glass-primary"
          size="lg"
          onClick={() => {
            setShowForm(true);
            setGeneratedUrl(null);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nowy dostęp
        </Button>
      </div>

      {/* Wygenerowany URL po utworzeniu */}
      {generatedUrl && (
        <GeneratedTokenCard
          url={generatedUrl}
          onClose={() => setGeneratedUrl(null)}
        />
      )}

      {/* Formularz tworzenia */}
      {showForm && !generatedUrl && (
        <CreateTokenForm
          onSuccess={(url) => {
            setGeneratedUrl(url);
            setShowForm(false);
            router.refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Lista tokenów */}
      {accesses.length === 0 ? (
        <div
          className={cn(
            ffSettingsPanelPadded,
            'py-16 text-center',
          )}
        >
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)]">
            <UserCog className="h-6 w-6 text-[var(--ff-primary)]" />
          </div>
          <h3 className="mb-1 text-xl font-bold tracking-tight">
            Brak udostępnionych dostępów
          </h3>
          <p className="mx-auto max-w-sm text-[15px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Utwórz pierwszy link dla księgowej aby udostępnić jej faktury
          </p>
        </div>
      ) : (
        <FfDataTableCard
          title="Udostępnione dostępy"
          subtitle={`${accesses.length} tokenów • księgowi z linkiem portalu`}
          minWidth={960}
        >
          <thead>
            <tr className={ffTable.headRow}>
              <th className={ffTable.th}>Księgowa</th>
              <th className={ffTable.th}>Poziom dostępu</th>
              <th className={ffTable.th}>Wygasa</th>
              <th className={ffTable.th}>Status</th>
              <th className={ffTable.th}>Użycia</th>
              <th className={ffTable.th} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {accesses.map((access) => (
              <AccessRow key={access.id} access={access} />
            ))}
          </tbody>
        </FfDataTableCard>
      )}
    </div>
  );
}

function CreateTokenForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (url: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<'read_only' | 'download'>(
    'read_only'
  );
  const [validForDays, setValidForDays] = useState('90');
  const [isCreating, startCreating] = useTransition();

  const handleSubmit = () => {
    if (!name || !email) {
      toast.error('Wypełnij wszystkie pola');
      return;
    }

    startCreating(async () => {
      const result = await createAccountantTokenAction({
        name,
        email,
        accessLevel,
        validForDays: Number(validForDays),
      });

      if (result.success) {
        toast.success('Dostęp utworzony');
        onSuccess(result.shareUrl);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className={cn(ffSettingsPanelPadded, 'space-y-5')}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ff-on-surface)]">
            Nowy dostęp dla księgowej
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Wygenerujemy link, który możesz wysłać emailem
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="rounded-full"
          aria-label="Zamknij"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label
            htmlFor="acc-name"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block"
          >
            Imię i nazwisko / nazwa biura
          </Label>
          <Input
            id="acc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anna Kowalska"
          />
        </div>
        <div>
          <Label
            htmlFor="acc-email"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block"
          >
            Email
          </Label>
          <Input
            id="acc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="anna@biuro.pl"
          />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Poziom dostępu
          </Label>
          <select
            value={accessLevel}
            onChange={(e) =>
              setAccessLevel(e.target.value as 'read_only' | 'download')
            }
            className="flex h-11 w-full rounded-xl border border-glass-border bg-white/50 dark:bg-white/[0.05] backdrop-blur-glass-sm px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all duration-200"
          >
            <option value="read_only">Tylko podgląd</option>
            <option value="download">Podgląd + pobieranie XML</option>
          </select>
        </div>
        <div>
          <Label
            htmlFor="acc-days"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block"
          >
            Ważność (dni)
          </Label>
          <Input
            id="acc-days"
            type="number"
            min="1"
            max="365"
            value={validForDays}
            onChange={(e) => setValidForDays(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button
          variant="glass"
          size="lg"
          onClick={onCancel}
          disabled={isCreating}
        >
          Anuluj
        </Button>
        <Button
          variant="glass-primary"
          size="lg"
          onClick={handleSubmit}
          disabled={isCreating}
        >
          {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Wygeneruj link
        </Button>
      </div>
    </div>
  );
}

function GeneratedTokenCard({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link skopiowany do schowka');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        ffSettingsPanelPadded,
        'space-y-5 border-green-500/25 bg-green-500/10',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-display font-semibold tracking-tighter-text">
              Link wygenerowany pomyślnie
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Skopiuj poniższy URL i wyślij emailem do księgowej
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-full"
          aria-label="Zamknij"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          className="font-mono text-xs"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button
          variant="glass-primary"
          size="lg"
          onClick={handleCopy}
          className="shrink-0"
        >
          <Copy className="h-4 w-4 mr-2" />
          {copied ? 'Skopiowano!' : 'Kopiuj'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Link jest jednorazowy do pokazania. Po zamknięciu tej karty już go nie
        zobaczysz — token pozostaje aktywny do daty wygaśnięcia, ale URL musisz
        zachować w bezpiecznym miejscu (np. menedżerze haseł).
      </p>
    </div>
  );
}

function AccessRow({ access }: { access: AccountantAccess }) {
  const router = useRouter();
  const [isRevoking, startRevoking] = useTransition();

  const isExpired = new Date(access.expires_at) < new Date();
  const isRevoked = !!access.revoked_at;
  const isActive = !isRevoked && !isExpired;

  const handleRevoke = () => {
    if (!confirm(`Odebrać dostęp dla ${access.accountant_email}?`)) return;

    startRevoking(async () => {
      const result = await revokeAccountantTokenAction(access.id);
      if (result.success) {
        toast.success('Dostęp odebrany');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <tr className={ffTable.row}>
      <td className={ffTable.td}>
        <div className="font-semibold text-[var(--ff-on-surface)]">
          {access.accountant_name}
        </div>
        <div className="mt-0.5 font-mono text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
          {access.accountant_email}
        </div>
      </td>
      <td className={ffTable.td}>
        <span className={ffTable.badge}>
          {access.access_level === 'download' ? 'Pobieranie' : 'Podgląd'}
        </span>
      </td>
      <td className={ffTable.tdMuted}>
        {new Date(access.expires_at).toLocaleDateString('pl-PL')}
      </td>
      <td className={ffTable.td}>
        {isActive && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 text-xs font-medium backdrop-blur-glass-sm">
            <CheckCircle2 className="h-3 w-3" />
            Aktywny
          </span>
        )}
        {isRevoked && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 text-xs font-medium backdrop-blur-glass-sm">
            <XCircle className="h-3 w-3" />
            Odebrany
          </span>
        )}
        {isExpired && !isRevoked && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 text-muted-foreground border border-glass-border text-xs font-medium backdrop-blur-glass-sm">
            Wygasł
          </span>
        )}
      </td>
      <td className={ffTable.tdMuted}>
        <div className="font-semibold text-[var(--ff-on-surface)]">
          {access.use_count}×
        </div>
        {access.last_used_at ? (
          <div className="mt-0.5 text-[12px]">
            {new Date(access.last_used_at).toLocaleDateString('pl-PL')}
          </div>
        ) : null}
      </td>
      <td className={`${ffTable.td} text-right`}>
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRevoke}
            disabled={isRevoking}
            className="hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
          >
            {isRevoking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Odbierz'
            )}
          </Button>
        )}
      </td>
    </tr>
  );
}
