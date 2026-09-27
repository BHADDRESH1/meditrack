-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Phase 5: Production Stock Receiving, Barcode Identification & Operations
-- ==============================================================================

-- 1. CENTRALIZED PRODUCT IDENTIFIER REGISTRY TABLE
-- Central authoritative registry across SKU, PRODUCT_CODE, BARCODE, and QR
CREATE TABLE IF NOT EXISTS public.product_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier_value VARCHAR(100) NOT NULL,
    normalized_value VARCHAR(100) NOT NULL UNIQUE,
    identifier_type VARCHAR(20) NOT NULL CHECK (identifier_type IN ('SKU', 'PRODUCT_CODE', 'BARCODE', 'QR')),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_synthetic_demo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_identifiers_normalized ON public.product_identifiers(normalized_value);
CREATE INDEX IF NOT EXISTS idx_product_identifiers_product ON public.product_identifiers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_identifiers_variant ON public.product_identifiers(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_identifiers_type ON public.product_identifiers(identifier_type);

-- 2. EXTEND INVENTORY_BATCHES FOR VARIANT, SUPPLIER & DATE CONSTRAINTS
ALTER TABLE IF EXISTS public.inventory_batches
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS supplier VARCHAR(150),
    ADD COLUMN IF NOT EXISTS delivery_note VARCHAR(100);

-- Enforce that expiry_date must be strictly greater than mfg_date when mfg_date is supplied
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_batch_mfg_expiry'
    ) THEN
        ALTER TABLE public.inventory_batches 
            ADD CONSTRAINT chk_batch_mfg_expiry 
            CHECK (mfg_date IS NULL OR expiry_date > mfg_date);
    END IF;
END $$;

-- 3. EXTEND LOCATION_STOCK & TRANSACTIONS FOR VARIANT RESOLUTION
ALTER TABLE IF EXISTS public.location_stock
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE IF EXISTS public.inventory_transactions
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE RESTRICT;

-- Index for high-performance stock lookups with variants
CREATE INDEX IF NOT EXISTS idx_location_stock_variant 
    ON public.location_stock(product_id, variant_id, location_id);

-- 4. ROW LEVEL SECURITY (RLS) FOR PHYSICAL INVENTORY OPERATIONS
-- Permitted roles: ADMIN, INVENTORY_MANAGER, STOREKEEPER for Receiving & Transfers
-- DEPARTMENT_USER is isolated to their assigned location

DROP POLICY IF EXISTS p_inventory_receive_perm ON public.inventory_transactions;
CREATE POLICY p_inventory_receive_perm ON public.inventory_transactions
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND (
            (type = 'RECEIVE' AND public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'))
            OR (type IN ('TRANSFER', 'RETURN') AND public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'))
            OR (type IN ('CONSUME', 'ISSUE') AND public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER', 'DEPARTMENT_USER'))
            OR (type = 'WASTAGE' AND public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'))
        )
    );
