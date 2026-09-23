import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FloProposalRow } from './db-types';
import type { FloApproveInput } from '@/types/flo';

const inputSchema = z.object({
  value: z.string().max(4000).optional(),
  editedBody: z.string().max(20000).optional(),
  selectedIds: z.array(z.string().min(1).max(200)).max(1000).optional(),
}).strict();

export function parseApprovalInput(value: unknown): FloApproveInput | undefined {
  if (value === undefined) return undefined;
  return inputSchema.parse(value);
}

/** Canonical JSON: key ordering cannot change a consent, separators cannot collide. */
function canonical(value: unknown, depth = 0): string {
  if (depth > 40) throw new Error('Nieprawidłowa treść propozycji');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item, depth + 1)).join(',') + '}';
  }
  throw new Error('Nieprawidłowa treść propozycji');
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function isApprovalVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/** Covers the operation and displayed content; lifecycle fields intentionally excluded. */
export function proposalApprovalVersion(row: Pick<FloProposalRow,
  'id' | 'tenant_id' | 'kind' | 'topic_key' | 'title' | 'body' | 'payload' |
  'evidence' | 'fingerprint' | 'expires_at' | 'priority'>): string {
  return digest({
    version: 1, id: row.id, tenantId: row.tenant_id, kind: row.kind, topic: row.topic_key,
    title: row.title, body: row.body, payload: row.payload ?? {}, evidence: row.evidence ?? [],
    facts: row.fingerprint, expiresAt: row.expires_at, priority: row.priority,
  });
}

export function approvalOperationHash(version: string, input?: FloApproveInput): string {
  if (!isApprovalVersion(version)) throw new Error('Nieprawidłowa wersja zgody');
  return digest({ version, input: parseApprovalInput(input) ?? null });
}

export function hasApprovalBinding(snapshot: Record<string, unknown>, version: string, input?: FloApproveInput): boolean {
  return snapshot.approvalVersion === 1 && snapshot.proposalVersion === version &&
    snapshot.operationHash === approvalOperationHash(version, input);
}
