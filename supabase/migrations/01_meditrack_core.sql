-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Core PostgreSQL / Supabase Schema Migration (Phase 1)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. HOSPITAL LOCATIONS HIERARCHY
-- Distinguishes between Central Warehouse/Depot and Point-of-Care Clinical Units
CREATE TABLE IF NOT EXISTS hospital_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'CENTRAL_STORE', 
        'CLINICAL_DEPARTMENT', 
        'OPERATING_THEATRE', 
        'INPATIENT_WARD', 
        'SPECIALTY_UNIT'
    )),
    building VARCHAR(50) NOT NULL,
    floor VARCHAR(20) NOT NULL,
    head_of_department VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. PRODUCT MASTER CATEGORIES
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. PRODUCT MASTER (SCICO & Plasti-med Reference Catalogs)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(50) NOT NULL CHECK (brand IN ('SCICO Medical', 'Plasti-med')),
    category_id UUID REFERENCES product_categories(id) ON DELETE RESTRICT,
    specifications JSONB DEFAULT '{}'::jsonb,
    uom VARCHAR(30) NOT NULL, -- e.g. Box, Pack, Canister, Unit, Carton
    units_per_pack INT NOT NULL DEFAULT 1 CHECK (units_per_pack > 0),
    min_safety_stock INT NOT NULL DEFAULT 10 CHECK (min_safety_stock >= 0),
    reorder_point INT NOT NULL DEFAULT 25 CHECK (reorder_point >= min_safety_stock),
    standard_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (standard_cost >= 0),
    is_sterile BOOLEAN DEFAULT FALSE,
    storage_requirements VARCHAR(100) DEFAULT 'Room Temperature (15-25°C)',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. INVENTORY BATCHES (Granular Lot & Expiry Tracking)
CREATE TABLE IF NOT EXISTS inventory_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_number VARCHAR(50) NOT NULL,
    mfg_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    initial_quantity INT NOT NULL CHECK (initial_quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'NEAR_EXPIRY', 'EXPIRED', 'QUARANTINE')),
    sterilization_lot VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_product_batch UNIQUE (product_id, batch_number),
    CONSTRAINT check_batch_dates CHECK (expiry_date > mfg_date)
);

-- 5. LOCATION STOCK (Core Invariant: PRODUCT + BATCH + LOCATION + QUANTITY)
CREATE TABLE IF NOT EXISTS location_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES hospital_locations(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity),
    last_audited_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_product_batch_location UNIQUE (product_id, batch_id, location_id)
);

-- 6. INVENTORY TRANSACTION LEDGER (Immutable Movement Audit Log)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'RECEIVE',      -- Supplier delivery received into Central Store
        'TRANSFER',     -- Movement between locations (e.g. Central Store -> ICU)
        'ISSUE',        -- Issued directly to procedure/floor
        'CONSUME',      -- Used in clinical care
        'RETURN',       -- Unused return to central store
        'WASTAGE',      -- Discarded due to expiry/damage/contamination
        'ADJUSTMENT'    -- Physical inventory cycle count adjustment
    )),
    product_id UUID NOT NULL REFERENCES products(id),
    batch_id UUID NOT NULL REFERENCES inventory_batches(id),
    from_location_id UUID REFERENCES hospital_locations(id),
    to_location_id UUID REFERENCES hospital_locations(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    performed_by VARCHAR(100) NOT NULL,
    reason VARCHAR(255),
    reference_doc VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 7. DAILY CONSUMPTION (For Velocity & Average Daily Usage Calculations)
CREATE TABLE IF NOT EXISTS daily_consumption (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    location_id UUID NOT NULL REFERENCES hospital_locations(id),
    consumed_units INT NOT NULL DEFAULT 0 CHECK (consumed_units >= 0),
    CONSTRAINT unique_daily_consumption UNIQUE (date, product_id, location_id)
);

-- INDEXES FOR HIGH-PERFORMANCE MEDICAL SUPPLY AUDITS
CREATE INDEX IF NOT EXISTS idx_location_stock_product ON location_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_location_stock_location ON location_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_location_stock_batch ON location_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON inventory_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON inventory_transactions(type);
CREATE INDEX IF NOT EXISTS idx_daily_consumption_lookup ON daily_consumption(product_id, location_id, date);
