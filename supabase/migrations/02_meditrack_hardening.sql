-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Production Database Hardening & Data Integrity Migration (Phase 2)
-- ==============================================================================

-- 1. EXTEND DAILY CONSUMPTION SCHEMA
-- Support batch traceability (nullable where historical consumption does not record batch)
-- and recorded user attribution
ALTER TABLE IF EXISTS daily_consumption 
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recorded_by VARCHAR(100);

-- 2. HARDEN CONSTRAINTS ON LOCATION STOCK & BATCHES
-- Ensure stock cannot be negative and reserved quantity cannot exceed total quantity
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_location_stock_non_negative'
    ) THEN
        ALTER TABLE location_stock 
            ADD CONSTRAINT chk_location_stock_non_negative CHECK (quantity >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_location_stock_reserved_bounds'
    ) THEN
        ALTER TABLE location_stock 
            ADD CONSTRAINT chk_location_stock_reserved_bounds 
            CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_transaction_qty_positive'
    ) THEN
        ALTER TABLE inventory_transactions 
            ADD CONSTRAINT chk_transaction_qty_positive CHECK (quantity > 0);
    END IF;
END $$;

-- Expand batch statuses to include EXPIRING alongside ACTIVE, NEAR_EXPIRY, EXPIRED, QUARANTINE
ALTER TABLE inventory_batches 
    DROP CONSTRAINT IF EXISTS inventory_batches_status_check;

ALTER TABLE inventory_batches 
    ADD CONSTRAINT inventory_batches_status_check 
    CHECK (status IN ('ACTIVE', 'NEAR_EXPIRY', 'EXPIRING', 'EXPIRED', 'QUARANTINE'));

-- 3. IMMUTABILITY ENFORCEMENT ON INVENTORY TRANSACTION LEDGER
-- The ledger represents historical physical inventory facts.
-- Direct UPDATE and DELETE operations are strictly forbidden. Corrections require an ADJUSTMENT transaction.
CREATE OR REPLACE FUNCTION fn_prevent_transaction_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DATABASE INTEGRITY VIOLATION: Historical inventory transactions are immutable and cannot be updated or deleted. Use an authorized ADJUSTMENT transaction to correct stock discrepancies.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_inventory_transactions_immutability ON inventory_transactions;

CREATE TRIGGER trg_protect_inventory_transactions_immutability
BEFORE UPDATE OR DELETE ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_transaction_tampering();

-- 4. ATOMIC & CONCURRENCY-SAFE INVENTORY MOVEMENT RPC FUNCTION
-- Single authoritative database transaction for: RECEIVE, TRANSFER, ISSUE, CONSUME, RETURN, WASTAGE, ADJUSTMENT
-- Uses SELECT ... FOR UPDATE row locking to prevent race conditions (e.g. concurrent transfers draining final stock)
CREATE OR REPLACE FUNCTION process_inventory_movement(
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
RETURNS JSONB AS $$
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
BEGIN
    -- 4.1 Validate Quantity
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Transaction quantity must be greater than zero. Received: %', p_quantity;
    END IF;

    -- 4.2 Validate Product
    SELECT name, is_active INTO v_prod_name, v_prod_is_active
    FROM products WHERE id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_PRODUCT: Product with ID % does not exist.', p_product_id;
    END IF;

    IF NOT v_prod_is_active THEN
        RAISE EXCEPTION 'INACTIVE_PRODUCT: Cannot perform movements on inactive product: %.', v_prod_name;
    END IF;

    -- 4.3 Validate Batch and its relationship to the product
    SELECT batch_number, expiry_date, status, (product_id = p_product_id)
    INTO v_batch_number, v_batch_expiry, v_batch_status, v_batch_matches_product
    FROM inventory_batches WHERE id = p_batch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_BATCH: Batch with ID % does not exist.', p_batch_id;
    END IF;

    IF NOT v_batch_matches_product THEN
        RAISE EXCEPTION 'INVALID_BATCH_RELATIONSHIP: Batch % does not belong to product %.', v_batch_number, v_prod_name;
    END IF;

    -- 4.4 Validate Source & Destination Logic
    IF p_type = 'TRANSFER' THEN
        IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_LOCATION: Transfer requires both a source and destination location.';
        END IF;

        IF p_from_location_id = p_to_location_id THEN
            RAISE EXCEPTION 'SAME_LOCATION: Source and destination locations cannot be identical for a transfer.';
        END IF;
    END IF;

    -- 4.5 Validate Source Location & Lock Row for Concurrency Safety
    IF p_from_location_id IS NOT NULL THEN
        SELECT name, is_active INTO v_source_loc_name, v_source_is_active
        FROM hospital_locations WHERE id = p_from_location_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVALID_LOCATION: Source location does not exist.';
        END IF;

        IF NOT v_source_is_active THEN
            RAISE EXCEPTION 'INACTIVE_LOCATION: Source location "%" is inactive. Cannot issue or transfer stock.', v_source_loc_name;
        END IF;

        -- ROW-LEVEL LOCK to prevent concurrency race conditions
        SELECT quantity, reserved_quantity 
        INTO v_source_qty, v_source_reserved
        FROM location_stock
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

        -- 4.6 Expired Stock Safeguard:
        -- Normal clinical issuance or transfer to clinical departments must never use expired stock.
        IF (v_batch_expiry <= CURRENT_DATE OR v_batch_status = 'EXPIRED') AND p_type IN ('ISSUE', 'CONSUME') THEN
            RAISE EXCEPTION 'EXPIRED_STOCK: Batch % expired on %. Clinical issuance or consumption is prohibited.', v_batch_number, v_batch_expiry;
        END IF;

        -- For transfers of expired stock, only allow if destination is Quarantine or disposal/return
        IF (v_batch_expiry <= CURRENT_DATE OR v_batch_status = 'EXPIRED') AND p_type = 'TRANSFER' THEN
            SELECT type INTO v_dest_loc_type FROM hospital_locations WHERE id = p_to_location_id;
            IF v_dest_loc_type NOT IN ('CENTRAL_STORE', 'SPECIALTY_UNIT') AND p_reason NOT ILIKE '%quarantine%' AND p_reason NOT ILIKE '%disposal%' THEN
                RAISE EXCEPTION 'EXPIRED_STOCK: Cannot transfer expired batch % to clinical point of care. Must be routed to quarantine or authorized disposal.', v_batch_number;
            END IF;
        END IF;
    END IF;

    -- 4.7 Validate Destination Location
    IF p_to_location_id IS NOT NULL THEN
        SELECT is_active INTO v_dest_is_active
        FROM hospital_locations WHERE id = p_to_location_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVALID_LOCATION: Destination location does not exist.';
        END IF;

        IF NOT v_dest_is_active THEN
            RAISE EXCEPTION 'INACTIVE_LOCATION: Destination location is inactive. Cannot receive stock.';
        END IF;
    END IF;

    -- 4.8 Execute Atomic Stock Decrement
    IF p_from_location_id IS NOT NULL THEN
        UPDATE location_stock
        SET quantity = quantity - p_quantity,
            last_audited_at = now()
        WHERE product_id = p_product_id 
          AND batch_id = p_batch_id 
          AND location_id = p_from_location_id;
    END IF;

    -- 4.9 Execute Atomic Stock Increment
    IF p_to_location_id IS NOT NULL THEN
        INSERT INTO location_stock (id, product_id, batch_id, location_id, quantity, reserved_quantity, last_audited_at)
        VALUES (uuid_generate_v4(), p_product_id, p_batch_id, p_to_location_id, p_quantity, 0, now())
        ON CONFLICT (product_id, batch_id, location_id)
        DO UPDATE SET 
            quantity = location_stock.quantity + EXCLUDED.quantity,
            last_audited_at = now();
    END IF;

    -- 4.10 Generate Transaction Number and Insert into Immutable Ledger
    v_tx_id := uuid_generate_v4();
    v_tx_number := 'TX-' || TO_CHAR(now(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');

    INSERT INTO inventory_transactions (
        id, transaction_number, timestamp, type,
        product_id, batch_id, from_location_id, to_location_id,
        quantity, performed_by, reason, reference_doc, notes
    ) VALUES (
        v_tx_id, v_tx_number, now(), p_type,
        p_product_id, p_batch_id, p_from_location_id, p_to_location_id,
        p_quantity, p_performed_by, p_reason, p_reference_doc, p_notes
    );

    -- 4.11 If CONSUME, also record in daily_consumption for rolling velocity analytics
    IF p_type = 'CONSUME' AND p_from_location_id IS NOT NULL THEN
        INSERT INTO daily_consumption (id, date, product_id, batch_id, location_id, consumed_units, recorded_by)
        VALUES (uuid_generate_v4(), CURRENT_DATE, p_product_id, p_batch_id, p_from_location_id, p_quantity, p_performed_by)
        ON CONFLICT (date, product_id, location_id)
        DO UPDATE SET consumed_units = daily_consumption.consumed_units + EXCLUDED.consumed_units;
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
$$ LANGUAGE plpgsql;

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Roles: ADMIN, INVENTORY_MANAGER, STOREKEEPER, DEPARTMENT_USER
ALTER TABLE hospital_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_consumption ENABLE ROW LEVEL SECURITY;

-- Helper function to extract user role from JWT auth
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claims', true)::jsonb->>'role',
        current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role',
        'DEPARTMENT_USER'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function to extract authorized location ID from JWT
CREATE OR REPLACE FUNCTION auth_user_location()
RETURNS UUID AS $$
BEGIN
    RETURN (current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'assigned_location_id')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 5.1 Hospital Locations Policies
DROP POLICY IF EXISTS rls_locations_select ON hospital_locations;
CREATE POLICY rls_locations_select ON hospital_locations FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS rls_locations_admin ON hospital_locations;
CREATE POLICY rls_locations_admin ON hospital_locations FOR ALL TO authenticated 
USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER'));

-- 5.2 Product Master Policies (Catalogs are accessible to all clinical staff; editable only by supply chain leads)
DROP POLICY IF EXISTS rls_products_select ON products;
CREATE POLICY rls_products_select ON products FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS rls_products_modify ON products;
CREATE POLICY rls_products_modify ON products FOR ALL TO authenticated 
USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER'));

-- 5.3 Inventory Batches Policies
DROP POLICY IF EXISTS rls_batches_select ON inventory_batches;
CREATE POLICY rls_batches_select ON inventory_batches FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS rls_batches_modify ON inventory_batches;
CREATE POLICY rls_batches_modify ON inventory_batches FOR ALL TO authenticated 
USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'));

-- 5.4 Location Stock Policies
-- Department users can only read their authorized location and Central Store; Managers/Storekeepers can view all
DROP POLICY IF EXISTS rls_location_stock_select ON location_stock;
CREATE POLICY rls_location_stock_select ON location_stock FOR SELECT TO authenticated 
USING (
    auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER') 
    OR location_id = auth_user_location()
    OR location_id IN (SELECT id FROM hospital_locations WHERE type = 'CENTRAL_STORE')
);

-- 5.5 Inventory Transactions Policies
-- All staff can view transaction history for audit compliance; insertions through security definer RPC; UPDATE/DELETE strictly blocked by trigger
DROP POLICY IF EXISTS rls_tx_select ON inventory_transactions;
CREATE POLICY rls_tx_select ON inventory_transactions FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS rls_tx_insert ON inventory_transactions;
CREATE POLICY rls_tx_insert ON inventory_transactions FOR INSERT TO authenticated 
WITH CHECK (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER', 'DEPARTMENT_USER'));

-- 6. HIGH-PERFORMANCE QUERY INDEXES (FEFO, Audit, Expiry, Location Stock)
CREATE INDEX IF NOT EXISTS idx_batches_fefo_active 
    ON inventory_batches (product_id, expiry_date ASC) 
    WHERE status IN ('ACTIVE', 'NEAR_EXPIRY', 'EXPIRING');

CREATE INDEX IF NOT EXISTS idx_location_stock_balance 
    ON location_stock (location_id, product_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_transactions_movement_audit 
    ON inventory_transactions (timestamp DESC, type);

CREATE INDEX IF NOT EXISTS idx_daily_consumption_trend 
    ON daily_consumption (product_id, location_id, date DESC);
