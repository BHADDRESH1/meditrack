import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getDataMode, 
  setDataMode, 
  sanitizeSupabaseError,
  clearSupabaseSession 
} from '@/services/supabaseClient';
import { productMasterService } from '@/services/productMasterService';
import { inventoryRepo } from '@/services/inventoryRepository';
import { procurementEngine } from '@/services/procurementEngine';
import { purchaseRequestService } from '@/services/purchaseRequestService';
import { MASTER_PRODUCTS } from '@/data/productCatalogs';

describe('Phase 8 Step 3: Strict SUPABASE vs DEMO Mode Isolation & Data Integrity', () => {
  beforeEach(() => {
    clearSupabaseSession();
    setDataMode('DEMO');
    vi.restoreAllMocks();
  });

  // 1. SUPABASE successful retrieval
  it('1. retrieves and hydrates remote data successfully in SUPABASE mode', async () => {
    setDataMode('SUPABASE');
    expect(getDataMode()).toBe('SUPABASE');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('products')) {
        return new Response(JSON.stringify([
          {
            id: 'prod-live-001',
            name: 'Sterile Gauze Pad 10x10',
            sku: 'SGP-1010',
            category: { name: 'Wound Care' },
            unit: 'PACK',
            brand: 'MediSupply Co',
            catalog_source: 'LOCAL_HOSPITAL',
            min_stock_level: 10,
            max_stock_level: 50,
            reorder_point: 20,
            is_active: true,
            variants: [],
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('inventory_batches')) {
        return new Response(JSON.stringify([
          {
            id: 'batch-live-001',
            product_id: 'prod-live-001',
            batch_number: 'LIVE-BATCH-99',
            expiry_date: '2027-01-01',
            initial_quantity: 100,
            current_quantity: 85,
            status: 'ACTIVE',
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const prodRes = await productMasterService.loadFromSupabase();
    expect(prodRes.success).toBe(true);
    expect(productMasterService.getProducts().length).toBe(1);
    expect(productMasterService.getProducts()[0].id).toBe('prod-live-001');

    const invRes = await inventoryRepo.loadFromSupabase();
    expect(invRes.success).toBe(true);
    expect(inventoryRepo.getBatches().length).toBe(1);
    expect(inventoryRepo.getBatches()[0].batchNumber).toBe('LIVE-BATCH-99');
  });

  // 2. SUPABASE failure
  it('2. retains zero demo records and preserves internal error without fallback on Supabase failure', async () => {
    setDataMode('SUPABASE');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ code: '57P01', message: 'terminating connection due to administrator command' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const prodRes = await productMasterService.loadFromSupabase();
    expect(prodRes.success).toBe(false);
    expect(productMasterService.getProducts()).toEqual([]);
    expect(productMasterService.getRemoteError()).toBeDefined();

    const invRes = await inventoryRepo.loadFromSupabase();
    expect(invRes.success).toBe(false);
    expect(inventoryRepo.getBatches()).toEqual([]);
    expect(inventoryRepo.getLocationStock()).toEqual([]);
    expect(inventoryRepo.getRemoteError()).toBeDefined();

    // Mode must remain SUPABASE
    expect(getDataMode()).toBe('SUPABASE');
  });

  // 3. SUPABASE empty result
  it('3. returns honest empty results when remote database has zero rows without switching to DEMO', async () => {
    setDataMode('SUPABASE');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const prodRes = await productMasterService.loadFromSupabase();
    expect(prodRes.success).toBe(true);
    expect(prodRes.count).toBe(0);
    expect(productMasterService.getProducts()).toEqual([]);

    const invRes = await inventoryRepo.loadFromSupabase();
    expect(invRes.success).toBe(true);
    expect(inventoryRepo.getBatches()).toEqual([]);
    expect(inventoryRepo.getLocationStock()).toEqual([]);

    // Stays strictly in SUPABASE mode
    expect(getDataMode()).toBe('SUPABASE');
  });

  // 4. DEMO canonical data
  it('4. loads canonical demonstration seed when in DEMO mode', async () => {
    setDataMode('DEMO');
    expect(getDataMode()).toBe('DEMO');

    const products = productMasterService.getProducts();
    expect(products.length).toBe(MASTER_PRODUCTS.length);

    const batches = inventoryRepo.getBatches();
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.some(b => b.batchNumber === 'EB-2026-001')).toBe(true);

    const reqRes = await purchaseRequestService.getPurchaseRequests();
    expect(reqRes.requests.length).toBeGreaterThan(0);
  });

  // 5. DEMO -> SUPABASE transition
  it('5. clears all in-memory demo state immediately upon switching from DEMO to SUPABASE', async () => {
    setDataMode('DEMO');
    expect(productMasterService.getProducts().length).toBeGreaterThan(0);
    expect(inventoryRepo.getBatches().length).toBeGreaterThan(0);

    // Switch mode
    setDataMode('SUPABASE');
    expect(getDataMode()).toBe('SUPABASE');

    // Before any remote load, in-memory state must be empty
    expect(productMasterService.getProducts()).toEqual([]);
    expect(inventoryRepo.getBatches()).toEqual([]);
    expect(inventoryRepo.getLocationStock()).toEqual([]);
    expect(inventoryRepo.getTransactions()).toEqual([]);
    const reqRes = await purchaseRequestService.getPurchaseRequests();
    expect(reqRes.requests).toEqual([]);
  });

  // 6. SUPABASE -> DEMO transition
  it('6. restores canonical demo seed immediately upon switching from SUPABASE to DEMO without page reload', async () => {
    setDataMode('SUPABASE');
    expect(productMasterService.getProducts()).toEqual([]);
    expect(inventoryRepo.getBatches()).toEqual([]);

    // Switch back to DEMO
    setDataMode('DEMO');
    expect(getDataMode()).toBe('DEMO');

    expect(productMasterService.getProducts().length).toBe(MASTER_PRODUCTS.length);
    expect(inventoryRepo.getBatches().some(b => b.batchNumber === 'EB-2026-001')).toBe(true);
    const reqRes = await purchaseRequestService.getPurchaseRequests();
    expect(reqRes.requests.length).toBeGreaterThan(0);
  });

  // 7. Retry after failure
  it('7. cleanly re-attempts remote connection and recovers when retry succeeds', async () => {
    setDataMode('SUPABASE');

    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ message: 'network timeout' }), { status: 504 });
      }
      return new Response(JSON.stringify([
        {
          id: 'prod-retry-01',
          name: 'Recovered Product',
          sku: 'REC-01',
          unit: 'BOX',
          is_active: true,
          variants: [],
        }
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    // 1st attempt: fails
    const firstRes = await productMasterService.loadFromSupabase();
    expect(firstRes.success).toBe(false);
    expect(productMasterService.getProducts()).toEqual([]);

    // 2nd attempt (Retry): succeeds
    const retryRes = await productMasterService.loadFromSupabase();
    expect(retryRes.success).toBe(true);
    expect(productMasterService.getProducts().length).toBe(1);
    expect(productMasterService.getProducts()[0].name).toBe('Recovered Product');
    expect(productMasterService.getRemoteError()).toBeNull();
  });

  // 8. No DEMO fallback during SUPABASE failure
  it('8. strictly avoids falling back to INITIAL_BATCHES or DEMO_PURCHASE_ORDERS during Supabase failure', async () => {
    setDataMode('SUPABASE');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'fatal database outage' }), { status: 503 });
    });

    await inventoryRepo.loadFromSupabase();
    expect(inventoryRepo.getBatches()).toEqual([]);
    expect(inventoryRepo.getLocationStock()).toEqual([]);
    expect(inventoryRepo.getTransactions()).toEqual([]);

    const kpis = procurementEngine.calculateKPIs();
    expect(kpis.pendingPoCoverageUnits).toBe(0);
    expect(kpis.replenishmentCandidatesCount).toBe(0);
  });

  // 9. Error sanitization
  it('9. sanitizes internal Supabase/PostgreSQL technical details, credentials, and stack traces', () => {
    // Leaked token
    const tokenError = 'Failed to authenticate: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive_payload';
    const sanitizedToken = sanitizeSupabaseError(tokenError);
    expect(sanitizedToken).not.toContain('eyJhbGci');
    expect(sanitizedToken).toBe('Unable to load live inventory data.');

    // Raw SQL / PostgREST internal
    const sqlError = 'PostgREST syntax error at "SELECT * FROM users WHERE password_hash = 123"';
    const sanitizedSql = sanitizeSupabaseError(sqlError);
    expect(sanitizedSql).not.toContain('password_hash');
    expect(sanitizedSql).not.toContain('SELECT');
    expect(sanitizedSql).toBe('Unable to load live inventory data.');

    // Connection string
    const connError = 'connection error to postgres://postgres:secretpassword@db.supabase.co:5432/postgres';
    const sanitizedConn = sanitizeSupabaseError(connError);
    expect(sanitizedConn).not.toContain('secretpassword');
    expect(sanitizedConn).not.toContain('postgres://');
    expect(sanitizedConn).toBe('Unable to load live inventory data.');

    // Generic safe fallback
    const generic = sanitizeSupabaseError(null);
    expect(generic).toBe('Unable to load live inventory data.');
  });

  // 10. No stale demo state after mode switching
  it('10. leaves zero stale demo state after cyclic DEMO -> SUPABASE -> DEMO -> SUPABASE transitions', async () => {
    // 1. DEMO
    setDataMode('DEMO');
    expect(productMasterService.getProducts().length).toBeGreaterThan(0);

    // 2. SUPABASE
    setDataMode('SUPABASE');
    expect(productMasterService.getProducts()).toEqual([]);
    expect(inventoryRepo.getBatches()).toEqual([]);
    let reqRes = await purchaseRequestService.getPurchaseRequests();
    expect(reqRes.requests).toEqual([]);

    // 3. DEMO
    setDataMode('DEMO');
    expect(productMasterService.getProducts().length).toBe(MASTER_PRODUCTS.length);
    expect(inventoryRepo.getBatches().length).toBeGreaterThan(0);

    // 4. SUPABASE
    setDataMode('SUPABASE');
    expect(productMasterService.getProducts()).toEqual([]);
    expect(inventoryRepo.getBatches()).toEqual([]);
    expect(inventoryRepo.getLocationStock()).toEqual([]);
    reqRes = await purchaseRequestService.getPurchaseRequests();
    expect(reqRes.requests).toEqual([]);
  });
});
