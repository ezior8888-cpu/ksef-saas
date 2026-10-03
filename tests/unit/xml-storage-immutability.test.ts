import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/storage/r2-client', () => ({
  getR2Client: () => ({ send: mocks.send }),
  getR2Config: () => ({ bucketName: 'private-documents' }),
}));

import { uploadInvoiceXml } from '@/lib/storage/r2';

const tenantId = 'tenant-test';
const invoiceId = 'invoice-test';
const xml = '<Faktura>oryginal</Faktura>';
const key = `${tenantId}/2026/10/${invoiceId}.xml`;

function preconditionFailed(): S3ServiceException {
  return new S3ServiceException({
    name: 'PreconditionFailed',
    $fault: 'client',
    $metadata: { httpStatusCode: 412 },
  });
}

beforeEach(() => mocks.send.mockReset());

describe('immutable invoice XML archive', () => {
  it('creates the object only when the key is absent', async () => {
    mocks.send.mockResolvedValueOnce({ ETag: 'etag' });

    const result = await uploadInvoiceXml(tenantId, invoiceId, '2026-10-01', xml);

    expect(result).toEqual({
      storagePath: key,
      sha256Hash: createHash('sha256').update(xml).digest('hex'),
      sizeBytes: Buffer.byteLength(xml),
      etag: 'etag',
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const put = mocks.send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input.IfNoneMatch).toBe('*');
  });

  it('accepts a 412 retry only after verifying identical stored bytes', async () => {
    mocks.send.mockRejectedValueOnce(preconditionFailed()).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new TextEncoder().encode(xml) },
    });

    const result = await uploadInvoiceXml(tenantId, invoiceId, '2026-10-01', xml);

    expect(result.sha256Hash).toBe(createHash('sha256').update(xml).digest('hex'));
    expect(result.sizeBytes).toBe(Buffer.byteLength(xml));
    expect(mocks.send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect((mocks.send.mock.calls[1]?.[0] as GetObjectCommand).input.Key).toBe(key);
  });

  it('refuses changed XML at the same key without exposing its contents', async () => {
    mocks.send.mockRejectedValueOnce(preconditionFailed()).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new TextEncoder().encode('<Faktura>inna</Faktura>') },
    });

    await expect(uploadInvoiceXml(tenantId, invoiceId, '2026-10-01', xml))
      .rejects.toThrow('immutable XML differs');
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect((mocks.send.mock.calls[0]?.[0] as PutObjectCommand).input.IfNoneMatch).toBe('*');
  });

  it('fails closed if the archived bytes cannot be read after a 412', async () => {
    mocks.send.mockRejectedValueOnce(preconditionFailed()).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(uploadInvoiceXml(tenantId, invoiceId, '2026-10-01', xml))
      .rejects.toThrow('storage unavailable');
  });
});
