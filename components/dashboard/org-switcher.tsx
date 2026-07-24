'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-full cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--ff-border)] bg-[var(--ff-surface)] px-3.5 py-2 text-left transition-colors hover:border-[var(--ff-border-strong)] disabled:opacity-60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ff-surface-chip)] text-[var(--ff-accent)]">
          <span className="material-symbols-outlined text-[16px] leading-none">
            business
          </span>
        </span>
        <div className="min-w-0 flex-1 leading-[1.25]">
          <p className="truncate text-[13px] font-semibold text-[var(--ff-text-strong)]">
            {activeName}
          </p>
          <p className="truncate font-mono text-[11px] text-[var(--ff-text-dim)]">
            NIP {activeNip}
          </p>
        </div>
        <span
          className={cn(
            'material-symbols-outlined ml-1 shrink-0 text-[16px] text-[var(--ff-text-dim)] transition-transform',
            open && 'rotate-180',
          )}
        >
          expand_more
        </span>
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface)] py-2 shadow-[0_12px_32px_0_rgba(0,0,0,0.45)]"
          role="listbox"
          aria-label="Wybór organizacji"
        >
          <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[color-mix(in_srgb,var(--ff-on-surface-variant)_80%,transparent)]">
            Twoje organizacje
          </div>
          {memberships.map((m) => (
            <button
              key={m.organizationId}
              type="button"
              role="option"
              aria-selected={m.isActive}
              onClick={() => handleSwitch(m.organizationId)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--ff-row-hover)]"
            >
              <span className="material-symbols-outlined shrink-0 text-[20px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
                business
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--ff-on-surface)]">
                  {m.name}
                </p>
                <p className="truncate font-mono text-[10px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_70%,transparent)]">
                  NIP: {m.nip} · {ROLE_LABEL[m.role]}
                </p>
              </div>
              {m.isActive ? (
                <span className="material-symbols-outlined shrink-0 text-[20px] text-[var(--ff-accent)]">
                  check
                </span>
              ) : null}
            </button>
          ))}
          <div className="mt-1 border-t border-[var(--ff-border)] pt-1">
            <Link
              href="/onboarding?action=new"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--ff-on-surface)] hover:bg-[var(--ff-row-hover)]"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Dodaj kolejną organizację
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
