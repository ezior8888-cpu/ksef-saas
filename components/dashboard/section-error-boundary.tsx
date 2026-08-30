'use client';

import { Component, type ReactNode } from 'react';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Granica błędu dla POJEDYNCZEJ sekcji strony. Powstała 30.08.2026 z konkretnej
 * awarii: `listProposals()` rzuciło `PGRST205` (brak tabel FLO w bazie
 * deweloperskiej) i cały dashboard zamienił się w ekran „Coś poszło nie tak” —
 * razem z liczbami miesiąca, które nie mają z agentem nic wspólnego.
 *
 * `Suspense` tego nie łapie: obsługuje oczekiwanie, nie wyjątek. Bez tej
 * granicy każda czkawka po stronie agenta zabiera człowiekowi całą stronę,
 * a agent jest z założenia częścią, która ma prawo czasem milczeć.
 *
 * Komunikat jest CELOWO spokojny i nie udaje, że wszystko gra — cisza jest
 * stanem zabronionym (własność W5 z planu FLO).
 */
interface Props {
  children: ReactNode;
  /** Co pokazać zamiast sekcji. Bez tego — dyskretna notka. */
  fallback?: ReactNode;
  /** Nazwa sekcji do komunikatu, np. „Flo”. */
  label?: string;
}

export class SectionErrorBoundary extends Component<
  Props,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <section
        role="status"
        className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-[22px] py-5"
      >
        <p className="text-[13px] text-[var(--ff-text-muted)]">
          {this.props.label ?? 'Ta sekcja'} chwilowo się nie ładuje. Reszta
          strony działa normalnie — odśwież za chwilę.
        </p>
      </section>
    );
  }
}
