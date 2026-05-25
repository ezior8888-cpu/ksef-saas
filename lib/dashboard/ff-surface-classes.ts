/** Panele i tabele dashboardu — ten sam wygląd co /inbox i /invoices. */
export const ffSettingsPanel = 'ff-glass-pane rounded-[var(--ff-radius-lg)]';

export const ffSettingsPanelPadded =
  'ff-glass-pane rounded-[var(--ff-radius-lg)] p-6 lg:p-8';

export const ffTable = {
  card: 'ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]',
  header: 'border-b border-white/10 px-6 py-5 sm:px-8',
  title: 'text-xl font-bold tracking-tight text-[var(--ff-on-surface)]',
  subtitle:
    'mt-1 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]',
  scroll: 'overflow-x-auto',
  table: 'w-full min-w-[880px] text-left text-[14px]',
  headRow:
    'border-b border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]',
  th: 'px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8',
  thRight:
    'px-6 py-3.5 text-right text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8',
  row: 'border-b border-white/6 transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]',
  td: 'px-6 py-4 sm:px-8',
  tdMuted:
    'px-6 py-4 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_65%,transparent)] tabular-nums sm:px-8',
  tdMono:
    'px-6 py-4 font-mono text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_75%,transparent)] sm:px-8',
  tdStrong: 'px-6 py-4 font-semibold text-[var(--ff-on-surface)] sm:px-8',
  badge:
    'inline-flex items-center rounded-full border border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_6%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--ff-on-surface)]',
} as const;
