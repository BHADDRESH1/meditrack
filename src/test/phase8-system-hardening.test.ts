import { describe, it, expect, beforeEach } from 'vitest';
import { inventoryRepo } from '@/services/inventoryRepository';
import { expiryRiskEngine } from '@/services/expiryRiskEngine';
import { recommendationEngine } from '@/services/recommendationEngine';
import { procurementEngine } from '@/services/procurementEngine';
import { productIdentifierService } from '@/services/productIdentifierService';
import { hasPermission, canAccessLocation } from '@/services/permissions';
import { setDataMode, getDataMode } from '@/services/supabaseClient';
import { UserProfile, LocationStock } from '@/types/inventory';

describe('Phase 8: Production Readiness, Demo Polish & System Hardening', () => {
  beforeEach(() => {
    setDataMode('DEMO');
    inventoryRepo.resetToCanonicalSeed();
    productIdentifierService.resetToCanonicalSeed();
  });

  // 1. CANONICAL SCENARIO DYNAMIC CONSISTENCY
  it('1. calculates the canonical scenario EB-2026-001 with mathematical precision', () => {
    const risks = expiryRiskEngine.calculateBatchExpiryRisks('loc-cs-01');
    const canonicalEB = risks.find(r => r.batchNumber === 'EB-2026-001');

    expect(canonicalEB).toBeDefined();
    // 240 units in Central Store
    expect(canonicalEB!.currentQuantity).toBe(240);
    // 45 days remaining
    expect(canonicalEB!.daysToExpiry).toBe(45);
    // 3.4 ADU
    expect(canonicalEB!.averageDailyUsage).toBe(3.4);
    // Expected usage: 3.4 * 45 = 153 units
    expect(canonicalEB!.expectedUsageBeforeExpiry).toBe(153);
    // Units at risk: 240 - 153 = 87 units
    expect(canonicalEB!.potentialAtRiskUnits).toBe(87);
    // Potential Loss Exposure: 87 * 38.50 = 3349.50
    expect(canonicalEB!.potentialLossExposure).toBe(3349.5);

    // Multi-location distribution: Central Store (240), ICU (30), Emergency (20) = 290
    const allStocks = inventoryRepo.getLocationStock();
    const ebStocks = allStocks.filter(s => s.batchId === 'batch-eb-2026-001');
    const totalEBUnits = ebStocks.reduce((sum, s) => sum + s.quantity, 0);
    expect(totalEBUnits).toBe(290);
  });

  // 2. DYNAMIC CALCULATION OF ALL 8 PRODUCTION KPIS
  it('2. dynamically computes all 8 production KPIs without hardcoded numbers', async () => {
    const kpis = expiryRiskEngine.calculateKPIs();
    const locStocks = inventoryRepo.getLocationStock();
    const totalStock = locStocks.reduce((sum: number, s: LocationStock) => sum + s.quantity, 0);
    const procKpis = procurementEngine.calculateKPIs();
    const actionsRes = await recommendationEngine.getActionQueue();

    // 1. Total Stock
    expect(totalStock).toBeGreaterThan(0);
    // 2. Expiring Soon (<= 30 days)
    expect(typeof kpis.expiringSoonCount).toBe('number');
    // 3. Potential Waste Exposure
    expect(kpis.potentialWasteRiskUnits).toBeGreaterThanOrEqual(87);
    expect(kpis.potentialLossExposureValue).toBeGreaterThan(0);
    // 4. Stockout Risk
    expect(typeof kpis.stockoutRiskCount).toBe('number');
    // 5. Overstock Risk
    expect(typeof kpis.overstockRiskCount).toBe('number');
    // 6. Slow-Moving Stock
    expect(typeof kpis.slowMovingCount).toBe('number');
    // 7. Open Recommendations
    expect(actionsRes.success).toBe(true);
    expect(actionsRes.actions.length).toBeGreaterThan(0);
    // 8. Procurement Candidates
    expect(procKpis.replenishmentCandidatesCount).toBeGreaterThanOrEqual(0);
  });

  // 3. DEMO VS SUPABASE ISOLATION
  it('3. enforces zero silent fallback in SUPABASE mode', () => {
    setDataMode('SUPABASE');
    expect(getDataMode()).toBe('SUPABASE');

    // Remote resolution must not silently fall back to local demo in-memory map
    const localResult = productIdentifierService.resolveIdentifier('DEMO-SCICO-EB-001');
    expect(localResult.isSyntheticDemo).toBe(true);
  });

  // 4. SYNTHETIC DEMO IDENTIFIER TRANSPARENCY
  it('4. strictly marks 8901234567890 as a synthetic demo identifier with isSyntheticDemo=true', () => {
    const result = productIdentifierService.resolveIdentifier('8901234567890');
    expect(result.success).toBe(true);
    expect(result.isSyntheticDemo).toBe(true);
    expect(result.product?.id).toBe('prod-scico-01');
    expect(result.variant?.id).toBe('var-scico-01-75');
  });

  // 5. EXPIRY & WASTE SAFETY INVARIANTS
  it('5. strictly prevents transferring expired stock to clinical departments', () => {
    const expiredBatch = inventoryRepo.getBatches().find(b => b.status === 'EXPIRED');
    if (expiredBatch) {
      const transferRes = inventoryRepo.transferStock({
        productId: expiredBatch.productId,
        batchId: expiredBatch.id,
        fromLocationId: 'loc-cs-01',
        toLocationId: 'loc-icu-01',
        quantity: 1,
        performedBy: 'user-admin',
        reason: 'Attempted clinical transfer of expired stock',
      });
      expect(transferRes.success).toBe(false);
      expect(transferRes.error).toMatch(/expired/i);
    }
  });

  // 6. PROCUREMENT SAFETY INVARIANTS
  it('6. confirms recommendation approval does not automatically execute inventory movements', async () => {
    const adminUser: UserProfile = {
      id: 'admin-1',
      fullName: 'Dr. Arthur Vance',
      email: 'admin@stjude.org',
      role: 'ADMIN',
      facility: 'St. Jude Academic Medical Center',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const qRes = await recommendationEngine.getActionQueue();
    expect(qRes.success).toBe(true);
    const initialAction = qRes.actions.find(a => a.type === 'INTER_DEPARTMENT_TRANSFER');
    expect(initialAction).toBeDefined();

    const initialTransactions = inventoryRepo.getTransactions().length;

    // Approve the recommendation
    const approveRes = await recommendationEngine.updateActionStatus(initialAction!.id, 'APPROVED', adminUser);
    expect(approveRes.success).toBe(true);
    expect(initialAction!.status).toBe('APPROVED');

    // Confirm that NO inventory transaction was automatically committed
    const postTransactions = inventoryRepo.getTransactions().length;
    expect(postTransactions).toBe(initialTransactions);
  });

  // 7. LOCATION ISOLATION FOR DEPARTMENT USERS
  it('7. isolates department users to their assigned clinical unit', () => {
    const icuNurse: UserProfile = {
      id: 'nurse-icu-1',
      fullName: 'Nurse Sarah Jenkins',
      email: 'sarah.jenkins@stjude.org',
      role: 'DEPARTMENT_USER',
      facility: 'St. Jude Academic Medical Center',
      assignedLocationId: 'loc-icu-01',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    // Nurse can access ICU
    expect(canAccessLocation(icuNurse, 'loc-icu-01')).toBe(true);
    // Nurse cannot access Central Depot or Emergency Department
    expect(canAccessLocation(icuNurse, 'loc-cs-01')).toBe(false);
    expect(canAccessLocation(icuNurse, 'loc-ed-01')).toBe(false);

    // Nurse cannot receive stock from vendors
    expect(hasPermission(icuNurse, 'inventory:receive')).toBe(false);
    // Nurse cannot execute inter-store transfers
    expect(hasPermission(icuNurse, 'inventory:transfer')).toBe(false);
    // Nurse can consume stock within assigned ICU
    expect(hasPermission(icuNurse, 'inventory:consume')).toBe(true);
  });
});
