import { describe, it, expect, beforeEach } from 'vitest';
import { authService, INITIAL_USERS } from '@/services/authService';
import { hasPermission, canAccessLocation } from '@/services/permissions';
import { inventoryRepo } from '@/services/inventoryRepository';

// Polyfill localStorage for node test runner
const storageMock = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageMock.get(key) ?? null,
    setItem: (key: string, val: string) => storageMock.set(key, val),
    removeItem: (key: string) => storageMock.delete(key),
    clear: () => storageMock.clear(),
  };
}

describe('MEDiTRACK Phase 3: Production Authentication, RBAC & Location Isolation', () => {
  const adminUser = INITIAL_USERS.find(u => u.role === 'ADMIN')!;
  const managerUser = INITIAL_USERS.find(u => u.role === 'INVENTORY_MANAGER')!;
  const storekeeperUser = INITIAL_USERS.find(u => u.role === 'STOREKEEPER')!;
  const icuUser = INITIAL_USERS.find(u => u.email === 'icu.nurse@stjude.org')!;
  const edUser = INITIAL_USERS.find(u => u.email === 'emergency@stjude.org')!;
  const inactiveUser = INITIAL_USERS.find(u => !u.isActive)!;

  beforeEach(() => {
    // Reset session before each test
    globalThis.localStorage.clear();
  });

  // 1. Unauthenticated access denied
  it('1. denies all permissions and location access to unauthenticated sessions', () => {
    expect(hasPermission(null, 'inventory:read')).toBe(false);
    expect(hasPermission(undefined, 'products:read')).toBe(false);
    expect(hasPermission(null, 'users:write')).toBe(false);
    expect(canAccessLocation(null, 'loc-cs-01')).toBe(false);
    expect(canAccessLocation(undefined, 'loc-icu-01')).toBe(false);
  });

  // 2. Authenticated access allowed
  it('2. permits authorized access for active authenticated identities', () => {
    expect(hasPermission(adminUser, 'inventory:read')).toBe(true);
    expect(hasPermission(storekeeperUser, 'inventory:receive')).toBe(true);
    expect(canAccessLocation(adminUser, 'loc-cs-01')).toBe(true);
  });

  // 3. ADMIN permissions
  it('3. grants full administrative authorization across all capabilities to ADMIN', () => {
    const requiredAdminPerms = [
      'products:read', 'products:write',
      'inventory:read', 'inventory:receive', 'inventory:transfer', 'inventory:issue',
      'inventory:consume', 'inventory:waste', 'inventory:adjust',
      'locations:read', 'locations:write',
      'expiry:read', 'recommendations:read', 'recommendations:approve',
      'alerts:read', 'audit:read', 'users:read', 'users:write'
    ] as const;

    for (const perm of requiredAdminPerms) {
      expect(hasPermission(adminUser, perm)).toBe(true);
    }
  });

  // 4. INVENTORY_MANAGER permissions
  it('4. grants inventory oversight and adjustment permissions to INVENTORY_MANAGER but excludes user/location administration', () => {
    expect(hasPermission(managerUser, 'products:read')).toBe(true);
    expect(hasPermission(managerUser, 'products:write')).toBe(true);
    expect(hasPermission(managerUser, 'inventory:read')).toBe(true);
    expect(hasPermission(managerUser, 'inventory:transfer')).toBe(true);
    expect(hasPermission(managerUser, 'inventory:adjust')).toBe(true);
    expect(hasPermission(managerUser, 'recommendations:approve')).toBe(true);

    // Forbidden administrative operations
    expect(hasPermission(managerUser, 'users:read')).toBe(false);
    expect(hasPermission(managerUser, 'users:write')).toBe(false);
    expect(hasPermission(managerUser, 'locations:write')).toBe(false);
  });

  // 5. STOREKEEPER permissions
  it('5. grants warehouse operations to STOREKEEPER but forbids adjustments and admin features', () => {
    expect(hasPermission(storekeeperUser, 'inventory:read')).toBe(true);
    expect(hasPermission(storekeeperUser, 'inventory:receive')).toBe(true);
    expect(hasPermission(storekeeperUser, 'inventory:transfer')).toBe(true);
    expect(hasPermission(storekeeperUser, 'inventory:issue')).toBe(true);
    expect(hasPermission(storekeeperUser, 'inventory:waste')).toBe(true);

    // Forbidden actions
    expect(hasPermission(storekeeperUser, 'inventory:adjust')).toBe(false);
    expect(hasPermission(storekeeperUser, 'products:write')).toBe(false);
    expect(hasPermission(storekeeperUser, 'users:write')).toBe(false);
  });

  // 6. DEPARTMENT_USER permissions
  it('6. restricts DEPARTMENT_USER to reading inventory and clinical consumption only', () => {
    expect(hasPermission(icuUser, 'inventory:read')).toBe(true);
    expect(hasPermission(icuUser, 'inventory:consume')).toBe(true);
    expect(hasPermission(icuUser, 'expiry:read')).toBe(true);
    expect(hasPermission(icuUser, 'alerts:read')).toBe(true);

    // STRICTLY FORBIDDEN OPERATIONS
    expect(hasPermission(icuUser, 'products:write')).toBe(false);
    expect(hasPermission(icuUser, 'locations:write')).toBe(false);
    expect(hasPermission(icuUser, 'users:read')).toBe(false);
    expect(hasPermission(icuUser, 'users:write')).toBe(false);
    expect(hasPermission(icuUser, 'inventory:receive')).toBe(false);
    expect(hasPermission(icuUser, 'inventory:transfer')).toBe(false);
    expect(hasPermission(icuUser, 'inventory:adjust')).toBe(false);
    expect(hasPermission(icuUser, 'inventory:waste')).toBe(false);
  });

  // 7. Department location isolation
  it('7. isolates DEPARTMENT_USER strictly to their assigned clinical location', () => {
    expect(icuUser.assignedLocationId).toBe('loc-icu-01');
    expect(edUser.assignedLocationId).toBe('loc-ed-01');

    // ICU User access boundaries
    expect(canAccessLocation(icuUser, 'loc-icu-01')).toBe(true);
    expect(canAccessLocation(icuUser, 'loc-ed-01')).toBe(false);
    expect(canAccessLocation(icuUser, 'loc-cs-01')).toBe(false);

    // Emergency Department User access boundaries
    expect(canAccessLocation(edUser, 'loc-ed-01')).toBe(true);
    expect(canAccessLocation(edUser, 'loc-icu-01')).toBe(false);
    expect(canAccessLocation(edUser, 'loc-cs-01')).toBe(false);
  });

  // 8. Unauthorized location access rejected
  it('8. rejects inventory mutation when a department user attempts to mutate stock in an unauthorized location', () => {
    // ICU user tries to consume stock located in Emergency Department
    const result = inventoryRepo.consumeStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-ed-01', // Emergency department location!
      quantity: 1,
      performedBy: icuUser.fullName,
      actor: icuUser,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UNAUTHORIZED');
    expect(result.error).toContain('Unauthorized location access');
  });

  // 9. Non-admin cannot modify roles
  it('9. blocks non-admin users from modifying staff roles or user profiles', () => {
    const attemptByManager = authService.adminUpdateUser({
      actorId: managerUser.id,
      targetUserId: icuUser.id,
      newRole: 'INVENTORY_MANAGER',
      newIsActive: true,
    });

    expect(attemptByManager.success).toBe(false);
    expect(attemptByManager.error).toContain('SECURITY VIOLATION');

    const attemptByDept = authService.adminUpdateUser({
      actorId: icuUser.id,
      targetUserId: edUser.id,
      newRole: 'STOREKEEPER',
      newIsActive: true,
    });

    expect(attemptByDept.success).toBe(false);
    expect(attemptByDept.error).toContain('SECURITY VIOLATION');
  });

  // 10. User cannot self-promote
  it('10. prevents user self-promotion and prevents administrator self-demotion', () => {
    // Regular user attempting self-promotion
    const attempt = authService.adminUpdateUser({
      actorId: icuUser.id,
      targetUserId: icuUser.id,
      newRole: 'ADMIN',
      newIsActive: true,
    });
    expect(attempt.success).toBe(false);

    // Admin attempting self-demotion
    const selfDemoteAttempt = authService.adminUpdateUser({
      actorId: adminUser.id,
      targetUserId: adminUser.id,
      newRole: 'STOREKEEPER',
      newIsActive: true,
    });
    expect(selfDemoteAttempt.success).toBe(false);
    expect(selfDemoteAttempt.error).toContain('Administrators cannot demote their own account');
  });

  // 11. Inactive user cannot perform inventory operations
  it('11. denies all permissions and transactions for inactive user accounts', () => {
    expect(inactiveUser.isActive).toBe(false);

    // Zero permissions
    expect(hasPermission(inactiveUser, 'inventory:read')).toBe(false);
    expect(hasPermission(inactiveUser, 'inventory:consume')).toBe(false);
    expect(canAccessLocation(inactiveUser, inactiveUser.assignedLocationId || 'loc-sw-01')).toBe(false);

    // Mutation rejected
    const result = inventoryRepo.consumeStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-sw-01',
      quantity: 1,
      performedBy: inactiveUser.fullName,
      actor: inactiveUser,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UNAUTHORIZED');
    expect(result.error).toContain('Inactive user accounts cannot perform inventory operations');
  });

  // 12. Logout removes authenticated state
  it('12. clears active user session and removes local authentication state on logout', async () => {
    await authService.login(adminUser.email);
    expect(authService.getCurrentUser()).toBeDefined();

    authService.logout();
    expect(authService.getCurrentUser()).toBeNull();
    expect(localStorage.getItem('meditrack_auth_session')).toBeNull();
  });

  // 13. Session restoration
  it('13. restores user identity and active role on browser refresh / session reload', async () => {
    await authService.login(managerUser.email);
    const stored = localStorage.getItem('meditrack_auth_session');
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed.email).toBe(managerUser.email);
    expect(parsed.role).toBe('INVENTORY_MANAGER');
  });

  // 14. Role change creates audit record
  it('14. creates an immutable audit record whenever an admin modifies user roles or authorization', () => {
    const prevAuditCount = authService.getUserAuditLogs().length;

    const updateResult = authService.adminUpdateUser({
      actorId: adminUser.id,
      targetUserId: storekeeperUser.id,
      newRole: 'INVENTORY_MANAGER',
      newLocationId: storekeeperUser.assignedLocationId,
      newIsActive: true,
      notes: 'Certified for hospital inventory managerial oversight',
    });

    expect(updateResult.success).toBe(true);

    const auditLogs = authService.getUserAuditLogs();
    expect(auditLogs.length).toBe(prevAuditCount + 1);

    const latestAudit = auditLogs[0];
    expect(latestAudit.action).toBe('ROLE_CHANGE');
    expect(latestAudit.performedBy).toBe(adminUser.id);
    expect(latestAudit.targetUserId).toBe(storekeeperUser.id);
    expect(latestAudit.oldValue).toBe('STOREKEEPER');
    expect(latestAudit.newValue).toBe('INVENTORY_MANAGER');

    // Revert role back for other tests
    authService.adminUpdateUser({
      actorId: adminUser.id,
      targetUserId: storekeeperUser.id,
      newRole: 'STOREKEEPER',
      newLocationId: storekeeperUser.assignedLocationId,
      newIsActive: true,
    });
  });

  // 15. Audit record cannot be modified
  it('15. protects audit logs from mutation and maintains tamper-resistant ledger', () => {
    const logs = authService.getUserAuditLogs();
    const originalLength = logs.length;
    const initialFirstItemNotes = logs[0]?.notes;

    // Direct mutation of returned array does not mutate internal service state
    logs.pop();
    if (logs[0]) {
      logs[0].notes = 'TAMPERED_NOTES';
    }

    const freshLogs = authService.getUserAuditLogs();
    expect(freshLogs.length).toBe(originalLength);
    expect(freshLogs[0]?.notes).toBe(initialFirstItemNotes);
  });

  // 16. Unauthorized inventory operation returns UNAUTHORIZED
  it('16. returns standardized UNAUTHORIZED errorCode when unauthorized operation is attempted', () => {
    // Storekeeper attempting stock adjustment (Only ADMIN and INVENTORY_MANAGER possess inventory:adjust)
    const result = inventoryRepo.adjustStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      locationId: 'loc-cs-01',
      quantity: 5,
      performedBy: storekeeperUser.fullName,
      reason: 'Physical cycle count discrepancy adjustment',
      actor: storekeeperUser,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UNAUTHORIZED');
    expect(result.error).toContain('Unauthorized');
  });

  // 17. ADMIN user management works
  it('17. allows ADMIN to reassign clinical location and toggle user active status', () => {
    // Deactivate user
    const deactivateResult = authService.adminUpdateUser({
      actorId: adminUser.id,
      targetUserId: edUser.id,
      newRole: 'DEPARTMENT_USER',
      newLocationId: 'loc-icu-01', // Reassigned to ICU
      newIsActive: false,
      notes: 'Transfer and temporary deactivation for sabbatical',
    });

    expect(deactivateResult.success).toBe(true);
    expect(deactivateResult.updatedUser?.isActive).toBe(false);
    expect(deactivateResult.updatedUser?.assignedLocationId).toBe('loc-icu-01');

    // Restore user
    authService.adminUpdateUser({
      actorId: adminUser.id,
      targetUserId: edUser.id,
      newRole: 'DEPARTMENT_USER',
      newLocationId: 'loc-ed-01',
      newIsActive: true,
    });
  });

  // 18. DEPARTMENT_USER cannot access User Management
  it('18. strictly prohibits DEPARTMENT_USER from viewing or modifying user management', () => {
    expect(hasPermission(icuUser, 'users:read')).toBe(false);
    expect(hasPermission(icuUser, 'users:write')).toBe(false);
    expect(hasPermission(edUser, 'users:read')).toBe(false);
    expect(hasPermission(edUser, 'users:write')).toBe(false);
  });
});
