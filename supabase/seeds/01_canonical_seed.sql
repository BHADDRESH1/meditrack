-- ==============================================================================
-- MEDiTRACK: Canonical Seed Data Script (Phase 5.5)
-- Distinguishes Reference Catalog from Synthetic Demo Operational Data.
-- Preserves canonical EB-2026-001 baseline scenario without destructive alterations.
-- ==============================================================================

-- ==============================================================================
-- 1. REFERENCE CATALOG DATA (Locations, Categories, Products, Variants, Identifiers)
-- ==============================================================================

-- 1.1 HOSPITAL LOCATIONS
INSERT INTO public.hospital_locations (id, name, code, type, description, is_active)
VALUES
    ('11111111-1111-1111-1111-111111111101', 'Central Supply Depot', 'LOC-CS-01', 'CENTRAL_STORE', 'Main logistics receipt and bulk inventory depot', TRUE),
    ('11111111-1111-1111-1111-111111111102', 'Intensive Care Unit Sub-Store', 'LOC-ICU-01', 'DEPARTMENT', 'Floor supply room for ICU critical procedures', TRUE),
    ('11111111-1111-1111-1111-111111111103', 'Emergency & Trauma Department', 'LOC-ED-01', 'DEPARTMENT', 'Rapid-turnover acute trauma inventory', TRUE),
    ('11111111-1111-1111-1111-111111111104', 'Main Operating Theatres', 'LOC-OT-01', 'DEPARTMENT', 'Sterile surgical procedural supply store', TRUE),
    ('11111111-1111-1111-1111-111111111105', 'South Inpatient Ward', 'LOC-SW-01', 'DEPARTMENT', 'General medical-surgical unit floor stock', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 1.2 PRODUCT CATEGORIES
INSERT INTO public.product_categories (id, code, name, description, is_active)
VALUES
    ('22222222-2222-2222-2222-222222222201', 'WOUND_CARE', 'Wound Care & Dressings', 'Sterile bandages, gauze, sponges, and wound closures', TRUE),
    ('22222222-2222-2222-2222-222222222202', 'SURGICAL', 'Surgical Instruments & Blades', 'Sterile scalpels, surgical scissors, clamps, and disposables', TRUE),
    ('22222222-2222-2222-2222-222222222203', 'RESPIRATORY', 'Respiratory & Oxygenation', 'Endotracheal tubes, cannulas, and ventilator circuits', TRUE),
    ('22222222-2222-2222-2222-222222222204', 'IV_ACCESS', 'Vascular Access & Infusion', 'IV catheters, infusion sets, cannulas, and syringes', TRUE),
    ('22222222-2222-2222-2222-222222222205', 'ORTHOPEDIC', 'Orthopedic & Immobilization', 'Plaster bandages, splints, orthopedic supports', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 1.3 PRODUCTS (Core Reference Catalog)
INSERT INTO public.products (
    id, name, sku, category_id, unit, packaging_unit, conversion_factor, brand, catalog_source,
    min_stock_level, max_stock_level, reorder_point, requires_cold_chain, is_active
)
VALUES
    (
        '33333333-3333-3333-3333-333333333301',
        'SCICO Elastic Bandage 10cm x 4.5m',
        'SCICO-EB-10CM',
        '22222222-2222-2222-2222-222222222201',
        'ROLL',
        'BOX_OF_10',
        10,
        'SCICO Medical',
        'SCICO_CATALOG',
        50, 400, 100, FALSE, TRUE
    ),
    (
        '33333333-3333-3333-3333-333333333302',
        'Plasti-med Disposable Surgical Scalpel #15',
        'PM-SCALP-15',
        '22222222-2222-2222-2222-222222222202',
        'PIECE',
        'BOX_OF_50',
        50,
        'Plasti-med',
        'PLASTIMED_CATALOG',
        100, 800, 200, FALSE, TRUE
    ),
    (
        '33333333-3333-3333-3333-333333333303',
        'Sterile Gauze Swabs 10cm x 10cm',
        'GAUZE-10X10',
        '22222222-2222-2222-2222-222222222201',
        'PACK',
        'CASE_OF_20',
        20,
        'SCICO Medical',
        'SCICO_CATALOG',
        80, 500, 150, FALSE, TRUE
    ),
    (
        '33333333-3333-3333-3333-333333333304',
        'Endotracheal Tube Cuffed 7.5mm',
        'ETT-CUFF-75',
        '22222222-2222-2222-2222-222222222203',
        'PIECE',
        'BOX_OF_10',
        10,
        'Plasti-med',
        'PLASTIMED_CATALOG',
        30, 200, 60, FALSE, TRUE
    ),
    (
        '33333333-3333-3333-3333-333333333305',
        'IV Cannula 20G Pink with Injection Port',
        'IV-CAN-20G',
        '22222222-2222-2222-2222-222222222204',
        'PIECE',
        'BOX_OF_50',
        50,
        'SCICO Medical',
        'SCICO_CATALOG',
        150, 1000, 300, FALSE, TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- 1.4 PRODUCT VARIANTS
INSERT INTO public.product_variants (id, product_id, name, variant_code, attributes, unit, is_active)
VALUES
    (
        '44444444-4444-4444-4444-444444444401',
        '33333333-3333-3333-3333-333333333301',
        '10cm x 4.5m Stretched',
        'VAR-EB-10CM',
        '{"width": "10cm", "length": "4.5m", "color": "tan"}'::jsonb,
        'ROLL',
        TRUE
    ),
    (
        '44444444-4444-4444-4444-444444444402',
        '33333333-3333-3333-3333-333333333301',
        '15cm x 4.5m Stretched',
        'VAR-EB-15CM',
        '{"width": "15cm", "length": "4.5m", "color": "tan"}'::jsonb,
        'ROLL',
        TRUE
    ),
    (
        '44444444-4444-4444-4444-444444444403',
        '33333333-3333-3333-3333-333333333302',
        'Blade #15 Stainless Steel',
        'VAR-SCALP-15',
        '{"blade_number": "15", "material": "stainless_steel"}'::jsonb,
        'PIECE',
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

-- 1.5 PRODUCT IDENTIFIERS (Explicitly marked as SKU or SYNTHETIC_DEMO - No false GS1 claims)
INSERT INTO public.product_identifiers (id, identifier_value, normalized_value, identifier_type, product_id, variant_id, is_active)
VALUES
    ('55555555-5555-5555-5555-555555555501', 'SKU-SCICO-EB-10', 'SKU-SCICO-EB-10', 'SKU', '33333333-3333-3333-3333-333333333301', '44444444-4444-4444-4444-444444444401', TRUE),
    ('55555555-5555-5555-5555-555555555502', 'DEMO-SCICO-EB-001', 'DEMO-SCICO-EB-001', 'SYNTHETIC_DEMO', '33333333-3333-3333-3333-333333333301', '44444444-4444-4444-4444-444444444401', TRUE),
    ('55555555-5555-5555-5555-555555555503', 'SKU-PLASTIMED-15', 'SKU-PLASTIMED-15', 'SKU', '33333333-3333-3333-3333-333333333302', '44444444-4444-4444-4444-444444444403', TRUE),
    ('55555555-5555-5555-5555-555555555504', 'DEMO-PLASTIMED-SLB-15', 'DEMO-PLASTIMED-SLB-15', 'SYNTHETIC_DEMO', '33333333-3333-3333-3333-333333333302', '44444444-4444-4444-4444-444444444403', TRUE)
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- 2. SYNTHETIC DEMO OPERATIONAL DATA (Canonical Scenario: EB-2026-001)
-- ==============================================================================

-- 2.1 INVENTORY BATCHES (Canonical EB-2026-001 with 45 days to expiry)
INSERT INTO public.inventory_batches (
    id, product_id, variant_id, batch_number, mfg_date, expiry_date,
    initial_quantity, current_quantity, status, supplier, delivery_note, received_at
)
VALUES
    (
        '66666666-6666-6666-6666-666666666601',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        'EB-2026-001',
        CURRENT_DATE - INTERVAL '180 days',
        CURRENT_DATE + INTERVAL '45 days',
        300,
        290,
        'NEAR_EXPIRY',
        'SCICO Medical Supplies Ltd',
        'DN-2026-0189',
        CURRENT_TIMESTAMP - INTERVAL '170 days'
    ),
    (
        '66666666-6666-6666-6666-666666666602',
        '33333333-3333-3333-3333-333333333302',
        '44444444-4444-4444-4444-444444444403',
        'PM-2026-044',
        CURRENT_DATE - INTERVAL '90 days',
        CURRENT_DATE + INTERVAL '300 days',
        200,
        185,
        'ACTIVE',
        'Plasti-med Surgical Equipment',
        'DN-2026-0210',
        CURRENT_TIMESTAMP - INTERVAL '80 days'
    )
ON CONFLICT (id) DO NOTHING;

-- 2.2 LOCATION STOCK (Canonical: Central Store = 240, ICU = 30, Emergency = 20, Total = 290)
INSERT INTO public.location_stock (
    id, product_id, variant_id, batch_id, location_id, quantity, reserved_quantity, last_audited_at
)
VALUES
    (
        '77777777-7777-7777-7777-777777777701',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101', -- Central Store
        240,
        0,
        CURRENT_TIMESTAMP
    ),
    (
        '77777777-7777-7777-7777-777777777702',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111102', -- ICU
        30,
        0,
        CURRENT_TIMESTAMP
    ),
    (
        '77777777-7777-7777-7777-777777777703',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111103', -- Emergency
        20,
        0,
        CURRENT_TIMESTAMP
    ),
    (
        '77777777-7777-7777-7777-777777777704',
        '33333333-3333-3333-3333-333333333302',
        '44444444-4444-4444-4444-444444444403',
        '66666666-6666-6666-6666-666666666602',
        '11111111-1111-1111-1111-111111111101', -- Central Store
        185,
        0,
        CURRENT_TIMESTAMP
    )
ON CONFLICT (id) DO NOTHING;

-- 2.3 DAILY CONSUMPTION (Canonical ADU = 3.4 for SCICO Elastic Bandage in Central Store)
INSERT INTO public.daily_consumption (id, date, product_id, location_id, consumed_units)
VALUES
    ('88888888-8888-8888-8888-888888888801', CURRENT_DATE - 1, '33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111101', 3),
    ('88888888-8888-8888-8888-888888888802', CURRENT_DATE - 2, '33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111101', 4),
    ('88888888-8888-8888-8888-888888888803', CURRENT_DATE - 3, '33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111101', 3),
    ('88888888-8888-8888-8888-888888888804', CURRENT_DATE - 4, '33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111101', 4)
ON CONFLICT (id) DO NOTHING;

-- 2.4 INVENTORY TRANSACTIONS (Auditable Baseline Movement Ledger)
INSERT INTO public.inventory_transactions (
    id, transaction_number, timestamp, type, product_id, variant_id, batch_id,
    from_location_id, to_location_id, quantity, performed_by, reason, reference_doc
)
VALUES
    (
        '99999999-9999-9999-9999-999999999901',
        'TX-2026-00001',
        CURRENT_TIMESTAMP - INTERVAL '170 days',
        'RECEIVE',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        NULL,
        '11111111-1111-1111-1111-111111111101',
        300,
        'James Sterling (Storekeeper)',
        'Initial bulk delivery receipt from supplier',
        'DN-2026-0189'
    ),
    (
        '99999999-9999-9999-9999-999999999902',
        'TX-2026-00002',
        CURRENT_TIMESTAMP - INTERVAL '30 days',
        'TRANSFER',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        '11111111-1111-1111-1111-111111111102',
        40,
        'Sarah Jenkins (Manager)',
        'Routine floor stock replenishment to ICU',
        'TR-2026-0081'
    ),
    (
        '99999999-9999-9999-9999-999999999903',
        'TX-2026-00003',
        CURRENT_TIMESTAMP - INTERVAL '20 days',
        'TRANSFER',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        '11111111-1111-1111-1111-111111111103',
        20,
        'Sarah Jenkins (Manager)',
        'Emergency trauma stock staging',
        'TR-2026-0094'
    ),
    (
        '99999999-9999-9999-9999-999999999904',
        'TX-2026-00004',
        CURRENT_TIMESTAMP - INTERVAL '10 days',
        'CONSUME',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111102',
        NULL,
        10,
        'Dr. Elena Rostova (ICU Nurse)',
        'Bedside patient compression bandaging',
        'MRN-88402'
    )
ON CONFLICT (id) DO NOTHING;
