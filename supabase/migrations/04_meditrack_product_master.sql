-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Phase 4: Production Product Master, Variants & Catalog Management Migration
-- ==============================================================================

-- 1. EXTEND PRODUCTS TABLE FOR CATALOG SOURCE & SOURCE CODE SEPARATION
ALTER TABLE IF EXISTS public.products 
    ADD COLUMN IF NOT EXISTS product_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS catalog_source VARCHAR(30) DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

-- Enforce controlled catalog_source values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_catalog_source'
    ) THEN
        ALTER TABLE public.products 
            ADD CONSTRAINT chk_products_catalog_source 
            CHECK (catalog_source IN ('SCICO_MEDICAL', 'PLASTI_MED', 'MANUAL'));
    END IF;
END $$;

-- 2. PRODUCT VARIANTS TABLE
-- Clean architectural distinction between PRODUCT and PRODUCT VARIANT
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    variant_name VARCHAR(150) NOT NULL,
    size VARCHAR(100),
    capacity VARCHAR(100),
    material VARCHAR(150),
    specifications JSONB DEFAULT '{}'::jsonb,
    packaging VARCHAR(150),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_variant_name UNIQUE (product_id, variant_name)
);

-- Index for high-performance variant resolution by product
CREATE INDEX IF NOT EXISTS idx_product_variants_product 
    ON public.product_variants(product_id, is_active);

-- 3. PRODUCT MASTER AUDIT TRAIL
-- Immutable audit log for product catalog modifications
CREATE TABLE IF NOT EXISTS public.product_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    performed_by UUID NOT NULL,
    performed_by_name VARCHAR(150) NOT NULL,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('PRODUCT', 'VARIANT')),
    entity_id UUID NOT NULL,
    entity_name VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'PRODUCT_CREATED',
        'PRODUCT_UPDATED',
        'PRODUCT_ACTIVATED',
        'PRODUCT_DEACTIVATED',
        'VARIANT_CREATED',
        'VARIANT_UPDATED',
        'VARIANT_ACTIVATED',
        'VARIANT_DEACTIVATED'
    )),
    field_changed VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_audit_logs_entity 
    ON public.product_audit_logs(entity_id, timestamp DESC);

-- 4. IMMUTABILITY TRIGGER ON PRODUCT AUDIT LOGS
CREATE OR REPLACE FUNCTION fn_prevent_product_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DATABASE INTEGRITY VIOLATION: Product Master audit records are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_product_audit_immutability ON public.product_audit_logs;

CREATE TRIGGER trg_protect_product_audit_immutability
    BEFORE UPDATE OR DELETE ON public.product_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_product_audit_tampering();

-- 5. ROW LEVEL SECURITY (RLS) FOR PRODUCT MASTER & VARIANTS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_audit_logs ENABLE ROW LEVEL SECURITY;

-- Reading Products & Variants:
-- Permitted for ADMIN, INVENTORY_MANAGER, STOREKEEPER
DROP POLICY IF EXISTS p_products_read ON public.products;
CREATE POLICY p_products_read ON public.products
    FOR SELECT
    USING (
        public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER')
    );

DROP POLICY IF EXISTS p_product_variants_read ON public.product_variants;
CREATE POLICY p_product_variants_read ON public.product_variants
    FOR SELECT
    USING (
        public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER')
    );

-- Writing Products & Variants:
-- Permitted exclusively for ADMIN and INVENTORY_MANAGER
DROP POLICY IF EXISTS p_products_write ON public.products;
CREATE POLICY p_products_write ON public.products
    FOR ALL
    USING (
        public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    )
    WITH CHECK (
        public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    );

DROP POLICY IF EXISTS p_product_variants_write ON public.product_variants;
CREATE POLICY p_product_variants_write ON public.product_variants
    FOR ALL
    USING (
        public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    )
    WITH CHECK (
        public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    );

-- Product Audit Logs:
-- Read permitted for ADMIN and INVENTORY_MANAGER
DROP POLICY IF EXISTS p_product_audit_read ON public.product_audit_logs;
CREATE POLICY p_product_audit_read ON public.product_audit_logs
    FOR SELECT
    USING (
        public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    );

-- Insert into audit logs permitted for authenticated actors performing writes
DROP POLICY IF EXISTS p_product_audit_insert ON public.product_audit_logs;
CREATE POLICY p_product_audit_insert ON public.product_audit_logs
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    );
