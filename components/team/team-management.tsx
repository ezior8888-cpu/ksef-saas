'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Clock,
  Crown,
  Mail,
  MoreHorizontal,
  Send,
  ShieldCheck,
  UserCog,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  approveJoinRequestAction,
  changeMembershipRoleAction,
  denyJoinRequestAction,
  inviteMemberAction,
  revokeInvitationAction,
  revokeMembershipAction,
} from '@/app/actions/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type {
  PendingInvitation,
  PendingJoinRequest,
  TeamMember,
} from '@/app/(dashboard)/settings/team/page';

type Role = 'owner' | 'admin' | 'member' | 'accountant';

const ROLE_LABEL: Record<string, string> = {
  owner: 'właściciel',
  admin: 'admin',
  member: 'członek',
  accountant: 'księgowy',
};

const ROLE_OPTIONS: Array<{ value: 'admin' | 'member' | 'accountant'; label: string }> = [
  { value: 'member', label: 'członek' },
  { value: 'admin', label: 'admin' },
  { value: 'accountant', label: 'księgowy' },
];

export function TeamManagement({
  members,
  invitations,
  joinRequests,
  currentRole,
}: {
  members: TeamMember[];
  invitations: PendingInvitation[];
  joinRequests: PendingJoinRequest[];
  currentRole: Role;
}) {
  const router = useRouter();
  const isOwner = currentRole === 'owner';

  return (
    <div className="space-y-8">
      <InviteForm onInvited={() => router.refresh()} />

      {joinRequests.length > 0 && (
        <Section title={`Prośby o dostęp (${joinRequests.length})`}>
          <div className="space-y-2">
            {joinRequests.map((r) => (
              <JoinRequestRow
                key={r.id}
                row={r}
                onChanged={() => router.refresh()}
              />
            ))}
          </div>
        </Section>
      )}

      {invitations.length > 0 && (
        <Section title={`Zaproszenia oczekujące (${invitations.length})`}>
          <div className="space-y-2">
            {invitations.map((i) => (
              <InvitationRow
                key={i.id}
                row={i}
                onChanged={() => router.refresh()}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title={`Członkowie (${members.length})`}>
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.membershipId}
              member={m}
              isOwner={isOwner}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'accountant'>('member');
  const [isPending, start] = useTransition();

  const submit = () => {
    if (!email.trim()) {
      toast.error('Wpisz email');
      return;
    }
    start(async () => {
      const r = await inviteMemberAction({ email: email.trim(), role });
      if (r.success) {
        toast.success('Zaproszenie wysłane');
        setEmail('');
        onInvited();
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-4">
      <div className="flex items-center gap-3">
        <UserPlus className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">Zaproś nowego członka</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
        <div className="space-y-1">
          <Label htmlFor="invite-email" className="sr-only">
            Email
          </Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adres@example.pl"
            disabled={isPending}
          />
        </div>
        <div>
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as 'admin' | 'member' | 'accountant')
            }
            disabled={isPending}
            className="h-10 px-3 rounded-xl border border-glass-border bg-background text-sm"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="glass-primary"
          onClick={submit}
          disabled={isPending || !email.trim()}
        >
          <Send className="h-4 w-4 mr-2" />
          Wyślij
        </Button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Wyślemy mailem link z tokenem ważnym 7 dni. Zaproszenie weryfikuje
        adres email — sam token w odpowiednim koncie nie wystarcza.
      </p>
    </div>
  );
}

function MemberRow({
  member,
  isOwner,
  onChanged,
}: {
  member: TeamMember;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [isPending, start] = useTransition();
  const [showRoles, setShowRoles] = useState(false);

  const handleChangeRole = (newRole: Role) => {
    start(async () => {
      const r = await changeMembershipRoleAction({
        membershipId: member.membershipId,
        newRole,
      });
      if (r.success) {
        toast.success('Rola zmieniona');
        onChanged();
      } else {
        toast.error(r.error);
      }
      setShowRoles(false);
    });
  };

  const handleRevoke = () => {
    if (
      !window.confirm(
        member.isYou
          ? 'Na pewno chcesz opuścić tę organizację?'
          : `Wyrzucić użytkownika ${member.email || member.name} z organizacji?`,
      )
    ) {
      return;
    }
    start(async () => {
      const r = await revokeMembershipAction(member.membershipId);
      if (r.success) {
        toast.success('Membership cofnięty');
        onChanged();
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-glass-border bg-foreground/3">
      <div className="h-9 w-9 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
        {member.role === 'owner' ? (
          <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {member.name}{' '}
          {member.isYou ? (
            <span className="text-xs text-muted-foreground font-normal">
              (Ty)
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {member.email || '(brak emaila)'} · {ROLE_LABEL[member.role]} ·
          dołączył(a){' '}
          {new Date(member.joinedAt).toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>

      <div className="relative flex items-center gap-2">
        {isOwner && member.role !== 'owner' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRoles((v) => !v)}
            disabled={isPending}
          >
            <UserCog className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRevoke}
          disabled={isPending}
          aria-label={member.isYou ? 'Opuść' : 'Usuń'}
        >
          <UserMinus className="h-4 w-4 text-red-600 dark:text-red-400" />
        </Button>

        {showRoles && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-glass-border bg-background shadow-lg p-1 z-10">
            {ROLE_OPTIONS.concat([{ value: 'admin', label: 'admin' }])
              .filter(
                (o, i, arr) =>
                  arr.findIndex((x) => x.value === o.value) === i,
              )
              .map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleChangeRole(o.value as Role)}
                  className={cn(
                    'w-full text-left text-sm px-3 py-1.5 rounded-lg hover:bg-foreground/5',
                    o.value === member.role && 'bg-foreground/5',
                  )}
                >
                  {o.label}
                </button>
              ))}
            {isOwner && (
              <button
                type="button"
                onClick={() => handleChangeRole('owner')}
                className="w-full text-left text-sm px-3 py-1.5 rounded-lg hover:bg-foreground/5 text-amber-600 dark:text-amber-400"
              >
                właściciel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InvitationRow({
  row,
  onChanged,
}: {
  row: PendingInvitation;
  onChanged: () => void;
}) {
  const [isPending, start] = useTransition();
  const handleRevoke = () => {
    start(async () => {
      const r = await revokeInvitationAction(row.id);
      if (r.success) {
        toast.success('Zaproszenie cofnięte');
        onChanged();
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-glass-border bg-foreground/3">
      <div className="h-9 w-9 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
        <Mail className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{row.email}</p>
        <p className="text-xs text-muted-foreground">
          rola {ROLE_LABEL[row.role] ?? row.role} · wygasa{' '}
          {new Date(row.expiresAt).toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRevoke}
        disabled={isPending}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function JoinRequestRow({
  row,
  onChanged,
}: {
  row: PendingJoinRequest;
  onChanged: () => void;
}) {
  const [isPending, start] = useTransition();

  const handleApprove = (approve: boolean) => {
    start(async () => {
      const r = approve
        ? await approveJoinRequestAction(row.id, 'member')
        : await denyJoinRequestAction(row.id);
      if (r.success) {
        toast.success(approve ? 'Dodano do zespołu' : 'Prośba odrzucona');
        onChanged();
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-2xl border border-glass-border bg-foreground/3">
      <div className="h-9 w-9 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
        <Clock className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium truncate">
          {row.name}{' '}
          <span className="text-xs text-muted-foreground font-normal">
            ({row.email})
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Złożono{' '}
          {new Date(row.createdAt).toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
        {row.message ? (
          <p className="text-sm leading-relaxed text-foreground bg-foreground/3 rounded-xl p-3 mt-2">
            {row.message}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="glass-primary"
          size="sm"
          onClick={() => handleApprove(true)}
          disabled={isPending}
        >
          <Check className="h-4 w-4 mr-1" />
          Akceptuj
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleApprove(false)}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <MoreHorizontal className="h-4 w-4 text-muted-foreground hidden" />
    </div>
  );
}
