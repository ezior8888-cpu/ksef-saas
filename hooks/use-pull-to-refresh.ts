'use client';

import { useEffect, useRef, useState } from 'react';

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  /** Jak daleko trzeba pociągnąć (px). */
  threshold?: number;
  /** 0–1 — im mniejsze, tym „cięższy” pull (mniejszy dystans przy tym samym ruchu). */
  resistance?: number;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  resistance = 0.5,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const isPulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      const y = e.touches[0]?.clientY;
      if (y === undefined) return;
      startY.current = y;
      isPulling.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || startY.current === null) return;

      const currentY = e.touches[0]?.clientY ?? startY.current;
      const diff = currentY - startY.current;

      if (diff > 0 && window.scrollY === 0) {
        const distance = diff * resistance;
        const capped = Math.min(distance, threshold * 1.5);
        pullDistanceRef.current = capped;
        setPullDistance(capped);
        if (e.cancelable) e.preventDefault();
      }
    };

    const finishBelowThreshold = () => {
      isPulling.current = false;
      startY.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current && pullDistanceRef.current === 0) return;

      const finalDistance = pullDistanceRef.current;
      isPulling.current = false;
      startY.current = null;

      if (finalDistance >= threshold) {
        setIsRefreshing(true);
        setPullDistance(0);
        pullDistanceRef.current = 0;
        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
        }
      } else {
        finishBelowThreshold();
      }
    };

    const handleTouchCancel = () => {
      finishBelowThreshold();
    };

    document.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    document.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [threshold, resistance]);

  return {
    pullDistance,
    isRefreshing,
    progress: Math.min(pullDistance / threshold, 1),
  };
}
