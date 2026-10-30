// @vitest-environment jsdom
import { act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary, type ErrorComponent } from 'next/dist/client/components/error-boundary';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

import DashboardError from '@/app/(dashboard)/error';

/**
 * „Spróbuj ponownie” na stronie błędu panelu (ustalenie 3 sesji 9 planu
 * skalowania, #350). Błąd Server Componentu (np. odczyt członkostw
 * w `getPageContext` przy miękkiej nawigacji) przychodzi w ładunku RSC.
 * Samo `reset()` granicy Next tylko czyści jej stan i renderuje ten sam
 * ładunek — klient od razu widzi ten sam błąd. Ponowienie musi pobrać
 * stronę od nowa (`router.refresh()`), i dopiero wtedy wyrenderować segment.
 *
 * Test stawia PRAWDZIWĄ granicę błędu Next (`ErrorBoundary`, tę samą, którą
 * App Router owija `error.tsx`) z atrapą routera w `AppRouterContext`.
 * „Serwer” to zmienna `serwer`: `refresh()` atrapy kopiuje jego stan do
 * ładunku, który widzi strona — jak prawdziwe ponowne pobranie RSC.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Next typuje `error` granicy jako `unknown` (TODO NAR-804 w error-boundary.js),
// `error.tsx` według dokumentacji jako `Error & { digest }`.
const errorComponent = DashboardError as ErrorComponent;

type Ladunek = { stan: 'blad' } | { stan: 'ok' } | { stan: 'wczytuje'; gotowe: Promise<void> };

let serwer: Ladunek = { stan: 'blad' };
let ladunek: Ladunek = { stan: 'blad' };

const refresh = vi.fn(() => {
  ladunek = serwer;
});
const router: AppRouterInstance = {
  back: vi.fn(),
  forward: vi.fn(),
  refresh,
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  bfcacheId: '_b_0_',
};

function Strona() {
  if (ladunek.stan === 'blad') throw new Error('Nie udało się odczytać członkostw');
  if (ladunek.stan === 'wczytuje') use(ladunek.gotowe);
  return <p>Pulpit wczytany</p>;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  refresh.mockClear();
  sentry.captureException.mockReset();
  serwer = { stan: 'blad' };
  ladunek = { stan: 'blad' };
  // React wypisuje każdy błąd złapany przez granicę — tu jest oczekiwany.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.restoreAllMocks();
});

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <AppRouterContext.Provider value={router}>
        <ErrorBoundary errorComponent={errorComponent}>
          <Strona />
        </ErrorBoundary>
      </AppRouterContext.Provider>,
    );
  });
  return host;
}

function przycisk(el: HTMLElement) {
  const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Spróbuj ponownie'));
  expect(button).toBeDefined();
  return button!;
}

describe('panel — „Spróbuj ponownie” na stronie błędu', () => {
  it('awaria minęła: pobiera stronę od nowa i pokazuje dane', async () => {
    const el = await mount();
    expect(el.textContent).toContain('Coś poszło nie tak');
    expect(sentry.captureException).toHaveBeenCalledTimes(1);

    serwer = { stan: 'ok' };
    await act(async () => {
      przycisk(el).click();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Pulpit wczytany');
    expect(el.textContent).not.toContain('Coś poszło nie tak');
  });

  it('awaria trwa: jedno ponowne pobranie i znów ekran błędu, bez pętli', async () => {
    const el = await mount();

    await act(async () => {
      przycisk(el).click();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Coś poszło nie tak');
    // Drugie kliknięcie działa tak samo — ekran nie zostaje martwy.
    serwer = { stan: 'ok' };
    await act(async () => {
      przycisk(el).click();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('Pulpit wczytany');
  });

  it('w trakcie pobierania przycisk jest wyłączony — seria kliknięć nie mnoży renderów strony', async () => {
    let zakoncz!: () => void;
    const gotowe = new Promise<void>((resolve) => {
      zakoncz = resolve;
    });
    const el = await mount();

    serwer = { stan: 'wczytuje', gotowe };
    await act(async () => {
      przycisk(el).click();
    });

    // Strona czeka na dane: React trzyma ekran błędu, przycisk wyłączony.
    expect(el.textContent).toContain('Coś poszło nie tak');
    expect(przycisk(el).disabled).toBe(true);
    await act(async () => {
      przycisk(el).click();
      przycisk(el).click();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      zakoncz();
      await gotowe;
    });
    expect(el.textContent).toContain('Pulpit wczytany');
  });
});
