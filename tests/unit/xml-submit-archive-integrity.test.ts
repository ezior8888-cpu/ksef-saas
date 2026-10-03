import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  submit: vi.fn(),
  recordSent: vi.fn(),
}));

vi.mock('@/lib/storage/r2-client', () => ({
  getR2Client: () => ({ send: mocks.send }),
  getR2Config: () => ({ bucketName: 'private-documents' }),
}));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerificationForBackgroundJob: vi.fn(async () => undefined),
}));
vi.mock('@/lib/ksef/xml-generated-at', () => ({
  claimXmlGeneratedAt: vi.fn(async () => new Date('2026-10-03T08:00:00Z')),
}));
vi.mock('@/lib/xml/fa3-generator', async (original) => ({
  ...(await original<typeof import('@/lib/xml/fa3-generator')>()),
  generateFA3Xml: () => '<Faktura>oryginał</Faktura>',
}));
vi.mock('@/lib/xml/validator', async (original) => ({
  ...(await original<typeof import('@/lib/xml/validator')>()),
  validateInvoiceXml: async () => ({ valid: true, errors: [] }),
}));
vi.mock('@/lib/ksef/submit', () => ({ submitInvoice: mocks.submit }));
vi.mock('@/lib/ksef/submission-log', () => ({ recordKsefSubmissionSent: mocks.recordSent }));

import { submitInvoiceFullFlow } from '@/lib/ksef/submit-invoice-full';
import type { KsefAuth } from '@/lib/ksef/auth';
import type { Invoice } from '@/types/invoice';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const invoiceId = '11111111-1111-4111-8111-111111111111';
const invoice = { type: 'VAT', issueDate: '2026-10-03' } as Invoice;
const xml = '<Faktura>oryginał</Faktura>';
const key = `${tenantId}/2026/10/${invoiceId}.xml`;

function alreadyExists(): S3ServiceException {
  return new S3ServiceException({
    name: 'PreconditionFailed',
    $fault: 'client',
    $metadata: { httpStatusCode: 412 },
  });
}

function submit(): ReturnType<typeof submitInvoiceFullFlow> {
  return submitInvoiceFullFlow(tenantId, invoiceId, invoice, {} as KsefAuth, 'test');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockReset();
  mocks.submit.mockResolvedValue({ ksefNumber: 'TEST-NUMBER' });
});

describe('archiwum XML przed wysyłką do KSeF', () => {
  it('przy pierwszej próbie zapisuje z IfNoneMatch przed wysyłką', async () => {
    mocks.send.mockResolvedValueOnce({ ETag: 'etag' });
    const result = await submit();

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const put = mocks.send.mock.calls[0][0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({ Key: key, IfNoneMatch: '*' });
    expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(mocks.submit.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({
      ksefNumber: 'TEST-NUMBER',
      xmlSha256Hash: createHash('sha256').update(xml).digest('hex'),
      xmlSizeBytes: Buffer.byteLength(xml),
    });
  });

  it('przy ponowieniu odczytuje identyczne bajty przed wysyłką i zachowuje blokadę nadpisania', async () => {
    mocks.send.mockRejectedValueOnce(alreadyExists()).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from(xml) },
    });
    await submit();

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect((mocks.send.mock.calls[0][0] as PutObjectCommand).input.IfNoneMatch).toBe('*');
    expect(mocks.send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
    expect(mocks.send.mock.invocationCallOrder[1]).toBeLessThan(mocks.submit.mock.invocationCallOrder[0]);
    expect(mocks.submit).toHaveBeenCalledWith(xml, expect.anything(), 'test', { tenantId, invoiceId }, expect.anything());
  });

  it('inny XML w archiwum zatrzymuje próbę przed wysyłką i zapisem numerów referencyjnych', async () => {
    mocks.send.mockRejectedValueOnce(alreadyExists()).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from('<Faktura>inna treść</Faktura>') },
    });

    await expect(submit()).rejects.toThrow('immutable XML differs');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.recordSent).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it('brak możliwości odczytu istniejącego XML zatrzymuje wysyłkę', async () => {
    mocks.send.mockRejectedValueOnce(alreadyExists()).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(submit()).rejects.toThrow('storage unavailable');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.recordSent).not.toHaveBeenCalled();
  });
});
