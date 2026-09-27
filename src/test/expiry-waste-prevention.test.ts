import { describe, it, expect, beforeEach, vi } from 'vitest';
import { expiryRiskEngine } from '@/services/expiryRiskEngine';
import { recommendationEngine } from '@/services/recommendationEngine';
import { riskEngineConfig } from '@/services/riskEngineConfig';
import { inventoryRepo } from '@/services/inventoryRepository';
import { UserProfile } from '@/types/inventory';
import { setDataMode, clearSupabaseSession } from '@/services/supabaseClient';

describe('MEDiTRACK Phase 6: Expiry & Waste Prevention Intelligence Suite', () => {
  const adminUser: UserProfile = {
    id: 'user-admin-01',
    email: 'admin@meditrack.health',
    fullName: 'Dr. Sarah Chen (Admin)',
    role: 'ADMIN',
    facility: 'St. Jude General Hospital',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const managerUser: UserProfile = {
    id: 'user-mgr-01',
    email: 'manager@meditrack.health',
    fullName: 'Elena Rostova (Inventory Lead)',
    role: 'INVENTORY_MANAGER',
    facility: 'St. Jude General Hospital',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const storekeeperUser: UserProfile = {
    id: 'user-sk-01',
    email: 'storekeeper@meditrack.health',
    fullName: 'James Sterling (Storekeeper)',
    role: 'STOREKEEPER',
    facility: 'St. Jude General Hospital',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const deptUser: UserProfile = {
    id: 'user-dept-01',
    email: 'nurse@meditrack.health',
    fullName: 'Nurse Clara Oswald',
    role: 'DEPARTMENT_USER',
    facility: 'St. Jude General Hospital',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    setDataMode('DEMO');
    clearSupabaseSession();
    riskEngineConfig.resetToDefaults();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. CANONICAL SCENARIO DYNAMIC VERIFICATION (EB-2026-001)
  // ============================================================================
  describe('1. Canonical Scenario EB-2026-001 Verification', () => {
    it('verifies dynamic calculation: 240 stock, 45 days, 3.4 ADU -> 153 expected, 87 at risk', () => {
      const risks = expiryRiskEngine.calculateBatchExpiryRisks('loc-cs-01');
      const ebRisk = risks.find(r => r.batchNumber === 'EB-2026-001');

      expect(ebRisk).toBeDefined();
      expect(ebRisk!.currentQuantity).toBe(240);
      expect(ebRisk!.daysToExpiry).toBe(45);
      expect(ebRisk!.averageDailyUsage).toBe(3.4);

      // Verify the formula rather than relying on hardcoded numbers
      const calculatedExpected = Math.round(ebRisk!.averageDailyUsage * ebRisk!.daysToExpiry);
      expect(calculatedExpected).toBe(153);
      expect(ebRisk!.expectedUsageBeforeExpiry).toBe(153);

      const calculatedPotentialRisk = Math.max(0, ebRisk!.currentQuantity - calculatedExpected);
      expect(calculatedPotentialRisk).toBe(87);
      expect(ebRisk!.potentialAtRiskUnits).toBe(87);

      // Multi-location total stock verification
      const allStock = inventoryRepo.getLocationStock().filter(s => s.batchId === 'batch-eb-2026-001');
      const csStock = allStock.find(s => s.locationId === 'loc-cs-01')?.quantity || 0;
      const icuStock = allStock.find(s => s.locationId === 'loc-icu-01')?.quantity || 0;
      const edStock = allStock.find(s => s.locationId === 'loc-ed-01')?.quantity || 0;

      expect(csStock).toBe(240);
      expect(icuStock).toBe(30);
      expect(edStock).toBe(20);
      expect(csStock + icuStock + edStock).toBe(290);
    });

    it('calculates financial loss exposure from product unit cost', () => {
      const risks = expiryRiskEngine.calculateBatchExpiryRisks('loc-cs-01');
      const ebRisk = risks.find(r => r.batchNumber === 'EB-2026-001');

      expect(ebRisk).toBeDefined();
      expect(ebRisk!.unitCost).toBeGreaterThan(0);
      const expectedLoss = Number((ebRisk!.potentialAtRiskUnits * ebRisk!.unitCost).toFixed(2));
      expect(ebRisk!.potentialLossExposure).toBe(expectedLoss);
    });
  });

  // ============================================================================
  // 2. EXPIRY RISK THRESHOLDS & ENGINE
  // ============================================================================
  describe('2. Expiry Risk Engine & Thresholds', () => {
    it('classifies batches by centralized risk thresholds', () => {
      const config = riskEngineConfig.getConfig();
      expect(config.expiry.criticalDays).toBe(7);
      expect(config.expiry.highDays).toBe(30);
      expect(config.expiry.mediumDays).toBe(60);
      expect(config.expiry.lowDays).toBe(61);
    });

    it('refuses to fabricate consumption forecasts when history is insufficient', () => {
      // Query product with zero consumption history
      const velocity = expiryRiskEngine.calculateConsumptionVelocity('prod-scico-unknown', 'loc-cs-01');
      expect(velocity.hasSufficientHistory).toBe(false);
      expect(velocity.averageDailyUsage).toBe(0);
      expect(velocity.daysRecorded).toBe(0);
    });
  });

  // ============================================================================
  // 3. STOCKOUT RISK ENGINE
  // ============================================================================
  describe('3. Stockout Risk Engine', () => {
    it('calculates days of stock remaining and categorizes risk levels', () => {
      const stockouts = expiryRiskEngine.calculateStockoutRisks();
      expect(stockouts.length).toBeGreaterThan(0);

      // Verify that items with sufficient history calculate days of stock
      const valid = stockouts.filter(s => s.hasSufficientHistory && s.daysOfStockRemaining !== null);
      for (const item of valid) {
        const calculated = Number((item.availableQuantity / item.averageDailyUsage).toFixed(1));
        expect(item.daysOfStockRemaining).toBe(calculated);
        if (item.daysOfStockRemaining !== null && item.daysOfStockRemaining < 3) {
          expect(item.riskLevel).toBe('CRITICAL');
        } else if (item.daysOfStockRemaining !== null && item.daysOfStockRemaining <= 7) {
          expect(item.riskLevel).toBe('HIGH');
        }
      }
    });

    it('identifies products with insufficient consumption history without fabricating a forecast', () => {
      const stockouts = expiryRiskEngine.calculateStockoutRisks();
      const insufficient = stockouts.filter(s => !s.hasSufficientHistory);
      for (const item of insufficient) {
        expect(item.daysOfStockRemaining).toBeNull();
        expect(item.explanation).toContain('Insufficient consumption history');
      }
    });
  });

  // ============================================================================
  // 4. OVERSTOCK & SLOW-MOVING RISK
  // ============================================================================
  describe('4. Overstock & Slow-Moving Risk', () => {
    it('identifies overstock where coverage exceeds configurable policy threshold', () => {
      const overstocks = expiryRiskEngine.calculateOverstockRisks();
      expect(overstocks).toBeDefined();

      const config = riskEngineConfig.getConfig();
      for (const item of overstocks.filter(o => o.hasSufficientHistory)) {
        if (item.coverageDays && item.coverageDays > config.overstock.overstockThresholdDays) {
          expect(item.isOverstocked).toBe(true);
          expect(item.excessQuantity).toBeGreaterThan(0);
        }
      }
    });

    it('permits dynamic reconfiguration of overstock threshold policy', () => {
      riskEngineConfig.updateOverstockPolicy(45, 90);
      const config = riskEngineConfig.getConfig();
      expect(config.overstock.targetCoverageDays).toBe(45);
      expect(config.overstock.overstockThresholdDays).toBe(90);

      expect(() => riskEngineConfig.updateOverstockPolicy(0, 30)).toThrow();
      expect(() => riskEngineConfig.updateOverstockPolicy(50, 40)).toThrow();
    });

    it('identifies slow-moving inventory with actual consumption telemetry', () => {
      const slow = expiryRiskEngine.calculateSlowMovingInventory();
      expect(slow).toBeDefined();
      for (const s of slow) {
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(s.riskLevel);
      }
    });
  });

  // ============================================================================
  // 5. ACTION RECOMMENDATION ENGINE & RBAC
  // ============================================================================
  describe('5. Action Recommendation Engine & Human-in-the-Loop Workflow', () => {
    it('generates rule-based recommendations across required action types', () => {
      const actions = recommendationEngine.generateRecommendations();
      expect(actions.length).toBeGreaterThan(0);

      // Verify supplier return review wording
      const supplierReturns = actions.filter(a => a.type === 'SUPPLIER_RETURN_REVIEW');
      for (const sr of supplierReturns) {
        expect(sr.recommendedAction.toLowerCase()).toContain('review supplier-return eligibility');
        expect(sr.reason.toLowerCase()).toContain('review supplier-return eligibility');
      }
    });

    it('enforces RBAC: only ADMIN and INVENTORY_MANAGER can approve or reject recommendations', async () => {
      const queueRes = await recommendationEngine.getActionQueue();
      const firstAction = queueRes.actions[0];
      expect(firstAction).toBeDefined();

      // Storekeeper rejection
      const skResult = await recommendationEngine.updateActionStatus(
        firstAction.id,
        'APPROVED',
        storekeeperUser
      );
      expect(skResult.success).toBe(false);
      expect(skResult.error).toContain('UNAUTHORIZED');

      // Department user rejection
      const deptResult = await recommendationEngine.updateActionStatus(
        firstAction.id,
        'APPROVED',
        deptUser
      );
      expect(deptResult.success).toBe(false);
      expect(deptResult.error).toContain('UNAUTHORIZED');

      // Inventory Manager authorization
      const mgrResult = await recommendationEngine.updateActionStatus(
        firstAction.id,
        'APPROVED',
        managerUser
      );
      expect(mgrResult.success).toBe(true);

      // Verify status is now APPROVED
      const updatedQueue = await recommendationEngine.getActionQueue();
      const updatedAction = updatedQueue.actions.find(a => a.id === firstAction.id);
      expect(updatedAction?.status).toBe('APPROVED');
    });

    it('CRITICAL: Approval does NOT automatically execute a transfer movement', async () => {
      const queueRes = await recommendationEngine.getActionQueue();
      const transferAction = queueRes.actions.find(a => a.type === 'INTER_DEPARTMENT_TRANSFER');
      expect(transferAction).toBeDefined();

      const txCountBefore = inventoryRepo.getTransactions().length;

      // Approve recommendation
      const appRes = await recommendationEngine.updateActionStatus(
        transferAction!.id,
        'APPROVED',
        adminUser
      );
      expect(appRes.success).toBe(true);

      // Verify that ledger did NOT record a transfer on mere approval!
      const txCountAfterApproval = inventoryRepo.getTransactions().length;
      expect(txCountAfterApproval).toBe(txCountBefore);

      // Only explicit executeApprovedTransfer() creates the transaction
      const execRes = await recommendationEngine.executeApprovedTransfer(
        transferAction!.id,
        adminUser
      );
      expect(execRes.success).toBe(true);

      const txCountAfterExecution = inventoryRepo.getTransactions().length;
      expect(txCountAfterExecution).toBe(txCountBefore + 1);

      // Verify action is now COMPLETED
      const finalQueue = await recommendationEngine.getActionQueue();
      const completedAction = finalQueue.actions.find(a => a.id === transferAction!.id);
      expect(completedAction?.status).toBe('COMPLETED');
    });
  });

  // ============================================================================
  // 6. ZERO SILENT FALLBACK IN SUPABASE MODE
  // ============================================================================
  describe('6. Zero Silent Fallback in SUPABASE Mode', () => {
    it('returns authentic empty/error state when Supabase query fails without falling back to mock actions', async () => {
      setDataMode('SUPABASE');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(
          JSON.stringify({ code: '42P01', message: 'relation "recommendation_actions" does not exist' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const qRes = await recommendationEngine.getActionQueue();
      expect(qRes.success).toBe(false);
      expect(qRes.error).toContain('relation "recommendation_actions" does not exist');
      expect(qRes.actions.length).toBe(0);
    });
  });
});
