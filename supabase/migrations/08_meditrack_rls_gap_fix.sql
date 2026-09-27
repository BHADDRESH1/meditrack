-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Phase 8: Production RLS Policy Gap Remediation & Security Hardening
-- Migration: 08_meditrack_rls_gap_fix.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PRODUCT IDENTIFIERS RLS (Phase 5 Gap Remediation)
-- ------------------------------------------------------------------------------
-- Ensure RLS is active on product_identifiers
ALTER TABLE IF EXISTS public.product_identifiers ENABLE ROW LEVEL SECURITY;

-- 1.1 Read Access: All authenticated clinical and inventory staff must be able
-- to scan and resolve barcodes, QR codes, product codes, and SKUs at point of care.
DROP POLICY IF EXISTS rls_product_identifiers_select ON public.product_identifiers;
CREATE POLICY rls_product_identifiers_select 
ON public.product_identifiers
FOR SELECT 
TO authenticated 
USING (TRUE);

-- 1.2 Write Access: Only ADMIN and INVENTORY_MANAGER may insert, update, or delete
-- entries in the centralized identifier registry (aligns with products:write).
DROP POLICY IF EXISTS rls_product_identifiers_admin_manager ON public.product_identifiers;
CREATE POLICY rls_product_identifiers_admin_manager 
ON public.product_identifiers
FOR ALL 
TO authenticated 
USING (
    public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
)
WITH CHECK (
    public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
);


-- ------------------------------------------------------------------------------
-- 2. DAILY CONSUMPTION RLS (Phase 2 Gap Remediation)
-- ------------------------------------------------------------------------------
-- Ensure RLS is active on daily_consumption
ALTER TABLE IF EXISTS public.daily_consumption ENABLE ROW LEVEL SECURITY;

-- 2.1 Read Access: Follows the location-isolation architecture of location_stock.
-- Facility-level managers and storekeepers view all departmental consumption.
-- Clinical department users view their authorized department and Central Store.
DROP POLICY IF EXISTS rls_daily_consumption_select ON public.daily_consumption;
CREATE POLICY rls_daily_consumption_select 
ON public.daily_consumption
FOR SELECT 
TO authenticated 
USING (
    public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER')
    OR location_id = public.auth_user_location()
    OR location_id IN (
        SELECT id FROM public.hospital_locations WHERE type = 'CENTRAL_STORE'
    )
);

-- 2.2 Insert Access: Recorded during clinical consumption.
-- Department users can only record consumption for their assigned location.
DROP POLICY IF EXISTS rls_daily_consumption_insert ON public.daily_consumption;
CREATE POLICY rls_daily_consumption_insert 
ON public.daily_consumption
FOR INSERT 
TO authenticated 
WITH CHECK (
    public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER')
    OR (
        public.auth_user_role() = 'DEPARTMENT_USER' 
        AND location_id = public.auth_user_location()
    )
);

-- 2.3 Update Access: Permitted for upsert aggregation (ON CONFLICT DO UPDATE).
-- Follows identical authorization bounds to INSERT.
DROP POLICY IF EXISTS rls_daily_consumption_update ON public.daily_consumption;
CREATE POLICY rls_daily_consumption_update 
ON public.daily_consumption
FOR UPDATE 
TO authenticated 
USING (
    public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER')
    OR (
        public.auth_user_role() = 'DEPARTMENT_USER' 
        AND location_id = public.auth_user_location()
    )
)
WITH CHECK (
    public.auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER')
    OR (
        public.auth_user_role() = 'DEPARTMENT_USER' 
        AND location_id = public.auth_user_location()
    )
);

-- Note: No DELETE policy is defined. Historical daily consumption is immutable telemetry.


-- ------------------------------------------------------------------------------
-- 3. PRODUCT MASTER & VARIANT READ ACCESS (Phase 4 Gap Remediation)
-- ------------------------------------------------------------------------------
-- Migration 04 inadvertently restricted SELECT on products and product_variants
-- to ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'), blocking DEPARTMENT_USER
-- from resolving product details during barcode/QR scanning at point of care.
-- Recreate the SELECT policies to grant read access to all authenticated staff.

DROP POLICY IF EXISTS p_products_read ON public.products;
CREATE POLICY p_products_read 
ON public.products
FOR SELECT 
TO authenticated 
USING (TRUE);

DROP POLICY IF EXISTS p_product_variants_read ON public.product_variants;
CREATE POLICY p_product_variants_read 
ON public.product_variants
FOR SELECT 
TO authenticated 
USING (TRUE);

-- Existing write policies (p_products_write, p_product_variants_write) remain unchanged,
-- ensuring that only ADMIN and INVENTORY_MANAGER can modify the catalog.


-- ------------------------------------------------------------------------------
-- 4. PROCESS_INVENTORY_MOVEMENT SECURITY REINFORCEMENT
-- ------------------------------------------------------------------------------
-- Recreate process_inventory_movement with SECURITY DEFINER and a locked search_path
-- (public, pg_temp). This ensures atomic clinical consumption can update location_stock,
-- insert into immutable transactions, and upsert daily_consumption under elevated
-- execution context while strictly enforcing all business and clinical validations.

CREATE OR REPLACE FUNCTION public.process_inventory_movement(
    p_type VARCHAR(30),
    p_product_id UUID,
    p_batch_id UUID,
    p_from_location_id UUID,
    p_to_location_id UUID,
    p_quantity INT,
    p_performed_by VARCHAR(100),
    p_reason VARCHAR(255),
    p_reference_doc VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx_id UUID;
    v_tx_number VARCHAR(50);
    v_source_qty INT;
    v_source_reserved INT;
    v_source_available INT;
    v_source_loc_name VARCHAR(100);
    v_source_is_active BOOLEAN;
    v_dest_is_active BOOLEAN;
    v_dest_loc_type VARCHAR(30);
    v_prod_is_active BOOLEAN;
    v_prod_name VARCHAR(255);
    v_batch_number VARCHAR(50);
    v_batch_expiry DATE;
    v_batch_status VARCHAR(20);
    v_batch_matches_product BOOLEAN;
    v_variant_id UUID;
    v_caller_role TEXT;
    v_caller_location UUID;
BEGIN
    -- 4.1 Validate Movement Type
    IF p_type NOT IN ('RECEIVE', 'TRANSFER', 'ISSUE', 'CONSUME', 'RETURN', 'WASTAGE', 'ADJUSTMENT') THEN
        RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: Unknown movement type: %', p_type;
    END IF;

    -- 4.2 Validate Quantity
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Transaction quantity must be greater than zero. Received: %', p_quantity;
    END IF;

    -- 4.3 Validate Caller Authorization (RBAC and Location Scope)
    v_caller_role := public.auth_user_role();
    v_caller_location := public.auth_user_location();

    -- Role-based movement permissions
    IF p_type = 'RECEIVE' AND v_caller_role NOT IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only ADMIN, INVENTORY_MANAGER, or STOREKEEPER may receive stock.';
    ELSIF p_type IN ('TRANSFER', 'RETURN') AND v_caller_role NOT IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only ADMIN, INVENTORY_MANAGER, or STOREKEEPER may transfer or return stock.';
    ELSIF p_type = 'WASTAGE' AND v_caller_role NOT IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only ADMIN, INVENTORY_MANAGER, or STOREKEEPER may write off wastage.';
    ELSIF p_type = 'ADJUSTMENT' AND v_caller_role NOT IN ('ADMIN', 'INVENTORY_MANAGER') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only ADMIN or INVENTORY_MANAGER may execute physical cycle count adjustments.';
    ELSIF p_type IN ('ISSUE', 'CONSUME') AND v_caller_role NOT IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER', 'DEPARTMENT_USER') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Caller role % is not authorized for %.', v_caller_role, p_type;
    END IF;

    -- Location-isolation: DEPARTMENT_USER can only consume/issue from their assigned location
    IF v_caller_role = 'DEPARTMENT_USER' AND p_from_location_id IS NOT NULL THEN
        IF v_caller_location IS NULL OR p_from_location_id <> v_caller_location THEN
            RAISE EXCEPTION 'UNAUTHORIZED_LOCATION: Department users may only issue or consume inventory from their assigned clinical unit.';
        END IF;
    END IF;

    -- 4.4 Validate Product
    SELECT name, is_active INTO v_prod_name, v_prod_is_active
    FROM public.products WHERE id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_PRODUCT: Product with ID % does not exist.', p_product_id;
    END IF;

    IF NOT v_prod_is_active THEN
        RAISE EXCEPTION 'INACTIVE_PRODUCT: Cannot perform movements on inactive product: %.', v_prod_name;
    END IF;

    -- 4.5 Validate Batch, variant linkage, and relationship to product
    SELECT batch_number, expiry_date, status, (product_id = p_product_id), variant_id
    INTO v_batch_number, v_batch_expiry, v_batch_status, v_batch_matches_product, v_variant_id
    FROM public.inventory_batches WHERE id = p_batch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_BATCH: Batch with ID % does not exist.', p_batch_id;
    END IF;

    IF NOT v_batch_matches_product THEN
        RAISE EXCEPTION 'INVALID_BATCH_RELATIONSHIP: Batch % does not belong to product %.', v_batch_number, v_prod_name;
    END IF;

    -- 4.6 Validate Source & Destination Logic
    IF p_type = 'TRANSFER' THEN
        IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_LOCATION: Transfer requires both a source and destination location.';
        END IF;

        IF p_from_location_id = p_to_location_id THEN
            RAISE EXCEPTION 'SAME_LOCATION: Source and destination locations cannot be identical for a transfer.';
        END IF;
    END IF;

    -- 4.7 Validate Source Location & Concurrency-Safe Lock
    IF p_from_location_id IS NOT NULL THEN
        SELECT name, is_active INTO v_source_loc_name, v_source_is_active
        FROM public.hospital_locations WHERE id = p_from_location_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVALID_LOCATION: Source location does not exist.';
        END IF;

        IF NOT v_source_is_active THEN
            RAISE EXCEPTION 'INACTIVE_LOCATION: Source location "%" is inactive. Cannot issue or transfer stock.', v_source_loc_name;
        END IF;

        -- ROW-LEVEL LOCK to prevent concurrency race conditions
        SELECT quantity, reserved_quantity 
        INTO v_source_qty, v_source_reserved
        FROM public.location_stock
        WHERE product_id = p_product_id 
          AND batch_id = p_batch_id 
          AND location_id = p_from_location_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: No stock record found for % (Batch %) at %.', v_prod_name, v_batch_number, v_source_loc_name;
        END IF;

        v_source_available := v_source_qty - v_source_reserved;
        IF v_source_available < p_quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock available at %. Requested: %. Available: % (Total: %, Reserved: %).',
                v_source_loc_name, p_quantity, v_source_available, v_source_qty, v_source_reserved;
        END IF;

        -- 4.8 Expired Stock Safeguard:
        -- Clinical issuance or consumption of expired batches is strictly prohibited.
        IF (v_batch_expiry <= CURRENT_DATE OR v_batch_status = 'EXPIRED') AND p_type IN ('ISSUE', 'CONSUME') THEN
            RAISE EXCEPTION 'EXPIRED_STOCK: Batch % expired on %. Clinical issuance or consumption is prohibited.', v_batch_number, v_batch_expiry;
        END IF;

        -- For transfers of expired stock, only allow if destination is Quarantine/Central Store or authorized disposal
        IF (v_batch_expiry <= CURRENT_DATE OR v_batch_status = 'EXPIRED') AND p_type = 'TRANSFER' THEN
            SELECT type INTO v_dest_loc_type FROM public.hospital_locations WHERE id = p_to_location_id;
            IF v_dest_loc_type NOT IN ('CENTRAL_STORE', 'SPECIALTY_UNIT') AND p_reason NOT ILIKE '%quarantine%' AND p_reason NOT ILIKE '%disposal%' THEN
                RAISE EXCEPTION 'EXPIRED_STOCK: Cannot transfer expired batch % to clinical point of care. Must be routed to quarantine or authorized disposal.', v_batch_number;
            END IF;
        END IF;
    END IF;

    -- 4.9 Validate Destination Location
    IF p_to_location_id IS NOT NULL THEN
        SELECT is_active INTO v_dest_is_active
        FROM public.hospital_locations WHERE id = p_to_location_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVALID_LOCATION: Destination location does not exist.';
        END IF;

        IF NOT v_dest_is_active THEN
            RAISE EXCEPTION 'INACTIVE_LOCATION: Destination location is inactive. Cannot receive stock.';
        END IF;
    END IF;

    -- 4.10 Execute Atomic Stock Decrement
    IF p_from_location_id IS NOT NULL THEN
        UPDATE public.location_stock
        SET quantity = quantity - p_quantity,
            last_audited_at = now()
        WHERE product_id = p_product_id 
          AND batch_id = p_batch_id 
          AND location_id = p_from_location_id;
    END IF;

    -- 4.11 Execute Atomic Stock Increment
    IF p_to_location_id IS NOT NULL THEN
        INSERT INTO public.location_stock (id, product_id, variant_id, batch_id, location_id, quantity, reserved_quantity, last_audited_at)
        VALUES (public.uuid_generate_v4(), p_product_id, v_variant_id, p_batch_id, p_to_location_id, p_quantity, 0, now())
        ON CONFLICT (product_id, batch_id, location_id)
        DO UPDATE SET 
            quantity = public.location_stock.quantity + EXCLUDED.quantity,
            last_audited_at = now();
    END IF;

    -- 4.12 Generate Transaction Number and Insert into Immutable Ledger
    v_tx_id := public.uuid_generate_v4();
    v_tx_number := 'TX-' || TO_CHAR(now(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');

    INSERT INTO public.inventory_transactions (
        id, transaction_number, timestamp, type,
        product_id, variant_id, batch_id, from_location_id, to_location_id,
        quantity, performed_by, reason, reference_doc, notes
    ) VALUES (
        v_tx_id, v_tx_number, now(), p_type,
        p_product_id, v_variant_id, p_batch_id, p_from_location_id, p_to_location_id,
        p_quantity, p_performed_by, p_reason, p_reference_doc, p_notes
    );

    -- 4.13 If CONSUME, also record in daily_consumption for rolling velocity analytics
    IF p_type = 'CONSUME' AND p_from_location_id IS NOT NULL THEN
        INSERT INTO public.daily_consumption (id, date, product_id, batch_id, location_id, consumed_units, recorded_by)
        VALUES (public.uuid_generate_v4(), CURRENT_DATE, p_product_id, p_batch_id, p_from_location_id, p_quantity, p_performed_by)
        ON CONFLICT (date, product_id, location_id)
        DO UPDATE SET consumed_units = public.daily_consumption.consumed_units + EXCLUDED.consumed_units;
    END IF;

    -- Return JSON Result
    RETURN jsonb_build_object(
        'success', TRUE,
        'transaction_id', v_tx_id,
        'transaction_number', v_tx_number,
        'type', p_type,
        'quantity', p_quantity,
        'timestamp', now()
    );
END;
$$;
