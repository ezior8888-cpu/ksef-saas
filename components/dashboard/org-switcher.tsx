'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { setActiveOrganizationAction } from '@/app/actions/organizations';
import { cn } from '@/lib/utils';

export interface MembershipPreview {
  organizationId: string;
  name: string;
  nip: string;
  role: 'owner' | 'admin' | 'member' | 'accountant';
  isActive: boolean;
}

const ROLE_LABEL: Record<MembershipPreview['role'], string> = {
  owner: 'właściciel',
  admin: 'admin',
  member: 'członek',
  accountant: 'księgowy',
};

export function OrgSwitcher({
  memberships,
  activeOrgId,
  activeName,
  activeNip,
}: {
  memberships: MembershipPreview[];
  activeOrgId: string;
  activeName: string;
  activeNip: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSwitch = (orgId: string) => {
    if (orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await setActiveOrganizationAction(orgId);
      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const onlyOne = memberships.length <= 1;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] px-3 py-1.5 text-left hover:bg-white/65 transition-colors disabled:opacity-60"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div className="hidden sm:block min-w-0">
          <p className="text-sm font-medium leading-tight truncate max-w-[180px]">
            {activeName}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            NIP: {activeNip}
          </p>
        </div>
        {!onlyOne ? (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        ) : null}
      </button>

      {open && !onlyOne ? (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/55 dark:border-white/14 bg-white/85 dark:bg-[rgba(20,15,35,0.85)] backdrop-blur-2xl shadow-[0_12px_32px_0_rgba(31,38,135,0.12)] py-2 z-50">
          <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Twoje organizacje
          </div>
          {memberships.map((m) => (
            <button
              key={m.organizationId}
              type="button"
              onClick={() => handleSwitch(m.organizationId)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-foreground/5 transition-colors"
            >
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{m.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  NIP: {m.nip} · {ROLE_LABEL[m.role]}
                </p>
              </div>
              {m.isActive ? (
                <Check className="h-4 w-4 text-foreground" />
              ) : null}
            </button>
          ))}
          <div className="border-t border-foreground/5 mt-1 pt-1">
            <a
              href="/onboarding?action=new"
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Dodaj kolejną organizację
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
