'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Copy, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import {
  createAccountantTokenAction,
  revokeAccountantTokenAction,
} from '@/components/settings/accountant-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Wiersz bez wrażliwych pól (`token_hash` / `token`) — bezpieczne do propsów z serwera. */
export interface AccountantAccessPublicRow {
  id: string;
  accountant_name: string;
  accountant_email: string;
  access_level: string;
  expires_at: string;
  use_count: number;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

type AccessStatus = 'aktywny' | 'wygasły' | 'odebrany';

function getAccessStatus(row: AccountantAccessPublicRow): AccessStatus {
  if (row.revoked_at) return 'odebrany';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'wygasły';
  return 'aktywny';
}

function accessLevelLabel(level: string): string {
  if (level === 'read_only') return 'Tylko podgląd';
  if (level === 'download') return 'Podgląd + pobieranie';
  return level;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Skopiowano do schowka');
  } catch {
    toast.error('Nie udało się skopiować linku');
  }
}

interface AccountantAccessListProps {
  accesses: AccountantAccessPublicRow[];
}

export function AccountantAccessList({ accesses }: AccountantAccessListProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<'read_only' | 'download'>(
    'read_only'
  );
  const [validForDays, setValidForDays] = useState('90');

  const resetForm = () => {
    setName('');
    setEmail('');
    setAccessLevel('read_only');
    setValidForDays('90');
    setDialogError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Zaproszenia</h2>
        <Button
          type="button"
          onClick={() => {
            setDialogError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          Nowe zaproszenie
        </Button>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setDialogError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Nowe zaproszenie</DialogTitle>
            <DialogDescription>
              Wygeneruj link z ograniczonym czasem ważności. Udostępnij go
              księgowej bezpiecznym kanałem.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setDialogError(null);
              startTransition(async () => {
                const r = await createAccountantTokenAction({
                  name,
                  email,
                  accessLevel,
                  validForDays: Number(validForDays),
                });
                if (!r.success) {
                  setDialogError(r.error);
                  return;
                }
                setCreateOpen(false);
                resetForm();
                setSuccessUrl(r.shareUrl);
                router.refresh();
              });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="acc-name">Imię i nazwisko / nazwa księgowej</Label>
              <Input
                id="acc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-email">Email księgowej</Label>
              <Input
                id="acc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label>Poziom dostępu</Label>
              <Select
                value={accessLevel}
                onValueChange={(v) =>
                  setAccessLevel(v as 'read_only' | 'download')
                }
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read_only">Tylko podgląd</SelectItem>
                  <SelectItem value="download">Podgląd + pobieranie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-days">Ważność (dni)</Label>
              <Input
                id="acc-days"
                type="number"
                min={1}
                max={365}
                value={validForDays}
                onChange={(e) => setValidForDays(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            {dialogError && (
              <p className="text-sm text-destructive" role="alert">
                {dialogError}
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setCreateOpen(false)}
              >
                Anuluj
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Wygeneruj link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(successUrl)}
        onOpenChange={(open) => {
          if (!open) setSuccessUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Link dostępu</DialogTitle>
            <DialogDescription>
              Zapisz adres — nie wyświetlimy go ponownie po zamknięciu okna.
            </DialogDescription>
          </DialogHeader>
          {successUrl && (
            <div className="space-y-3">
              <p className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
                {successUrl}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => copyToClipboard(successUrl)}
              >
                <Copy className="mr-2 size-4" />
                Kopiuj
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {listError && (
        <p className="text-sm text-destructive" role="alert">
          {listError}
        </p>
      )}

      {accesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak zapisanych linków.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">Nazwa / email</TableHead>
              <TableHead>Poziom dostępu</TableHead>
              <TableHead>Data wygaśnięcia</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[140px]">Użycie</TableHead>
              <TableHead className="text-right">Akcja</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accesses.map((row) => {
              const status = getAccessStatus(row);
              const canRevoke = status !== 'odebrany';

              return (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{row.accountant_name}</div>
                    <div className="text-muted-foreground text-xs">
                      {row.accountant_email}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {accessLevelLabel(row.access_level)}
                  </TableCell>
                  <TableCell>
                    {new Date(row.expires_at).toLocaleDateString('pl-PL', {
                      dateStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell>
                    {status === 'aktywny' && (
                      <Badge variant="secondary">Aktywny</Badge>
                    )}
                    {status === 'wygasły' && (
                      <Badge variant="outline">Wygasły</Badge>
                    )}
                    {status === 'odebrany' && (
                      <Badge variant="destructive">Odebrany</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs">
                    <div className="font-medium tabular-nums">{row.use_count}</div>
                    <div className="text-muted-foreground">
                      {row.last_used_at
                        ? `Ostatnio: ${formatDateTime(row.last_used_at)}`
                        : 'Brak użycia'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {canRevoke ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => {
                          setListError(null);
                          startTransition(async () => {
                            const r = await revokeAccountantTokenAction(row.id);
                            if (!r.success) {
                              setListError(r.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        Odbierz
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
