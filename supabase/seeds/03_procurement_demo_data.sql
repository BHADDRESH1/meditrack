-- ==============================================================================
-- MEDiTRACK: Phase 7 Synthetic Procurement Demo Data Seed
-- Isolated from core schema migration 07_meditrack_procurement.sql.
-- ALL VENDOR DATA IN THIS FILE IS SYNTHETIC/DEMONSTRATION AND DOES NOT
-- IMPLY ANY COMMERCIAL CONTRACT OR RELATIONSHIP.
-- ==============================================================================

-- 1. SYNTHETIC SUPPLIERS
INSERT INTO public.suppliers (id, code, name, contact_email, contact_phone, is_synthetic_demo, is_active)
VALUES
    (
        'aaaa1111-aaaa-1111-aaaa-111111111101',
        'DEMO-SUPP-SCICO',
        'SCICO Medical Supplies Ltd (Synthetic Demo Partner)',
        'orders-demo@scico-medical.example.com',
        '+1-800-555-0191',
        TRUE,
        TRUE
    ),
    (
        'aaaa1111-aaaa-1111-aaaa-111111111102',
        'DEMO-SUPP-PLASTIMED',
        'Plasti-med Healthcare Global (Synthetic Demo Partner)',
        'supply-demo@plastimed-global.example.com',
        '+1-800-555-0192',
        TRUE,
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- 2. SYNTHETIC SUPPLIER PRODUCTS (Lead Times & Ordering MOQ)
-- References canonical products from 01_canonical_seed.sql
INSERT INTO public.supplier_products (
    id, supplier_id, product_id, supplier_sku, lead_time_days, minimum_order_quantity, unit_price, is_preferred
)
VALUES
    (
        'bbbb1111-bbbb-1111-bbbb-111111111101',
        'aaaa1111-aaaa-1111-aaaa-111111111101',
        '33333333-3333-3333-3333-333333333301', -- SCICO Elastic Bandage Heavy Duty
        'SC-EAB-75-SUPP',
        7,
        20,
        38.50,
        TRUE
    ),
    (
        'bbbb1111-bbbb-1111-bbbb-111111111102',
        'aaaa1111-aaaa-1111-aaaa-111111111102',
        '33333333-3333-3333-3333-333333333302', -- Plasti-med Suction Liner 1.5L
        'PM-SL-1500-SUPP',
        10,
        25,
        14.20,
        TRUE
    ),
    (
        'bbbb1111-bbbb-1111-bbbb-111111111103',
        'aaaa1111-aaaa-1111-aaaa-111111111101',
        '33333333-3333-3333-3333-333333333303', -- Scico-Fix Retention Tape
        'SC-RET-50-SUPP',
        5,
        10,
        22.80,
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- 3. SYNTHETIC PENDING PURCHASE ORDER (Demonstrates Pending PO Demand Coverage)
INSERT INTO public.purchase_orders (
    id, po_number, supplier_id, order_date, expected_delivery_date, status, destination_location_id, total_amount, notes
)
VALUES
    (
        'cccc1111-cccc-1111-cccc-111111111101',
        'PO-2026-0042',
        'aaaa1111-aaaa-1111-aaaa-111111111102', -- Plasti-med
        CURRENT_DATE - 3,
        CURRENT_DATE + 4, -- Expected in 4 days
        'ORDERED',
        '11111111-1111-1111-1111-111111111101', -- Central Store
        710.00,
        'Scheduled replenishment order for suction liners (Synthetic Demo)'
    )
ON CONFLICT (id) DO NOTHING;

-- Line item for pending PO: 50 units of Suction Liner 1.5L
INSERT INTO public.purchase_order_items (
    id, purchase_order_id, product_id, ordered_quantity, received_quantity, unit_price
)
VALUES
    (
        'dddd1111-dddd-1111-dddd-111111111101',
        'cccc1111-cccc-1111-cccc-111111111101',
        '33333333-3333-3333-3333-333333333302', -- Suction Liner 1.5L
        50,
        0,
        14.20
    )
ON CONFLICT (id) DO NOTHING;
