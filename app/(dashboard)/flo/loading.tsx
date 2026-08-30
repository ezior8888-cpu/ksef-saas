/**
 * Szkielet ładowania ekranu agenta (krok 20 toru B).
 *
 * Kształt jest ten sam co docelowy ekran: nagłówek, trzy karty, prawa
 * kolumna. Chodzi o to, żeby po wczytaniu nic nie podskoczyło — a nie o to,
 * żeby pokazać, że „coś się dzieje”. Żadnego kręcącego się kółka: ono mówi
 * tylko tyle, że czekamy, i przy szybkim łączu zdąży mrugnąć irytująco.
 */
export default function FloLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--ff-surface-muted)]" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-16 animate-pulse rounded bg-[var(--ff-surface-muted)]" />
          <div className="h-2.5 w-40 animate-pulse rounded bg-[var(--ff-surface-muted)]" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3 rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4 md:p-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-3.5"
            >
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--ff-surface-muted)]" />
              <div className="h-3 w-full animate-pulse rounded bg-[var(--ff-surface-muted)]" />
              <div className="h-6 w-28 animate-pulse rounded-lg bg-[var(--ff-surface-muted)]" />
            </div>
          ))}
        </div>

        <div className="hidden rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4 lg:block">
          <div className="h-2.5 w-44 animate-pulse rounded bg-[var(--ff-surface-muted)]" />
          <div className="mt-3 space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-[var(--ff-surface-muted)]"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
