import { NonRetriableError } from '@/lib/jobs/errors';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

/**
 * AUD-12: `xml_documents` nigdy nie było zapisywane — PDF bez kodu QR KOD I,
 * „Pobierz XML” i portal księgowej zwracały błąd. Job zapisuje teraz wiersz
 * (ścieżka, SHA-256, rozmiar) przy akceptacji.
 * AUD-13: błąd zgodności z XSD FA(3) był zwykłym błędem — 5 ponowień, potem
 * Offline24 do terminu. KSeF takiej faktury nigdy nie przyjmie.
 * AUD-14 (decyzja B3): na KSeF produkcyjnym automatyczne przejście w Offline24
 * jest wyłączone, dopóki kody QR nie są zgodne ze specyfikacją MF (#122).
 */

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  fullFlow: vi.fn(),
  findOpen: vi.fn(),
  isOwn: vi.fn(),
  mark: vi.fn(),
  record: vi.fn(),
  status: vi.fn(),
  invalidate: vi.fn(),
  sendEvent: vi.fn(),
  credentials: vi.fn(),
  health: vi.fn(),
  addOffline: vi.fn(),
  recordXml: vi.fn(),
  ownSubmission: vi.fn(),
  xmlAdmin: vi.fn(),
  xmlDownload: vi.fn(),
  xmlInsert: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/ksef/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/ksef/client')>()),
  ksefFetch: mocks.fetch,
}));
vi.mock('@/lib/ksef/session-cache', () => ({
  ksefSessionCache: { getSession: async () => ({ accessToken: 'token' }), invalidate: mocks.invalidate },
}));
vi.mock('@/lib/ksef/rate-limiter', () => ({
  ksefRateLimiter: { enqueue: (_nip: string, fn: () => unknown) => fn() },
}));
vi.mock('@/lib/ksef/encryption', () => ({
  generateSessionEncryption: async () => ({ encryptedSymmetricKey: 'k', initializationVector: 'iv' }),
  encryptInvoiceXml: () => ({
    invoiceHash: 'h',
    invoiceSize: 1,
    encryptedInvoiceHash: 'eh',
    encryptedInvoiceSize: 1,
    encryptedInvoiceContent: 'c',
  }),
}));
vi.mock('@/lib/ksef/submission-log', () => ({
  recordKsefSubmissionSent: mocks.record,
  markKsefSubmission: mocks.mark,
  findOpenKsefSubmission: mocks.findOpen,
  isOwnKsefSession: mocks.isOwn,
  findOwnKsefSubmission: mocks.ownSubmission,
  findSessionReferenceForKsefNumber: vi.fn(async () => null),
}));
vi.mock('@/lib/jobs/runners/tenant-boundary', () => ({ requireInvoiceTenant: vi.fn() }));
// Krok 5: job czyta wyłącznik wysyłek autorytatywnie — tu zdjęty.
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: async () => false }));
vi.mock('@/lib/ksef/submit-invoice-full', () => ({ submitInvoiceFullFlow: mocks.fullFlow }));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: mocks.health, isKsefHealthy: async () => true }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: mocks.addOffline }));
vi.mock('@/lib/storage/xml-documents', () => ({ recordXmlDocument: mocks.recordXml }));
vi.mock('@/lib/storage/r2', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  downloadFromR2: mocks.xmlDownload,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.xmlAdmin }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerificationForBackgroundJob: vi.fn(),
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getTenantKsefCredentials: mocks.credentials,
  updateInvoiceStatus: mocks.status,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => {
    let isUpdate = false;
    const q = {
      select: () => q,
      eq: () => q,
      or: () => q,
      update: () => { isUpdate = true; return q; },
      maybeSingle: async () => ({
        data: isUpdate
          ? { id: '11111111-1111-4111-8111-111111111111' }
          // Faktura w bazie = treść zdarzenia (kontrola z #63), środowisko „test”.
          : {
              id: '11111111-1111-4111-8111-111111111111', ksef_status: 'sending', ksef_number: null,
              ksef_environment: 'test', invoice_kind: 'regular', invoice_type: 'VAT', internal_number: 'FV/1/2026',
              fa3_data: { internalNumber: 'FV/1/2026', type: 'VAT', issueDate: '2026-10-01' },
            },
        error: null,
      }),
    };
    // Przejęcie wysyłki (AUD-10, 00124) — w tych testach zawsze wolne.
    return { from: () => q, rpc: async (fn: string) => ({ data: fn === 'claim_ksef_send' ? '2026-10-02T12:00:00.000000+00:00' : null, error: null }), };
  },
}));
vi.mock('@/lib/cache/invalidation', () => ({ invalidateTenantDashboard: vi.fn() }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture, addBreadcrumb: vi.fn() }));

import { InvoiceXmlSchemaError } from '@/lib/xml/validator';
import { KsefInvoiceRejectedError } from '@/lib/ksef/submit';
import { onSubmitInvoiceExhausted, runSubmitInvoice } from '@/lib/jobs/runners/submit-invoice';
import type { KsefAuth } from '@/lib/ksef/auth';

const XADES = { type: 'xades', nip: '1234567890', certificatePem: 'fixture-pem' } as unknown as KsefAuth;
const ctx: JobContext = {
  attempt: 1,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: mocks.sendEvent, scheduleAfter: vi.fn() },
};
const zdarzenie = {
  invoiceId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  nip: '1234567890',
  environment: 'test' as const,
  invoice: { internalNumber: 'FV/1/2026', type: 'VAT', issueDate: '2026-10-01' } as Invoice,
};
const ACCEPTED = {
  ksefNumber: '1234567890-20261001-0100A0B0C0D0-1A',
  xmlStoragePath: 'tenants/aaaa/2026/10/inv.xml',
  xmlSha256Hash: 'a'.repeat(64),
  xmlSizeBytes: 2048,
  acquisitionTimestamp: '2026-10-01T10:00:00Z',
  sessionReferenceNumber: 'S-1',
  invoiceReferenceNumber: 'I-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.credentials.mockResolvedValue(XADES);
  mocks.findOpen.mockResolvedValue(null);
  mocks.ownSubmission.mockResolvedValue(null);
  mocks.recordXml.mockReset().mockResolvedValue(undefined);
  mocks.health.mockResolvedValue({ offline: false });
  mocks.fullFlow.mockResolvedValue(ACCEPTED);
  vi.stubEnv('KSEF_ENV', 'test');
});

describe('uzgodnienie KSeF: hash wysłanego XML zamiast dowodu z bieżącego archiwum', () => {
  const ORIGINAL_XML = Buffer.from('<Faktura>oryginał</Faktura>');
  const CHANGED_XML = Buffer.from('<Faktura>zmieniona</Faktura>');
  const ORIGINAL_HASH = createHash('sha256').update(ORIGINAL_XML).digest('hex');
  const ORIGINAL_REFS = { sessionReferenceNumber: 'S-ORIGINAL', invoiceReferenceNumber: 'I-ORIGINAL' };
  const ORIGINAL_PATH = `${zdarzenie.tenantId}/2026/10/${zdarzenie.invoiceId}.xml`;

  async function useActualMetadataHelper(bytes: Buffer) {
    const actual = await vi.importActual<typeof import('@/lib/storage/xml-documents')>('@/lib/storage/xml-documents');
    mocks.recordXml.mockImplementation(actual.recordXmlDocument);
    mocks.xmlDownload.mockResolvedValue(bytes);
    mocks.xmlInsert.mockResolvedValue({ error: null });
    mocks.xmlAdmin.mockReturnValue({
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          limit: async () => ({ data: [], error: null }),
          insert: mocks.xmlInsert,
        };
        return q;
      },
    });
  }

  function reconcileWithHash(payloadHash: string | null | undefined) {
    mocks.findOpen.mockResolvedValue({ ...ORIGINAL_REFS, payloadHash });
    mocks.fetch.mockResolvedValue({
      referenceNumber: ORIGINAL_REFS.invoiceReferenceNumber,
      status: { code: 200, description: 'Sukces' },
      ksefNumber: ACCEPTED.ksefNumber,
    });
  }

  function duplicateWithHash(payloadHash: string | null) {
    mocks.fullFlow.mockRejectedValue(new KsefInvoiceRejectedError(440, {
      code: 440, description: 'Duplikat',
      extensions: { originalSessionReferenceNumber: ORIGINAL_REFS.sessionReferenceNumber, originalKsefNumber: ACCEPTED.ksefNumber },
    }));
    mocks.ownSubmission.mockResolvedValue({ ...ORIGINAL_REFS, payloadHash });
  }

  function expectAcceptedAndUpo() {
    expect(mocks.status).toHaveBeenCalledWith(zdarzenie.invoiceId, expect.objectContaining({
      ksef_status: 'accepted', ksef_number: ACCEPTED.ksefNumber,
    }), zdarzenie.tenantId);
    expect(mocks.sendEvent).toHaveBeenCalledWith('trigger-upo-download', expect.objectContaining({
      data: expect.objectContaining({ sessionReferenceNumber: ORIGINAL_REFS.sessionReferenceNumber }),
    }));
  }

  it('przyjęta próba A z archiwum B: rzeczywisty helper odrzuca dowód B, akceptacja i UPO zostają', async () => {
    await useActualMetadataHelper(CHANGED_XML);
    reconcileWithHash(ORIGINAL_HASH);
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
    expect(mocks.fullFlow).not.toHaveBeenCalled();
    expect(mocks.recordXml).toHaveBeenCalledWith(expect.objectContaining({ sha256Hash: ORIGINAL_HASH }));
    expect(mocks.xmlDownload).toHaveBeenCalledWith(ORIGINAL_PATH, zdarzenie.tenantId);
    expect(mocks.xmlInsert).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tags: { area: 'ksef.xml-documents' } }));
    expectAcceptedAndUpo();
  });

  it('przyjęta próba A z tym samym archiwum A: rzeczywisty helper zapisuje sprawdzony dowód', async () => {
    await useActualMetadataHelper(ORIGINAL_XML);
    reconcileWithHash(ORIGINAL_HASH);
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
    expect(mocks.xmlInsert).toHaveBeenCalledWith(expect.objectContaining({
      sha256_hash: ORIGINAL_HASH, file_size_bytes: ORIGINAL_XML.length, storage_path: ORIGINAL_PATH,
    }));
    expectAcceptedAndUpo();
  });

  it.each([
    ['NULL', null], ['brak pola', undefined], ['pusty', ''], ['krótki', 'abc'], ['wielkie litery', 'A'.repeat(64)],
  ])('uzgodnienie bez kanonicznego skrótu (%s): akceptacja i UPO, bez tworzenia metadanych', async (_label, hash) => {
    await useActualMetadataHelper(CHANGED_XML);
    reconcileWithHash(hash);
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
    expect(mocks.recordXml).not.toHaveBeenCalled();
    expect(mocks.xmlDownload).not.toHaveBeenCalled();
    expect(mocks.xmlInsert).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tags: { area: 'ksef.xml-documents' } }));
    expectAcceptedAndUpo();
  });

  it('440 bierze hash oryginalnej sesji A: nowa próba z archiwum B nie zyskuje dowodu', async () => {
    await useActualMetadataHelper(CHANGED_XML);
    duplicateWithHash(ORIGINAL_HASH);
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
    expect(mocks.ownSubmission).toHaveBeenCalledWith(zdarzenie.tenantId, zdarzenie.invoiceId,
      ORIGINAL_REFS.sessionReferenceNumber, ACCEPTED.ksefNumber);
    expect(mocks.recordXml).toHaveBeenCalledWith(expect.objectContaining({ sha256Hash: ORIGINAL_HASH }));
    expect(mocks.xmlInsert).not.toHaveBeenCalled();
    expectAcceptedAndUpo();
  });

  it('440 z dowodem A i archiwum A zapisuje metadane i zamyka oryginalną próbę', async () => {
    await useActualMetadataHelper(ORIGINAL_XML);
    duplicateWithHash(ORIGINAL_HASH);
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
    expect(mocks.xmlInsert).toHaveBeenCalledWith(expect.objectContaining({ sha256_hash: ORIGINAL_HASH }));
    expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({
      invoiceReferenceNumber: ORIGINAL_REFS.invoiceReferenceNumber, status: 'accepted',
    }));
    expectAcceptedAndUpo();
  });

  it('440 z własnej starszej sesji NULL hash zachowuje akceptację i UPO bez dowodu XML', async () => {
    await useActualMetadataHelper(CHANGED_XML);
    duplicateWithHash(null);
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
    expect(mocks.recordXml).not.toHaveBeenCalled();
    expect(mocks.xmlDownload).not.toHaveBeenCalled();
    expectAcceptedAndUpo();
  });

  it('awaria odczytu oryginalnej sesji 440 nie przyznaje akceptacji ani dowodu', async () => {
    duplicateWithHash(ORIGINAL_HASH);
    mocks.ownSubmission.mockRejectedValueOnce(new Error('history unavailable'));
    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toThrow('history unavailable');
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.recordXml).not.toHaveBeenCalled();
  });

  it('awaria odczytu poprzedniej próby nie powoduje nowej wysyłki ani dowodu', async () => {
    mocks.findOpen.mockRejectedValueOnce(new Error('history unavailable'));
    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toThrow('history unavailable');
    expect(mocks.fullFlow).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.recordXml).not.toHaveBeenCalled();
  });

  it('również świeży wynik bez skrótu nie może wytworzyć dowodu z magazynu', async () => {
    mocks.fullFlow.mockResolvedValue({ ...ACCEPTED, xmlSha256Hash: undefined });
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
    expect(mocks.recordXml).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tags: { area: 'ksef.xml-documents' } }));
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('xml_documents przy akceptacji (AUD-12)', () => {
  it('zapisuje ścieżkę, SHA-256 i rozmiar XML przyjętego przez KSeF', async () => {
    await runSubmitInvoice(zdarzenie, ctx);
    expect(mocks.recordXml).toHaveBeenCalledWith({
      tenantId: zdarzenie.tenantId,
      invoiceId: zdarzenie.invoiceId,
      storagePath: ACCEPTED.xmlStoragePath,
      sha256Hash: ACCEPTED.xmlSha256Hash,
      sizeBytes: ACCEPTED.xmlSizeBytes,
    });
  });

  it('błąd zapisu nie cofa akceptacji', async () => {
    mocks.recordXml.mockRejectedValue(new Error('fixture db'));
    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true });
  });
});

describe('błąd XSD bez ponowień (AUD-13)', () => {
  it('niezgodność ze schematem FA(3) kończy się od razu, bez retry i bez Offline24', async () => {
    mocks.fullFlow.mockRejectedValue(new InvoiceXmlSchemaError(['Linia 12: element P_15 niepoprawny']));
    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe('Offline24 na KSeF produkcyjnym (AUD-14)', () => {
  it('PROD: zła sonda zdrowia NIE parkuje faktury w Offline24 — idzie zwykła wysyłka', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    mocks.health.mockResolvedValue({ offline: true, isMfOutage: false, reason: 'ping' });
    // Zdarzenie z tego samego środowiska co konfiguracja (#63).
    await runSubmitInvoice({ ...zdarzenie, environment: 'production' }, ctx);
    expect(mocks.addOffline).not.toHaveBeenCalled();
    expect(mocks.fullFlow).toHaveBeenCalled();
  });

  // Decyzja 02.10.2026 (#71): Offline24 wstrzymany także na TEST.
  it('TEST: bez sondy zdrowia i bez Offline24 — zwykła wysyłka', async () => {
    mocks.health.mockResolvedValue({ offline: true, isMfOutage: false, reason: 'ping' });
    await runSubmitInvoice(zdarzenie, ctx);
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.addOffline).not.toHaveBeenCalled();
    expect(mocks.fullFlow).toHaveBeenCalled();
  });

  it('PROD: po wyczerpaniu prób nie parkuje w Offline24', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    await onSubmitInvoiceExhausted(new Error('ECONNRESET'), zdarzenie, ctx);
    expect(mocks.addOffline).not.toHaveBeenCalled();
  });
});
