-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Production Authentication, RBAC & Location Isolation Migration (Phase 3)
-- ==============================================================================

-- 1. USER PROFILES TABLE
-- Bridges Supabase auth.users(id) with clinical application authorization metadata
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN (
        'ADMIN', 
        'INVENTORY_MANAGER', 
        'STOREKEEPER', 
        'DEPARTMENT_USER'
    )),
    facility VARCHAR(100) NOT NULL DEFAULT 'St. Jude Academic Medical Center',
    assigned_location_id UUID REFERENCES hospital_locations(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. USER AUDIT LOGS TABLE
-- Immutable record of administrative security and role changes
CREATE TABLE IF NOT EXISTS user_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    performed_by UUID NOT NULL,
    target_user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'ROLE_CHANGE', 
        'LOCATION_REASSIGNMENT', 
        'STATUS_TOGGLE', 
        'PROFILE_UPDATE'
    )),
    field_changed VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. AUDIT LOG IMMUTABILITY TRIGGER
-- Audit records cannot be modified or deleted once written
CREATE OR REPLACE FUNCTION fn_prevent_audit_log_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DATABASE INTEGRITY VIOLATION: User audit logs are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_user_audit_logs_immutability ON user_audit_logs;

CREATE TRIGGER trg_protect_user_audit_logs_immutability
BEFORE UPDATE OR DELETE ON user_audit_logs
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_audit_log_tampering();

-- 4. UPDATE AUTHORIZATION HELPER FUNCTIONS
-- Derive user role and authorized location from user_profiles using auth.uid()
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role 
    FROM user_profiles 
    WHERE auth_user_id = auth.uid() AND is_active = TRUE;

    RETURN COALESCE(v_role, 'DEPARTMENT_USER');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_user_location()
RETURNS UUID AS $$
DECLARE
    v_loc_id UUID;
BEGIN
    SELECT assigned_location_id INTO v_loc_id 
    FROM user_profiles 
    WHERE auth_user_id = auth.uid() AND is_active = TRUE;

    RETURN v_loc_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. ATOMIC ADMIN USER UPDATE STORED PROCEDURE
-- Validates actor is ADMIN, prevents self-demotion, updates profile, and writes immutable audit log
CREATE OR REPLACE FUNCTION admin_update_user_profile(
    p_target_user_id UUID,
    p_new_role VARCHAR(30),
    p_new_location_id UUID,
    p_new_is_active BOOLEAN,
    p_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_actor_auth_id UUID;
    v_actor_profile_id UUID;
    v_actor_role VARCHAR(30);
    v_target_old_role VARCHAR(30);
    v_target_old_loc UUID;
    v_target_old_active BOOLEAN;
BEGIN
    v_actor_auth_id := auth.uid();

    -- Verify actor
    SELECT id, role INTO v_actor_profile_id, v_actor_role
    FROM user_profiles WHERE auth_user_id = v_actor_auth_id AND is_active = TRUE;

    IF v_actor_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only system ADMINs can perform user management operations.';
    END IF;

    -- Retrieve target user
    SELECT role, assigned_location_id, is_active
    INTO v_target_old_role, v_target_old_loc, v_target_old_active
    FROM user_profiles WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: Target user profile with ID % does not exist.', p_target_user_id;
    END IF;

    -- Prevent self-demotion / self-deactivation
    IF p_target_user_id = v_actor_profile_id THEN
        IF p_new_role <> 'ADMIN' THEN
            RAISE EXCEPTION 'INVALID_OPERATION: Administrators cannot demote their own account.';
        END IF;
        IF p_new_is_active = FALSE THEN
            RAISE EXCEPTION 'INVALID_OPERATION: Administrators cannot deactivate their own account.';
        END IF;
    END IF;

    -- Update Profile
    UPDATE user_profiles
    SET role = p_new_role,
        assigned_location_id = p_new_location_id,
        is_active = p_new_is_active,
        updated_at = now()
    WHERE id = p_target_user_id;

    -- Record Audit Events
    IF v_target_old_role <> p_new_role THEN
        INSERT INTO user_audit_logs (performed_by, target_user_id, action, field_changed, old_value, new_value, notes)
        VALUES (v_actor_profile_id, p_target_user_id, 'ROLE_CHANGE', 'role', v_target_old_role, p_new_role, p_notes);
    END IF;

    IF COALESCE(v_target_old_loc::TEXT, '') <> COALESCE(p_new_location_id::TEXT, '') THEN
        INSERT INTO user_audit_logs (performed_by, target_user_id, action, field_changed, old_value, new_value, notes)
        VALUES (v_actor_profile_id, p_target_user_id, 'LOCATION_REASSIGNMENT', 'assigned_location_id', v_target_old_loc::TEXT, p_new_location_id::TEXT, p_notes);
    END IF;

    IF v_target_old_active <> p_new_is_active THEN
        INSERT INTO user_audit_logs (performed_by, target_user_id, action, field_changed, old_value, new_value, notes)
        VALUES (v_actor_profile_id, p_target_user_id, 'STATUS_TOGGLE', 'is_active', v_target_old_active::TEXT, p_new_is_active::TEXT, p_notes);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'target_user_id', p_target_user_id,
        'new_role', p_new_role,
        'is_active', p_new_is_active,
        'timestamp', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ROW LEVEL SECURITY POLICIES FOR USER PROFILES & AUDIT LOGS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_audit_logs ENABLE ROW LEVEL SECURITY;

-- user_profiles policies
DROP POLICY IF EXISTS rls_user_profiles_read_own ON user_profiles;
CREATE POLICY rls_user_profiles_read_own ON user_profiles FOR SELECT TO authenticated
USING (auth_user_id = auth.uid() OR auth_user_role() = 'ADMIN');

DROP POLICY IF EXISTS rls_user_profiles_admin_update ON user_profiles;
CREATE POLICY rls_user_profiles_admin_update ON user_profiles FOR UPDATE TO authenticated
USING (auth_user_role() = 'ADMIN');

-- user_audit_logs policies
DROP POLICY IF EXISTS rls_user_audit_logs_read ON user_audit_logs;
CREATE POLICY rls_user_audit_logs_read ON user_audit_logs FOR SELECT TO authenticated
USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_id ON user_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_location ON user_profiles(assigned_location_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_target ON user_audit_logs(target_user_id, timestamp DESC);
