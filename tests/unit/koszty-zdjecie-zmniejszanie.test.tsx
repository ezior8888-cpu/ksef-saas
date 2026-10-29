// @vitest-environment jsdom
import { act, Component, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sesja 4 planu skalowania (EXT-09, HOR-V1, LIM-08, CPU-06, DBC-02, BCK-09).
 * Server Action przyjmuje najwyżej 1 MB (domyślny limit Next, `next.config.ts`
 * go nie zmienia), a zdjęcie z aparatu telefonu ma 2–5 MB. Dlatego przycisk
 * „Dodaj wydatek” zmniejsza zdjęcie w przeglądarce (dłuższy bok ≤ 2000 px,
 * JPEG 0,8) przed wysłaniem. PDF idzie bez zmian. Plik, który dalej nie
 * mieści się w limicie, dostaje komunikat i nie trafia do akcji. Odrzucona
 * obietnica akcji (413, sieć) kończy się toastem, nie granicą błędu strony.
 *
 * jsdom nie ma płótna ani dekodera obrazów, więc `createImageBitmap`,
 * `getContext` i `toBlob` to atrapy. Atrapa `toBlob` liczy rozmiar JPEG
 * z liczby pikseli (0,15 B/px przy jakości 0,8, rośnie z jakością). Prawdziwy
 * pomiar na zdjęciu jest w opisie PR, tu sprawdzamy drogę pliku.
 */

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  upload: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/app/actions/expenses', () => ({
  getOcrJobStatusAction: mocks.getStatus,
  uploadExpensePhotoAction: mocks.upload,
}));

import { CaptureButton } from '@/components/expenses/capture-button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JOB_ID = '11111111-1111-4111-8111-111111111111';
/** Domyślny limit ciała Server Action w Next 16 (`action-handler.js`). */
const ACTION_LIMIT = 1024 * 1024;
const MB = 1024 * 1024;

/** Atrapa kodera JPEG: rozmiar z pikseli płótna i jakości. */
let bytesPerPixel = (quality: number) => 0.15 * (quality / 0.8);

type Drawn = { canvas: HTMLCanvasElement; calls: string[] };
let drawn: Drawn[] = [];
let toBlobCalls: Array<{ type: string | undefined; quality: number | undefined; width: number; height: number }> = [];
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };

function fakeContext(canvas: HTMLCanvasElement) {
  const entry: Drawn = { canvas, calls: [] };
  drawn.push(entry);
  return {
    set fillStyle(value: string) {
      entry.calls.push(`fillStyle=${value}`);
    },
    set imageSmoothingQuality(value: string) {
      entry.calls.push(`smoothing=${value}`);
    },
    imageSmoothingEnabled: true,
    fillRect: (x: number, y: number, w: number, h: number) => entry.calls.push(`fillRect ${x},${y},${w},${h}`),
    drawImage: (_img: unknown, x: number, y: number, w: number, h: number) =>
      entry.calls.push(`drawImage ${x},${y},${w},${h}`),
  };
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? <p data-granica>Granica błędu</p> : this.props.children;
  }
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

// jsdom nie ma `URL.createObjectURL` ani `img.decode()` — zapas `<img>`
// dostaje je od testu, który go sprawdza, i oddaje po teście.
const urlStatics = URL as unknown as Record<'createObjectURL' | 'revokeObjectURL', unknown>;
const imgProto = HTMLImageElement.prototype as unknown as Record<'decode', unknown>;
const saved = {
  createObjectURL: urlStatics.createObjectURL,
  revokeObjectURL: urlStatics.revokeObjectURL,
  decode: imgProto.decode,
};

/** Zapas `<img>`: dekoduje (`ok`) albo odrzuca, z podanymi wymiarami. */
function imgFallback({ ok, width = 0, height = 0 }: { ok: boolean; width?: number; height?: number }) {
  const revoke = vi.fn();
  urlStatics.createObjectURL = vi.fn(() => 'blob:zdjecie');
  urlStatics.revokeObjectURL = revoke;
  imgProto.decode = ok
    ? vi.fn(async () => undefined)
    : vi.fn(async () => {
        throw new DOMException('decode', 'EncodingError');
      });
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(height);
  return { revoke };
}

beforeEach(() => {
  vi.resetAllMocks();
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
  // Wgranie się udaje, odczyt czeka — test kończy się przed odpytywaniem.
  mocks.upload.mockResolvedValue({ success: true, ocrJobId: JOB_ID });
  mocks.getStatus.mockReturnValue(new Promise(() => {}));

  drawn = [];
  toBlobCalls = [];
  bytesPerPixel = (quality: number) => 0.15 * (quality / 0.8);
  bitmap = { width: 4000, height: 3000, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return fakeContext(this) as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext']);
  HTMLCanvasElement.prototype.toBlob = function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ) {
    toBlobCalls.push({ type, quality, width: this.width, height: this.height });
    const size = Math.round(this.width * this.height * bytesPerPixel(quality ?? 0.92));
    setTimeout(() => callback(new Blob([new Uint8Array(size)], { type: type ?? 'image/png' })), 0);
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  urlStatics.createObjectURL = saved.createObjectURL;
  urlStatics.revokeObjectURL = saved.revokeObjectURL;
  imgProto.decode = saved.decode;
  process.off('unhandledRejection', onUnhandled);
});

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <Boundary>
        <CaptureButton />
      </Boundary>,
    );
  });
  return host;
}

/** Wybiera plik w polu galerii (zdjęcie lub PDF) i czeka na koniec wgrywania. */
async function choose(file: File, field: 'camera' | 'gallery' = 'gallery') {
  const el = host ?? (await render());
  const inputs = el.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const input = field === 'camera' ? inputs[0]! : inputs[1]!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Dekodowanie i koder JPEG są asynchroniczne (atrapa `toBlob` odpowiada
  // w następnym takcie), więc dajemy przejściu kilka prawdziwych taktów.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function sentFile(): File {
  expect(mocks.upload).toHaveBeenCalledOnce();
  const form = mocks.upload.mock.calls[0]![0] as FormData;
  const photo = form.get('photo');
  expect(photo).toBeInstanceOf(File);
  return photo as File;
}

function photo(size: number, name = 'IMG_2041.JPG', type = 'image/jpeg') {
  return new File([new Uint8Array(size)], name, { type });
}

function boundaryShown() {
  return host!.querySelector('[data-granica]') !== null;
}

describe('CaptureButton — zdjęcie zmniejszane przed wysłaniem (sesja 4)', () => {
  it('JPEG 4000×3000, 4 MB → do akcji trafia JPEG 2000×1500 poniżej 1 MB', async () => {
    const original = photo(4 * MB);
    await choose(original, 'camera');

    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(original, { imageOrientation: 'from-image' });
    expect(toBlobCalls).toEqual([{ type: 'image/jpeg', quality: 0.8, width: 2000, height: 1500 }]);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.calls).toContain('drawImage 0,0,2000,1500');
    expect(bitmap.close).toHaveBeenCalled();

    const sent = sentFile();
    expect(sent.type).toBe('image/jpeg');
    expect(sent.name).toBe('IMG_2041.jpg');
    expect(sent.size).toBeLessThan(ACTION_LIMIT);
    expect(sent.size).toBeLessThan(original.size / 4);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('pionowe zdjęcie 3000×4000 → dłuższy bok 2000 px (1500×2000)', async () => {
    bitmap = { width: 3000, height: 4000, close: vi.fn() };
    await choose(photo(3 * MB));

    expect(toBlobCalls[0]).toMatchObject({ width: 1500, height: 2000 });
    expect(sentFile().size).toBeLessThan(ACTION_LIMIT);
  });

  it('PNG z przezroczystością → białe tło pod obrazem, wynik JPEG', async () => {
    bitmap = { width: 2400, height: 1200, close: vi.fn() };
    await choose(photo(2 * MB, 'zrzut ekranu.png', 'image/png'));

    const calls = drawn[0]!.calls;
    const fill = calls.indexOf('fillRect 0,0,2000,1000');
    const draw = calls.indexOf('drawImage 0,0,2000,1000');
    expect(calls).toContain('fillStyle=#ffffff');
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(draw).toBeGreaterThan(fill);
    const sent = sentFile();
    expect(sent.type).toBe('image/jpeg');
    expect(sent.name).toBe('zrzut ekranu.jpg');
  });

  it('PDF idzie bez zmian — bez dekodowania i bez płótna', async () => {
    const pdf = photo(300 * 1024, 'faktura.pdf', 'application/pdf');
    await choose(pdf);

    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
    expect(toBlobCalls).toEqual([]);
    expect(sentFile()).toBe(pdf);
  });

  it('błąd dekodowania (np. HEIC w Chrome) → wysyłamy oryginał, jeśli mieści się w limicie', async () => {
    vi.mocked(globalThis.createImageBitmap).mockRejectedValue(new DOMException('decode', 'InvalidStateError'));
    const { revoke } = imgFallback({ ok: false });
    const heic = photo(600 * 1024, 'IMG_0001.HEIC', 'image/heic');
    await choose(heic);

    expect(sentFile()).toBe(heic);
    expect(toBlobCalls).toEqual([]);
    expect(revoke).toHaveBeenCalledWith('blob:zdjecie');
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('zapas <img>: gdy createImageBitmap zawiedzie, obraz dekoduje element img', async () => {
    vi.mocked(globalThis.createImageBitmap).mockRejectedValue(new TypeError('imageOrientation'));
    const { revoke } = imgFallback({ ok: true, width: 4032, height: 3024 });

    await choose(photo(4 * MB));

    expect(toBlobCalls[0]).toMatchObject({ type: 'image/jpeg', width: 2000, height: 1500 });
    expect(sentFile().size).toBeLessThan(ACTION_LIMIT);
    expect(revoke).toHaveBeenCalledWith('blob:zdjecie');
  });

  it('wynik nie jest mniejszy od oryginału → zostaje oryginał', async () => {
    bitmap = { width: 800, height: 600, close: vi.fn() };
    const small = photo(40 * 1024, 'mały.jpg');
    await choose(small);

    expect(toBlobCalls).toHaveLength(1);
    expect(sentFile()).toBe(small);
  });

  it('JPEG 0,8 dalej ponad limit → druga próba z jakością 0,6', async () => {
    // Zdjęcie pełne szczegółów: 0,8 daje ok. 1,1 MB, 0,6 ok. 0,8 MB.
    bytesPerPixel = (quality: number) => (quality >= 0.8 ? 0.38 : 0.27);
    await choose(photo(5 * MB));

    expect(toBlobCalls.map((call) => call.quality)).toEqual([0.8, 0.6]);
    const sent = sentFile();
    expect(sent.size).toBeLessThan(ACTION_LIMIT);
    expect(sent.type).toBe('image/jpeg');
  });

  it('PDF 2 MB → komunikat o limicie, akcja niewołana, przycisk wolny', async () => {
    await choose(photo(2 * MB, 'skan.pdf', 'application/pdf'));

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledOnce();
    const message = String(mocks.toast.error.mock.calls[0]![0]);
    expect(message).toContain('2,0 MB');
    expect(message).toContain('1 MB');
    expect(host!.querySelector('button')!.textContent).toContain('Dodaj wydatek');
  });

  it('zdjęcie, którego nie da się zmniejszyć, ponad limit → komunikat, akcja niewołana', async () => {
    vi.mocked(globalThis.createImageBitmap).mockRejectedValue(new DOMException('decode', 'InvalidStateError'));
    imgFallback({ ok: false });
    await choose(photo(3 * MB, 'IMG_0002.HEIC', 'image/heic'));

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledOnce();
    expect(String(mocks.toast.error.mock.calls[0]![0])).toContain('JPG');
  });

  it('akcja odrzuca obietnicę (413 od Next) → toast, nie granica błędu strony', async () => {
    mocks.upload.mockRejectedValue(new Error('Body exceeded 1 MB limit.'));
    await choose(photo(4 * MB));

    expect(boundaryShown()).toBe(false);
    expect(mocks.toast.error).toHaveBeenCalledOnce();
    const message = String(mocks.toast.error.mock.calls[0]![0]);
    expect(message).not.toContain('Body exceeded');
    expect(message).toMatch(/Nie udało się wysłać/);
    expect(host!.querySelector('button')!.textContent).toContain('Dodaj wydatek');
    expect(unhandled).toEqual([]);
  });
});
