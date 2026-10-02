'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteContractorAction, updateContractorAction } from '@/app/actions/contractors';
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

interface Props {
  contractor: {
    id: string;
    nip: string | null;
    name: string | null;
    address: { addressLine1?: string; addressLine2?: string } | null;
    email: string | null;
  };
}

/** Edycja i usunięcie kontrahenta (F-011). NIP nie podlega edycji. */
export function ContractorRowActions({ contractor }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(contractor.name ?? '');
  const [addressLine1, setAddressLine1] = useState(contractor.address?.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(contractor.address?.addressLine2 ?? '');
  const [email, setEmail] = useState(contractor.email ?? '');
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const save = () => {
    startSaving(async () => {
      const r = await updateContractorAction(contractor.id, { name, addressLine1, addressLine2, email });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success('Kontrahent zapisany');
      setOpen(false);
      router.refresh();
    });
  };

  const remove = () => {
    if (!window.confirm(`Usunąć kontrahenta ${contractor.name ?? contractor.nip ?? ''}? Wystawione faktury się nie zmienią.`)) return;
    startDeleting(async () => {
      const r = await deleteContractorAction(contractor.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success('Kontrahent usunięty');
      router.refresh();
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Edytuj kontrahenta">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={remove} disabled={deleting} aria-label="Usuń kontrahenta">
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edycja kontrahenta</DialogTitle>
            <DialogDescription>
              NIP {contractor.nip ?? '—'}. Poprawione dane trafią na kolejne faktury; nocne odświeżanie z rejestrów ich nie cofnie.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor={`c-name-${contractor.id}`}>Nazwa</Label>
              <Input id={`c-name-${contractor.id}`} value={name} maxLength={512} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`c-a1-${contractor.id}`}>Ulica i numer</Label>
              <Input id={`c-a1-${contractor.id}`} value={addressLine1} maxLength={512} onChange={(e) => setAddressLine1(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`c-a2-${contractor.id}`}>Kod pocztowy i miejscowość</Label>
              <Input id={`c-a2-${contractor.id}`} value={addressLine2} maxLength={512} onChange={(e) => setAddressLine2(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`c-mail-${contractor.id}`}>E-mail do faktur</Label>
              <Input id={`c-mail-${contractor.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Anuluj
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
