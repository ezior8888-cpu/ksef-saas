import { z } from 'zod';

/**
 * Dane firmy edytowane w ustawieniach (F-008): nazwa i adres siedziby trafiają
 * do Podmiot1 każdej kolejnej faktury i do JPK. NIP nie podlega edycji — to
 * tożsamość firmy w KSeF.
 *
 * Granice jak w XSD FA(3) (`Nazwa`, `AdresL1`, `AdresL2` — do 512 znaków, bez
 * znaków sterujących). Druga linia adresu ma postać „00-000 Miasto”: JPK_FA
 * wyciąga z niej kod pocztowy i miejscowość.
 */
const XML_FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
const NO_CONTROL_CHARS_MESSAGE = 'Usuń niewidoczne znaki sterujące (np. wklejone z Worda)';

// Znaki sterujące sprawdzamy PRZED zwinięciem spacji — `\s` obejmuje np.
// pionowy tabulator i po cichu by go „naprawił”.
const text = (required: string) =>
  z
    .string()
    .refine((v) => !XML_FORBIDDEN_CHARS.test(v), NO_CONTROL_CHARS_MESSAGE)
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, required).max(512, 'Maksymalnie 512 znaków'));

export const companyProfileSchema = z.object({
  name: text('Podaj nazwę firmy'),
  addressLine1: text('Podaj ulicę i numer'),
  addressLine2: text('Podaj kod pocztowy i miejscowość').refine(
    (v) => /^\d{2}-\d{3}\s+\S/.test(v),
    'Kod pocztowy i miejscowość, np. „00-001 Warszawa”',
  ),
});

export type CompanyProfileInput = z.input<typeof companyProfileSchema>;
