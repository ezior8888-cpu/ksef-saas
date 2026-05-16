'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Eventy traktowane jako "aktywność" — resetują timer.
 * `visibilitychange` łapie powrót do karty z innej zakładki.
 */
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'visibilitychange',
] as const;

export interface InactivityTimeoutOptions {
  /** Po jakim czasie idle wyloguć. Default 60 min (masterplan Fazy 28). */
  timeoutMs?: number;
  /** Ile sekund przed wylogowaniem pokazać modal. Default 60s. */
  warningMs?: number;
  /** Callback gdy minął timeoutMs. Wywoływany RAZ, NIE w petle. */
  onTimeout: () => void;
}

export interface InactivityTimeoutState {
  isWarning: boolean;
  /** Sekund do automatycznego wylogowania, gdy w fazie warning. */
  secondsLeft: number;
  /** Reset timera — np. button "Pozostań zalogowany". */
  reset: () => void;
}

/**
 * Hook śledzący aktywność użytkownika. Po `timeoutMs - warningMs` zaczyna
 * pokazywać warning, po `timeoutMs` woła `onTimeout`.
 *
 * Throttle (1s) na resety — przy ruchu myszką event leci 60/s, nie ma sensu
 * resetować setTimeout tyle razy.
 */
export function useInactivityTimeout(
  options: InactivityTimeoutOptions,
): InactivityTimeoutState {
  const timeoutMs = options.timeoutMs ?? 60 * 60 * 1000;
  const warningMs = options.warningMs ?? 60 * 1000;
  const onTimeoutRef = useRef(options.onTimeout);
  onTimeoutRef.current = options.onTimeout;

  const [isWarning, setIsWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(warningMs / 1000));

  const lastResetRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const scheduleTimers = useCallback(() => {
    clearTimers();
    firedRef.current = false;
    setIsWarning(false);
    setSecondsLeft(Math.floor(warningMs / 1000));

    warningTimerRef.current = setTimeout(() => {
      setIsWarning(true);
      const startedAt = Date.now();
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const left = Math.max(0, Math.ceil((warningMs - elapsed) / 1000));
        setSecondsLeft(left);
      }, 500);
    }, timeoutMs - warningMs);

    timeoutTimerRef.current = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onTimeoutRef.current();
    }, timeoutMs);
  }, [timeoutMs, warningMs, clearTimers]);

  const reset = useCallback(() => {
    lastResetRef.current = Date.now();
    scheduleTimers();
  }, [scheduleTimers]);

  // Setup eventów + initial scheduling.
  useEffect(() => {
    scheduleTimers();

    const onActivity = () => {
      // W fazie warning user musi explicit kliknąć "Pozostań" — sam ruch
      // myszką może być przypadkowy (kot na klawiaturze). Inaczej user
      // nigdy nie zobaczyłby wylogowania.
      if (isWarning) return;

      const now = Date.now();
      if (now - lastResetRef.current < 1000) return; // throttle 1s
      lastResetRef.current = now;
      scheduleTimers();
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      clearTimers();
    };
  }, [scheduleTimers, clearTimers, isWarning]);

  return { isWarning, secondsLeft, reset };
}
