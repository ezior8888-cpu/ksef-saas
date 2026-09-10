import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/storage/r2-client', async () => {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    endpoint: 'https://storage.example.test',
    region: 'eu-test-1',
    credentials: { accessKeyId: 'fake-access-key', secretAccessKey: 'fake-secret-key' },
  });
  client.send = mocks.send;
  return { getR2Client: () => client, getR2Config: () => ({ bucketName: 'private-documents' }) };
});

import { isTenantStoragePath } from '@/lib/storage/tenant-path';
import {
  downloadFromR2, downloadInvoiceXml, downloadInvoiceXmlUnchecked, getSignedInvoiceUrl,
} from '@/lib/storage/r2';
import { downloadExpensePhoto, getExpensePhotoUrl, uploadExpensePhoto } from '@/lib/storage/expenses';

const tenantId = 'tenant-a';
const xml = '<Invoice>private test fixture</Invoice>';
const hash = createHash('sha256').update(xml).digest('hex');

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({
    Body: {
      transformToString: async () => xml,
      transformToByteArray: async () => new TextEncoder().encode(xml),
    },
    ContentType: 'image/png',
  });
});

describe('storage: database row ownership cannot authorize another tenant object', () => {
  it.each([
    'tenant-b/2026/09/invoice.xml',
    'tenants/tenant-b/expenses/invoice.png',
    'exports/tenant-b/job/file.csv',
    'imports/tenant-b/job/file.csv',
    'upo/tenant-b/invoice.xml',
    'tenant-a-foreign/invoice.xml',
    'tenant-a/../tenant-b/invoice.xml',
    'tenants/tenant-a/../../tenant-b/invoice.xml',
    'tenant-a\\..\\tenant-b\\invoice.xml',
    '/tenant-a/invoice.xml',
    'https://storage.example.test/tenant-a/invoice.xml',
  ])('rejects forged database path before any S3 request: %s', async (key) => {
    expect(isTenantStoragePath(key, tenantId)).toBe(false);
    await expect(downloadFromR2(key, tenantId)).rejects.toThrow('does not belong');
    await expect(downloadInvoiceXml(key, hash, tenantId)).rejects.toThrow('does not belong');
    await expect(downloadInvoiceXmlUnchecked(key, tenantId)).rejects.toThrow('does not belong');
    await expect(getSignedInvoiceUrl(key, tenantId)).rejects.toThrow('does not belong');
    await expect(getExpensePhotoUrl(key, tenantId)).rejects.toThrow('does not belong');
    await expect(downloadExpensePhoto(key, tenantId)).rejects.toThrow('does not belong');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    'tenant-a/2026/09/invoice.xml', 'tenants/tenant-a/expenses/2026/09/receipt.jpg',
    'exports/tenant-a/job/file.csv', 'imports/tenant-a/job/file.csv',
    'upo/tenant-a/invoice.xml', 'reminders/tenant-a/reminder.pdf',
  ])('preserves valid tenant document paths: %s', async (key) => {
    expect(isTenantStoragePath(key, tenantId)).toBe(true);
    expect(await downloadFromR2(key, tenantId)).toEqual(Buffer.from(xml));
    expect(mocks.send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
  });

  it('preserves integrity verification for allowed XML downloads', async () => {
    expect(await downloadInvoiceXml('tenant-a/2026/09/invoice.xml', hash, tenantId)).toBe(xml);
    await expect(downloadInvoiceXml('tenant-a/2026/09/invoice.xml', '0'.repeat(64), tenantId)).rejects.toThrow('hash mismatch');
  });

  it('signs a no-store response override for legacy documents, preserving URL expiry', async () => {
    const url = new URL(await getSignedInvoiceUrl('tenant-a/2026/09/invoice.xml', tenantId, 60));
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('stores new expense photos with private no-store metadata', async () => {
    await uploadExpensePhoto(tenantId, 'ocr-test', Buffer.from('fake-photo'), 'image/png');
    const command = mocks.send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.CacheControl).toBe('private, no-store');
    expect(command.input.Key).toMatch(/^tenants\/tenant-a\/expenses\//);
  });
});
