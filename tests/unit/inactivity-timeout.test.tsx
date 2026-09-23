import { JSDOM } from 'jsdom';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInactivityTimeout, type InactivityTimeoutOptions } from '@/hooks/use-inactivity-timeout';

let dom: JSDOM;
let root: Root;
let container: HTMLDivElement;
const minute = 60_000;
function Harness(options: InactivityTimeoutOptions) {
  const { isWarning, secondsLeft, reset } = useInactivityTimeout(options);
  return <><output>{isWarning ? 'warning' : 'active'}:{secondsLeft}</output><button onClick={reset}>Stay</button></>;
}
function render(onTimeout: () => void) {
  act(() => root.render(<StrictMode><Harness onTimeout={onTimeout} /></StrictMode>));
}
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)); }
function activity(type: string) { act(() => window.dispatchEvent(new dom.window.Event(type))); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.test' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  dom.window.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('inactivity deadline through real React renders and effect cleanup', () => {
  it('warns at 59 minutes and logs out exactly once at 60, including StrictMode replay', () => {
    const logout = vi.fn(); render(logout);
    advance(59 * minute);
    expect(container.textContent).toContain('warning:60');
    expect(logout).not.toHaveBeenCalled();
    advance(minute - 1);
    expect(logout).not.toHaveBeenCalled();
    advance(1);
    expect(logout).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('warning:0');
    advance(120 * minute);
    expect(logout).toHaveBeenCalledOnce();
  });
  it('does not treat warning renders or incidental activity as an extension', () => {
    const logout = vi.fn(); render(logout);
    advance(59 * minute);
    for (const type of ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'visibilitychange']) activity(type);
    advance(minute);
    expect(logout).toHaveBeenCalledOnce();
    activity('mousemove');
    advance(60 * minute);
    expect(logout).toHaveBeenCalledOnce();
  });
  it('allows an explicit Stay click to start a new full deadline', () => {
    const logout = vi.fn(); render(logout);
    advance(59 * minute);
    advance(30_000);
    act(() => container.querySelector('button')!.click());
    expect(container.textContent).toContain('active:60');
    advance(59 * minute);
    expect(container.textContent).toContain('warning:60');
    expect(logout).not.toHaveBeenCalled();
    advance(minute);
    expect(logout).toHaveBeenCalledOnce();
  });
  it('reschedules for activity before the warning', () => {
    const logout = vi.fn(); render(logout);
    advance(30 * minute);
    activity('keydown');
    advance(59 * minute);
    expect(container.textContent).toContain('warning:60');
    expect(logout).not.toHaveBeenCalled();
    advance(minute);
    expect(logout).toHaveBeenCalledOnce();
  });
  it('uses the latest callback without changing the existing deadline', () => {
    const original = vi.fn(); const latest = vi.fn(); render(original);
    advance(59 * minute);
    render(latest);
    expect(container.textContent).toContain('warning:60');
    advance(minute);
    expect(latest).toHaveBeenCalledOnce();
    expect(original).not.toHaveBeenCalled();
  });
  it('removes scheduled work and listeners after unmount', () => {
    const logout = vi.fn(); render(logout);
    advance(59 * minute);
    act(() => root.render(null));
    activity('keydown');
    advance(120 * minute);
    expect(logout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
