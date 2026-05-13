import { FileText } from 'lucide-react';

/**
 * Wordmark + ikona jak w brandingu FaktFlow: squircle w miętowym zielonym,
 * dokument w ciemnym konturze, nazwa w Geist (`font-sans` z root layout).
 */
export function AuthBrandMark() {
  return (
    <h1 className="flex items-center justify-center gap-3 text-white">
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#9ae8a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        aria-hidden
      >
        <FileText
          className="h-[22px] w-[22px] text-[#12131a]"
          strokeWidth={2.35}
          aria-hidden
        />
      </span>
      <span className="font-sans text-3xl font-semibold tracking-[-0.03em]">
        FaktFlow
      </span>
    </h1>
  );
}
