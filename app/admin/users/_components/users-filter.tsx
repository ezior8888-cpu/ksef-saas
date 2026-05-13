'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Wszyscy' },
  { value: 'active', label: 'Aktywni' },
  { value: 'suspended', label: 'Zawieszeni' },
  { value: 'unverified', label: 'Niezweryfikowani' },
] as const;

export function UsersFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const status = searchParams.get('status') ?? 'all';

  // Debounced search — bez tego każdy keystroke odpalałby SSR refresh.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) {
        params.set('q', q.trim());
      } else {
        params.delete('q');
      }
      params.delete('page');
      router.replace(`/admin/users?${params.toString()}`);
    }, 350);
    return () => window.clearTimeout(handle);
    // searchParams w deps wywołałby pętlę przy router.replace; bierzemy
    // tylko `q` jako prawdziwy trigger debounce'a.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const handleStatusChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') {
      params.delete('status');
    } else {
      params.set('status', next);
    }
    params.delete('page');
    router.replace(`/admin/users?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Email, NIP, nazwa organizacji…"
          className="pl-10"
        />
      </div>
      <div className="flex gap-1 rounded-2xl border border-glass-border bg-foreground/3 p-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleStatusChange(opt.value)}
            className={
              status === opt.value
                ? 'rounded-xl bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-glass-sm'
                : 'rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
