import { Star } from 'lucide-react';

interface Props {
  quote: string;
  author: string;
  role: string;
  rating: number;
}

export function TestimonialCard({ quote, author, role, rating }: Props) {
  return (
    <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7">
      <div className="mb-4 flex gap-0.5" aria-label={`Ocena ${rating} na 5`}>
        {Array.from({ length: rating }, (_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
        ))}
      </div>
      <p className="text-sm leading-relaxed mb-6">&quot;{quote}&quot;</p>
      <div>
        <p className="text-sm font-medium">{author}</p>
        <p className="text-xs text-muted-foreground">{role}</p>
      </div>
    </div>
  );
}
