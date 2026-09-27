import { describe, it, expect } from 'vitest';
import { productMasterService } from '@/services/productMasterService';
import { inventoryRepo } from '@/services/inventoryRepository';
import { INITIAL_USERS } from '@/services/authService';
import { CatalogSource } from '@/types/inventory';

describe('MEDiTRACK Phase 4: Production Product Master & Medical Catalog Management', () => {
  const adminUser = INITIAL_USERS.find(u => u.role === 'ADMIN')!;
  const managerUser = INITIAL_USERS.find(u => u.role === 'INVENTORY_MANAGER')!;
  const storekeeperUser = INITIAL_USERS.find(u => u.role === 'STOREKEEPER')!;
  const deptUser = INITIAL_USERS.find(u => u.role === 'DEPARTMENT_USER')!;

  // 1. Product Creation
  it('1. allows authorized users to register a new medical product with full specifications', () => {
    const newSku = `SC-TEST-${Date.now()}`;
    const result = productMasterService.createProduct({
      product: {
        name: 'Scico-Flex Cohesive Compression Wrap',
        sku: newSku,
        productCode: `SRC-${newSku}`,
        brand: 'SCICO Medical',
        category: 'Bandages & Dressings',
        catalogSource: 'SCICO_MEDICAL',
        description: 'Self-adherent high-compression elastic wrap for clinical immobilization.',
        specifications: { 'Width': '10 cm', 'Length': '4.5 m' },
        uom: 'Box of 12 Rolls',
        unitsPerPack: 12,
        minSafetyStock: 25,
        reorderPoint: 50,
        standardCost: 34.0,
        isSterile: false,
        storageRequirements: 'Store in cool dry conditions',
        isActive: true,
      },
      actor: adminUser,
      reason: 'New product onboarding',
    });

    expect(result.success).toBe(true);
    expect(result.product).toBeDefined();
    expect(result.product?.sku).toBe(newSku);
    expect(result.product?.catalogSource).toBe('SCICO_MEDICAL');
    expect(result.product?.variants?.length).toBeGreaterThan(0);

    // Verify product can be retrieved via service and synced repo
    const retrieved = productMasterService.getProductById(result.product!.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Scico-Flex Cohesive Compression Wrap');
    expect(inventoryRepo.getProductById(result.product!.id)).toBeDefined();
  });

  // 2. Duplicate SKU / Code Prevention
  it('2. prevents duplicate SKU and duplicate source product code registration', () => {
    // Attempt duplicate SKU
    const resultSku = productMasterService.createProduct({
      product: {
        name: 'Duplicate SKU Item',
        sku: 'SC-EAB-75', // Existing SKU for prod-scico-01
        brand: 'SCICO Medical',
        category: 'Bandages & Dressings',
        catalogSource: 'SCICO_MEDICAL',
        description: 'Test description',
        specifications: {},
        uom: 'Box',
        unitsPerPack: 1,
        minSafetyStock: 10,
        reorderPoint: 20,
        standardCost: 10.0,
        isSterile: false,
        storageRequirements: 'Standard',
        isActive: true,
      },
      actor: managerUser,
    });

    expect(resultSku.success).toBe(false);
    expect(resultSku.error).toContain('DUPLICATE_SKU');

    // Attempt duplicate source code
    const resultSourceCode = productMasterService.createProduct({
      product: {
        name: 'Duplicate Code Item',
        sku: `UNIQUE-SKU-${Date.now()}`,
        productCode: 'SC-EAB-75', // Existing source code
        brand: 'SCICO Medical',
        category: 'Bandages & Dressings',
        catalogSource: 'SCICO_MEDICAL',
        description: 'Test description',
        specifications: {},
        uom: 'Box',
        unitsPerPack: 1,
        minSafetyStock: 10,
        reorderPoint: 20,
        standardCost: 10.0,
        isSterile: false,
        storageRequirements: 'Standard',
        isActive: true,
      },
      actor: adminUser,
    });

    expect(resultSourceCode.success).toBe(false);
    expect(resultSourceCode.error).toContain('DUPLICATE_PRODUCT_CODE');
  });

  // 3. Product Update
  it('3. permits authorized users to update safe reference attributes and records audit log', () => {
    const targetProduct = productMasterService.getProductById('prod-pm-04')!;
    const prevCost = targetProduct.standardCost;
    const newCost = prevCost + 5.5;

    const result = productMasterService.updateProduct({
      id: targetProduct.id,
      updates: {
        standardCost: newCost,
        reorderPoint: 35,
      },
      actor: managerUser,
      reason: 'Annual vendor contract price adjustment',
    });

    expect(result.success).toBe(true);
    expect(result.product?.standardCost).toBe(newCost);
    expect(result.product?.reorderPoint).toBe(35);

    // Verify audit log
    const logs = productMasterService.getProductAuditLogs(targetProduct.id);
    const latestLog = logs[0];
    expect(latestLog.entityId).toBe(targetProduct.id);
    expect(latestLog.action).toBe('PRODUCT_UPDATED');
    expect(latestLog.performedBy).toBe(managerUser.id);
  });

  // 4. Product Deactivation & Inventory Invariant
  it('4. allows deactivating a product and prevents new stock receipt on deactivated items', () => {
    const target = productMasterService.getProductById('prod-pm-10')!;

    // Deactivate
    const deactResult = productMasterService.toggleProductStatus({
      id: target.id,
      isActive: false,
      actor: adminUser,
      reason: 'Discontinued product line decommissioning',
    });

    expect(deactResult.success).toBe(true);
    expect(deactResult.product?.isActive).toBe(false);

    // Inactive product cannot receive new stock
    const receiveAttempt = inventoryRepo.receiveStock({
      productId: target.id,
      batchId: 'batch-pm-2026-030',
      toLocationId: 'loc-cs-01',
      quantity: 10,
      performedBy: adminUser.fullName,
      actor: adminUser,
    });

    expect(receiveAttempt.success).toBe(false);
    expect(receiveAttempt.errorCode).toBe('INACTIVE_PRODUCT');

    // Reactivate to preserve test cleanliness
    productMasterService.toggleProductStatus({
      id: target.id,
      isActive: true,
      actor: adminUser,
    });
  });

  // 5. Variant Creation
  it('5. allows creating configuration variants under a product catalog master', () => {
    const parent = productMasterService.getProductById('prod-scico-01')!;
    const variantName = `Custom 12.5 cm × 4.5 m Wide (${Date.now()})`;

    const result = productMasterService.createVariant({
      variant: {
        productId: parent.id,
        variantName,
        size: '12.5 cm × 4.5 m',
        material: 'Heavy-duty twisted cotton',
        packaging: '6 Rolls / Box',
        isActive: true,
      },
      actor: managerUser,
      reason: 'Clinical specialty request for bariatric support',
    });

    expect(result.success).toBe(true);
    expect(result.variant?.variantName).toBe(variantName);
    expect(result.variant?.size).toBe('12.5 cm × 4.5 m');

    // Verify parent product contains the new variant
    const updatedParent = productMasterService.getProductById(parent.id)!;
    expect(updatedParent.variants?.some(v => v.variantName === variantName)).toBe(true);
  });

  // 6. Variant Update
  it('6. allows updating variant configuration specifications and audit tracking', () => {
    const parent = productMasterService.getProductById('prod-scico-01')!;
    const firstVariant = parent.variants![0];

    const result = productMasterService.updateVariant({
      id: firstVariant.id,
      updates: {
        packaging: '24 Rolls / Outer Dispenser',
      },
      actor: managerUser,
      reason: 'Updated packaging SKU configuration',
    });

    expect(result.success).toBe(true);
    expect(result.variant?.packaging).toBe('24 Rolls / Outer Dispenser');

    // Verify audit log
    const logs = productMasterService.getProductAuditLogs(firstVariant.id);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('VARIANT_UPDATED');
  });

  // 7. Variant Deactivation
  it('7. allows deactivating a variant without deleting historical catalog references', () => {
    const parent = productMasterService.getProductById('prod-pm-01')!;
    const variant = parent.variants![0];

    const result = productMasterService.toggleVariantStatus({
      id: variant.id,
      isActive: false,
      actor: adminUser,
      reason: 'Temporary vendor supply chain shortage',
    });

    expect(result.success).toBe(true);
    expect(result.variant?.isActive).toBe(false);

    // Reactivate for cleanliness
    productMasterService.toggleVariantStatus({
      id: variant.id,
      isActive: true,
      actor: adminUser,
    });
  });

  // 8. Historical Inventory Integrity: Prevent Destructive Deletion
  it('8. prevents destructive deletion of products with existing batches, stock, or transactions', () => {
    // prod-scico-01 has Batch EB-2026-001, stock in 3 locations, and transactions
    const deleteAttempt = productMasterService.deleteProductSafely({
      id: 'prod-scico-01',
      actor: adminUser,
    });

    expect(deleteAttempt.success).toBe(false);
    expect(deleteAttempt.error).toContain('HISTORICAL_INTEGRITY_VIOLATION');
    expect(deleteAttempt.error).toContain('Please deactivate the product instead');

    // Verify product still exists intact
    expect(productMasterService.getProductById('prod-scico-01')).toBeDefined();
  });

  // 9. Unauthorized User Cannot Modify Products
  it('9. strictly forbids STOREKEEPER and DEPARTMENT_USER from creating or modifying products', () => {
    // Storekeeper attempt
    const storekeeperAttempt = productMasterService.createProduct({
      product: {
        name: 'Unauthorized Product',
        sku: 'UNAUTH-01',
        brand: 'SCICO Medical',
        category: 'Bandages & Dressings',
        catalogSource: 'SCICO_MEDICAL',
        description: 'Test',
        specifications: {},
        uom: 'Box',
        unitsPerPack: 1,
        minSafetyStock: 10,
        reorderPoint: 20,
        standardCost: 10.0,
        isSterile: false,
        storageRequirements: 'Standard',
        isActive: true,
      },
      actor: storekeeperUser,
    });

    expect(storekeeperAttempt.success).toBe(false);
    expect(storekeeperAttempt.error).toContain('UNAUTHORIZED');

    // Department User attempt
    const deptAttempt = productMasterService.toggleProductStatus({
      id: 'prod-scico-01',
      isActive: false,
      actor: deptUser,
    });

    expect(deptAttempt.success).toBe(false);
    expect(deptAttempt.error).toContain('UNAUTHORIZED');
  });

  // 10. Catalog Source Validation
  it('10. validates that catalogSource conforms strictly to SCICO_MEDICAL, PLASTI_MED, or MANUAL', () => {
    const invalidSourceAttempt = productMasterService.createProduct({
      product: {
        name: 'Invalid Source Product',
        sku: `INV-SRC-${Date.now()}`,
        brand: 'Generic',
        category: 'Bandages & Dressings',
        catalogSource: 'EXTERNAL_VENDOR' as unknown as CatalogSource, // Invalid!
        description: 'Testing invalid enum',
        specifications: {},
        uom: 'Box',
        unitsPerPack: 1,
        minSafetyStock: 10,
        reorderPoint: 20,
        standardCost: 10.0,
        isSterile: false,
        storageRequirements: 'Standard',
        isActive: true,
      },
      actor: adminUser,
    });

    expect(invalidSourceAttempt.success).toBe(false);
    expect(invalidSourceAttempt.error).toContain('Invalid catalog source');
  });

  // 11. Search and Filter Behavior
  it('11. performs multi-criteria catalog search and filtering across source, brand, category, and text', () => {
    // Filter SCICO products
    const scicoProducts = productMasterService.queryProducts({
      catalogSource: 'SCICO_MEDICAL',
    });
    expect(scicoProducts.length).toBeGreaterThan(0);
    for (const p of scicoProducts) {
      expect(p.catalogSource).toBe('SCICO_MEDICAL');
      expect(p.brand).toBe('SCICO Medical');
    }

    // Filter Plasti-med products
    const plastimedProducts = productMasterService.queryProducts({
      catalogSource: 'PLASTI_MED',
    });
    expect(plastimedProducts.length).toBeGreaterThan(0);
    for (const p of plastimedProducts) {
      expect(p.catalogSource).toBe('PLASTI_MED');
      expect(p.brand).toBe('Plasti-med');
    }

    // Search text query
    const searched = productMasterService.queryProducts({
      query: 'suction liner',
    });
    expect(searched.length).toBeGreaterThan(0);
    for (const p of searched) {
      expect(p.name.toLowerCase() + p.category.toLowerCase()).toContain('suction');
    }
  });

  // 12. Product-to-Inventory Relationship (EB-2026-001)
  it('12. preserves exact product-to-inventory relationships for EB-2026-001', () => {
    const product = productMasterService.getProductById('prod-scico-01');
    expect(product).toBeDefined();

    // Verify associated batch
    const batches = inventoryRepo.getBatches().filter(b => b.productId === 'prod-scico-01');
    const ebBatch = batches.find(b => b.batchNumber === 'EB-2026-001');
    expect(ebBatch).toBeDefined();
    expect(ebBatch?.status).toBe('ACTIVE');

    // Verify stock distribution
    const stockRecords = inventoryRepo.getStockByProduct('prod-scico-01');
    expect(stockRecords.length).toBe(3);

    const csStock = stockRecords.find(s => s.locationId === 'loc-cs-01');
    const icuStock = stockRecords.find(s => s.locationId === 'loc-icu-01');
    const edStock = stockRecords.find(s => s.locationId === 'loc-ed-01');

    expect(csStock?.quantity).toBe(240);
    expect(icuStock?.quantity).toBe(30);
    expect(edStock?.quantity).toBe(20);
  });

  // 13. Dynamic Inventory Summary Calculation
  it('13. dynamically calculates real-time inventory balances and expiry risk on product master', () => {
    const batches = inventoryRepo.getBatches().filter(b => b.productId === 'prod-scico-01');
    const ebBatch = batches.find(b => b.batchNumber === 'EB-2026-001')!;

    const summary = productMasterService.getProductInventorySummary('prod-scico-01');

    expect(summary.hasInventory).toBe(true);
    expect(summary.totalQuantity).toBe(290); // 240 + 30 + 20
    expect(summary.locationCount).toBe(3);
    expect(summary.batchCount).toBe(1);
    expect(summary.earliestExpiry).toBe(ebBatch.expiryDate);
    expect(summary.daysToEarliestExpiry).toBeGreaterThanOrEqual(44);
    expect(summary.daysToEarliestExpiry).toBeLessThanOrEqual(46);
    expect(summary.potentialExpiryRiskUnits).toBe(87); // Exact deterministic rule: 87 units!

    // Verify empty state for unstocked product
    const unstockedSummary = productMasterService.getProductInventorySummary('prod-nonexistent-999');
    expect(unstockedSummary.hasInventory).toBe(false);
    expect(unstockedSummary.totalQuantity).toBe(0);
    expect(unstockedSummary.locationCount).toBe(0);
  });

  // 14. Audit Record Creation
  it('14. creates immutable audit log entries with actor attribution for product and variant operations', () => {
    const prevLogs = productMasterService.getProductAuditLogs().length;

    const testSku = `SC-AUDIT-${Date.now()}`;
    const createRes = productMasterService.createProduct({
      product: {
        name: 'Audited Diagnostic Strip',
        sku: testSku,
        brand: 'SCICO Medical',
        category: 'Tapes & Strapping',
        catalogSource: 'SCICO_MEDICAL',
        description: 'Audit test product',
        specifications: {},
        uom: 'Pack',
        unitsPerPack: 10,
        minSafetyStock: 10,
        reorderPoint: 20,
        standardCost: 15.0,
        isSterile: false,
        storageRequirements: 'Room temp',
        isActive: true,
      },
      actor: adminUser,
      reason: 'Audit verification test record',
    });

    const currentLogs = productMasterService.getProductAuditLogs();
    expect(currentLogs.length).toBe(prevLogs + 1);

    const latest = currentLogs[0];
    expect(latest.action).toBe('PRODUCT_CREATED');
    expect(latest.performedBy).toBe(adminUser.id);
    expect(latest.performedByName).toBe(adminUser.fullName);
    expect(latest.entityId).toBe(createRes.product!.id);
    expect(latest.reason).toBe('Audit verification test record');
  });
});
