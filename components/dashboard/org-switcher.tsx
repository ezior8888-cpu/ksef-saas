'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { setActiveOrganizationAction } from '@/app/actions/organizations';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/use-media-query';
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

/**
 * Przełącznik organizacji w pasku nagłówka.
 *
 * DWA UKŁADY, JEDEN PRZYCISK. Na komputerze to kartonik z nazwą i NIP-em
 * w dwóch wierszach; na telefonie pigułka „● Nazwa" z samą nazwą, bo pasek
 * na 375 px dzieli się jeszcze z wordmarkiem i przełącznikiem motywu.
 * Warianty różnią się WYŁĄCZNIE klasami — jeden przycisk znaczy jeden
 * element sterujący dla czytnika ekranu, zamiast dwóch bliźniaków, z których
 * jeden zawsze jest schowany.
 *
 * LISTA W DWÓCH POJEMNIKACH, ALE MONTOWANA RAZ. Na komputerze rozwijka
 * pozycjonowana absolutnie (jak było), na telefonie arkusz z dołu — rozwijka
 * `w-72` przy prawej krawędzi wychodziła poza ekran 375 px. Wyboru dokonuje
 * `useIsDesktop`, a nie klasa `lg:hidden`, bo zamontowany i schowany
 * `Dialog` i tak przechwytuje ognisko oraz blokuje przewijanie strony.
 */
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
  const isDesktop = useIsDesktop();
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

  const lista = (
    <OrgList
      memberships={memberships}
      onSwitch={handleSwitch}
      onClose={() => setOpen(false)}
    />
  );

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex max-w-full cursor-pointer items-center text-left transition-colors disabled:opacity-60',
          'max-w-[58vw] gap-2 rounded-full border border-[var(--ff-border)] bg-[var(--ff-surface)] py-1.5 pl-3 pr-2 lg:max-w-full',
          'lg:gap-3 lg:rounded-[10px] lg:py-2 lg:pl-3.5 lg:pr-3.5',
          'hover:border-[var(--ff-border-strong)]',
        )}
      >
        {/* Kropka na telefonie, kwadracik z ikoną od `lg` — pigułka z makiety
            ma mieć wysokość jednego wiersza, a ikona 32 px by ją rozepchnęła. */}
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-[var(--ff-accent)] lg:hidden"
        />
        <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ff-surface-chip)] text-[var(--ff-accent)] lg:flex">
          <span className="material-symbols-outlined text-[16px] leading-none">
            business
          </span>
        </span>

        <div className="min-w-0 flex-1 leading-[1.25]">
          <p className="truncate text-[13px] font-semibold text-[var(--ff-text-strong)]">
            {activeName}
          </p>
          {/* NIP tylko na komputerze: drugi wiersz podwaja wysokość paska,
              a na telefonie nagłówek ma 56 px na wszystko. */}
          <p className="hidden truncate font-mono text-[11px] text-[var(--ff-text-dim)] lg:block">
            NIP {activeNip}
          </p>
        </div>

        <span
          aria-hidden
          className={cn(
            'material-symbols-outlined shrink-0 text-[16px] text-[var(--ff-text-dim)] transition-transform lg:ml-1',
            open && 'rotate-180',
          )}
        >
          expand_more
        </span>
      </button>

      {isDesktop ? (
        open ? (
          <div
            className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface)] py-2 shadow-[0_12px_32px_0_rgba(0,0,0,0.45)]"
            role="listbox"
            aria-label="Wybór organizacji"
          >
            {lista}
          </div>
        ) : null
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="ff-dashboard max-h-[85dvh] overflow-y-auto rounded-t-2xl border-[var(--ff-border)] pb-[calc(1rem+var(--ff-safe-b))] text-[var(--ff-on-surface)]"
          >
            <SheetTitle className="text-left text-base font-semibold text-[var(--ff-text-strong)]">
              Twoje organizacje
            </SheetTitle>
            {/* `min-w-0` jest tu obowiązkowe: `SheetContent` to siatka, a jej
                dzieci mają domyślnie `min-width: auto` i NIE kurczą się poniżej
                szerokości treści. Bez tego „BP POLSKA SERVICES SPÓŁKA
                Z OGRANICZONĄ…" rozpycha arkusz poza ekran, mimo `truncate`
                na samej nazwie. */}
            <div className="min-w-0" role="listbox" aria-label="Wybór organizacji">
              {lista}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/** Sama lista organizacji — ten sam znacznik w rozwijce i w arkuszu. */
function OrgList({
  memberships,
  onSwitch,
  onClose,
}: {
  memberships: MembershipPreview[];
  onSwitch: (orgId: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="hidden px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[color-mix(in_srgb,var(--ff-on-surface-variant)_80%,transparent)] lg:block">
        Twoje organizacje
      </div>
      {memberships.map((m) => (
        <button
          key={m.organizationId}
          type="button"
          role="option"
          aria-selected={m.isActive}
          onClick={() => onSwitch(m.organizationId)}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--ff-row-hover)]"
        >
          <span
            aria-hidden
            className="material-symbols-outlined shrink-0 text-[20px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]"
          >
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
            <span
              aria-hidden
              className="material-symbols-outlined shrink-0 text-[20px] text-[var(--ff-accent)]"
            >
              check
            </span>
          ) : null}
        </button>
      ))}
      <div className="mt-1 border-t border-[var(--ff-border)] pt-1">
        <Link
          href="/onboarding?action=new"
          prefetch={false}
          onClick={onClose}
          className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--ff-on-surface)] hover:bg-[var(--ff-row-hover)]"
        >
          <span aria-hidden className="material-symbols-outlined text-[20px]">
            add
          </span>
          Dodaj kolejną organizację
        </Link>
      </div>
    </>
  );
}
