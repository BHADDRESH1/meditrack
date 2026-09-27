-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Phase 7: Smart Procurement & Replenishment Planning Schema
-- ==============================================================================

-- 1. SUPPLIERS MASTER TABLE
-- Dedicated entity for supply-chain vendors. All demonstration entries must be
-- explicitly marked with is_synthetic_demo = TRUE.
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    contact_email VARCHAR(100),
    contact_phone VARCHAR(50),
    is_synthetic_demo BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SUPPLIER PRODUCTS TABLE (Vendor Catalog & Lead Times)
-- References existing products(id) and product_variants(id) without duplicating Product Master.
CREATE TABLE IF NOT EXISTS public.supplier_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    supplier_sku VARCHAR(100),
    lead_time_days INT NOT NULL DEFAULT 7 CHECK (lead_time_days > 0),
    minimum_order_quantity INT NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_supplier_product_variant UNIQUE (supplier_id, product_id, variant_id)
);

-- 3. PURCHASE ORDERS (Pending & Historical Vendor Orders)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ORDERED' CHECK (status IN (
        'ORDERED',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'CANCELLED'
    )),
    destination_location_id UUID REFERENCES public.hospital_locations(id) ON DELETE RESTRICT,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. PURCHASE ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    ordered_quantity INT NOT NULL CHECK (ordered_quantity > 0),
    received_quantity INT NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= ordered_quantity),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. PURCHASE REQUESTS (Internal Clinical & Supply Planning Artifacts)
-- Separate from supplier POs. Internal authorization workflow: DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED / REJECTED
CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'REJECTED'
    )),
    requested_location_id UUID REFERENCES public.hospital_locations(id) ON DELETE SET NULL,
    justification TEXT NOT NULL,
    recommended_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    estimated_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_cost >= 0),
    requested_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    requested_by_name VARCHAR(150) NOT NULL,
    reviewed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. PURCHASE REQUEST ITEMS
CREATE TABLE IF NOT EXISTS public.purchase_request_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_request_id UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    requested_quantity INT NOT NULL CHECK (requested_quantity > 0),
    estimated_unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_unit_cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_supplier_products_lookup 
    ON public.supplier_products (product_id, is_preferred);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status 
    ON public.purchase_orders (status, expected_delivery_date);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product 
    ON public.purchase_order_items (product_id);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status 
    ON public.purchase_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request 
    ON public.purchase_request_items (purchase_request_id, product_id);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;

-- 8.1 Suppliers & Supplier Products Policies (Read all, write Admin/Manager)
CREATE POLICY rls_suppliers_select ON public.suppliers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY rls_suppliers_admin ON public.suppliers FOR ALL TO authenticated 
    USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER'));

CREATE POLICY rls_supplier_products_select ON public.supplier_products FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY rls_supplier_products_admin ON public.supplier_products FOR ALL TO authenticated 
    USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER'));

-- 8.2 Purchase Orders Policies (Read all, manage Admin/Manager/Storekeeper)
CREATE POLICY rls_purchase_orders_select ON public.purchase_orders FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY rls_purchase_orders_manage ON public.purchase_orders FOR ALL TO authenticated 
    USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'));

CREATE POLICY rls_po_items_select ON public.purchase_order_items FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY rls_po_items_manage ON public.purchase_order_items FOR ALL TO authenticated 
    USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER'));

-- 8.3 Purchase Requests Policies (Read all, create by staff, review Admin/Manager)
CREATE POLICY rls_purchase_requests_select ON public.purchase_requests FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY rls_purchase_requests_insert ON public.purchase_requests FOR INSERT TO authenticated 
    WITH CHECK (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER', 'DEPARTMENT_USER'));

CREATE POLICY rls_purchase_requests_update ON public.purchase_requests FOR UPDATE TO authenticated 
    USING (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER'))
    WITH CHECK (auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER'));

CREATE POLICY rls_pr_items_select ON public.purchase_request_items FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY rls_pr_items_insert ON public.purchase_request_items FOR INSERT TO authenticated WITH CHECK (TRUE);

-- 9. AUDIT & STATUS FUNCTION FOR PURCHASE REQUESTS
CREATE OR REPLACE FUNCTION process_purchase_request_review(
    p_request_id UUID,
    p_new_status VARCHAR(30),
    p_reviewed_by UUID,
    p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_req RECORD;
BEGIN
    IF p_new_status NOT IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Status must be DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, or REJECTED.';
    END IF;

    SELECT * INTO v_req FROM public.purchase_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Purchase request % not found.', p_request_id;
    END IF;

    UPDATE public.purchase_requests
    SET status = p_new_status,
        reviewed_by = p_reviewed_by,
        reviewed_at = now(),
        review_notes = COALESCE(p_review_notes, review_notes),
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'request_id', p_request_id,
        'previous_status', v_req.status,
        'new_status', p_new_status,
        'reviewed_at', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
