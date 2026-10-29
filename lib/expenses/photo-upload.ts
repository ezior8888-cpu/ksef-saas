import { ACTION_FILE_LIMIT_BYTES, ACTION_FILE_LIMIT_LABEL, formatUploadSize } from '@/lib/upload-limit';

/**
 * Wysyłka zdjęcia albo PDF-u kosztu z przeglądarki (plan skalowania,
 * sesja 4; EXT-09, HOR-V1, DBC-02, BCK-09).
 *
 * PO CO. Zdjęcie z aparatu telefonu ma 2–5 MB, a Server Action przyjmuje
 * 1 MB (`lib/upload-limit.ts`) — typowe zdjęcie paragonu nie dochodziło do
 * serwera. Do odczytu wystarcza dłuższy bok 2000 px: OCR (Anthropic) i tak
 * skaluje obraz do ok. 1568 px. Mniejszy plik to też mniej miejsca
 * w magazynie plików i kopiach oraz mniej tokenów OCR.
 *
 * ZASADY ZMNIEJSZANIA:
 * - PDF bez zmian.
 * - Obraz: dekodowanie z orientacją z EXIF (`createImageBitmap`, zapas
 *   `<img>`), dłuższy bok ≤ 2000 px, JPEG 0,8, a gdy dalej ponad limit — 0,6.
 *   Pod przezroczystością PNG białe tło. Animowany GIF daje pierwszą klatkę.
 * - Dekodowanie zawiodło (np. HEIC poza Safari) albo wynik nie jest
 *   mniejszy → zostaje oryginał. Typ i tak sprawdza serwer, z zawartości.
 * - JPEG z płótna nie ma metadanych EXIF (położenia GPS, daty zdjęcia).
 *
 * Tylko API przeglądarki — moduł dla komponentów klienckich.
 */

/** Dłuższy bok zmniejszonego zdjęcia. */
export const PHOTO_MAX_EDGE_PX = 2000;

/** Jakość JPEG; druga tylko wtedy, gdy pierwsza nie mieści się w limicie. */
const JPEG_QUALITIES = [0.8, 0.6] as const;

/** Wynik akcji wgrania — kształt zwracany przez `uploadExpensePhotoAction`. */
export type ExpenseUploadResult = { success: true; ocrJobId: string } | { success: false; error: string };

/** Odrzucona obietnica akcji: 413 od Next, zerwane połączenie, restart serwera. */
export const EXPENSE_UPLOAD_FAILED = 'Nie udało się wysłać pliku. Sprawdź połączenie i spróbuj ponownie.';

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function jpgName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, '');
  return `${base || 'paragon'}.jpg`;
}

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Starsza przeglądarka nie zna opcji albo formatu — próbujemy `<img>`,
      // który też obraca obraz według EXIF.
    }
  }

  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    const objectUrl = url;
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    if (url) URL.revokeObjectURL(url);
    return null;
  }
}

/** Obraz na płótnie z białym tłem, dłuższy bok ≤ `PHOTO_MAX_EDGE_PX`. */
function drawScaled(image: Decoded): HTMLCanvasElement | null {
  const { width, height } = image;
  if (!width || !height) return null;

  const scale = Math.min(1, PHOTO_MAX_EDGE_PX / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Zmniejszone zdjęcie jako JPEG albo — dla PDF-u, nieudanego dekodowania
 * i wyniku, który nie jest mniejszy — ten sam plik.
 */
export async function shrinkReceiptPhoto(file: File): Promise<File> {
  if (isPdf(file)) return file;

  try {
    const image = await decode(file);
    if (!image) return file;

    let canvas: HTMLCanvasElement | null;
    try {
      canvas = drawScaled(image);
    } finally {
      // Pełna bitmapa 12 Mpx to ok. 48 MB pamięci — oddajemy ją przed kodowaniem.
      image.release();
    }
    if (!canvas) return file;

    try {
      let blob: Blob | null = null;
      for (const quality of JPEG_QUALITIES) {
        blob = await toJpeg(canvas, quality);
        if (!blob || blob.size <= ACTION_FILE_LIMIT_BYTES) break;
      }
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], jpgName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
    } finally {
      // Safari na iOS zwalnia pamięć płótna dopiero po wyzerowaniu wymiarów.
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch {
    return file;
  }
}

/** Komunikat dla pliku, który nie zmieści się w limicie Server Action; `null` = mieści się. */
export function expenseFileTooLargeMessage(file: File): string | null {
  if (file.size <= ACTION_FILE_LIMIT_BYTES) return null;
  const size = formatUploadSize(file.size);
  if (isPdf(file)) {
    return `PDF ma ${size}, a można wgrać najwyżej ${ACTION_FILE_LIMIT_LABEL}. Zmniejsz go albo wgraj zdjęcie dokumentu — zdjęcia zmniejszamy sami.`;
  }
  return `Nie udało się zmniejszyć zdjęcia (${size}), a można wgrać najwyżej ${ACTION_FILE_LIMIT_LABEL}. Zapisz je jako JPG i spróbuj ponownie.`;
}

/**
 * Zmniejsza zdjęcie, zatrzymuje plik ponad limit i wysyła resztę akcją.
 * Odrzucona obietnica akcji wraca jako zwykły błąd: w `startTransition`
 * trafiłaby do granicy błędu strony zamiast do toastu.
 */
export async function sendExpenseFile(
  file: File,
  upload: (form: FormData) => Promise<ExpenseUploadResult>,
): Promise<ExpenseUploadResult> {
  const prepared = await shrinkReceiptPhoto(file);
  const tooLarge = expenseFileTooLargeMessage(prepared);
  if (tooLarge) return { success: false, error: tooLarge };

  const form = new FormData();
  form.append('photo', prepared);
  return upload(form).catch((): ExpenseUploadResult => ({ success: false, error: EXPENSE_UPLOAD_FAILED }));
}
