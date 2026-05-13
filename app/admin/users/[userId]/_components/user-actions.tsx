'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, KeyRound, LogOut, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import {
  deleteUserGdprAction,
  forceLogoutAction,
  sendPasswordResetAction,
  suspendUserAction,
  unsuspendUserAction,
  type AdminActionResult,
} from '../../actions';

interface Props {
  userId: string;
  email: string | null;
  isSuspended: boolean;
}

export function UserActions({ userId, email, isSuspended }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const handle = (
    label: string,
    fn: () => Promise<AdminActionResult>,
    options: { afterSuccess?: () => void } = {},
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        toast.success(result.message ?? `${label} — gotowe`);
        options.afterSuccess?.();
        router.refresh();
      } else {
        toast.error(`${label}: ${result.error}`);
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {isSuspended ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => handle('Odblokuj', () => unsuspendUserAction(userId))}
        >
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
          Odblokuj
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => handle('Zawieś', () => suspendUserAction(userId))}
          className="border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" />
          Zawieś + wyloguj
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => handle('Force logout', () => forceLogoutAction(userId))}
      >
        <LogOut className="mr-1.5 h-3.5 w-3.5" />
        Force logout
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={isPending || !email}
        onClick={() =>
          handle('Reset hasła', () => sendPasswordResetAction(userId))
        }
      >
        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
        Wyślij reset hasła
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setDeleteOpen(true)}
          className="border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Usuń (GDPR)
        </Button>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usunięcie konta — GDPR</DialogTitle>
            <DialogDescription>
              Akcja nieodwracalna. Konto auth.users zostanie skasowane od razu.
              Organizacje (których user jest ownerem) idą do soft-delete z hard
              delete za <strong>30 dni</strong> (retention period). Wpisz
              <code className="mx-1 rounded bg-foreground/10 px-1 py-0.5 text-xs font-mono">
                DELETE
              </code>
              żeby potwierdzić.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            className="font-mono"
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Anuluj
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending || deleteConfirm !== 'DELETE'}
              onClick={() =>
                handle(
                  'Usuń GDPR',
                  () => deleteUserGdprAction(userId, deleteConfirm),
                  {
                    afterSuccess: () => {
                      setDeleteOpen(false);
                      setDeleteConfirm('');
                      router.push('/admin/users');
                    },
                  },
                )
              }
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Usuń trwale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
