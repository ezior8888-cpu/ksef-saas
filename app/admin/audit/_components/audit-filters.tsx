'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function AuditFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [action, setAction] = useState(() => searchParams.get('action') ?? '');
  const [userId, setUserId] = useState(() => searchParams.get('userId') ?? '');
  const [tenantId, setTenantId] = useState(() => searchParams.get('tenantId') ?? '');
  const [fromDate, setFromDate] = useState(() => searchParams.get('from') ?? '');
  const [toDate, setToDate] = useState(() => searchParams.get('to') ?? '');

  // Debounced auto-search. Inline logic zamiast osobnej funkcji żeby uniknąć
  // `cannot access before declaration` (ESLint react-hooks/purity).
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (action.trim()) params.set('action', action.trim());
      if (userId.trim()) params.set('userId', userId.trim());
      if (tenantId.trim()) params.set('tenantId', tenantId.trim());
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      router.replace(`/admin/audit?${params.toString()}`);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [action, userId, tenantId, fromDate, toDate, router]);

  function clearAll() {
    setAction('');
    setUserId('');
    setTenantId('');
    setFromDate('');
    setToDate('');
    router.replace('/admin/audit');
  }

  const hasAny = action || userId || tenantId || fromDate || toDate;

  return (
    <div className="space-y-3 rounded-2xl border border-glass-border bg-foreground/3 p-4 backdrop-blur-glass">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Action (contains)
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="np. ksef.invoice.send"
              className="pl-9 font-mono text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            User ID (UUID)
          </label>
          <Input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="00000000-0000-..."
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Tenant ID (UUID)
          </label>
          <Input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="00000000-0000-..."
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Od
          </label>
          <Input
            type="datetime-local"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Do
          </label>
          <Input
            type="datetime-local"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="flex items-end">
          {hasAny ? (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              className="w-full"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Wyczyść filtry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
