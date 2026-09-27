import { describe, it, expect, beforeEach } from 'vitest';
import { authService, INITIAL_USERS } from '@/services/authService';
import { hasPermission } from '@/services/permissions';
import { setDataMode } from '@/services/supabaseClient';

describe('MEDiTRACK: Real User Creation & User Management Security Suite', () => {
  const adminUser = INITIAL_USERS.find(u => u.role === 'ADMIN')!;
  const storekeeperUser = INITIAL_USERS.find(u => u.role === 'STOREKEEPER')!;
  const departmentUser = INITIAL_USERS.find(u => u.role === 'DEPARTMENT_USER')!;

  beforeEach(() => {
    setDataMode('DEMO');
  });

  // 1. Authorization check for Add User action
  it('1. permits users:write permission only to ADMIN role', () => {
    expect(hasPermission(adminUser, 'users:write')).toBe(true);
    expect(hasPermission(storekeeperUser, 'users:write')).toBe(false);
    expect(hasPermission(departmentUser, 'users:write')).toBe(false);
    expect(hasPermission(null, 'users:write')).toBe(false);
  });

  // 2. Reject non-admin creation attempt
  it('2. blocks unauthorized non-admin attempts to provision user accounts', async () => {
    const res = await authService.adminCreateUser({
      actorId: storekeeperUser.id,
      fullName: 'Intruder Staff',
      email: 'intruder@stjude.org',
      password: 'StrongPassword123!',
      role: 'STOREKEEPER',
      isActive: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('SECURITY VIOLATION');
  });

  // 3. Form validation: full name required
  it('3. rejects user creation when full name is empty', async () => {
    const res = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: '   ',
      email: 'valid.email@stjude.org',
      password: 'StrongPassword123!',
      role: 'STOREKEEPER',
      isActive: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Full name is required');
  });

  // 4. Form validation: invalid email format
  it('4. rejects user creation when email format is invalid', async () => {
    const res = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Dr. Jane Doe',
      email: 'invalid-email-address',
      password: 'StrongPassword123!',
      role: 'STOREKEEPER',
      isActive: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid email address');
  });

  // 5. Form validation: password minimum length
  it('5. rejects user creation when password is shorter than 8 characters', async () => {
    const res = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Dr. Jane Doe',
      email: 'jane.doe@stjude.org',
      password: '123',
      role: 'STOREKEEPER',
      isActive: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('minimum 8 characters');
  });

  // 6. Role-location rule: DEPARTMENT_USER requires assigned location
  it('6. requires assigned location when provisioning a DEPARTMENT_USER', async () => {
    const res = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Nurse Practitioner',
      email: 'nurse.dept@stjude.org',
      password: 'StrongPassword123!',
      role: 'DEPARTMENT_USER',
      assignedLocationId: undefined, // Missing location
      isActive: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Please select an authorized department or location');
  });

  // 7. Duplicate email prevention
  it('7. prevents creating an account with an email that already exists', async () => {
    const res = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Dr. Duplicate',
      email: 'admin@stjude.org', // Existing admin email
      password: 'StrongPassword123!',
      role: 'ADMIN',
      isActive: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('already exists');
  });

  // 8. Successful user creation in DEMO mode
  it('8. successfully creates a new user, adds to directory, and logs immutable security event', async () => {
    const initialUsersCount = authService.getUsers().length;
    const initialLogsCount = authService.getUserAuditLogs().length;

    const res = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Nurse Chloe Bennet',
      email: 'chloe.bennet@stjude.org',
      password: 'TempPassword2026!',
      role: 'DEPARTMENT_USER',
      assignedLocationId: 'loc-icu-01',
      isActive: true,
      notes: 'New surgical ICU floor nurse onboarded',
    });

    expect(res.success).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.fullName).toBe('Nurse Chloe Bennet');
    expect(res.user?.email).toBe('chloe.bennet@stjude.org');
    expect(res.user?.role).toBe('DEPARTMENT_USER');
    expect(res.user?.assignedLocationId).toBe('loc-icu-01');
    expect(res.user?.isActive).toBe(true);

    // Directory count incremented
    const freshUsers = authService.getUsers();
    expect(freshUsers.length).toBe(initialUsersCount + 1);
    expect(freshUsers.some(u => u.email === 'chloe.bennet@stjude.org')).toBe(true);

    // Security audit log recorded
    const freshLogs = authService.getUserAuditLogs();
    expect(freshLogs.length).toBe(initialLogsCount + 1);
    const latestLog = freshLogs[0];
    expect(latestLog.performedBy).toBe(adminUser.id);
    expect(latestLog.targetUserName).toBe('Nurse Chloe Bennet');
    expect(latestLog.action).toBe('PROFILE_UPDATE');
    expect(latestLog.fieldChanged).toBe('account_provisioning');
  });

  // 9. Created user can authenticate immediately
  it('9. allows newly created user to authenticate successfully using their credentials', async () => {
    const email = `pediatric.staff.${Date.now()}@stjude.org`;
    const createRes = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Nurse Michael Chang',
      email,
      password: 'SecurePassword2026!',
      role: 'DEPARTMENT_USER',
      assignedLocationId: 'loc-ed-01',
      isActive: true,
    });

    expect(createRes.success).toBe(true);

    // Attempt login
    const loginRes = await authService.login(email, 'SecurePassword2026!');
    expect(loginRes.success).toBe(true);
    expect(loginRes.user?.email).toBe(email);
    expect(loginRes.user?.role).toBe('DEPARTMENT_USER');
  });

  // 10. Edit Role works on newly created user
  it('10. integrates seamlessly with existing adminUpdateUser for role editing', async () => {
    const email = `upgrade.candidate.${Date.now()}@stjude.org`;
    const createRes = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Lucas Gray',
      email,
      password: 'SecurePassword2026!',
      role: 'STOREKEEPER',
      assignedLocationId: 'loc-cs-01',
      isActive: true,
    });

    expect(createRes.success).toBe(true);
    const newUserId = createRes.user!.id;

    // Promote to INVENTORY_MANAGER
    const updateRes = authService.adminUpdateUser({
      actorId: adminUser.id,
      targetUserId: newUserId,
      newRole: 'INVENTORY_MANAGER',
      newLocationId: 'loc-cs-01',
      newIsActive: true,
      notes: 'Completed warehouse management certifications',
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.updatedUser?.role).toBe('INVENTORY_MANAGER');

    const verifiedUser = authService.getUserById(newUserId);
    expect(verifiedUser?.role).toBe('INVENTORY_MANAGER');
  });

  // 11. Deactivated created user is blocked from logging in
  it('11. blocks login if a created user is deactivated', async () => {
    const email = `inactive.candidate.${Date.now()}@stjude.org`;
    const createRes = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Inactive Staff Member',
      email,
      password: 'SecurePassword2026!',
      role: 'DEPARTMENT_USER',
      assignedLocationId: 'loc-ed-01',
      isActive: false, // Inactive
    });

    expect(createRes.success).toBe(true);

    const loginRes = await authService.login(email, 'SecurePassword2026!');
    expect(loginRes.success).toBe(false);
    expect(loginRes.error).toContain('deactivated');
  });

  // 12. SUPABASE mode safety check: refuses un-architected client-side privilege elevation
  it('12. enforces zero client-side service-role exposure in SUPABASE mode', async () => {
    setDataMode('SUPABASE');

    const res = await authService.adminCreateUser({
      actorId: adminUser.id,
      fullName: 'Dr. Cloud Physician',
      email: 'cloud.physician@stjude.org',
      password: 'SecurePassword2026!',
      role: 'DEPARTMENT_USER',
      assignedLocationId: 'loc-icu-01',
      isActive: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Creating Supabase Auth users requires a secure server-side/admin mechanism. No service-role secret will be exposed to the frontend.');
  });
});
