import { UserProfile, UserRole } from '@/types/inventory';

export type Permission =
  | 'products:read'
  | 'products:write'
  | 'inventory:read'
  | 'inventory:receive'
  | 'inventory:transfer'
  | 'inventory:issue'
  | 'inventory:consume'
  | 'inventory:waste'
  | 'inventory:adjust'
  | 'locations:read'
  | 'locations:write'
  | 'expiry:read'
  | 'recommendations:read'
  | 'recommendations:approve'
  | 'alerts:read'
  | 'audit:read'
  | 'users:read'
  | 'users:write'
  | 'procurement:read'
  | 'procurement:recommend'
  | 'procurement:approve'
  | 'procurement:request';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'products:read',
    'products:write',
    'inventory:read',
    'inventory:receive',
    'inventory:transfer',
    'inventory:issue',
    'inventory:consume',
    'inventory:waste',
    'inventory:adjust',
    'locations:read',
    'locations:write',
    'expiry:read',
    'recommendations:read',
    'recommendations:approve',
    'alerts:read',
    'audit:read',
    'users:read',
    'users:write',
    'procurement:read',
    'procurement:recommend',
    'procurement:approve',
    'procurement:request',
  ],
  INVENTORY_MANAGER: [
    'products:read',
    'products:write',
    'inventory:read',
    'inventory:receive',
    'inventory:transfer',
    'inventory:issue',
    'inventory:consume',
    'inventory:waste',
    'inventory:adjust',
    'locations:read',
    'expiry:read',
    'recommendations:read',
    'recommendations:approve',
    'alerts:read',
    'audit:read',
    'procurement:read',
    'procurement:recommend',
    'procurement:approve',
    'procurement:request',
  ],
  STOREKEEPER: [
    'products:read',
    'inventory:read',
    'inventory:receive',
    'inventory:transfer',
    'inventory:issue',
    'inventory:consume',
    'inventory:waste',
    'locations:read',
    'expiry:read',
    'recommendations:read',
    'alerts:read',
    'procurement:read',
    'procurement:request',
  ],
  DEPARTMENT_USER: [
    'inventory:read',
    'inventory:consume',
    'locations:read',
    'expiry:read',
    'alerts:read',
    'procurement:read',
    'procurement:request',
  ],
};

export function hasRolePermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Validates whether the given user possesses the required permission.
 * Enforces that inactive users possess zero permissions.
 */
export function hasPermission(user: UserProfile | null | undefined, permission: Permission): boolean {
  if (!user || !user.isActive) return false;
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes(permission);
}

/**
 * Validates whether the user is authorized to view or mutate inventory at the target location.
 * - ADMIN, INVENTORY_MANAGER, and STOREKEEPER possess facility-wide multi-location scope.
 * - DEPARTMENT_USER is strictly isolated to their assignedLocationId.
 */
export function canAccessLocation(
  user: UserProfile | null | undefined, 
  locationId: string,
  _mode: 'READ' | 'WRITE' = 'READ'
): boolean {
  if (!user || !user.isActive) return false;

  // Administrative and logistics roles have full hospital access
  if (['ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'].includes(user.role)) {
    return true;
  }

  // Department users are strictly restricted to their assigned department
  if (user.role === 'DEPARTMENT_USER') {
    if (!user.assignedLocationId) return false;
    return user.assignedLocationId === locationId;
  }

  return false;
}
