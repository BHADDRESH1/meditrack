import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getDataMode, 
  setDataMode, 
  supabaseRest, 
  setSupabaseSession, 
  clearSupabaseSession 
} from '@/services/supabaseClient';
import { productMasterService } from '@/services/productMasterService';
import { inventoryRepo } from '@/services/inventoryRepository';
import { productIdentifierService } from '@/services/productIdentifierService';
import { authService } from '@/services/authService';

describe('MEDiTRACK Phase 5.5: Authoritative Supabase Remote-Data Cutover', () => {
  beforeEach(() => {
    clearSupabaseSession();
    setDataMode('DEMO');
    vi.restoreAllMocks();
  });

  // 1. Data Mode Isolation
  it('1. correctly identifies and switches between SUPABASE and DEMO modes', () => {
    setDataMode('SUPABASE');
    expect(getDataMode()).toBe('SUPABASE');

    setDataMode('DEMO');
    expect(getDataMode()).toBe('DEMO');
  });

  // 2. Client Authentication Headers
  it('2. attaches Supabase publishable key and bearer auth token in REST queries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['apikey']).toBeDefined();
      expect(headers['Authorization']).toBe('Bearer test-jwt-token-12345');
      return new Response(JSON.stringify([{ id: 'prod-1', name: 'Test Suture' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    setSupabaseSession('test-jwt-token-12345');
    const res = await supabaseRest<any[]>('products');
    expect(res.status).toBe(200);
    expect(res.data?.[0].name).toBe('Test Suture');
    expect(fetchSpy).toHaveBeenCalled();
  });

  // 3. Product Master Supabase Cutover
  it('3. reads product catalog and nested variants authoritatively from Supabase', async () => {
    setDataMode('SUPABASE');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify([
          {
            id: 'prod-remote-01',
            name: 'SCICO Surgical Dressing',
            sku: 'SCICO-SD-01',
            category_id: 'cat-01',
            category: { name: 'Wound Care' },
            unit: 'PACK',
            brand: 'SCICO Medical',
            catalog_source: 'SCICO_CATALOG',
            min_stock_level: 20,
            max_stock_level: 100,
            reorder_point: 40,
            requires_cold_chain: false,
            is_active: true,
            variants: [
              {
                id: 'var-remote-01',
                product_id: 'prod-remote-01',
                name: 'Large 10x10',
                variant_code: 'VAR-SD-LG',
                is_active: true,
              },
            ],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const res = await productMasterService.loadFromSupabase();
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);

    const prods = productMasterService.getProducts();
    expect(prods[0].id).toBe('prod-remote-01');
    expect(prods[0].name).toBe('SCICO Surgical Dressing');
    expect(prods[0].variants?.[0].variantName).toBe('Large 10x10');
  });

  // 4. Product Master Zero Silent Fallback
  it('4. refuses to silently fall back to mock products when Supabase returns an error in connected mode', async () => {
    setDataMode('SUPABASE');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ code: '42501', message: 'permission denied for table products' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const res = await productMasterService.loadFromSupabase();
    expect(res.success).toBe(false);
    expect(res.error).toContain('permission denied');
    expect(productMasterService.getProducts().length).toBe(0);
    expect(productMasterService.getRemoteError()).toContain('permission denied');
  });

  // 5. Product Identifier Supabase Cutover
  it('5. resolves identifier authoritatively from Supabase product_identifiers table', async () => {
    setDataMode('SUPABASE');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify([
          {
            id: 'ident-001',
            identifier_value: 'DEMO-SCICO-EB-001',
            normalized_value: 'DEMO-SCICO-EB-001',
            identifier_type: 'SYNTHETIC_DEMO',
            product_id: 'prod-scico-01',
            variant_id: 'var-01',
            is_active: true,
            product: {
              id: 'prod-scico-01',
              name: 'SCICO Elastic Bandage',
              sku: 'SCICO-EB-10CM',
            },
            variant: {
              id: 'var-01',
              variant_name: '10cm x 4.5m',
              variant_code: 'VAR-10CM',
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const res = await productIdentifierService.resolveIdentifierRemote('DEMO-SCICO-EB-001');
    expect(res.success).toBe(true);
    expect(res.product?.name).toBe('SCICO Elastic Bandage');
    expect(res.variant?.variantName).toBe('10cm x 4.5m');
    expect(res.identifier?.identifierType).toBe('SYNTHETIC_DEMO');
  });

  // 6. Inventory Batches and Balances Remote Load
  it('6. loads batches, location balances, and transactions from Supabase', async () => {
    setDataMode('SUPABASE');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('inventory_batches')) {
        return new Response(JSON.stringify([
          {
            id: 'batch-remote-01',
            product_id: 'prod-01',
            batch_number: 'EB-2026-001',
            expiry_date: '2026-10-25',
            initial_quantity: 300,
            current_quantity: 290,
            status: 'NEAR_EXPIRY',
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('location_stock')) {
        return new Response(JSON.stringify([
          {
            id: 'stock-remote-01',
            product_id: 'prod-01',
            batch_id: 'batch-remote-01',
            location_id: 'loc-cs-01',
            quantity: 240,
          },
          {
            id: 'stock-remote-02',
            product_id: 'prod-01',
            batch_id: 'batch-remote-01',
            location_id: 'loc-icu-01',
            quantity: 30,
          },
          {
            id: 'stock-remote-03',
            product_id: 'prod-01',
            batch_id: 'batch-remote-01',
            location_id: 'loc-ed-01',
            quantity: 20,
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const res = await inventoryRepo.loadFromSupabase();
    expect(res.success).toBe(true);

    const batches = inventoryRepo.getBatches();
    expect(batches.length).toBe(1);
    expect(batches[0].batchNumber).toBe('EB-2026-001');

    const stock = inventoryRepo.getLocationStock();
    expect(stock.length).toBe(3);
    const totalQty = stock.reduce((sum, s) => sum + s.quantity, 0);
    expect(totalQty).toBe(290); // Canonical total: 240 + 30 + 20
  });

  // 7. Authoritative RPC process_inventory_movement() Invocation
  it('7. dispatches inventory movements to authoritative process_inventory_movement RPC', async () => {
    setDataMode('SUPABASE');
    const rpcSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = url.toString();
      if (urlStr.includes('/rpc/process_inventory_movement')) {
        const body = JSON.parse(init?.body as string);
        expect(body.p_type).toBe('TRANSFER');
        expect(body.p_quantity).toBe(10);
        expect(body.p_performed_by).toBe('Sarah Jenkins');

        return new Response(
          JSON.stringify({
            transaction_id: 'tx-001',
            transaction_number: 'TX-2026-00099',
            status: 'COMMITTED',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await inventoryRepo.executeMovementRemote({
      type: 'TRANSFER',
      productId: '33333333-3333-3333-3333-333333333301',
      batchId: '66666666-6666-6666-6666-666666666601',
      fromLocationId: '11111111-1111-1111-1111-111111111101',
      toLocationId: '11111111-1111-1111-1111-111111111102',
      quantity: 10,
      performedBy: 'Sarah Jenkins',
      reason: 'Routine ICU ward replenishment',
    });

    expect(result.success).toBe(true);
    expect(rpcSpy).toHaveBeenCalled();
  });

  // 8. RPC PostgreSQL Error Propagation (Zero Silent Masking)
  it('8. surfaces PostgreSQL business exceptions (e.g. INSUFFICIENT_STOCK) directly without silent masking', async () => {
    setDataMode('SUPABASE');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          code: 'P0001',
          message: 'INSUFFICIENT_STOCK: Requested transfer quantity 500 exceeds available stock 240',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const result = await inventoryRepo.executeMovementRemote({
      type: 'TRANSFER',
      productId: 'prod-01',
      batchId: 'batch-01',
      fromLocationId: 'loc-cs-01',
      toLocationId: 'loc-icu-01',
      quantity: 500,
      performedBy: 'Storekeeper',
      reason: 'Excessive movement test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('INSUFFICIENT_STOCK');
    expect(result.errorCode).toBe('P0001');
  });

  // 9. Supabase Auth and User Profile Linking
  it('9. authenticates through Supabase Auth and authoritatively queries public.user_profiles', async () => {
    setDataMode('SUPABASE');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/auth/v1/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'auth-jwt-token-xyz',
            refresh_token: 'refresh-token-xyz',
            user: { id: 'auth-user-guid-001', email: 'admin@stjude.org' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('user_profiles')) {
        return new Response(
          JSON.stringify([
            {
              id: 'prof-01',
              auth_user_id: 'auth-user-guid-001',
              email: 'admin@stjude.org',
              full_name: 'Dr. Arthur Vance',
              role: 'ADMIN',
              facility: 'St. Jude Academic Medical Center',
              assigned_location_id: 'loc-cs-01',
              is_active: true,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const loginRes = await authService.login('admin@stjude.org', 'correct-password');
    expect(loginRes.success).toBe(true);
    expect(loginRes.user?.role).toBe('ADMIN');
    expect(loginRes.user?.fullName).toBe('Dr. Arthur Vance');
  });

  // 10. Supabase Auth Error Surfaces When No Account Exists
  it('10. surfaces manual provisioning notice when user does not exist in remote Supabase Auth', async () => {
    setDataMode('SUPABASE');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const loginRes = await authService.login('unregistered@stjude.org', 'wrong-pass');
    expect(loginRes.success).toBe(false);
    expect(loginRes.error).toContain('Invalid login credentials');
  });
});
