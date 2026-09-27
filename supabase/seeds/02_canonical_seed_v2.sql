-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Canonical Core Seed Script v2 (Phase 8 Production Schema Aligned)
-- File: supabase/seeds/02_canonical_seed_v2.sql
--
-- PURPOSE:
-- Provides deterministic, production-safe reference catalog and canonical
-- operational demo data for the actual database schema established by
-- migrations 01 through 08.
--
-- IMPORTANT NOTICES:
-- 1. DEMO & TEST SEEDING ONLY — This script contains synthetic demonstration
--    data for the St. Jude Academic Medical Center baseline scenario (EB-2026-001).
--    It is NOT a database migration and contains NO real patient data (PHI).
-- 2. NON-DESTRUCTIVE & IDEMPOTENT — Uses ON CONFLICT (id) DO NOTHING to allow
--    safe, repeatable execution without overwriting or deleting active data.
-- 3. SCHEMA COMPLIANT — Matches the exact column names, constraints, and enums
--    defined in migrations 01–08.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HOSPITAL LOCATIONS HIERARCHY (Migration 01 schema)
-- Valid types: CENTRAL_STORE, CLINICAL_DEPARTMENT, OPERATING_THEATRE,
--              INPATIENT_WARD, SPECIALTY_UNIT
-- ------------------------------------------------------------------------------
INSERT INTO public.hospital_locations (
    id, code, name, type, building, floor, head_of_department, is_active, created_at
)
VALUES
    (
        '11111111-1111-1111-1111-111111111101',
        'LOC-CS-01',
        'Central Supply Depot',
        'CENTRAL_STORE',
        'Main Logistics Building',
        'Ground Floor',
        'James Sterling (Lead Storekeeper)',
        TRUE,
        now()
    ),
    (
        '11111111-1111-1111-1111-111111111102',
        'LOC-ICU-01',
        'Intensive Care Unit Sub-Store',
        'CLINICAL_DEPARTMENT',
        'Critical Care Wing',
        'Level 2',
        'Dr. Elena Rostova (ICU Nurse Lead)',
        TRUE,
        now()
    ),
    (
        '11111111-1111-1111-1111-111111111103',
        'LOC-ED-01',
        'Emergency & Trauma Department',
        'CLINICAL_DEPARTMENT',
        'Acute Care Pavilion',
        'Ground Floor',
        'Dr. Marcus Brody (ED Medical Director)',
        TRUE,
        now()
    ),
    (
        '11111111-1111-1111-1111-111111111104',
        'LOC-OT-01',
        'Main Operating Theatres',
        'OPERATING_THEATRE',
        'Surgical Tower',
        'Level 3',
        'Sarah Jenkins (Surgical Inventory Lead)',
        TRUE,
        now()
    ),
    (
        '11111111-1111-1111-1111-111111111105',
        'LOC-SW-01',
        'South Inpatient Ward',
        'INPATIENT_WARD',
        'South Ward Block',
        'Level 4',
        'Clinical Nursing Supervisor',
        TRUE,
        now()
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 2. PRODUCT MASTER CATEGORIES (Migration 01 schema)
-- Columns: id, name, description, created_at
-- ------------------------------------------------------------------------------
INSERT INTO public.product_categories (id, name, description, created_at)
VALUES
    (
        '22222222-2222-2222-2222-222222222201',
        'Wound Care & Dressings',
        'Sterile bandages, elastic wraps, compression dressings, and gauze sponges',
        now()
    ),
    (
        '22222222-2222-2222-2222-222222222202',
        'Surgical Instruments & Blades',
        'Precision surgical scalpels, disposable blades, surgical scissors, and drapes',
        now()
    ),
    (
        '22222222-2222-2222-2222-222222222203',
        'Respiratory & Oxygenation',
        'Endotracheal tubes, suction liners, ventilator circuits, and cannulas',
        now()
    ),
    (
        '22222222-2222-2222-2222-222222222204',
        'Vascular Access & Infusion',
        'IV catheters, winged infusion sets, cannulas, and syringe accessories',
        now()
    ),
    (
        '22222222-2222-2222-2222-222222222205',
        'Orthopedic & Immobilization',
        'Plaster bandages, orthopedic cast padding, splints, and joint supports',
        now()
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 3. PRODUCT MASTER (Migrations 01 & 04 schema)
-- Valid brand values: 'SCICO Medical', 'Plasti-med'
-- Valid catalog_source values: 'SCICO_MEDICAL', 'PLASTI_MED', 'MANUAL'
-- ------------------------------------------------------------------------------
INSERT INTO public.products (
    id, sku, product_code, name, brand, category_id, catalog_source, description,
    specifications, uom, units_per_pack, min_safety_stock, reorder_point,
    standard_cost, is_sterile, storage_requirements, is_active, created_at, updated_at
)
VALUES
    (
        '33333333-3333-3333-3333-333333333301',
        'SCICO-EB-10CM',
        'SCICO-EB-10CM',
        'SCICO Elastic Bandage 10cm x 4.5m',
        'SCICO Medical',
        '22222222-2222-2222-2222-222222222201',
        'SCICO_MEDICAL',
        'High-compression woven elastic bandage with sustained elasticity for clinical support and wound dressing stabilization.',
        '{"width": "10cm", "stretched_length": "4.5m", "composition": "Woven Cotton / Elastomer", "latex_free": true}'::jsonb,
        'Box',
        10,
        50,
        100,
        38.50,
        FALSE,
        'Room Temperature (15-25°C)',
        TRUE,
        now(),
        now()
    ),
    (
        '33333333-3333-3333-3333-333333333302',
        'PM-SCALP-15',
        'PM-SCALP-15',
        'Plasti-med Disposable Surgical Scalpel #15',
        'Plasti-med',
        '22222222-2222-2222-2222-222222222202',
        'PLASTI_MED',
        'Sterile disposable surgical scalpel with high-grade stainless steel blade #15 and calibrated ergonomic handle.',
        '{"blade_number": "15", "material": "Surgical Stainless Steel", "handle": "Graduated Polystyrene", "gamma_sterilized": true}'::jsonb,
        'Box',
        50,
        100,
        200,
        14.20,
        TRUE,
        'Dry Clean Storage (10-30°C)',
        TRUE,
        now(),
        now()
    ),
    (
        '33333333-3333-3333-3333-333333333303',
        'GAUZE-10X10',
        'GAUZE-10X10',
        'Sterile Gauze Swabs 10cm x 10cm',
        'SCICO Medical',
        '22222222-2222-2222-2222-222222222201',
        'SCICO_MEDICAL',
        '100% pure cotton surgical gauze swabs, 12-ply, sterile packaged with folded edges to prevent fraying.',
        '{"dimensions": "10cm x 10cm", "ply": 12, "radiopaque_thread": true, "absorbency": "High"}'::jsonb,
        'Case',
        20,
        80,
        150,
        22.80,
        TRUE,
        'Room Temperature (15-25°C)',
        TRUE,
        now(),
        now()
    ),
    (
        '33333333-3333-3333-3333-333333333304',
        'ETT-CUFF-75',
        'ETT-CUFF-75',
        'Endotracheal Tube Cuffed 7.5mm',
        'Plasti-med',
        '22222222-2222-2222-2222-222222222203',
        'PLASTI_MED',
        'Medical-grade thermo-sensitive PVC endotracheal tube with high-volume low-pressure cuff and radiopaque Murphy eye.',
        '{"internal_diameter": "7.5mm", "cuff_type": "High-Volume Low-Pressure", "valve": "Luer-lock", "atraumatic_tip": true}'::jsonb,
        'Box',
        10,
        30,
        60,
        45.00,
        TRUE,
        'Cool Dry Storage (15-25°C)',
        TRUE,
        now(),
        now()
    ),
    (
        '33333333-3333-3333-3333-333333333305',
        'IV-CAN-20G',
        'IV-CAN-20G',
        'IV Cannula 20G Pink with Injection Port',
        'SCICO Medical',
        '22222222-2222-2222-2222-222222222204',
        'SCICO_MEDICAL',
        'Sterile FEP radiopaque peripheral IV catheter with color-coded back-cut needle and injection port.',
        '{"gauge": "20G", "length": "32mm", "color_code": "Pink", "flow_rate": "60 ml/min"}'::jsonb,
        'Box',
        50,
        150,
        300,
        18.50,
        TRUE,
        'Room Temperature (15-25°C)',
        TRUE,
        now(),
        now()
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 4. PRODUCT VARIANTS (Migration 04 schema)
-- Columns: id, product_id, variant_name, size, capacity, material,
--          specifications, packaging, is_active, created_at, updated_at
-- ------------------------------------------------------------------------------
INSERT INTO public.product_variants (
    id, product_id, variant_name, size, capacity, material, specifications,
    packaging, is_active, created_at, updated_at
)
VALUES
    (
        '44444444-4444-4444-4444-444444444401',
        '33333333-3333-3333-3333-333333333301',
        '10cm x 4.5m Stretched',
        '10cm x 4.5m',
        NULL,
        'Woven Cotton Elastic',
        '{"width": "10cm", "length": "4.5m", "color": "tan"}'::jsonb,
        'Box of 10 Rolls',
        TRUE,
        now(),
        now()
    ),
    (
        '44444444-4444-4444-4444-444444444402',
        '33333333-3333-3333-3333-333333333301',
        '15cm x 4.5m Stretched',
        '15cm x 4.5m',
        NULL,
        'Woven Cotton Elastic',
        '{"width": "15cm", "length": "4.5m", "color": "tan"}'::jsonb,
        'Box of 10 Rolls',
        TRUE,
        now(),
        now()
    ),
    (
        '44444444-4444-4444-4444-444444444403',
        '33333333-3333-3333-3333-333333333302',
        'Blade #15 Stainless Steel',
        '#15',
        NULL,
        'Medical Grade Stainless Steel',
        '{"blade_number": "15", "material": "stainless_steel"}'::jsonb,
        'Box of 50 Pieces',
        TRUE,
        now(),
        now()
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 5. PRODUCT IDENTIFIERS (Migration 05 schema)
-- Valid identifier_type values: 'SKU', 'PRODUCT_CODE', 'BARCODE', 'QR'
-- Explicit synthetic demo tagging: is_synthetic_demo = TRUE
-- ------------------------------------------------------------------------------
INSERT INTO public.product_identifiers (
    id, identifier_value, normalized_value, identifier_type,
    product_id, variant_id, is_active, is_synthetic_demo, created_at, updated_at
)
VALUES
    -- Canonical SKU Identifiers
    (
        '55555555-5555-5555-5555-555555555501',
        'SKU-SCICO-EB-10',
        'SKU-SCICO-EB-10',
        'SKU',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        TRUE,
        FALSE,
        now(),
        now()
    ),
    -- Synthetic Demo Barcode for Elastic Bandage (matches scanner test suite)
    (
        '55555555-5555-5555-5555-555555555502',
        'DEMO-SCICO-EB-001',
        'DEMO-SCICO-EB-001',
        'BARCODE',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        TRUE,
        TRUE,
        now(),
        now()
    ),
    -- Standard EAN-13 Synthetic Barcode (tested in phase8 hardening suite)
    (
        '55555555-5555-5555-5555-555555555505',
        '8901234567890',
        '8901234567890',
        'BARCODE',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        TRUE,
        TRUE,
        now(),
        now()
    ),
    -- Scalpel SKU
    (
        '55555555-5555-5555-5555-555555555503',
        'SKU-PLASTIMED-15',
        'SKU-PLASTIMED-15',
        'SKU',
        '33333333-3333-3333-3333-333333333302',
        '44444444-4444-4444-4444-444444444403',
        TRUE,
        FALSE,
        now(),
        now()
    ),
    -- Scalpel Demo Barcode
    (
        '55555555-5555-5555-5555-555555555504',
        'DEMO-PLASTIMED-SLB-15',
        'DEMO-PLASTIMED-SLB-15',
        'BARCODE',
        '33333333-3333-3333-3333-333333333302',
        '44444444-4444-4444-4444-444444444403',
        TRUE,
        TRUE,
        now(),
        now()
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 6. INVENTORY BATCHES (Migrations 01, 02 & 05 schema)
-- Columns: id, product_id, variant_id, batch_number, mfg_date, expiry_date,
--          initial_quantity, status, supplier, delivery_note, sterilization_lot, created_at
-- Note: Batch balances are tracked per-location in location_stock.quantity.
-- ------------------------------------------------------------------------------
INSERT INTO public.inventory_batches (
    id, product_id, variant_id, batch_number, mfg_date, expiry_date,
    initial_quantity, status, supplier, delivery_note, sterilization_lot, created_at
)
VALUES
    -- Canonical EB-2026-001 (45 days to expiry, 300 units initial, 290 remaining across locations)
    (
        '66666666-6666-6666-6666-666666666601',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        'EB-2026-001',
        CURRENT_DATE - INTERVAL '180 days',
        CURRENT_DATE + INTERVAL '45 days',
        300,
        'NEAR_EXPIRY',
        'SCICO Medical Supplies Ltd',
        'DN-2026-0189',
        'STER-2026-EB01',
        now() - INTERVAL '170 days'
    ),
    -- Scalpel Batch PM-2026-044 (Active stock, 300 days to expiry)
    (
        '66666666-6666-6666-6666-666666666602',
        '33333333-3333-3333-3333-333333333302',
        '44444444-4444-4444-4444-444444444403',
        'PM-2026-044',
        CURRENT_DATE - INTERVAL '90 days',
        CURRENT_DATE + INTERVAL '300 days',
        200,
        'ACTIVE',
        'Plasti-med Surgical Equipment',
        'DN-2026-0210',
        'EO-2026-PM044',
        now() - INTERVAL '80 days'
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 7. LOCATION STOCK (Migrations 01, 02 & 05 schema)
-- Phase 8 Verified Canonical Distribution:
-- Central Store: 240
-- ICU Sub-Store: 30
-- Emergency Dept: 20
-- Total: 290 units of EB-2026-001
-- ------------------------------------------------------------------------------
INSERT INTO public.location_stock (
    id, product_id, variant_id, batch_id, location_id,
    quantity, reserved_quantity, last_audited_at
)
VALUES
    -- Central Supply Depot: 240 units
    (
        '77777777-7777-7777-7777-777777777701',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        240,
        0,
        now()
    ),
    -- Intensive Care Unit: 30 units
    (
        '77777777-7777-7777-7777-777777777702',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111102',
        30,
        0,
        now()
    ),
    -- Emergency & Trauma: 20 units
    (
        '77777777-7777-7777-7777-777777777703',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111103',
        20,
        0,
        now()
    ),
    -- Central Supply Depot: 185 Scalpels
    (
        '77777777-7777-7777-7777-777777777704',
        '33333333-3333-3333-3333-333333333302',
        '44444444-4444-4444-4444-444444444403',
        '66666666-6666-6666-6666-666666666602',
        '11111111-1111-1111-1111-111111111101',
        185,
        0,
        now()
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 8. DAILY CONSUMPTION (Migrations 01 & 02 schema)
-- Canonical consumption history: ADU = 3.4 for SCICO Elastic Bandage in Central Store
-- ------------------------------------------------------------------------------
INSERT INTO public.daily_consumption (
    id, date, product_id, batch_id, location_id, consumed_units, recorded_by
)
VALUES
    (
        '88888888-8888-8888-8888-888888888801',
        CURRENT_DATE - 1,
        '33333333-3333-3333-3333-333333333301',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        3,
        'Clinical Logistics Automated Feed'
    ),
    (
        '88888888-8888-8888-8888-888888888802',
        CURRENT_DATE - 2,
        '33333333-3333-3333-3333-333333333301',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        4,
        'Clinical Logistics Automated Feed'
    ),
    (
        '88888888-8888-8888-8888-888888888803',
        CURRENT_DATE - 3,
        '33333333-3333-3333-3333-333333333301',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        3,
        'Clinical Logistics Automated Feed'
    ),
    (
        '88888888-8888-8888-8888-888888888804',
        CURRENT_DATE - 4,
        '33333333-3333-3333-3333-333333333301',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        4,
        'Clinical Logistics Automated Feed'
    ),
    -- Historical clinical bedside consumption in ICU (10 units consumed)
    (
        '88888888-8888-8888-8888-888888888805',
        CURRENT_DATE - 10,
        '33333333-3333-3333-3333-333333333301',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111102',
        10,
        'Dr. Elena Rostova (ICU Nurse)'
    )
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 9. INVENTORY TRANSACTION LEDGER (Migrations 01, 02 & 05 schema)
-- Immutable baseline audit ledger accounting for initial 300 units received,
-- transfers to ICU (40) and ED (20), and ICU consumption (10).
-- Remaining balances: Central (240) + ICU (30) + ED (20) = 290 units.
-- ------------------------------------------------------------------------------
INSERT INTO public.inventory_transactions (
    id, transaction_number, timestamp, type, product_id, variant_id, batch_id,
    from_location_id, to_location_id, quantity, performed_by, reason, reference_doc, notes
)
VALUES
    -- Initial bulk delivery receipt into Central Supply Depot
    (
        '99999999-9999-9999-9999-999999999901',
        'TX-2026-00001',
        now() - INTERVAL '170 days',
        'RECEIVE',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        NULL,
        '11111111-1111-1111-1111-111111111101',
        300,
        'James Sterling (Storekeeper)',
        'Initial bulk delivery receipt from supplier',
        'DN-2026-0189',
        'Vendor carton inspection completed; zero transit damage detected.'
    ),
    -- Stock replenishment transfer from Central Supply to ICU
    (
        '99999999-9999-9999-9999-999999999902',
        'TX-2026-00002',
        now() - INTERVAL '30 days',
        'TRANSFER',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        '11111111-1111-1111-1111-111111111102',
        40,
        'Sarah Jenkins (Manager)',
        'Routine floor stock replenishment to ICU',
        'TR-2026-0081',
        'Internal dispatch transfer for critical care bed staging.'
    ),
    -- Stock staging transfer from Central Supply to Emergency & Trauma
    (
        '99999999-9999-9999-9999-999999999903',
        'TX-2026-00003',
        now() - INTERVAL '20 days',
        'TRANSFER',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101',
        '11111111-1111-1111-1111-111111111103',
        20,
        'Sarah Jenkins (Manager)',
        'Emergency trauma stock staging',
        'TR-2026-0094',
        'Disaster readiness safety stock buffer staging.'
    ),
    -- Bedside clinical consumption in ICU (Leaves 40 - 10 = 30 in ICU)
    (
        '99999999-9999-9999-9999-999999999904',
        'TX-2026-00004',
        now() - INTERVAL '10 days',
        'CONSUME',
        '33333333-3333-3333-3333-333333333301',
        '44444444-4444-4444-4444-444444444401',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111102',
        NULL,
        10,
        'Dr. Elena Rostova (ICU Nurse)',
        'Bedside patient compression bandaging',
        'MRN-88402',
        'Post-operative limb edema compression bandaging protocol.'
    )
ON CONFLICT (id) DO NOTHING;
