'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DUPLICATE_DECISION_TEXTS,
  type DuplicateChoice,
  type DuplicateDecisionView,
} from '@/lib/ksef/duplicate-decision';

import { decideKsefDuplicateAction } from './actions-detail';

export type DecidableDuplicateView = Extract<DuplicateDecisionView, { kind: 'decidable' }>;

interface Props {
  invoiceId: string;
  view: DecidableDuplicateView;
}

const T = DUPLICATE_DECISION_TEXTS;

/** Skutki wyboru (cztery zdania dialogu, 2.11.B) — warianty known-number tam, gdzie je podano. */
function consequences(choice: DuplicateChoice, view: DecidableDuplicateView, nr: string, nrK: string, y: string | null): string[] {
  const k = view.originalKsefNumber;
  if (choice === 'same_sale') {
    const S = T.DIALOG_SAME;
    return [
      y !== null ? S.LINE_1_KNOWN(nrK, k, y) : S.LINE_1(nrK, k, view.program),
      S.LINE_2(nr),
      y !== null ? S.LINE_3_KNOWN(nr, k, y) : S.LINE_3(k),
      S.LINE_4,
    ];
  }
  const O = T.DIALOG_OTHER;
  return [
    O.LINE_1(nr, k),
    O.LINE_2,
    view.heldCorrections ? O.LINE_3 + O.LINE_3_HELD : O.LINE_3,
    y !== null ? O.LINE_4_KNOWN(k, y) : view.program ? O.LINE_4(k, view.program) : O.LINE_4_UNKNOWN_PROGRAM(k),
  ];
}

/**
 * Panel decyzji klienta przy nierozstrzygniętym duplikacie 440 (D-A4-1b-3 PR B,
 * decyzje Bartosza 04.10 i 07.10.2026): tabela „W KSeF / Ten dokument” ze
 * znacznikiem „różni się”, linia treści, przy known-number — dokument Y, dwa
 * przyciski i dialog z czterema skutkami. Przy tarciu (decyzja 7) potwierdzenie
 * wymaga zaznaczenia „Rozumiem skutki: …” (C5) — akcja sprawdza to samo na
 * serwerze. Po wyniku toast i `router.refresh()`, także po błędzie: stan
 * faktury mógł się zmienić (np. decyzja zapisana w drugiej karcie).
 *
 * Widok (`duplicateDecisionOptions`) liczy serwer; komponent wysyła z powrotem
 * numer KSeF i SHA-256 oryginału, które pokazał (wiązanie, odmowa STALE).
 */
export function KsefDuplicateDecision({ invoiceId, view }: Props) {
  const router = useRouter();
  const checkboxId = useId();
  const [choice, setChoice] = useState<DuplicateChoice | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const nr = view.invoiceNumber ?? '(bez numeru)';
  const k = view.originalKsefNumber;
  // `{nrK}` = numer faktury z KSeF (`summary.number`), inaczej nasz numer.
  const nrK = view.comparison.find((row) => row.label === T.ROW_LABELS.number)?.ksef ?? nr;
  const y = view.knownInvoice ? view.knownInvoice.internalNumber ?? 'bez numeru' : null;
  const contentLine = view.sameContent === null ? T.NO_OWN_FILE : view.sameContent ? T.CONTENT_SAME : T.CONTENT_DIFFERENT;

  const needsConfirmation = choice !== null && view.needsConfirmation[choice];
  const canConfirm = choice !== null && !pending && (!needsConfirmation || confirmed);

  const open = (next: DuplicateChoice) => {
    setConfirmed(false);
    setChoice(next);
  };

  const submit = () => {
    if (!choice || !canConfirm) return;
    const picked = choice;
    startTransition(async () => {
      const result = await decideKsefDuplicateAction({
        invoiceId,
        choice: picked,
        originalKsefNumber: view.originalKsefNumber,
        originalSha256: view.originalSha256,
        confirmed,
      });
      if (result.success) toast.success(result.message);
      else toast.error(result.error);
      setChoice(null);
      // Sukces: szkic wycofany (baner). Błąd: dane albo stan mogły się zmienić — serwer policzy widok od nowa.
      router.refresh();
    });
  };

  const dialog = choice === 'same_sale' ? T.DIALOG_SAME : T.DIALOG_OTHER;
  // „Ta sama sprzedaż”: „mimo różnic zaznaczonych w tabeli” tylko, gdy tabela którąś zaznacza;
  // tarcie z danych nieznanych (B2C bez NIP, waluta nieznana) — wariant „nie da się porównać”.
  const checkboxLabel = choice === 'same_sale'
    ? (view.markedDifference ? T.DIALOG_SAME.CHECKBOX(k, nr) : T.DIALOG_SAME.CHECKBOX_UNCOMPARABLE(k, nr))
    : T.DIALOG_OTHER.CHECKBOX(k, nr);

  return (
    <div className="mt-3 space-y-3 text-sm text-amber-950">
      <p>{T.INTRO(nr, k, view.program)}</p>

      <Table className="bg-white/60 rounded-md">
        <TableHeader>
          <TableRow>
            <TableHead className="w-40" />
            <TableHead>{T.COLUMN_KSEF}</TableHead>
            <TableHead>{T.COLUMN_OURS}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.comparison.map((row) => (
            <TableRow key={row.label}>
              <TableCell className="font-medium align-top whitespace-normal">
                {row.label}
                {row.same === false && (
                  <span className="ml-2 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                    {T.DIFFERS}
                  </span>
                )}
              </TableCell>
              <TableCell className="align-top whitespace-normal break-all">{row.ksef ?? '—'}</TableCell>
              <TableCell className="align-top whitespace-normal break-all">{row.ours ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p>{contentLine}</p>

      {view.knownInvoice && y !== null && (
        <p>
          {T.KNOWN_NUMBER_LINE(k, y, nr)}{' '}
          <Link
            href={`/invoices/${encodeURIComponent(view.knownInvoice.id)}`}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            {T.KNOWN_LINK(y)}
          </Link>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => open('same_sale')} disabled={pending}>
          {T.BUTTON_SAME}
        </Button>
        <Button type="button" variant="outline" onClick={() => open('other_sale')} disabled={pending}>
          {T.BUTTON_OTHER}
        </Button>
      </div>

      <p className="text-xs text-amber-900">{T.SUPPORT(nr)}</p>

      <Dialog
        open={choice !== null}
        onOpenChange={(isOpen) => {
          // W trakcie zapisu dialog zostaje — wynik zamknie go sam.
          if (!isOpen && !pending) setChoice(null);
        }}
      >
        {/* Skutki są listą pod tytułem — bez osobnego opisu (radix: aria-describedby jawnie puste). */}
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          {choice !== null && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.TITLE}</DialogTitle>
              </DialogHeader>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {consequences(choice, view, nr, nrK, y).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              {needsConfirmation && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <Checkbox
                    id={checkboxId}
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                    disabled={pending}
                    className="mt-0.5"
                  />
                  <Label htmlFor={checkboxId} className="leading-snug font-normal">
                    {checkboxLabel}
                  </Label>
                </div>
              )}
              <DialogFooter>
                <Button type="button" onClick={submit} disabled={!canConfirm}>
                  {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
                  {dialog.CONFIRM_BUTTON}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
