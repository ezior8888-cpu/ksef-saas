'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, Loader2 } from 'lucide-react';

import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const { pullDistance, isRefreshing, progress } = usePullToRefresh({
    onRefresh,
  });

  return (
    <div className="relative">
      <motion.div
        animate={{
          height: isRefreshing ? 60 : pullDistance,
          opacity: pullDistance > 10 || isRefreshing ? 1 : 0,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex items-center justify-center overflow-hidden"
      >
        <div className="flex flex-col items-center gap-2 py-3">
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 animate-spin text-foreground" />
          ) : (
            <motion.div
              animate={{ rotate: progress >= 1 ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ArrowDown
                className={`h-5 w-5 transition-colors ${
                  progress >= 1
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground'
                }`}
              />
            </motion.div>
          )}
          <p className="text-xs text-muted-foreground">
            {isRefreshing
              ? 'Odświeżanie...'
              : progress >= 1
                ? 'Puść aby odświeżyć'
                : 'Pociągnij w dół'}
          </p>
        </div>
      </motion.div>

      {children}
    </div>
  );
}
