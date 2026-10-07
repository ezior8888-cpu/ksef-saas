'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Gavel, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { OPERATOR_DUPLICATE_MESSAGES } from '@/lib/admin/ksef-operator-policy';
import { DUPLICATE_DECISION_TEXTS, type DuplicateChoice, type DuplicateDecisionView } from '@/lib/ksef/duplicate-decision';
import { cn } from '@/lib/utils';

import { operatorDecideDuplicateAction } from '../actions';

type DecidableView = Extract<DuplicateDecisionView, { kind: 'decidable' }>;

interface Props {
  invoiceId: string;
  internalNumber: string | null;
  view: DecidableView;
  /** Inna akcja operatora w toku. */
  disabled?: boolean;
}

const M = OPERATOR_DUPLICATE_MESSAGES;
const T = DUPLICATE_DECISION_TEXTS;

/**
 * „Zapisz decyzję klienta” (D-A4-1b-3 PR B, spec §2.6.5): operator zapisuje
 * decyzję przekazaną przez klienta — wybór, notatka (kanał, data, osoba)
 * i potwierdzenie „Rozumiem skutki” klienta, gdy polityka go wymaga
 * (decyzja 7). Te same sprawdzenia powtarza akcja serwerowa i RPC.
 */
export function OperatorDuplicateDecision({ invoiceId, internalNumber, view, disabled = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<DuplicateChoice | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const nr = internalNumber ?? view.invoiceNumber ?? '(bez numeru)';
  const k = view.originalKsefNumber;
  const needsConfirmation = choice !== null && view.needsConfirmation[choice];

  const reset = () => {
    setChoice(null);
    setNote('');
    setConfirmed(false);
    setNoteError(null);
  };

  const submit = () => {
    if (!choice) return;
    if (note.trim().length < 10) {
      setNoteError(M.noteError);
      return;
    }
    setNoteError(null);
    start(async () => {
      const result = await operatorDecideDuplicateAction(invoiceId, {
        choice,
        note: note.trim(),
        originalKsefNumber: view.originalKsefNumber,
        originalSha256: view.originalSha256,
        confirmed,
      });
      if (!result.success) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(result.message);
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)} disabled={disabled || pending}>
        <Gavel className="h-4 w-4 mr-2" />
        {M.decideButton}
      </Button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{M.dialogTitle(nr, k)}</DialogTitle>
          <DialogDescription>{M.lead}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>{T.COLUMN_KSEF}</TableHead>
                <TableHead>{T.COLUMN_OURS}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.comparison.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="text-muted-foreground">{row.label}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{row.ksef ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs break-all">
                    {row.ours ?? '—'}
                    {row.same === false ? <span className="ml-2 font-sans text-xs font-semibold text-amber-700">{T.DIFFERS}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            powód: <span className="font-mono">{view.reason}</span>
            {view.knownInvoice ? ` · dokument w FaktFlow z tym numerem KSeF: ${view.knownInvoice.internalNumber ?? 'bez numeru'}` : ''}
          </p>

          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={M.decideButton}>
            {(['same_sale', 'other_sale'] as const).map((c) => (
              <Button
                key={c}
                type="button"
                role="radio"
                aria-checked={choice === c}
                variant={choice === c ? 'default' : 'outline'}
                onClick={() => {
                  setChoice(c);
                  setConfirmed(false);
                }}
                disabled={pending}
              >
                {c === 'same_sale' ? M.choiceSame : M.choiceOther}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="operator-duplicate-note">{M.noteLabel}</Label>
            <Textarea
              id="operator-duplicate-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={M.notePlaceholder}
              maxLength={1000}
              aria-invalid={noteError ? true : undefined}
              disabled={pending}
            />
            {noteError ? <p className="text-xs text-red-600">{noteError}</p> : null}
          </div>

          {needsConfirmation && choice ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="operator-duplicate-confirm"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                disabled={pending}
              />
              <Label htmlFor="operator-duplicate-confirm" className={cn('font-normal leading-snug')}>
                {choice === 'same_sale' ? M.confirmSame(k, nr) : M.confirmOther(k, nr)}
              </Label>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={pending || choice === null || (needsConfirmation && !confirmed)}
          >
            {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {M.decideButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
