import * as React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'strong' | 'subtle';
}

const variantClasses = {
  default:
    'bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-glass border border-white/55 dark:border-white/14 shadow-glass rounded-3xl',
  strong:
    'bg-white/62 dark:bg-[rgba(15,10,30,0.62)] backdrop-blur-glass-lg border border-white/55 dark:border-white/14 shadow-glass-lg rounded-3xl',
  subtle:
    'bg-white/40 dark:bg-white/[0.03] backdrop-blur-glass-sm border border-white/55 dark:border-white/14 rounded-2xl',
};

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(variantClasses[variant], className)}
      {...props}
    />
  )
);

GlassCard.displayName = 'GlassCard';

export { GlassCard };
