'use client';

import { useState, useTransition } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';

import {
  acceptInvitationAction,
  requestJoinAction,
} from '@/app/actions/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  completeOnboardingAction,
  lookupNipAction,
  type NipMatch,
  type OnboardingCompanyData,
} from './actions';

type Tab = 'create' | 'invite' | 'join';

export function OnboardingForm({
  initialInviteToken,
}: {
  initialInviteToken?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialInviteToken ? 'invite' : 'create');

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl border border-glass-border bg-foreground/5"
      >
        <TabButton
          active={tab === 'create'}
          onClick={() => setTab('create')}
          icon={<Building2 className="h-4 w-4" />}
          label="Załóż firmę"
        />
        <TabButton
          active={tab === 'invite'}
          onClick={() => setTab('invite')}
          icon={<Mail className="h-4 w-4" />}
          label="Mam zaproszenie"
        />
        <TabButton
          active={tab === 'join'}
          onClick={() => setTab('join')}
          icon={<UserPlus className="h-4 w-4" />}
          label="Poproś o dostęp"
        />
      </div>

      {tab === 'create' ? <CreateOrgPanel /> : null}
      {tab === 'invite' ? (
        <AcceptInvitePanel initialToken={initialInviteToken ?? ''} />
      ) : null}
      {tab === 'join' ? <RequestJoinPanel /> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-glass-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// Panel: Załóż firmę
// ═══════════════════════════════════════════════════════════════

function CreateOrgPanel() {
  const [nipInput, setNipInput] = useState('');
  const [company, setCompany] = useState<OnboardingCompanyData | null>(null);
  const [duplicates, setDuplicates] = useState<NipMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSearching, startSearching] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  const handleLookup = () => {
    setError(null);
    setInfo(null);
    setCompany(null);
    setDuplicates([]);
    startSearching(async () => {
      const result = await lookupNipAction(nipInput);
      if (result.success) {
        setCompany(result.data);
        setDuplicates(result.existingOrgs);
        if (result.existingOrgs.some((o) => o.ksefVerified)) {
          setInfo(
            'Inna organizacja z tym NIP-em jest już zweryfikowana w KSeF. Jeśli to Twoja firma — poproś o dostęp zamiast tworzyć duplikat.',
          );
        } else if (result.existingOrgs.length > 0) {
          setInfo(
            'Już istnieje konto firmy z tym NIP-em. Możesz mimo to założyć osobną organizację albo poprosić o dostęp do istniejącej.',
          );
        }
      } else {
        setError(result.error);
      }
    });
  };

  const handleConfirm = () => {
    if (!company) return;
    startSubmitting(async () => {
      // completeOnboardingAction → createOrganizationAction wykonuje redirect
      // server-side po sukcesie (Set-Cookie + 303 atomowo). Tu obsługujemy
      // tylko ścieżkę błędu — przy sukcesie funkcja nie returnsuje.
      const result = await completeOnboardingAction(company);
      if (!result.success) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label
          htmlFor="nip"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >
          NIP firmy
        </Label>
        <div className="relative">
          <Input
            id="nip"
            value={nipInput}
            onChange={(e) => setNipInput(e.target.value.replace(/\D/g, ''))}
            placeholder="Wpisz 10 cyfr NIP"
            maxLength={10}
            disabled={isSearching || !!company}
            className="pr-14 font-mono text-lg h-14"
          />
          <Button
            onClick={handleLookup}
            variant="ghost"
            size="icon"
            disabled={nipInput.length !== 10 || isSearching || !!company}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl"
          >
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pobierzemy dane firmy z bazy GUS REGON. NIP nie nadaje uprawnień —
          sam NIP jest publiczny, a dostęp do organizacji wymaga zaproszenia
          lub potwierdzonego ownership w KSeF.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      )}

      {info && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-foreground space-y-2">
            <p>{info}</p>
            {duplicates.length > 0 && (
              <ul className="space-y-1 text-xs">
                {duplicates.slice(0, 3).map((d) => (
                  <li key={d.organizationId} className="flex items-center gap-2">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{d.name}</span>
                    {d.ksefVerified ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-3 w-3" />
                        KSeF zweryfikowany
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {company && (
        <div className="space-y-5 pt-2">
          <div className="rounded-2xl border border-green-500/20 bg-green-500/5 backdrop-blur-xl p-5">
            <div className="flex items-center gap-2.5 text-green-700 dark:text-green-400 mb-4">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium text-sm">
                Znaleziono w bazie GUS
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Nazwa firmy
                </dt>
                <dd className="font-medium mt-1">{company.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Adres siedziby
                </dt>
                <dd className="text-foreground mt-1 leading-relaxed">
                  {company.street} {company.buildingNumber}
                  {company.localNumber ? `/${company.localNumber}` : ''}
                  <br />
                  {company.postalCode} {company.city}
                </dd>
              </div>
            </dl>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full"
            size="lg"
            variant="glass-primary"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tworzę nową organizację...
              </>
            ) : (
              <>
                {duplicates.length > 0
                  ? 'Mimo to załóż osobną organizację'
                  : 'Załóż organizację'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setCompany(null);
              setNipInput('');
              setError(null);
              setInfo(null);
              setDuplicates([]);
            }}
            className="block w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Wpisz inny NIP
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Panel: Mam zaproszenie
// ═══════════════════════════════════════════════════════════════

function AcceptInvitePanel({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const handleAccept = () => {
    setError(null);
    if (!token.trim()) {
      setError('Wklej token z otrzymanego maila');
      return;
    }
    start(async () => {
      // acceptInvitationAction wykonuje redirect server-side po sukcesie.
      const r = await acceptInvitationAction(token.trim());
      if (!r.success) {
        setError(r.error);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-glass-border bg-foreground/3 p-4 text-sm text-muted-foreground leading-relaxed">
        Otrzymałeś zaproszenie do organizacji w FaktFlow? Wklej token z linku
        z maila albo kliknij link bezpośrednio — ten formularz służy jako
        backup, gdy klient pocztowy zerwał link.
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="invite-token"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >
          Token zaproszenia
        </Label>
        <Input
          id="invite-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Wklej token z maila"
          className="font-mono"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      )}

      <Button
        onClick={handleAccept}
        disabled={isPending || !token.trim()}
        className="w-full"
        size="lg"
        variant="glass-primary"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sprawdzam zaproszenie...
          </>
        ) : (
          <>
            Akceptuję zaproszenie
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Panel: Poproś o dostęp
// ═══════════════════════════════════════════════════════════════

function RequestJoinPanel() {
  const [nipInput, setNipInput] = useState('');
  const [matches, setMatches] = useState<NipMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSending, startSend] = useTransition();
  const [message, setMessage] = useState('');
  const [chosenOrg, setChosenOrg] = useState<NipMatch | null>(null);
  const [sentToOrgId, setSentToOrgId] = useState<string | null>(null);

  const handleSearch = () => {
    setError(null);
    setInfo(null);
    setMatches(null);
    setChosenOrg(null);
    setSentToOrgId(null);
    startSearch(async () => {
      const r = await lookupNipAction(nipInput);
      if (!r.success) {
        setError(r.error);
        return;
      }
      if (r.existingOrgs.length === 0) {
        setInfo(
          'Nie znaleziono organizacji z tym NIP-em w FaktFlow. Możesz po prostu założyć ją sam (zakładka „Załóż firmę").',
        );
        return;
      }
      setMatches(r.existingOrgs);
    });
  };

  const handleSend = () => {
    if (!chosenOrg) return;
    setError(null);
    startSend(async () => {
      const r = await requestJoinAction({
        organizationId: chosenOrg.organizationId,
        message,
      });
      if (r.success) {
        setSentToOrgId(chosenOrg.organizationId);
      } else {
        setError(r.error);
      }
    });
  };

  if (sentToOrgId) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-xl p-5 space-y-2">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Prośba wysłana</span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          Właściciele organizacji <strong>{chosenOrg?.name}</strong> dostaną
          notyfikację. Otrzymasz email kiedy zaakceptują lub odrzucą prośbę.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-glass-border bg-foreground/3 p-4 text-sm text-muted-foreground leading-relaxed">
        Twoja firma jest już w FaktFlow, ale nikt Cię nie zaprosił? Wpisz NIP
        — pokażemy listę organizacji z tym NIP-em i wyślemy prośbę o dostęp do
        wybranej. Prośbę zatwierdza właściciel/admin tej organizacji.
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="nip-join"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >
          NIP organizacji
        </Label>
        <div className="relative">
          <Input
            id="nip-join"
            value={nipInput}
            onChange={(e) => setNipInput(e.target.value.replace(/\D/g, ''))}
            placeholder="Wpisz 10 cyfr NIP"
            maxLength={10}
            disabled={isSearching || matches !== null}
            className="pr-14 font-mono text-lg h-14"
          />
          <Button
            onClick={handleSearch}
            variant="ghost"
            size="icon"
            disabled={
              nipInput.length !== 10 || isSearching || matches !== null
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl"
          >
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      )}

      {info && (
        <div className="rounded-2xl border border-glass-border bg-foreground/3 p-4 text-sm text-foreground">
          {info}
        </div>
      )}

      {matches && matches.length > 0 && !chosenOrg && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Wybierz organizację, do której prosisz o dostęp
          </p>
          {matches.map((m) => (
            <button
              type="button"
              key={m.organizationId}
              onClick={() => setChosenOrg(m)}
              className="w-full flex items-center gap-3 rounded-2xl border border-glass-border bg-foreground/3 hover:bg-foreground/5 p-4 text-left transition-colors"
            >
              <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.name}</p>
                {m.ksefVerified ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="h-3 w-3" />
                    Zweryfikowana w KSeF
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Niezweryfikowana w KSeF
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {chosenOrg && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-glass-border p-4 bg-foreground/3 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{chosenOrg.name}</p>
              <p className="text-xs text-muted-foreground">
                Wybrana organizacja
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChosenOrg(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              zmień
            </button>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="join-message"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Wiadomość (opcjonalnie)
            </Label>
            <Textarea
              id="join-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Krótka wiadomość do właściciela — kim jesteś i dlaczego prosisz o dostęp"
              rows={3}
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={isSending}
            className="w-full"
            size="lg"
            variant="glass-primary"
          >
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wysyłam prośbę...
              </>
            ) : (
              <>
                Wyślij prośbę o dostęp
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
