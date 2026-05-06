'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteExpenseAction,
  reviewExpenseAction,
} from '@/app/actions/expenses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ExpenseRow } from '@/components/expenses/expenses-list';
import type { Database } from '@/types/database';

type KpirColumn = Database['public']['Enums']['kpir_column'];

const KPIR_OPTIONS: { value: KpirColumn; label: string }[] = [
  { value: 'col_7', label: 'Kol. 7' },
  { value: 'col_8', label: 'Kol. 8' },
  { value: 'col_10', label: 'Kol. 10 — Towary handlowe i materiały' },
  { value: 'col_11', label: 'Kol. 11 — Koszty uboczne zakupu' },
  { value: 'col_12', label: 'Kol. 12 — Wynagrodzenia' },
  { value: 'col_13', label: 'Kol. 13 — Pozostałe wydatki' },
  { value: 'col_15', label: 'Kol. 15 — Koszty B+R' },
  { value: 'col_16', label: 'Kol. 16' },
];

const KPIR_VALUE_SET = new Set<string>(KPIR_OPTIONS.map((o) => o.value));

const COMMON_CATEGORIES = [
  'Paliwo',
  'Telekomunikacja',
  'Oprogramowanie',
  'Marketing',
  'Materiały biurowe',
  'Reprezentacja',
  'Podróże służbowe',
  'Usługi obce',
  'Energia',
  'Czynsz',
  'Pozostałe wydatki',
];

function normalizeKpirColumn(raw: string | null): KpirColumn {
  if (raw && KPIR_VALUE_SET.has(raw)) return raw as KpirColumn;
  return 'col_13';
}

interface ExpenseEditFormProps {
  expense: ExpenseRow;
  photoUrl: string | null;
}

interface FormState {
  seller_name: string;
  seller_nip: string;
  document_number: string;
  issue_date: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  kpir_column: KpirColumn;
  category_label: string;
  is_deductible: boolean;
  notes: string;
}

function buildInitialForm(expense: ExpenseRow): FormState {
  return {
    seller_name: expense.seller_name,
    seller_nip: expense.seller_nip?.replace(/\D/g, '') ?? '',
    document_number: expense.document_number ?? '',
    issue_date: expense.issue_date,
    net_amount: Number(expense.net_amount),
    vat_amount: Number(expense.vat_amount),
    gross_amount: Number(expense.gross_amount),
    kpir_column: normalizeKpirColumn(expense.kpir_column),
    category_label: expense.category_label ?? 'Pozostałe wydatki',
    is_deductible: expense.is_deductible,
    notes: expense.notes ?? '',
  };
}

export function ExpenseEditForm({ expense, photoUrl }: ExpenseEditFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(expense));
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const confidence = Number(expense.categorization_confidence ?? 0);
  const method = expense.categorization_method;
  const wasAutoClassified =
    method != null &&
    ['rule_nip', 'rule_keyword', 'ml_heuristic', 'ai_claude'].includes(method);

  const handleSave = () => {
    startSave(async () => {
      const result = await reviewExpenseAction(expense.id, {
        seller_name: form.seller_name,
        seller_nip: form.seller_nip === '' ? null : form.seller_nip,
        document_number: form.document_number.trim() || undefined,
        issue_date: form.issue_date,
        net_amount: form.net_amount,
        vat_amount: form.vat_amount,
        gross_amount: form.gross_amount,
        kpir_column: form.kpir_column,
        category_label: form.category_label,
        is_deductible: form.is_deductible,
        notes: form.notes.trim() ? form.notes.trim() : undefined,
      });

      if (result.success) {
        toast.success('Zapisano - apka się nauczyła Twojej preferencji');
        router.push('/expenses');
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = () => {
    if (!window.confirm('Usunąć ten wydatek?')) return;
    startDelete(async () => {
      const result = await deleteExpenseAction(expense.id);
      if (result.success) {
        toast.success('Usunięto');
        router.push('/expenses');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-6 pb-32">
      <Link
        href="/expenses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Wydatki
      </Link>

      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tighter-display">
          {!expense.is_reviewed ? 'Zaakceptuj wydatek' : 'Edytuj wydatek'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {!expense.is_reviewed
            ? 'Sprawdź dane rozpoznane automatycznie i zatwierdź'
            : 'Wprowadź zmiany w wydatku'}
        </p>
      </div>

      {wasAutoClassified ? (
        <div
          className={`rounded-3xl border p-5 backdrop-blur-glass ${
            confidence >= 0.9
              ? 'border-green-500/20 bg-green-500/5'
              : confidence >= 0.7
                ? 'border-blue-500/20 bg-blue-500/5'
                : 'border-orange-500/20 bg-orange-500/5'
          }`}
        >
          <div className="flex items-start gap-3">
            <Sparkles
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                confidence >= 0.9
                  ? 'text-green-600 dark:text-green-400'
                  : confidence >= 0.7
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-orange-600 dark:text-orange-400'
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Auto-kategoryzacja
              </p>
              <p className="mt-1 text-sm">
                Wykryto: <strong>{expense.category_label ?? '—'}</strong> ·{' '}
                <strong>
                  {KPIR_OPTIONS.find((o) => o.value === expense.kpir_column)
                    ?.label ?? '—'}
                </strong>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pewność: {Math.round(confidence * 100)}% (metoda:{' '}
                {expense.categorization_method ?? '—'})
              </p>
              {confidence < 0.7 ? (
                <p className="mt-2 text-xs">
                  Uwaga: niska pewność — sprawdź szczególnie kategorię.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {photoUrl ? (
          <section className="order-2 rounded-3xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass lg:order-1">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Zdjęcie paragonu
            </h2>
            {/* eslint-disable-next-line @next/next/no-img-element -- podpisany URL R2, krótki TTL */}
            <img
              src={photoUrl}
              alt="Paragon"
              className="w-full rounded-2xl border border-glass-border/50"
            />
          </section>
        ) : null}

        <div
          className={`space-y-6 ${photoUrl ? 'order-1 lg:order-2' : 'lg:col-span-2'}`}
        >
          <section className="space-y-5 rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass">
            <h2 className="font-display text-lg font-semibold tracking-tighter-text">
              Sprzedawca
            </h2>
            <div>
              <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nazwa
              </Label>
              <Input
                value={form.seller_name}
                onChange={(e) =>
                  setForm({ ...form, seller_name: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                NIP (opcjonalnie)
              </Label>
              <Input
                value={form.seller_nip}
                onChange={(e) =>
                  setForm({
                    ...form,
                    seller_nip: e.target.value.replace(/\D/g, '').slice(0, 10),
                  })
                }
                inputMode="numeric"
                maxLength={10}
                className="font-mono"
              />
            </div>
          </section>

          <section className="space-y-5 rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass">
            <h2 className="font-display text-lg font-semibold tracking-tighter-text">
              Dokument
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Numer
                </Label>
                <Input
                  value={form.document_number}
                  onChange={(e) =>
                    setForm({ ...form, document_number: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Data wystawienia
                </Label>
                <Input
                  type="date"
                  value={form.issue_date}
                  onChange={(e) =>
                    setForm({ ...form, issue_date: e.target.value })
                  }
                />
              </div>
            </div>
          </section>

          <section className="space-y-5 rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass">
            <h2 className="font-display text-lg font-semibold tracking-tighter-text">
              Kwoty (PLN)
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Netto
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={form.net_amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      net_amount: Number(e.target.value),
                    })
                  }
                  className="text-right tabular-nums"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  VAT
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={form.vat_amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      vat_amount: Number(e.target.value),
                    })
                  }
                  className="text-right tabular-nums"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Brutto
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={form.gross_amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      gross_amount: Number(e.target.value),
                    })
                  }
                  className="text-right font-medium tabular-nums"
                />
              </div>
            </div>
          </section>

          <section className="space-y-5 rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tighter-text">
                Kategoryzacja KPiR
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Apka się uczy — jeśli zmienisz, następne wydatki tego sprzedawcy
                będą tak kategoryzowane
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Kolumna KPiR
              </Label>
              <select
                value={form.kpir_column}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kpir_column: normalizeKpirColumn(e.target.value),
                  })
                }
                className="h-11 w-full rounded-xl border border-glass-border bg-white/50 px-4 text-sm backdrop-blur-glass-sm dark:bg-white/[0.05]"
              >
                {KPIR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Kategoria (czytelna nazwa)
              </Label>
              <Input
                list="expense-categories"
                value={form.category_label}
                onChange={(e) =>
                  setForm({ ...form, category_label: e.target.value })
                }
              />
              <datalist id="expense-categories">
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <button
              type="button"
              onClick={() =>
                setForm({ ...form, is_deductible: !form.is_deductible })
              }
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-foreground/2"
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                  form.is_deductible
                    ? 'border-foreground bg-foreground'
                    : 'border-foreground/20'
                }`}
              >
                {form.is_deductible ? (
                  <CheckCircle2 className="h-3 w-3 text-background" />
                ) : null}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Uwzględnij w KPiR</p>
                <p className="text-xs text-muted-foreground">
                  Odhacz jeśli ten wydatek nie jest kosztem firmowym
                </p>
              </div>
            </button>
          </section>

          <section className="rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass">
            <Label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notatki
            </Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-xl border border-glass-border bg-white/50 px-4 py-2 text-sm backdrop-blur-glass-sm dark:bg-white/[0.05]"
              placeholder="np. Zakup na potrzeby projektu X"
            />
          </section>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-glass-border bg-glass-white-strong px-6 py-4 backdrop-blur-glass-lg lg:left-[280px]">
        <div className="mx-auto flex max-w-7xl justify-between gap-3">
          <Button
            variant="ghost"
            size="lg"
            onClick={handleDelete}
            disabled={isDeleting || isSaving}
            className="text-red-600 hover:bg-red-500/10"
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            <span className="hidden sm:inline">Usuń</span>
          </Button>
          <Button
            variant="glass-primary"
            size="lg"
            onClick={handleSave}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {!expense.is_reviewed ? 'Zaakceptuj' : 'Zapisz zmiany'}
          </Button>
        </div>
      </div>
    </div>
  );
}
