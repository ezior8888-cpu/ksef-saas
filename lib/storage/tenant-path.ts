/**
 * Object metadata is writable through tenant-scoped database policies.
 * Owning its row does not grant access to an arbitrary storage key.
 */
export function isTenantStoragePath(key: string, tenantId: string): boolean {
  if (!tenantId || /[/\\\x00-\x1f]/.test(tenantId)) return false;
  if (/[\\\x00-\x1f]/.test(key)) return false;
  const segments = key.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return false;
  }
  return (
    key.startsWith(`${tenantId}/`) ||
    ['tenants', 'exports', 'imports', 'upo', 'reminders'].some((prefix) =>
      key.startsWith(`${prefix}/${tenantId}/`),
    )
  );
}

export function assertTenantStoragePath(key: string, tenantId: string): void {
  if (!isTenantStoragePath(key, tenantId)) {
    // Deliberately do not disclose either the supplied key or tenant id.
    throw new Error('Storage path does not belong to this organization');
  }
}
