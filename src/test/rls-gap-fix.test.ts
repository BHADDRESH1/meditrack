import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { INITIAL_USERS } from '@/services/authService';
import { hasPermission, canAccessLocation } from '@/services/permissions';
import { productIdentifierService } from '@/services/productIdentifierService';
import { productMasterService } from '@/services/productMasterService';
import { inventoryRepo } from '@/services/inventoryRepository';
import { setDataMode } from '@/services/supabaseClient';

describe('Phase 8: RLS Policy Gap Remediation & Security Hardening (Migration 08)', () => {
  const adminUser = INITIAL_USERS.find(u => u.role === 'ADMIN')!;
  const managerUser = INITIAL_USERS.find(u => u.role === 'INVENTORY_MANAGER')!;
  const storekeeperUser = INITIAL_USERS.find(u => u.role === 'STOREKEEPER')!;
  const icuUser = INITIAL_USERS.find(u => u.email === 'icu.nurse@stjude.org')!;
  const edUser = INITIAL_USERS.find(u => u.email === 'emergency@stjude.org')!;

  beforeEach(() => {
    setDataMode('DEMO');
    inventoryRepo.resetToCanonicalSeed();
    productIdentifierService.resetToCanonicalSeed();
  });

  // ============================================================================
  // A. PRODUCT IDENTIFIERS RLS & PERMISSIONS
  // ============================================================================
  describe('A. product_identifiers RLS & Access Control', () => {
    it('1. allows authenticated users across all roles to resolve/scan product identifiers', () => {
      // Barcode lookup resolution at point of care / warehouse
      const resolved = productIdentifierService.resolveIdentifier('DEMO-SCICO-EB-001');
      expect(resolved.success).toBe(true);
      expect(resolved.product).toBeDefined();
      expect(resolved.product?.sku).toBe('SC-EAB-75');
    });

    it('2. permits ADMIN to write/register new product identifiers', () => {
      const res = productIdentifierService.registerIdentifier({
        identifierValue: 'BARCODE-ADMIN-NEW-01',
        productId: 'prod-scico-01',
        actor: adminUser,
      });
      expect(res.success).toBe(true);
      expect(res.identifier).toBeDefined();
    });

    it('3. permits INVENTORY_MANAGER to write/register new product identifiers', () => {
      const res = productIdentifierService.registerIdentifier({
        identifierValue: 'BARCODE-MGR-NEW-02',
        productId: 'prod-scico-01',
        actor: managerUser,
      });
      expect(res.success).toBe(true);
      expect(res.identifier).toBeDefined();
    });

    it('4. denies STOREKEEPER from writing/registering product identifiers', () => {
      const res = productIdentifierService.registerIdentifier({
        identifierValue: 'BARCODE-STORE-DENIED',
        productId: 'prod-scico-01',
        actor: storekeeperUser,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
    });

    it('5. denies DEPARTMENT_USER from writing/registering product identifiers', () => {
      const res = productIdentifierService.registerIdentifier({
        identifierValue: 'BARCODE-ICU-DENIED',
        productId: 'prod-scico-01',
        actor: icuUser,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
    });

    it('6. denies anonymous / unauthenticated access to register product identifiers', () => {
      expect(hasPermission(null, 'products:write')).toBe(false);
      expect(hasPermission(undefined, 'products:write')).toBe(false);
    });
  });

  // ============================================================================
  // B. DAILY CONSUMPTION RLS & LOCATION ISOLATION
  // ============================================================================
  describe('B. daily_consumption RLS & Location Isolation', () => {
    it('1. grants facility-wide multi-location access to ADMIN, INVENTORY_MANAGER, and STOREKEEPER', () => {
      // Multi-location facility scope
      expect(canAccessLocation(adminUser, 'loc-cs-01')).toBe(true);
      expect(canAccessLocation(adminUser, 'loc-icu-01')).toBe(true);
      expect(canAccessLocation(adminUser, 'loc-ed-01')).toBe(true);

      expect(canAccessLocation(managerUser, 'loc-cs-01')).toBe(true);
      expect(canAccessLocation(managerUser, 'loc-icu-01')).toBe(true);
      expect(canAccessLocation(managerUser, 'loc-ed-01')).toBe(true);

      expect(canAccessLocation(storekeeperUser, 'loc-cs-01')).toBe(true);
      expect(canAccessLocation(storekeeperUser, 'loc-icu-01')).toBe(true);
      expect(canAccessLocation(storekeeperUser, 'loc-ed-01')).toBe(true);
    });

    it('2. restricts DEPARTMENT_USER strictly to their assigned location', () => {
      expect(icuUser.assignedLocationId).toBe('loc-icu-01');
      expect(canAccessLocation(icuUser, 'loc-icu-01')).toBe(true);
      expect(canAccessLocation(icuUser, 'loc-ed-01')).toBe(false);
      expect(canAccessLocation(icuUser, 'loc-cs-01')).toBe(false);

      expect(edUser.assignedLocationId).toBe('loc-ed-01');
      expect(canAccessLocation(edUser, 'loc-ed-01')).toBe(true);
      expect(canAccessLocation(edUser, 'loc-icu-01')).toBe(false);
    });

    it('3. rejects consumption write when DEPARTMENT_USER attempts to record in an unauthorized location', () => {
      // ICU nurse tries to consume stock from Emergency Department location
      const res = inventoryRepo.consumeStock({
        productId: 'prod-scico-01',
        batchId: 'batch-eb-2026-001',
        fromLocationId: 'loc-ed-01',
        quantity: 1,
        performedBy: icuUser.fullName,
        actor: icuUser,
      });
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('UNAUTHORIZED');
      expect(res.error).toContain('location');
    });

    it('4. permits consumption write when DEPARTMENT_USER consumes stock in their assigned location', () => {
      const prevCons = inventoryRepo.getDailyConsumption().reduce((sum, c) => sum + c.consumedUnits, 0);

      const res = inventoryRepo.consumeStock({
        productId: 'prod-scico-01',
        batchId: 'batch-eb-2026-001',
        fromLocationId: 'loc-icu-01',
        quantity: 2,
        performedBy: icuUser.fullName,
        actor: icuUser,
      });

      expect(res.success).toBe(true);
      const newCons = inventoryRepo.getDailyConsumption().reduce((sum, c) => sum + c.consumedUnits, 0);
      expect(newCons).toBe(prevCons + 2);
    });

    it('5. enforces that daily_consumption has no client-accessible deletion capability', () => {
      // Daily consumption represents immutable historical telemetry; no deleteStock/deleteConsumption API exists
      expect((inventoryRepo as any).deleteDailyConsumption).toBeUndefined();
      expect((inventoryRepo as any).deleteConsumption).toBeUndefined();
    });
  });

  // ============================================================================
  // C & D. PRODUCT MASTER & VARIANT READ/WRITE PERMISSIONS
  // ============================================================================
  describe('C & D. Products & Variants Read/Write Access', () => {
    it('1. allows DEPARTMENT_USER to read products and product variants for clinical care', () => {
      const products = productMasterService.getProducts();
      expect(products.length).toBeGreaterThan(0);

      const eb = productMasterService.getProductById('prod-scico-01');
      expect(eb).toBeDefined();
      expect(eb?.variants).toBeDefined();
      expect(eb!.variants!.length).toBeGreaterThan(0);
    });

    it('2. denies anonymous / unauthenticated users from reading or writing products', () => {
      expect(hasPermission(null, 'products:read')).toBe(false);
      expect(hasPermission(undefined, 'products:read')).toBe(false);
      expect(hasPermission(null, 'products:write')).toBe(false);
      expect(hasPermission(undefined, 'products:write')).toBe(false);
    });

    it('3. strictly restricts product and variant modifications to ADMIN and INVENTORY_MANAGER', () => {
      expect(hasPermission(adminUser, 'products:write')).toBe(true);
      expect(hasPermission(managerUser, 'products:write')).toBe(true);
      expect(hasPermission(storekeeperUser, 'products:write')).toBe(false);
      expect(hasPermission(icuUser, 'products:write')).toBe(false);
      expect(hasPermission(edUser, 'products:write')).toBe(false);
    });
  });

  // ============================================================================
  // E. PROCESS_INVENTORY_MOVEMENT INVARIANTS & INTEGRITY
  // ============================================================================
  describe('E. process_inventory_movement Invariants & Safety', () => {
    it('1. CONSUME movement updates daily_consumption and preserves transaction audit', () => {
      const res = inventoryRepo.consumeStock({
        productId: 'prod-scico-01',
        batchId: 'batch-eb-2026-001',
        fromLocationId: 'loc-icu-01',
        quantity: 1,
        performedBy: 'Dr. Elena Rostova (ICU Nurse)',
        actor: icuUser,
        reason: 'Bedside wound care bandaging',
      });

      expect(res.success).toBe(true);
      expect(res.data?.transactionNumber).toMatch(/^TX-\d{4}-\d+/);

      // Verify transaction ledger
      const tx = inventoryRepo.getTransactions().find(t => t.id === res.data?.id);
      expect(tx).toBeDefined();
      expect(tx?.type).toBe('CONSUME');
    });

    it('2. strictly blocks clinical consumption of expired batches', () => {
      const expiredBatch = inventoryRepo.getBatches().find(b => b.status === 'EXPIRED');
      if (expiredBatch) {
        const res = inventoryRepo.consumeStock({
          productId: expiredBatch.productId,
          batchId: expiredBatch.id,
          fromLocationId: 'loc-cs-01',
          quantity: 1,
          performedBy: adminUser.fullName,
          actor: adminUser,
        });
        expect(res.success).toBe(false);
        expect(res.errorCode).toBe('EXPIRED_STOCK');
      }
    });

    it('3. enforces stock sufficiency and non-negative bounds', () => {
      const res = inventoryRepo.consumeStock({
        productId: 'prod-scico-01',
        batchId: 'batch-eb-2026-001',
        fromLocationId: 'loc-icu-01',
        quantity: 999999, // Exceeds available ICU stock
        performedBy: icuUser.fullName,
        actor: icuUser,
      });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('INSUFFICIENT_STOCK');
    });
  });

  // ============================================================================
  // F. MIGRATION 08 SQL SCHEMA & STATIC INTEGRITY VERIFICATION
  // ============================================================================
  describe('F. Migration 08 SQL Static Integrity Check', () => {
    const migrationPath = path.resolve(__dirname, '../../supabase/migrations/08_meditrack_rls_gap_fix.sql');

    it('1. verifies that 08_meditrack_rls_gap_fix.sql exists and is populated', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content.length).toBeGreaterThan(500);
    });

    it('2. verifies all required RLS policies are created in Migration 08', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');

      // Product Identifiers policies
      expect(content).toContain('rls_product_identifiers_select');
      expect(content).toContain('rls_product_identifiers_admin_manager');

      // Daily Consumption policies
      expect(content).toContain('rls_daily_consumption_select');
      expect(content).toContain('rls_daily_consumption_insert');
      expect(content).toContain('rls_daily_consumption_update');

      // Product and Product Variants SELECT policies
      expect(content).toContain('p_products_read');
      expect(content).toContain('p_product_variants_read');

      // No DELETE policy on daily_consumption
      expect(content).not.toContain('rls_daily_consumption_delete');
    });

    it('3. verifies SECURITY DEFINER and search_path hardening on process_inventory_movement', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content).toContain('SECURITY DEFINER');
      expect(content).toContain('SET search_path = public, pg_temp');
    });

    it('4. verifies safe migration practices (no DROP TABLE, no ALTER TABLE DROP COLUMN)', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content).not.toMatch(/DROP\s+TABLE/i);
      expect(content).not.toMatch(/DROP\s+COLUMN/i);
    });
  });

  // ============================================================================
  // G. CANONICAL SEED V2 SCHEMA INTEGRITY & COMPATIBILITY CHECK
  // ============================================================================
  describe('G. Canonical Seed v2 (02_canonical_seed_v2.sql) Verification', () => {
    const seedV2Path = path.resolve(__dirname, '../../supabase/seeds/02_canonical_seed_v2.sql');
    const seedV1Path = path.resolve(__dirname, '../../supabase/seeds/01_canonical_seed.sql');

    it('1. verifies that 02_canonical_seed_v2.sql exists and 01_canonical_seed.sql is untouched', () => {
      expect(fs.existsSync(seedV2Path)).toBe(true);
      expect(fs.existsSync(seedV1Path)).toBe(true);

      const v2Content = fs.readFileSync(seedV2Path, 'utf8');
      expect(v2Content.length).toBeGreaterThan(1000);
    });

    it('2. verifies all 9 core inventory tables are seeded in correct FK dependency order', () => {
      const content = fs.readFileSync(seedV2Path, 'utf8');

      const locIdx = content.indexOf('INSERT INTO public.hospital_locations');
      const catIdx = content.indexOf('INSERT INTO public.product_categories');
      const prodIdx = content.indexOf('INSERT INTO public.products');
      const varIdx = content.indexOf('INSERT INTO public.product_variants');
      const identIdx = content.indexOf('INSERT INTO public.product_identifiers');
      const batchIdx = content.indexOf('INSERT INTO public.inventory_batches');
      const stockIdx = content.indexOf('INSERT INTO public.location_stock');
      const consIdx = content.indexOf('INSERT INTO public.daily_consumption');
      const txIdx = content.indexOf('INSERT INTO public.inventory_transactions');

      expect(locIdx).toBeGreaterThan(-1);
      expect(catIdx).toBeGreaterThan(-1);
      expect(prodIdx).toBeGreaterThan(-1);
      expect(varIdx).toBeGreaterThan(-1);
      expect(identIdx).toBeGreaterThan(-1);
      expect(batchIdx).toBeGreaterThan(-1);
      expect(stockIdx).toBeGreaterThan(-1);
      expect(consIdx).toBeGreaterThan(-1);
      expect(txIdx).toBeGreaterThan(-1);

      // FK ordering validation
      expect(locIdx).toBeLessThan(stockIdx);
      expect(catIdx).toBeLessThan(prodIdx);
      expect(prodIdx).toBeLessThan(varIdx);
      expect(varIdx).toBeLessThan(identIdx);
      expect(prodIdx).toBeLessThan(batchIdx);
      expect(batchIdx).toBeLessThan(stockIdx);
      expect(stockIdx).toBeLessThan(consIdx);
    });

    it('3. verifies absence of obsolete or non-existent columns from legacy seed', () => {
      const content = fs.readFileSync(seedV2Path, 'utf8');

      // Obsolete product fields
      expect(content).not.toContain('packaging_unit');
      expect(content).not.toContain('conversion_factor');
      expect(content).not.toContain('min_stock_level');
      expect(content).not.toContain('max_stock_level');
      expect(content).not.toContain('requires_cold_chain');

      // Obsolete batch fields
      expect(content).not.toMatch(/INSERT INTO public\.inventory_batches\s*\([^)]*\bcurrent_quantity\b/);
      expect(content).not.toMatch(/INSERT INTO public\.inventory_batches\s*\([^)]*\breceived_at\b/);
      expect(content).not.toContain('current_quantity');
      expect(content).not.toContain('received_at');

      // Obsolete identifier type
      expect(content).not.toContain("'SYNTHETIC_DEMO'");

      // Obsolete location type
      expect(content).not.toMatch(/'DEPARTMENT'/);

      // Obsolete category columns
      expect(content).not.toMatch(/INSERT INTO public\.product_categories\s*\([^)]*\bcode\b/);
      expect(content).not.toMatch(/INSERT INTO public\.product_categories\s*\([^)]*\bis_active\b/);
    });

    it('4. verifies canonical distribution numbers (240 + 30 + 20 = 290) and synthetic demo tagging', () => {
      const content = fs.readFileSync(seedV2Path, 'utf8');

      // Canonical scenario allocations
      expect(content).toContain('240');
      expect(content).toContain('30');
      expect(content).toContain('20');
      expect(content).toContain('EB-2026-001');

      // Explicit synthetic demo markers
      expect(content).toContain('is_synthetic_demo');
      expect(content).toContain('DEMO-SCICO-EB-001');
      expect(content).toContain('8901234567890');

      // Non-destructive idempotency on all inserts
      const insertMatches = content.match(/INSERT INTO public\.[a-z_]+/g) || [];
      const onConflictMatches = content.match(/ON CONFLICT \(id\) DO NOTHING;/g) || [];
      expect(insertMatches.length).toBe(9);
      expect(onConflictMatches.length).toBe(9);
    });
  });
});

