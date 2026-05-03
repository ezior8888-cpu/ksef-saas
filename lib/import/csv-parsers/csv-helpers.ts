/**
 * Wspólne parsowanie kwot, dat i NIP dla importów CSV.
 */

export function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  let s = value
    .replace(/PLN|zł|EUR|USD/gi, '')
    .replace(/\s/g, '')
    .trim();

  // Polski format: 1.234,56 lub 1234,56
  if (/^\d{1,3}(\.\d{3})*,\d{1,}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})*\.\d{1,}$/.test(s)) {
    // 1,234.56 EN
    s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Zamiana typowych formatów PL/ISO na YYYY-MM-DD.
 * Przy niepowodzeniu wraca przez `fallback` lub dzisiejszą datę i dopisuje ostrzeżenie.
 */
export function parseDate(
  value: string | undefined,
  options?: {
    warnings?: string[];
    fieldLabel?: string;
    fallbackISO?: string;
  },
): string {
  const warn = options?.warnings;
  const label = options?.fieldLabel ?? 'Data';

  if (!value?.trim()) {
    const fb = options?.fallbackISO ?? new Date().toISOString().slice(0, 10);
    warn?.push(`${label}: pusta wartość — przyjęto ${fb}`);
    return fb;
  }

  const v = value.trim();

  const ddmmyyyy = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return v;
  }

  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  const fb = options?.fallbackISO ?? new Date().toISOString().slice(0, 10);
  warn?.push(`${label}: nie rozpoznano „${v}” — przyjęto ${fb}`);
  return fb;
}

/** NIP PL — dokładnie 10 cyfr (bez prefiksu PL). */
export function cleanNip(value: string): string | undefined {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 && /^\d{10}$/.test(digits) ? digits : undefined;
}
