'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  getOcrJobStatusAction,
  uploadExpensePhotoAction,
} from '@/app/actions/expenses';
import { Button } from '@/components/ui/button';

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'processing'; jobId: string }
  | { kind: 'failed'; error: string };

export function CaptureButton() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [state, setState] = useState<CaptureState>({ kind: 'idle' });
  const [, startUpload] = useTransition();

  const processingJobId =
    state.kind === 'processing' ? state.jobId : null;

  useEffect(() => {
    if (!processingJobId) return;

    const jobId = processingJobId;
    let cancelled = false;
    const timers: { interval?: ReturnType<typeof setInterval> } = {};

    async function pollOnce() {
      if (cancelled) return;
      const status = await getOcrJobStatusAction(jobId);
      if (cancelled) return;

      if (!status.success) {
        if (timers.interval) clearInterval(timers.interval);
        setState({ kind: 'failed', error: status.error });
        toast.error(status.error);
        return;
      }

      if (status.job.status === 'completed' && status.job.expense_id) {
        if (timers.interval) clearInterval(timers.interval);
        toast.success('Wydatek rozpoznany!');
        router.push(`/expenses/${status.job.expense_id}`);
        setState({ kind: 'idle' });
        return;
      }

      if (status.job.status === 'failed') {
        if (timers.interval) clearInterval(timers.interval);
        setState({
          kind: 'failed',
          error: status.job.error_message ?? 'Nieznany błąd',
        });
        toast.error('Nie udało się rozpoznać');
      }
    }

    void pollOnce();
    timers.interval = setInterval(() => void pollOnce(), 2000);

    const timeoutId = setTimeout(() => {
      cancelled = true;
      if (timers.interval) clearInterval(timers.interval);
      setState((s) =>
        s.kind === 'processing' && s.jobId === jobId
          ? {
              kind: 'failed',
              error: 'Przekroczono czas oczekiwania (60 s).',
            }
          : s,
      );
      toast.error('Przekroczono czas oczekiwania');
    }, 60_000);

    return () => {
      cancelled = true;
      if (timers.interval) clearInterval(timers.interval);
      clearTimeout(timeoutId);
    };
  }, [processingJobId, router]);

  const handleFile = (file: File) => {
    setShowSheet(false);
    setState({ kind: 'uploading' });

    startUpload(async () => {
      const fd = new FormData();
      fd.append('photo', file);
      const result = await uploadExpensePhotoAction(fd);

      if (!result.success) {
        setState({ kind: 'failed', error: result.error });
        toast.error(result.error);
        return;
      }

      setState({ kind: 'processing', jobId: result.ocrJobId });
    });
  };

  return (
    <>
      <Button
        variant="glass-primary"
        size="lg"
        onClick={() => setShowSheet(true)}
        disabled={state.kind === 'uploading' || state.kind === 'processing'}
      >
        {state.kind === 'uploading' || state.kind === 'processing' ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {state.kind === 'uploading' ? 'Wgrywanie...' : 'Rozpoznaję...'}
          </>
        ) : (
          <>
            <Camera className="mr-2 h-4 w-4" />
            Dodaj wydatek
          </>
        )}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      <AnimatePresence>
        {showSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSheet(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4 lg:bottom-8 lg:left-1/2 lg:max-w-md lg:-translate-x-1/2 lg:rounded-3xl"
            >
              <div className="space-y-3 rounded-3xl border border-glass-border bg-glass-white-strong p-5 shadow-glass-lg backdrop-blur-glass-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold tracking-tighter-text">
                    Dodaj wydatek
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowSheet(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-foreground/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-2xl border border-glass-border bg-glass-white p-4 transition-all duration-200 ease-apple hover:bg-glass-white-strong active:scale-[0.98]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium">Zrób zdjęcie</p>
                    <p className="text-xs text-muted-foreground">
                      Na telefonie otwiera od razu aparat tylny
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-2xl border border-glass-border bg-glass-white p-4 transition-all duration-200 ease-apple hover:bg-glass-white-strong active:scale-[0.98]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground/10">
                    <ImageIcon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium">Wybierz z galerii</p>
                    <p className="text-xs text-muted-foreground">
                      Zdjęcie lub PDF z plików
                    </p>
                  </div>
                </button>

                <p className="pt-2 text-center text-xs text-muted-foreground">
                  Akceptujemy: paragon, faktura VAT, faktura uproszczona. Max 10
                  MB.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
