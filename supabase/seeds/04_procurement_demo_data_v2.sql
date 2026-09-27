-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Phase 7/8 Synthetic Procurement Demo Data Seed v2
-- File: supabase/seeds/04_procurement_demo_data_v2.sql
--
-- PURPOSE:
-- Provides deterministic, synthetic procurement demonstration data aligned with
-- the canonical product catalog from 02_canonical_seed_v2.sql and schema
-- migrations 01 through 08.
--
-- PRODUCT MAPPINGS (Canonical):
-- 1. 33333333-3333-3333-3333-333333333301
--    = SCICO Elastic Bandage 10cm x 4.5m (Standard Cost: 38.50)
-- 2. 33333333-3333-3333-3333-333333333302
--    = Plasti-med Disposable Surgical Scalpel #15 (Standard Cost: 14.20)
-- 3. 33333333-3333-3333-3333-333333333303
--    = Sterile Gauze Swabs 10cm x 10cm (Standard Cost: 22.80)
--
-- SAFETY & INTEGRITY:
-- - All supplier demo records have is_synthetic_demo = TRUE.
-- - No real supplier credentials, no Auth users created.
-- - RFC 2606 reserved .example.com email domains used.
-- - Uses ON CONFLICT (id) DO NOTHING for safe, repeatable idempotency.
-- - Foreign keys strictly reference canonical records in 02_canonical_seed_v2.sql.
-- ==============================================================================

-- 1. SYNTHETIC SUPPLIERS
INSERT INTO public.suppliers (
    id, code, name, contact_email, contact_phone, is_synthetic_demo, is_active
)
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

-- 2. SYNTHETIC SUPPLIER PRODUCTS (Lead Times, MOQs & Ordering Pricing)
-- Accurately references canonical products from 02_canonical_seed_v2.sql
INSERT INTO public.supplier_products (
    id, supplier_id, product_id, supplier_sku, lead_time_days, minimum_order_quantity, unit_price, is_preferred
)
VALUES
    (
        'bbbb1111-bbbb-1111-bbbb-111111111101',
        'aaaa1111-aaaa-1111-aaaa-111111111101',
        '33333333-3333-3333-3333-333333333301', -- SCICO Elastic Bandage 10cm x 4.5m
        'SC-EB-10-SUPP',
        7,
        20,
        38.50,
        TRUE
    ),
    (
        'bbbb1111-bbbb-1111-bbbb-111111111102',
        'aaaa1111-aaaa-1111-aaaa-111111111102',
        '33333333-3333-3333-3333-333333333302', -- Plasti-med Disposable Surgical Scalpel #15
        'PM-SCALP-15-SUPP',
        10,
        25,
        14.20,
        TRUE
    ),
    (
        'bbbb1111-bbbb-1111-bbbb-111111111103',
        'aaaa1111-aaaa-1111-aaaa-111111111101',
        '33333333-3333-3333-3333-333333333303', -- Sterile Gauze Swabs 10cm x 10cm
        'SC-GAUZE-10X10-SUPP',
        5,
        10,
        22.80,
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- 3. SYNTHETIC PENDING PURCHASE ORDER (Demonstrates Pending PO Demand Coverage)
-- Destination: Central Supply Depot (11111111-1111-1111-1111-111111111101)
INSERT INTO public.purchase_orders (
    id, po_number, supplier_id, order_date, expected_delivery_date, status, destination_location_id, total_amount, notes
)
VALUES
    (
        'cccc1111-cccc-1111-cccc-111111111101',
        'PO-2026-0042',
        'aaaa1111-aaaa-1111-aaaa-111111111102', -- Plasti-med Healthcare Global
        CURRENT_DATE - 3,
        CURRENT_DATE + 4, -- Expected in 4 days
        'ORDERED',
        '11111111-1111-1111-1111-111111111101', -- Central Supply Depot
        710.00,
        'Scheduled replenishment order for surgical scalpels #15 (Synthetic Demo)'
    )
ON CONFLICT (id) DO NOTHING;

-- 4. SYNTHETIC PURCHASE ORDER ITEMS
-- 50 units of Plasti-med Disposable Surgical Scalpel #15 @ 14.20 = 710.00 (matches PO total_amount)
INSERT INTO public.purchase_order_items (
    id, purchase_order_id, product_id, ordered_quantity, received_quantity, unit_price
)
VALUES
    (
        'dddd1111-dddd-1111-dddd-111111111101',
        'cccc1111-cccc-1111-cccc-111111111101',
        '33333333-3333-3333-3333-333333333302', -- Plasti-med Disposable Surgical Scalpel #15
        50,
        0,
        14.20
    )
ON CONFLICT (id) DO NOTHING;
