import { cn } from '@/lib/utils';
import { ffTable } from '@/lib/dashboard/ff-surface-classes';

export function FfDataTableCard({
  title,
  subtitle,
  children,
  className,
  minWidth,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div className={cn(ffTable.card, className)}>
      {title || subtitle ? (
        <div className={ffTable.header}>
          {title ? <h2 className={ffTable.title}>{title}</h2> : null}
          {subtitle ? <p className={ffTable.subtitle}>{subtitle}</p> : null}
        </div>
      ) : null}
      <div className={ffTable.scroll}>
        <table
          className={ffTable.table}
          style={minWidth != null ? { minWidth } : undefined}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

export { ffTable };
