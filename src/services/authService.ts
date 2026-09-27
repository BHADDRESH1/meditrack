import { UserProfile, UserAuditLog, UserRole } from '@/types/inventory';
import { 
  isSupabaseConfigured,
  getDataMode,
  getSupabaseConfig,
  setSupabaseSession,
  clearSupabaseSession,
  supabaseRest
} from './supabaseClient';

const STORAGE_KEY = 'meditrack_auth_session';

export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'usr-admin-01',
    authUserId: 'auth-001',
    email: 'admin@stjude.org',
    fullName: 'Dr. Arthur Vance',
    role: 'ADMIN',
    facility: 'St. Jude Academic Medical Center',
    assignedLocationId: 'loc-cs-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'usr-mgr-01',
    authUserId: 'auth-002',
    email: 'manager@stjude.org',
    fullName: 'Sarah Jenkins',
    role: 'INVENTORY_MANAGER',
    facility: 'St. Jude Academic Medical Center',
    assignedLocationId: 'loc-ot-01',
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'usr-store-01',
    authUserId: 'auth-003',
    email: 'storekeeper@stjude.org',
    fullName: 'James Sterling',
    role: 'STOREKEEPER',
    facility: 'St. Jude Academic Medical Center',
    assignedLocationId: 'loc-cs-01',
    isActive: true,
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'usr-icu-01',
    authUserId: 'auth-004',
    email: 'icu.nurse@stjude.org',
    fullName: 'Dr. Elena Rostova',
    role: 'DEPARTMENT_USER',
    facility: 'St. Jude Academic Medical Center',
    assignedLocationId: 'loc-icu-01', // Strictly ICU
    isActive: true,
    createdAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'usr-ed-01',
    authUserId: 'auth-005',
    email: 'emergency@stjude.org',
    fullName: 'Dr. Marcus Brody',
    role: 'DEPARTMENT_USER',
    facility: 'St. Jude Academic Medical Center',
    assignedLocationId: 'loc-ed-01', // Strictly Emergency
    isActive: true,
    createdAt: '2026-02-15T00:00:00Z',
  },
  {
    id: 'usr-inactive-01',
    authUserId: 'auth-006',
    email: 'inactive@stjude.org',
    fullName: 'David Kim',
    role: 'DEPARTMENT_USER',
    facility: 'St. Jude Academic Medical Center',
    assignedLocationId: 'loc-sw-01',
    isActive: false, // Inactive account
    createdAt: '2026-03-01T00:00:00Z',
  },
];

export const INITIAL_AUDIT_LOGS: UserAuditLog[] = [
  {
    id: 'ua-001',
    timestamp: '2026-08-15T09:30:00Z',
    performedBy: 'usr-admin-01',
    performedByName: 'Dr. Arthur Vance',
    targetUserId: 'usr-mgr-01',
    targetUserName: 'Sarah Jenkins',
    action: 'ROLE_CHANGE',
    fieldChanged: 'role',
    oldValue: 'STOREKEEPER',
    newValue: 'INVENTORY_MANAGER',
    notes: 'Promoted following completion of clinical supply chain credentials',
  },
  {
    id: 'ua-002',
    timestamp: '2026-09-01T14:00:00Z',
    performedBy: 'usr-admin-01',
    performedByName: 'Dr. Arthur Vance',
    targetUserId: 'usr-inactive-01',
    targetUserName: 'David Kim',
    action: 'STATUS_TOGGLE',
    fieldChanged: 'is_active',
    oldValue: 'true',
    newValue: 'false',
    notes: 'Temporary medical leave deactivation',
  },
];

class AuthService {
  private users: UserProfile[] = [...INITIAL_USERS];
  private auditLogs: UserAuditLog[] = [...INITIAL_AUDIT_LOGS];
  private currentSessionUser: UserProfile | null = null;

  constructor() {
    this.restoreSession();
  }

  private restoreSession() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserProfile;
        const liveUser = this.users.find(u => u.id === parsed.id);
        if (liveUser && liveUser.isActive) {
          this.currentSessionUser = liveUser;
        } else {
          this.clearSession();
        }
      } else {
        // Default to Admin in development mode if no session stored
        this.currentSessionUser = this.users[0];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentSessionUser));
      }
    } catch {
      this.currentSessionUser = this.users[0];
    }
  }

  private clearSession() {
    this.currentSessionUser = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentSessionUser;
  }

  public isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  public async login(email: string, password?: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    // 1. Authoritative Supabase Auth Path (Connected Mode)
    if (getDataMode() === 'SUPABASE') {
      const config = getSupabaseConfig();
      if (!config.isConfigured) {
        return {
          success: false,
          error: 'Supabase credentials are not configured.',
        };
      }

      try {
        const res = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: config.publishableKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password: password || '',
          }),
        });

        const authData = await res.json();
        if (!res.ok) {
          const authMsg = authData?.msg || authData?.error_description || authData?.message;
          return {
            success: false,
            error: authMsg
              ? `Supabase Auth Error: ${authMsg}`
              : 'Invalid login credentials. Note: If no user has been created in remote Supabase Auth, manual provisioning is required.',
          };
        }

        const accessToken = authData.access_token;
        const authUserId = authData.user?.id;
        setSupabaseSession(accessToken, authData.refresh_token);

        // Authoritatively query public.user_profiles linked to the auth user ID
        const profileRes = await supabaseRest<any[]>(`user_profiles?auth_user_id=eq.${authUserId}&select=*`);
        if (profileRes.error || !profileRes.data || profileRes.data.length === 0) {
          clearSupabaseSession();
          return {
            success: false,
            error: 'Authenticated with Supabase Auth, but no clinical record was found in user_profiles. Manual user profile setup required.',
          };
        }

        const rawProfile = profileRes.data[0];
        const userProfile: UserProfile = {
          id: rawProfile.id,
          authUserId: rawProfile.auth_user_id,
          email: rawProfile.email,
          fullName: rawProfile.full_name,
          role: rawProfile.role,
          facility: rawProfile.facility,
          assignedLocationId: rawProfile.assigned_location_id,
          isActive: rawProfile.is_active,
          createdAt: rawProfile.created_at,
        };

        if (!userProfile.isActive) {
          clearSupabaseSession();
          return {
            success: false,
            error: 'This account has been deactivated. Please contact your hospital system administrator.',
          };
        }

        this.currentSessionUser = userProfile;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(userProfile));
        } catch {}

        return {
          success: true,
          user: userProfile,
        };
      } catch (err) {
        return {
          success: false,
          error: `Supabase Auth connection failure: ${err instanceof Error ? err.message : 'Unknown network failure'}`,
        };
      }
    }

    // 2. Development / Demo Auth Fallback
    const cleanEmail = email.trim().toLowerCase();
    const matchedUser = this.users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!matchedUser) {
      return {
        success: false,
        error: 'Unable to sign in. Please verify your credentials and try again.',
      };
    }

    if (!matchedUser.isActive) {
      return {
        success: false,
        error: 'This account has been deactivated. Please contact your hospital system administrator.',
      };
    }

    this.currentSessionUser = matchedUser;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(matchedUser));
    } catch {}

    return {
      success: true,
      user: matchedUser,
    };
  }

  public logout(): void {
    clearSupabaseSession();
    this.clearSession();
  }

  public switchDemoUser(role: UserRole): UserProfile {
    const user = this.users.find(u => u.role === role && u.isActive) || this.users[0];
    this.currentSessionUser = user;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {}
    return user;
  }

  // --- ADMIN USER MANAGEMENT APIS ---
  public getUsers(): UserProfile[] {
    return [...this.users];
  }

  public getUserById(id: string): UserProfile | undefined {
    return this.users.find(u => u.id === id);
  }

  public getUserAuditLogs(): UserAuditLog[] {
    return this.auditLogs
      .map(log => ({ ...log }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async adminCreateUser(params: {
    actorId: string;
    fullName: string;
    email: string;
    password: string;
    role: UserRole;
    assignedLocationId?: string;
    isActive: boolean;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
    const actor = this.getUserById(params.actorId);
    if (!actor || actor.role !== 'ADMIN' || !actor.isActive) {
      return {
        success: false,
        error: 'SECURITY VIOLATION: Only active hospital system administrators may provision user accounts.',
      };
    }

    const cleanFullName = params.fullName.trim();
    if (!cleanFullName) {
      return { success: false, error: 'Full name is required.' };
    }

    const cleanEmail = params.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return { success: false, error: 'Invalid email address.' };
    }

    if (!params.password || params.password.length < 8) {
      return { success: false, error: 'Password does not meet requirements: minimum 8 characters required.' };
    }

    if (!params.role) {
      return { success: false, error: 'Please select a role.' };
    }

    // Role-location validation rules
    if (params.role === 'DEPARTMENT_USER' && !params.assignedLocationId) {
      return { success: false, error: 'Please select an authorized department or location for clinical staff.' };
    }

    // Duplicate email check
    const existing = this.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    // In SUPABASE connected mode:
    if (getDataMode() === 'SUPABASE') {
      // Per Section 8 & Section 27: Never expose a service-role key to client.
      // Report missing server-side mechanism securely.
      return {
        success: false,
        error: 'Creating Supabase Auth users requires a secure server-side/admin mechanism. No service-role secret will be exposed to the frontend.',
      };
    }

    // In DEMO mode: Create and persist in-memory
    const newUserId = `usr-${Date.now()}`;
    const newAuthUserId = `auth-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const newUser: UserProfile = {
      id: newUserId,
      authUserId: newAuthUserId,
      email: cleanEmail,
      fullName: cleanFullName,
      role: params.role,
      facility: actor.facility || 'St. Jude Academic Medical Center',
      assignedLocationId: params.assignedLocationId || undefined,
      isActive: params.isActive,
      createdAt: timestamp,
    };

    this.users.push(newUser);

    // Record immutable audit log
    this.auditLogs.unshift({
      id: `ua-${Date.now()}-create`,
      timestamp,
      performedBy: actor.id,
      performedByName: actor.fullName,
      targetUserId: newUser.id,
      targetUserName: newUser.fullName,
      action: 'PROFILE_UPDATE',
      fieldChanged: 'account_provisioning',
      oldValue: 'NONE',
      newValue: `${newUser.role} | ${newUser.assignedLocationId || 'Global'} | ${newUser.isActive ? 'Active' : 'Inactive'}`,
      notes: params.notes || 'Administrative staff account creation',
    });

    return {
      success: true,
      user: newUser,
    };
  }

  public adminUpdateUser(params: {
    actorId: string;
    targetUserId: string;
    newRole: UserRole;
    newLocationId?: string;
    newIsActive: boolean;
    notes?: string;
  }): { success: boolean; error?: string; updatedUser?: UserProfile } {
    const actor = this.getUserById(params.actorId);
    if (!actor || actor.role !== 'ADMIN' || !actor.isActive) {
      return {
        success: false,
        error: 'SECURITY VIOLATION: Only active hospital system administrators may modify user profiles.',
      };
    }

    const target = this.getUserById(params.targetUserId);
    if (!target) {
      return {
        success: false,
        error: 'Target user not found.',
      };
    }

    // Prevent Admin self-demotion or self-deactivation
    if (actor.id === target.id) {
      if (params.newRole !== 'ADMIN') {
        return {
          success: false,
          error: 'Administrators cannot demote their own account.',
        };
      }
      if (!params.newIsActive) {
        return {
          success: false,
          error: 'Administrators cannot deactivate their own account.',
        };
      }
    }

    const oldRole = target.role;
    const oldLoc = target.assignedLocationId;
    const oldActive = target.isActive;

    // Apply updates
    target.role = params.newRole;
    target.assignedLocationId = params.newLocationId;
    target.isActive = params.newIsActive;

    const timestamp = new Date().toISOString();

    // Record immutable audit logs
    if (oldRole !== params.newRole) {
      this.auditLogs.unshift({
        id: `ua-${Date.now()}-1`,
        timestamp,
        performedBy: actor.id,
        performedByName: actor.fullName,
        targetUserId: target.id,
        targetUserName: target.fullName,
        action: 'ROLE_CHANGE',
        fieldChanged: 'role',
        oldValue: oldRole,
        newValue: params.newRole,
        notes: params.notes,
      });
    }

    if (oldLoc !== params.newLocationId) {
      this.auditLogs.unshift({
        id: `ua-${Date.now()}-2`,
        timestamp,
        performedBy: actor.id,
        performedByName: actor.fullName,
        targetUserId: target.id,
        targetUserName: target.fullName,
        action: 'LOCATION_REASSIGNMENT',
        fieldChanged: 'assignedLocationId',
        oldValue: oldLoc || 'Global',
        newValue: params.newLocationId || 'Global',
        notes: params.notes,
      });
    }

    if (oldActive !== params.newIsActive) {
      this.auditLogs.unshift({
        id: `ua-${Date.now()}-3`,
        timestamp,
        performedBy: actor.id,
        performedByName: actor.fullName,
        targetUserId: target.id,
        targetUserName: target.fullName,
        action: 'STATUS_TOGGLE',
        fieldChanged: 'isActive',
        oldValue: String(oldActive),
        newValue: String(params.newIsActive),
        notes: params.notes,
      });
    }

    // If current session was the target, update session
    if (this.currentSessionUser?.id === target.id) {
      this.currentSessionUser = { ...target };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentSessionUser));
      } catch {}
    }

    return {
      success: true,
      updatedUser: { ...target },
    };
  }
}

export const authService = new AuthService();
