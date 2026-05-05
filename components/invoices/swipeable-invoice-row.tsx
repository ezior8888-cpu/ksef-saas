'use client';

import { useState, useTransition } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  downloadInvoiceXmlAction,
  resendInvoiceAction,
} from '@/components/invoices/actions-detail';

import { StatusBadge } from './status-badge';

import type { InvoiceRow } from './invoice-row-types';

export type SwipeableInvoiceRowInvoice = InvoiceRow;

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface Props {
  invoice: SwipeableInvoiceRowInvoice;
}

/**
 * Wiersz faktury z gestem poziomym (framer-motion `drag="x"` + `animate` ze
 * springiem). Na touch: swipe w lewo → pobierz XML, swipe w prawo → ponów
 * wysyłkę (gdy dozwolone).
 */
export function SwipeableInvoiceRow({ invoice }: Props) {
  const router = useRouter();
  const x = useMotionValue(0);
  const [isResetting, setIsResetting] = useState(false);
  const [isDownloading, startDownload] = useTransition();
  const [isResending, startResend] = useTransition();

  const canDownload = Boolean(invoice.xml_storage_path);
  const canResend =
    invoice.ksef_status === 'failed' || invoice.ksef_status === 'rejected';

  const leftActionOpacity = useTransform(x, [-120, -40, 0], [1, 0.5, 0]);
  const rightActionOpacity = useTransform(x, [0, 40, 120], [0, 0.5, 1]);

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    const offset = info.offset.x;
    setIsResetting(true);

    if (offset < -100 && canDownload) {
      void animate(x, 0, SPRING);
      handleDownload();
    } else if (offset > 100 && canResend) {
      void animate(x, 0, SPRING);
      handleResend();
    } else {
      void animate(x, 0, SPRING);
    }

    setTimeout(() => setIsResetting(false), 300);
  };

  const handleDownload = () => {
    startDownload(async () => {
      const result = await downloadInvoiceXmlAction(invoice.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([result.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Pobrano XML');
    });
  };

  const handleResend = () => {
    startResend(async () => {
      const result = await resendInvoiceAction(invoice.id);
      if (result.success) {
        toast.success('Ponowna wysyłka rozpoczęta');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const dragEnabled = canDownload || canResend;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-6">
        <motion.div
          style={{ opacity: rightActionOpacity }}
          className="flex items-center gap-2 text-orange-600 dark:text-orange-400"
        >
          {isResending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="h-5 w-5" />
          )}
          <span className="text-sm font-medium">Wyślij ponownie</span>
        </motion.div>
        <motion.div
          style={{ opacity: leftActionOpacity }}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400"
        >
          <span className="text-sm font-medium">Pobierz XML</span>
          {isDownloading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Download className="h-5 w-5" />
          )}
        </motion.div>
      </div>

      <motion.div
        drag={dragEnabled ? 'x' : false}
        dragConstraints={{
          left: canDownload ? -120 : 0,
          right: canResend ? 120 : 0,
        }}
        dragElastic={0.2}
        style={{ x }}
        onDragEnd={handleDragEnd}
        className="relative touch-pan-y rounded-2xl border border-glass-border bg-glass-white backdrop-blur-glass"
      >
        <Link
          href={`/invoices/${invoice.id}`}
          className={`block p-4 ${isResetting ? 'pointer-events-none' : ''}`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-medium">
                {invoice.internal_number ?? '(bez numeru)'}
              </p>
              <p className="text-xs text-muted-foreground">
                {invoice.issue_date ?? '—'}
              </p>
            </div>
            <StatusBadge status={invoice.ksef_status} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {invoice.buyer_data?.name ?? '—'}
              </p>
              {invoice.buyer_data?.nip ? (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {invoice.buyer_data.nip}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums">
              {invoice.gross_total != null
                ? `${Number(invoice.gross_total).toFixed(2)} PLN`
                : '—'}
            </p>
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
