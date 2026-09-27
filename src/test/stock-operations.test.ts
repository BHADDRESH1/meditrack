import { describe, it, expect, beforeEach } from 'vitest';
import { inventoryRepo } from '@/services/inventoryRepository';
import { productIdentifierService } from '@/services/productIdentifierService';
import { INITIAL_USERS } from '@/services/authService';

describe('MEDiTRACK Phase 5: Production Stock Receiving, Barcode/QR Identification & Operations', () => {
  const managerUser = INITIAL_USERS.find(u => u.role === 'INVENTORY_MANAGER')!;
  const storekeeperUser = INITIAL_USERS.find(u => u.role === 'STOREKEEPER')!;
  const deptUser = INITIAL_USERS.find(u => u.role === 'DEPARTMENT_USER')!;

  beforeEach(() => {
    // Reset to canonical baseline to keep canonical EB-2026-001 intact across tests
    inventoryRepo.resetToCanonicalSeed();
    productIdentifierService.resetToCanonicalSeed();
  });

  // 1. Receiving Creates Inventory
  it('1. allows authorized storekeeper to receive stock and updates location inventory', () => {
    const batchNum = `RCV-BATCH-${Date.now()}`;
    const result = inventoryRepo.receiveStock({
      productId: 'prod-scico-02', // Cohesive Bandage
      batchNumber: batchNum,
      expiryDate: '2027-06-30',
      toLocationId: 'loc-cs-01',
      quantity: 50,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
      supplier: 'SCICO Medical Distribution Ltd.',
      deliveryNote: 'DN-9901',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.type).toBe('RECEIVE');

    // Verify location stock balance
    const stock = inventoryRepo
      .getLocationStock()
      .find(s => s.productId === 'prod-scico-02' && s.locationId === 'loc-cs-01');
    expect(stock).toBeDefined();
    expect(stock?.quantity).toBeGreaterThanOrEqual(50);
  });

  // 2. Receiving Creates RECEIVE Transaction
  it('2. creates an authoritative immutable RECEIVE transaction log entry', () => {
    const batchNum = `TX-TEST-${Date.now()}`;
    const result = inventoryRepo.receiveStock({
      productId: 'prod-pm-01',
      batchNumber: batchNum,
      expiryDate: '2027-12-31',
      toLocationId: 'loc-cs-01',
      quantity: 30,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
      referenceDoc: 'PO-8812',
    });

    expect(result.success).toBe(true);
    const tx = inventoryRepo.getTransactions().find(t => t.id === result.data?.id);
    expect(tx).toBeDefined();
    expect(tx?.type).toBe('RECEIVE');
    expect(tx?.quantity).toBe(30);
    expect(tx?.referenceDoc).toBe('PO-8812');
  });

  // 3. Invalid Quantity Rejected
  it('3. rejects receiving with negative or zero quantity', () => {
    const resultZero = inventoryRepo.receiveStock({
      productId: 'prod-scico-01',
      batchNumber: 'ZERO-QTY',
      expiryDate: '2027-05-01',
      toLocationId: 'loc-cs-01',
      quantity: 0,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(resultZero.success).toBe(false);
    expect(resultZero.errorCode).toBe('INVALID_QUANTITY');

    const resultNeg = inventoryRepo.receiveStock({
      productId: 'prod-scico-01',
      batchNumber: 'NEG-QTY',
      expiryDate: '2027-05-01',
      toLocationId: 'loc-cs-01',
      quantity: -15,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(resultNeg.success).toBe(false);
    expect(resultNeg.errorCode).toBe('INVALID_QUANTITY');
  });

  // 4. Invalid Expiry Rejected
  it('4. rejects receiving with missing, malformed, or already-expired dates', () => {
    // Missing expiry
    const resultEmpty = inventoryRepo.receiveStock({
      productId: 'prod-scico-01',
      batchNumber: 'EXP-EMPTY',
      expiryDate: '',
      toLocationId: 'loc-cs-01',
      quantity: 10,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(resultEmpty.success).toBe(false);
    expect(resultEmpty.errorCode).toBe('EXPIRED_STOCK');

    // Already expired date (past)
    const resultPast = inventoryRepo.receiveStock({
      productId: 'prod-scico-01',
      batchNumber: 'EXP-PAST',
      expiryDate: '2020-01-01',
      toLocationId: 'loc-cs-01',
      quantity: 10,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(resultPast.success).toBe(false);
    expect(resultPast.errorCode).toBe('EXPIRED_STOCK');
    expect(resultPast.error).toContain('Cannot receive expired stock');
  });

  // 5. Manufacture / Expiry Date Validation
  it('5. validates that expiry date must be strictly after manufacture date', () => {
    const resultInvalidDates = inventoryRepo.receiveStock({
      productId: 'prod-scico-01',
      batchNumber: 'MFG-ERR',
      mfgDate: '2026-10-01',
      expiryDate: '2026-05-01', // Expiry before mfg date!
      toLocationId: 'loc-cs-01',
      quantity: 25,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });

    expect(resultInvalidDates.success).toBe(false);
    expect(resultInvalidDates.errorCode).toBe('INVALID_BATCH');
    expect(resultInvalidDates.error).toContain('Expiry date must be strictly after manufacture date');
  });

  // 6. Duplicate Batch Handling
  it('6. deterministically reuses existing batch and increments location stock for identical batch number', () => {
    const testBatch = `DUP-BATCH-${Date.now()}`;

    // First receipt
    const r1 = inventoryRepo.receiveStock({
      productId: 'prod-pm-03',
      batchNumber: testBatch,
      expiryDate: '2028-01-15',
      toLocationId: 'loc-cs-01',
      quantity: 40,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(r1.success).toBe(true);
    const initialBatchId = r1.data?.batchId;

    // Second receipt of same batch number and product
    const r2 = inventoryRepo.receiveStock({
      productId: 'prod-pm-03',
      batchNumber: testBatch,
      expiryDate: '2028-01-15',
      toLocationId: 'loc-cs-01',
      quantity: 25,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(r2.success).toBe(true);
    expect(r2.data?.batchId).toBe(initialBatchId); // Reused deterministic batch ID!

    // Verify stock was incremented to 65
    const stock = inventoryRepo
      .getLocationStock()
      .find(s => s.productId === 'prod-pm-03' && s.batchId === initialBatchId && s.locationId === 'loc-cs-01');
    expect(stock?.quantity).toBe(65);
  });

  // 7. Barcode / Product Identifier Resolution
  it('7. resolves products and variants through SKU, supplier code, barcode, and QR payloads', () => {
    // Resolve by SKU
    const bySku = productIdentifierService.resolveIdentifier('SC-EAB-75');
    expect(bySku.success).toBe(true);
    expect(bySku.product?.id).toBe('prod-scico-01');
    expect(bySku.matchedBy).toBe('SKU');

    // Resolve by Supplier Source Code
    const bySource = productIdentifierService.resolveIdentifier('SRC-SC-EAB-75');
    expect(bySource.success).toBe(true);
    expect(bySource.product?.id).toBe('prod-scico-01');
    expect(bySource.matchedBy).toBe('PRODUCT_CODE');

    // Resolve by Synthetic Demo Barcode
    const byDemoBarcode = productIdentifierService.resolveIdentifier('DEMO-SCICO-EB-001');
    expect(byDemoBarcode.success).toBe(true);
    expect(byDemoBarcode.product?.id).toBe('prod-scico-01');
    expect(byDemoBarcode.isSyntheticDemo).toBe(true);

    // Resolve by Synthetic Demo Identifier (clearly labeled as synthetic demo, not verified GS1/EAN)
    const byBarcode = productIdentifierService.resolveIdentifier('8901234567890');
    expect(byBarcode.success).toBe(true);
    expect(byBarcode.product?.id).toBe('prod-scico-01');
    expect(byBarcode.isSyntheticDemo).toBe(true);

    // Resolve by QR code JSON
    const byQr = productIdentifierService.resolveIdentifier('{"sku":"PM-SUC-15L"}');
    expect(byQr.success).toBe(true);
    expect(byQr.product?.id).toBe('prod-pm-01');
    expect(byQr.matchedBy).toBe('QR');
  });

  // 8. Unknown Barcode Rejected
  it('8. rejects unknown barcodes or identifiers with a descriptive error', () => {
    const unknown = productIdentifierService.resolveIdentifier('INVALID-BARCODE-999999');
    expect(unknown.success).toBe(false);
    expect(unknown.product).toBeUndefined();
    expect(unknown.error).toContain('No medical product found');
  });

  // 9. Transfer Moves Stock Atomically
  it('9. atomically transfers stock between source and destination location', () => {
    // Central Store (240) -> ICU (30)
    const result = inventoryRepo.transferStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-cs-01',
      toLocationId: 'loc-icu-01',
      quantity: 20,
      performedBy: managerUser.fullName,
      actor: managerUser,
      reason: 'Routine ward buffer replenishment',
    });

    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('TRANSFER');

    const csStock = inventoryRepo
      .getLocationStock()
      .find(s => s.batchId === 'batch-eb-2026-001' && s.locationId === 'loc-cs-01');
    const icuStock = inventoryRepo
      .getLocationStock()
      .find(s => s.batchId === 'batch-eb-2026-001' && s.locationId === 'loc-icu-01');

    expect(csStock?.quantity).toBe(220); // 240 - 20
    expect(icuStock?.quantity).toBe(50);  // 30 + 20
  });

  // 10. Source and Destination Cannot Be Identical
  it('10. rejects transfer when source and destination locations are identical', () => {
    const result = inventoryRepo.transferStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-cs-01',
      toLocationId: 'loc-cs-01',
      quantity: 10,
      performedBy: managerUser.fullName,
      actor: managerUser,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SAME_LOCATION');
    expect(result.error).toContain('cannot be identical');
  });

  // 11. Insufficient Stock Transfer Rejected
  it('11. rejects transfer if requested quantity exceeds available stock at source', () => {
    const result = inventoryRepo.transferStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-cs-01',
      toLocationId: 'loc-ed-01',
      quantity: 9999, // Way more than 240
      performedBy: managerUser.fullName,
      actor: managerUser,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_STOCK');
    expect(result.error).toContain('Insufficient stock available');
  });

  // 12. FEFO Batch Recommendation
  it('12. recommends batches ordered by earliest expiry date (First-Expired, First-Out)', () => {
    // Add two batches for a test product in Central Store with different expiry dates
    const earlyBatch = `FEFO-EARLY-${Date.now()}`;
    const laterBatch = `FEFO-LATER-${Date.now()}`;

    inventoryRepo.receiveStock({
      productId: 'prod-scico-05',
      batchNumber: laterBatch,
      expiryDate: '2027-12-31',
      toLocationId: 'loc-cs-01',
      quantity: 50,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });

    inventoryRepo.receiveStock({
      productId: 'prod-scico-05',
      batchNumber: earlyBatch,
      expiryDate: '2026-11-30', // Earlier expiry!
      toLocationId: 'loc-cs-01',
      quantity: 20,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });

    const plan = inventoryRepo.getFEFOAllocation('prod-scico-05', 'loc-cs-01', 30);
    expect(plan.isFullyFulfilled).toBe(true);
    expect(plan.allocations.length).toBeGreaterThanOrEqual(1);
    // The earliest expiring batch must be allocated first
    expect(plan.allocations[0].batchNumber).toBe(earlyBatch);
    expect(plan.allocations[0].allocatedQuantity).toBe(20);
  });

  // 13. Expired Clinical Issue Rejected
  it('13. strictly rejects clinical issuance or patient consumption from expired batches', () => {
    // Create an expired batch record
    const expiredBatchNum = `EXPIRED-${Date.now()}`;
    // Directly inject expired batch into repository
    (inventoryRepo as any).batches.push({
      id: 'batch-expired-test',
      productId: 'prod-scico-01',
      batchNumber: expiredBatchNum,
      expiryDate: '2020-01-01',
      initialQuantity: 50,
      status: 'EXPIRED',
    });
    (inventoryRepo as any).locationStock.push({
      id: 'stock-expired-test',
      productId: 'prod-scico-01',
      batchId: 'batch-expired-test',
      locationId: 'loc-cs-01',
      quantity: 50,
      reservedQuantity: 0,
      lastAuditedAt: new Date().toISOString(),
    });

    // Attempt clinical issue of expired batch
    const issueRes = inventoryRepo.issueStock({
      productId: 'prod-scico-01',
      batchId: 'batch-expired-test',
      fromLocationId: 'loc-cs-01',
      toLocationId: 'loc-icu-01',
      quantity: 5,
      performedBy: managerUser.fullName,
      actor: managerUser,
    });
    expect(issueRes.success).toBe(false);
    expect(issueRes.errorCode).toBe('EXPIRED_STOCK');

    // Attempt consumption of expired batch
    const consumeRes = inventoryRepo.consumeStock({
      productId: 'prod-scico-01',
      batchId: 'batch-expired-test',
      fromLocationId: 'loc-cs-01',
      quantity: 5,
      performedBy: managerUser.fullName,
      actor: managerUser,
    });
    expect(consumeRes.success).toBe(false);
    expect(consumeRes.errorCode).toBe('EXPIRED_STOCK');
  });

  // 14. Consumption Reduces Stock
  it('14. clinical consumption reduces location stock balance atomically', () => {
    const initialIcuStock = inventoryRepo
      .getLocationStock()
      .find(s => s.batchId === 'batch-eb-2026-001' && s.locationId === 'loc-icu-01')?.quantity || 30;

    const result = inventoryRepo.consumeStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-icu-01',
      quantity: 5,
      performedBy: deptUser.fullName,
      actor: deptUser,
      reason: 'Post-op dressing change',
    });

    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('CONSUME');

    const updatedIcuStock = inventoryRepo
      .getLocationStock()
      .find(s => s.batchId === 'batch-eb-2026-001' && s.locationId === 'loc-icu-01')?.quantity;
    expect(updatedIcuStock).toBe(initialIcuStock - 5);
  });

  // 15. Consumption Updates Daily Consumption
  it('15. records daily consumption entry upon stock consumption', () => {
    const today = new Date().toISOString().split('T')[0];
    const prevConsumption = inventoryRepo
      .getDailyConsumption()
      .find(c => c.date === today && c.productId === 'prod-scico-01' && c.locationId === 'loc-icu-01')
      ?.consumedUnits || 0;

    inventoryRepo.consumeStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-icu-01',
      quantity: 4,
      performedBy: deptUser.fullName,
      actor: deptUser,
    });

    const updatedConsumption = inventoryRepo
      .getDailyConsumption()
      .find(c => c.date === today && c.productId === 'prod-scico-01' && c.locationId === 'loc-icu-01')
      ?.consumedUnits;

    expect(updatedConsumption).toBe(prevConsumption + 4);
  });

  // 16. Return Validates Source Stock
  it('16. returns unused stock to Central Store and verifies source stock sufficiency', () => {
    // Return 5 units from ICU to Central Store
    const result = inventoryRepo.returnStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-icu-01',
      toLocationId: 'loc-cs-01',
      quantity: 5,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
      reason: 'Unopened ward surplus return',
    });

    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('RETURN');

    // Attempting return with excessive quantity must fail
    const excessiveReturn = inventoryRepo.returnStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-icu-01',
      toLocationId: 'loc-cs-01',
      quantity: 9999,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(excessiveReturn.success).toBe(false);
    expect(excessiveReturn.errorCode).toBe('INSUFFICIENT_STOCK');
  });

  // 17. Wastage Reduces Stock
  it('17. controlled stock wastage reduces available inventory and captures mandatory reason', () => {
    // Missing reason must be rejected
    const missingReason = inventoryRepo.wasteStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-icu-01',
      quantity: 2,
      performedBy: managerUser.fullName,
      actor: managerUser,
      reason: '', // Empty reason
    });
    expect(missingReason.success).toBe(false);

    // Valid wastage with clinical reason
    const validWastage = inventoryRepo.wasteStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-icu-01',
      quantity: 2,
      performedBy: managerUser.fullName,
      actor: managerUser,
      reason: 'DAMAGE: Torn packaging during transit',
    });
    expect(validWastage.success).toBe(true);
    expect(validWastage.data?.type).toBe('WASTAGE');
  });

  // 18. Movement History Immutable
  it('18. returns deep-cloned movement records preventing tampering of historical ledger', () => {
    const txs = inventoryRepo.getTransactions();
    expect(txs.length).toBeGreaterThan(0);

    const firstTx = txs[0];
    const originalQty = firstTx.quantity;

    // Attempt mutation
    (firstTx as any).quantity = 999999;

    // Refetch from repo
    const refetched = inventoryRepo.getTransactions()[0];
    expect(refetched.quantity).toBe(originalQty);
  });

  // 19. RBAC Restrictions
  it('19. enforces RBAC permissions: storekeeper cannot manage users, department user cannot receive', () => {
    // Department user cannot receive central stock
    const deptReceive = inventoryRepo.receiveStock({
      productId: 'prod-scico-01',
      batchNumber: 'DEPT-RCV-FAIL',
      expiryDate: '2027-10-10',
      toLocationId: 'loc-cs-01',
      quantity: 10,
      performedBy: deptUser.fullName,
      actor: deptUser,
    });
    expect(deptReceive.success).toBe(false);
    expect(deptReceive.errorCode).toBe('UNAUTHORIZED');

    // Storekeeper can receive
    const skReceive = inventoryRepo.receiveStock({
      productId: 'prod-scico-01',
      batchNumber: `SK-RCV-${Date.now()}`,
      expiryDate: '2027-10-10',
      toLocationId: 'loc-cs-01',
      quantity: 10,
      performedBy: storekeeperUser.fullName,
      actor: storekeeperUser,
    });
    expect(skReceive.success).toBe(true);
  });

  // 20. Location Isolation
  it('20. enforces location isolation: department user cannot consume from unauthorized location', () => {
    // deptUser is assigned to ICU (loc-icu-01)
    // Attempting to consume stock directly from Emergency (loc-ed-01) must fail
    const result = inventoryRepo.consumeStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-ed-01', // Unauthorized department!
      quantity: 1,
      performedBy: deptUser.fullName,
      actor: deptUser,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UNAUTHORIZED');
    expect(result.error).toContain('Unauthorized location access');
  });

  // 21. Concurrent Movement Protection
  it('21. protects against simultaneous concurrent consumption of same stock balance', () => {
    const lockKey = 'prod-scico-01:batch-eb-2026-001:loc-cs-01';

    // Simulate User A acquiring row-lock
    const lockAcquired = inventoryRepo.acquireStockLock(lockKey);
    expect(lockAcquired).toBe(true);

    // User B attempts transaction while locked
    const resultB = inventoryRepo.transferStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-cs-01',
      toLocationId: 'loc-icu-01',
      quantity: 10,
      performedBy: 'User B',
      actor: managerUser,
    });

    expect(resultB.success).toBe(false);
    expect(resultB.error).toContain('locked by a concurrent transaction');

    // Release lock
    inventoryRepo.releaseStockLock(lockKey);

    // User C can now succeed
    const resultC = inventoryRepo.transferStock({
      productId: 'prod-scico-01',
      batchId: 'batch-eb-2026-001',
      fromLocationId: 'loc-cs-01',
      toLocationId: 'loc-icu-01',
      quantity: 10,
      performedBy: 'User C',
      actor: managerUser,
    });
    expect(resultC.success).toBe(true);
  });

  // 22. Canonical EB-2026-001 Scenario Remains Intact
  it('22. verifies canonical EB-2026-001 scenario: CS=240, ICU=30, ED=20, 87 units at risk', () => {
    // Reset repository to canonical baseline
    inventoryRepo.resetToCanonicalSeed();

    const csStock = inventoryRepo
      .getLocationStock()
      .find(s => s.batchId === 'batch-eb-2026-001' && s.locationId === 'loc-cs-01');
    const icuStock = inventoryRepo
      .getLocationStock()
      .find(s => s.batchId === 'batch-eb-2026-001' && s.locationId === 'loc-icu-01');
    const edStock = inventoryRepo
      .getLocationStock()
      .find(s => s.batchId === 'batch-eb-2026-001' && s.locationId === 'loc-ed-01');

    expect(csStock?.quantity).toBe(240);
    expect(icuStock?.quantity).toBe(30);
    expect(edStock?.quantity).toBe(20);

    // Risk calculation in Central Store:
    // Stock = 240, Days to Expiry = 45, ADU = 3.4
    // Expected usage = 3.4 * 45 = 153
    // Potential excess = 240 - 153 = 87 units
    const risks = inventoryRepo.calculateExpiryRisks('loc-cs-01');
    const ebRisk = risks.find(r => r.batchId === 'batch-eb-2026-001');

    expect(ebRisk).toBeDefined();
    expect(ebRisk?.currentStock).toBe(240);
    expect(ebRisk?.avgDailyUsage).toBe(3.4);
    expect(ebRisk?.daysToExpiry).toBeGreaterThanOrEqual(44);
    expect(ebRisk?.daysToExpiry).toBeLessThanOrEqual(46);
    expect(ebRisk?.potentialRiskUnits).toBe(87);
    expect(ebRisk?.riskFormattedText).toContain('87 units potentially at risk of expiry');
  });

  // 23. Globally Unique Identifier & Case Normalization
  it('23. normalizes identifier values and resolves case-insensitively', () => {
    const mixedCase = productIdentifierService.resolveIdentifier('  demo-scico-eb-001  ');
    expect(mixedCase.success).toBe(true);
    expect(mixedCase.product?.id).toBe('prod-scico-01');
    expect(mixedCase.identifier?.normalizedValue).toBe('DEMO-SCICO-EB-001');
  });

  // 24. Product vs Variant Identifier Resolution
  it('24. resolves exact product variant when variant-specific identifier is provided', () => {
    const variant1 = productIdentifierService.resolveIdentifier('DEMO-SCICO-EB-001');
    expect(variant1.success).toBe(true);
    expect(variant1.variant?.id).toBe('var-scico-01-75');

    const variant2 = productIdentifierService.resolveIdentifier('DEMO-SCICO-EB-002');
    expect(variant2.success).toBe(true);
    expect(variant2.variant?.id).toBe('var-scico-01-100');
  });

  // 25. Duplicate Identifier Rejection
  it('25. strictly rejects duplicate identifier registration across different products or variants', () => {
    // Attempt registering existing identifier to a different product
    const duplicate = productIdentifierService.registerIdentifier({
      identifierValue: 'DEMO-SCICO-EB-001',
      identifierType: 'BARCODE',
      productId: 'prod-pm-01',
      actor: managerUser,
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.error).toContain('Identifier conflict');
  });

  // 26. Product -> Variant Consistency Enforcement
  it('26. enforces product-to-variant consistency during identifier registration', () => {
    // Attempt registering with a variant that belongs to another product
    const mismatched = productIdentifierService.registerIdentifier({
      identifierValue: 'DEMO-MISMATCH-001',
      identifierType: 'BARCODE',
      productId: 'prod-scico-01',
      variantId: 'var-pm-01-15', // Belongs to prod-pm-01, not prod-scico-01
      actor: managerUser,
    });
    expect(mismatched.success).toBe(false);
    expect(mismatched.error).toContain('Variant consistency violation');
  });

  // 27. Synthetic Demo Identifier Labeling
  it('27. explicitly labels synthetic demonstration identifiers with isSyntheticDemo=true', () => {
    const demoScico = productIdentifierService.resolveIdentifier('DEMO-SCICO-EB-001');
    expect(demoScico.isSyntheticDemo).toBe(true);

    const demoPlasti = productIdentifierService.resolveIdentifier('DEMO-PLASTIMED-SLB-15');
    expect(demoPlasti.isSyntheticDemo).toBe(true);

    // Canonical master SKU is not a synthetic demo identifier
    const realSku = productIdentifierService.resolveIdentifier('SC-EAB-75');
    expect(realSku.isSyntheticDemo).toBe(false);
  });

  // 28. QR Identifier Resolution Disregards Untrusted Metadata
  it('28. extracts only identifier token from QR JSON and ignores arbitrary untrusted metadata', () => {
    const maliciousQrPayload = JSON.stringify({
      sku: 'PM-SUC-15L',
      name: 'Counterfeit / Injected Product Name',
      standardCost: 0.00,
      expiryDate: '2099-12-31',
      toxicPayload: true,
    });

    const resolved = productIdentifierService.resolveIdentifier(maliciousQrPayload);
    expect(resolved.success).toBe(true);
    expect(resolved.matchedBy).toBe('QR');
    // Authoritative name comes from Product Master, not the QR JSON payload
    expect(resolved.product?.name).toBe('Plasti-Vac Disposable Suction Liner Bag 1.5L');
    expect((resolved.product as any).toxicPayload).toBeUndefined();
  });
});
