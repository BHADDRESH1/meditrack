// ==============================================================================
// MEDiTRACK: Rule-Based Action Recommendation Engine
// Strictly Advisory Intelligence (No Autonomous Execution / Human Approval Required)
// ==============================================================================

import { inventoryRepo } from './inventoryRepository';
import { expiryRiskEngine } from './expiryRiskEngine';
import { hasPermission } from './permissions';
import { getDataMode, supabaseRest, onDataModeChange } from './supabaseClient';
import { 
  RecommendationAction, 
  RecommendationStatus 
} from '@/types/riskIntelligence';
import { UserProfile } from '@/types/inventory';

export class RecommendationEngine {
  private inMemoryActions: RecommendationAction[] = [];
  private isInitialized = false;

  public clearForSupabase(): void {
    this.inMemoryActions = [];
    this.isInitialized = false;
  }

  public resetToCanonicalSeed(): void {
    this.inMemoryActions = [];
    this.isInitialized = false;
  }

  /**
   * Generates rule-based recommendations from authoritative inventory state.
   */
  public generateRecommendations(): RecommendationAction[] {
    const expiryRisks = expiryRiskEngine.calculateBatchExpiryRisks();
    const stockoutRisks = expiryRiskEngine.calculateStockoutRisks();
    const overstockRisks = expiryRiskEngine.calculateOverstockRisks();
    const locations = inventoryRepo.getLocations();
    const batches = inventoryRepo.getBatches();
    const actions: RecommendationAction[] = [];

    // --- 1. QUARANTINE / DISPOSAL (Expired Batches) ---
    for (const risk of expiryRisks) {
      if (risk.daysToExpiry < 0) {
        actions.push({
          id: `rec-quar-${risk.batchId}-${risk.locationId}`,
          type: 'QUARANTINE_DISPOSAL',
          riskLevel: 'EXPIRED',
          productId: risk.productId,
          productName: risk.productName,
          productSku: risk.productSku,
          batchId: risk.batchId,
          batchNumber: risk.batchNumber,
          fromLocationId: risk.locationId,
          fromLocationName: risk.locationName,
          quantity: risk.currentQuantity,
          potentialLossExposure: risk.potentialLossExposure,
          reason: `Batch ${risk.batchNumber} expired on ${risk.expiryDate} (${Math.abs(risk.daysToExpiry)} days ago). Material must not be issued for clinical care.`,
          supportingData: {
            currentStock: risk.currentQuantity,
            daysToExpiry: risk.daysToExpiry,
            expiryDate: risk.expiryDate,
          },
          recommendedAction: 'Isolate stock immediately and route to authorized clinical waste quarantine/disposal protocol.',
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // --- 2. MULTI-LOCATION REDISTRIBUTION / INTER-DEPARTMENT TRANSFER ---
    for (const risk of expiryRisks) {
      if (risk.potentialAtRiskUnits <= 0 || risk.daysToExpiry < 0) continue;

      // Check if another clinical department consumes this product and has lower coverage
      const otherLocations = locations.filter(l => l.id !== risk.locationId && l.isActive);
      for (const destLoc of otherLocations) {
        const destVelocity = expiryRiskEngine.calculateConsumptionVelocity(risk.productId, destLoc.id);
        if (destVelocity.averageDailyUsage > 0) {
          // Destination has demand!
          const destStock = inventoryRepo.getLocationStock()
            .filter(s => s.productId === risk.productId && s.locationId === destLoc.id)
            .reduce((sum, s) => sum + s.quantity, 0);

          const destCoverageDays = destStock / destVelocity.averageDailyUsage;

          // If destination has lower coverage or source is central store with surplus
          if (destCoverageDays < risk.daysToExpiry) {
            const potentialToAbsorb = Math.round(destVelocity.averageDailyUsage * Math.min(30, risk.daysToExpiry));
            const transferQty = Math.min(risk.potentialAtRiskUnits, potentialToAbsorb, 50);

            if (transferQty > 0) {
              actions.push({
                id: `rec-trans-${risk.batchId}-${destLoc.id}`,
                type: 'INTER_DEPARTMENT_TRANSFER',
                riskLevel: risk.riskLevel,
                productId: risk.productId,
                productName: risk.productName,
                productSku: risk.productSku,
                batchId: risk.batchId,
                batchNumber: risk.batchNumber,
                fromLocationId: risk.locationId,
                fromLocationName: risk.locationName,
                toLocationId: destLoc.id,
                toLocationName: destLoc.name,
                quantity: transferQty,
                potentialLossExposure: Number((transferQty * risk.unitCost).toFixed(2)),
                reason: `Source location has ${risk.potentialAtRiskUnits} units potentially at risk. ${destLoc.name} has higher consumption capacity (${destVelocity.averageDailyUsage} units/day) with ${destCoverageDays.toFixed(1)} days existing coverage.`,
                supportingData: {
                  sourceStock: risk.currentQuantity,
                  sourceAdu: risk.averageDailyUsage,
                  potentialRiskUnits: risk.potentialAtRiskUnits,
                  destinationStock: destStock,
                  destinationAdu: destVelocity.averageDailyUsage,
                  destinationCoverageDays: Number(destCoverageDays.toFixed(1)),
                },
                recommendedAction: `Consider inter-department transfer of ${transferQty} units from ${risk.locationName} to ${destLoc.name} to avoid potential expiry loss.`,
                status: 'OPEN',
                createdAt: new Date().toISOString(),
              });
              break; // One primary transfer candidate per at-risk batch
            }
          }
        }
      }
    }

    // --- 3. SUPPLIER RETURN REVIEW ---
    // Rule: Near-expiry stock in Central Store with > 30 days remaining shelf life
    for (const risk of expiryRisks) {
      if (risk.locationCode === 'LOC-CS-01' || risk.locationName.toLowerCase().includes('central')) {
        if (risk.potentialAtRiskUnits > 20 && risk.daysToExpiry >= 30 && risk.daysToExpiry <= 60) {
          actions.push({
            id: `rec-sup-ret-${risk.batchId}`,
            type: 'SUPPLIER_RETURN_REVIEW',
            riskLevel: risk.riskLevel,
            productId: risk.productId,
            productName: risk.productName,
            productSku: risk.productSku,
            batchId: risk.batchId,
            batchNumber: risk.batchNumber,
            fromLocationId: risk.locationId,
            fromLocationName: risk.locationName,
            quantity: risk.potentialAtRiskUnits,
            potentialLossExposure: risk.potentialLossExposure,
            reason: `Central Depot holds ${risk.potentialAtRiskUnits} excess units with ${risk.daysToExpiry} days shelf-life. Review supplier-return eligibility before return window expires.`,
            supportingData: {
              currentStock: risk.currentQuantity,
              daysToExpiry: risk.daysToExpiry,
              potentialRiskUnits: risk.potentialAtRiskUnits,
            },
            recommendedAction: 'Review supplier-return eligibility under vendor agreement terms before shelf-life declines below 30 days.',
            status: 'OPEN',
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // --- 4. FEFO ISSUE PRIORITIZATION ---
    // Rule: Location has multiple active batches for a product, and an earlier batch needs issue priority
    const stocksByLocProd = new Map<string, string[]>();
    for (const s of inventoryRepo.getLocationStock()) {
      if (s.quantity <= 0) continue;
      const key = `${s.productId}:${s.locationId}`;
      const list = stocksByLocProd.get(key) || [];
      list.push(s.batchId);
      stocksByLocProd.set(key, list);
    }

    for (const [key, batchIds] of stocksByLocProd.entries()) {
      if (batchIds.length > 1) {
        const [prodId, locId] = key.split(':');
        const locBatches = batches
          .filter(b => batchIds.includes(b.id))
          .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

        const earliestBatch = locBatches[0];
        const latestBatch = locBatches[locBatches.length - 1];

        const daysDiff = Math.ceil(
          (new Date(latestBatch.expiryDate).getTime() - new Date(earliestBatch.expiryDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff >= 30) {
          const product = inventoryRepo.getProductById(prodId);
          const location = inventoryRepo.getLocationById(locId);

          actions.push({
            id: `rec-fefo-${earliestBatch.id}-${locId}`,
            type: 'FEFO_ISSUE',
            riskLevel: 'HIGH',
            productId: prodId,
            productName: product?.name || prodId,
            productSku: product?.sku || 'SKU',
            batchId: earliestBatch.id,
            batchNumber: earliestBatch.batchNumber,
            fromLocationId: locId,
            fromLocationName: location?.name || locId,
            quantity: earliestBatch.initialQuantity,
            potentialLossExposure: 0,
            reason: `Multiple active batches exist at ${location?.name}. Batch ${earliestBatch.batchNumber} expires ${daysDiff} days prior to Batch ${latestBatch.batchNumber}.`,
            supportingData: {
              earliestBatch: earliestBatch.batchNumber,
              earliestExpiry: earliestBatch.expiryDate,
              laterBatch: latestBatch.batchNumber,
              laterExpiry: latestBatch.expiryDate,
            },
            recommendedAction: `Prioritize issuing Batch ${earliestBatch.batchNumber} (FEFO) before later-expiring stock.`,
            status: 'OPEN',
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // --- 5. STOCKOUT ESCALATION ---
    for (const sRisk of stockoutRisks) {
      if (sRisk.riskLevel === 'CRITICAL' || sRisk.riskLevel === 'HIGH') {
        actions.push({
          id: `rec-stockout-${sRisk.productId}-${sRisk.locationId}`,
          type: 'STOCKOUT_ESCALATION',
          riskLevel: sRisk.riskLevel,
          productId: sRisk.productId,
          productName: sRisk.productName,
          productSku: sRisk.productSku,
          fromLocationId: sRisk.locationId,
          fromLocationName: sRisk.locationName,
          quantity: sRisk.availableQuantity,
          potentialLossExposure: 0,
          reason: `Available stock (${sRisk.availableQuantity} units) covers only ${sRisk.daysOfStockRemaining} days based on historical consumption of ${sRisk.averageDailyUsage} units/day.`,
          supportingData: {
            availableQuantity: sRisk.availableQuantity,
            adu: sRisk.averageDailyUsage,
            daysOfStockRemaining: sRisk.daysOfStockRemaining,
            reorderPoint: sRisk.reorderPoint,
          },
          recommendedAction: 'Review replenishment urgently; current inventory may not cover projected department demand.',
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // --- 6. PURCHASE ORDER REVIEW ---
    for (const oRisk of overstockRisks) {
      if (oRisk.isOverstocked && oRisk.excessQuantity > 30) {
        actions.push({
          id: `rec-po-rev-${oRisk.productId}-${oRisk.locationId}`,
          type: 'PURCHASE_ORDER_REVIEW',
          riskLevel: 'MEDIUM',
          productId: oRisk.productId,
          productName: oRisk.productName,
          productSku: oRisk.productSku,
          fromLocationId: oRisk.locationId,
          fromLocationName: oRisk.locationName,
          quantity: oRisk.excessQuantity,
          potentialLossExposure: 0,
          reason: `Current stock represents ${oRisk.coverageDays} days coverage against policy target of ${oRisk.targetCoverageDays} days (${oRisk.excessQuantity} excess units).`,
          supportingData: {
            currentQuantity: oRisk.currentQuantity,
            coverageDays: oRisk.coverageDays,
            targetCoverageDays: oRisk.targetCoverageDays,
            excessQuantity: oRisk.excessQuantity,
          },
          recommendedAction: 'Review pending purchase orders to suspend or defer scheduled deliveries until inventory stabilizes.',
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
      }
    }

    return actions;
  }

  /**
   * Retrieves active action queue items.
   * In SUPABASE mode: queries public.recommendation_actions.
   * In DEMO mode: returns in-memory actions.
   */
  public async getActionQueue(): Promise<{
    success: boolean;
    actions: RecommendationAction[];
    error: string | null;
  }> {
    if (getDataMode() === 'SUPABASE') {
      const res = await supabaseRest<any[]>('recommendation_actions?select=*&order=created_at.desc');
      if (res.error) {
        return {
          success: false,
          actions: [],
          error: res.error,
        };
      }

      const rows = res.data || [];
      const mapped: RecommendationAction[] = rows.map(r => ({
        id: r.id,
        type: r.recommendation_type,
        riskLevel: r.risk_level,
        productId: r.product_id,
        productName: r.product_name || 'Product',
        productSku: r.product_sku || 'SKU',
        batchId: r.batch_id || undefined,
        batchNumber: r.batch_number || undefined,
        fromLocationId: r.from_location_id || undefined,
        fromLocationName: r.from_location_name || undefined,
        toLocationId: r.to_location_id || undefined,
        toLocationName: r.to_location_name || undefined,
        quantity: r.quantity,
        potentialLossExposure: parseFloat(r.potential_loss_exposure) || 0,
        reason: r.reason,
        supportingData: r.calculation_details || {},
        recommendedAction: r.recommended_action || r.reason,
        status: r.status,
        reviewedBy: r.reviewed_by || undefined,
        reviewedByName: r.reviewed_by_name || undefined,
        reviewedAt: r.reviewed_at || undefined,
        reviewNotes: r.review_notes || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return {
        success: true,
        actions: mapped,
        error: null,
      };
    }

    // In-memory DEMO mode
    if (!this.isInitialized || this.inMemoryActions.length === 0) {
      this.inMemoryActions = this.generateRecommendations();
      this.isInitialized = true;
    }

    return {
      success: true,
      actions: [...this.inMemoryActions],
      error: null,
    };
  }

  /**
   * Updates recommendation action status with strict RBAC enforcement.
   * Status transitions: OPEN -> REVIEWED -> APPROVED / REJECTED -> COMPLETED.
   * Approval does NOT execute any inventory movement.
   */
  public async updateActionStatus(
    actionId: string,
    newStatus: RecommendationStatus,
    user: UserProfile,
    reviewNotes?: string
  ): Promise<{ success: boolean; error?: string }> {
    // 1. Strict RBAC check
    if (!hasPermission(user, 'recommendations:approve')) {
      return {
        success: false,
        error: `UNAUTHORIZED: Role ${user.role} does not possess permissions to approve, review, or reject clinical supply recommendations. Only ADMIN or INVENTORY_MANAGER may approve recommendations.`,
      };
    }

    if (getDataMode() === 'SUPABASE') {
      // In Supabase mode, call RPC process_recommendation_action or PATCH
      const patchRes = await supabaseRest<any>(`recommendation_actions?id=eq.${actionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null,
          updated_at: new Date().toISOString(),
        }),
      });

      if (patchRes.error) {
        return { success: false, error: patchRes.error };
      }
      return { success: true };
    }

    // In-memory DEMO mode
    const action = this.inMemoryActions.find(a => a.id === actionId);
    if (!action) {
      return { success: false, error: `Action ${actionId} not found.` };
    }

    action.status = newStatus;
    action.reviewedBy = user.id;
    action.reviewedByName = user.fullName;
    action.reviewedAt = new Date().toISOString();
    action.reviewNotes = reviewNotes || action.reviewNotes;

    return { success: true };
  }

  /**
   * Explicit Execution of an Approved Recommendation.
   * Only explicit user invocation of this method executes inventory movements!
   * Approving an action will NEVER automatically trigger this.
   */
  public async executeApprovedTransfer(
    actionId: string,
    user: UserProfile
  ): Promise<{ success: boolean; error?: string }> {
    // 1. RBAC Verification
    if (!hasPermission(user, 'inventory:transfer')) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Insufficient permissions to execute stock transfer.',
      };
    }

    const queueRes = await this.getActionQueue();
    const action = queueRes.actions.find(a => a.id === actionId);
    if (!action) {
      return { success: false, error: 'Recommendation action not found.' };
    }

    if (action.status !== 'APPROVED') {
      return {
        success: false,
        error: `INVALID_STATE: Action must be in APPROVED status before execution (current status: ${action.status}).`,
      };
    }

    if (action.type !== 'INTER_DEPARTMENT_TRANSFER' || !action.toLocationId || !action.fromLocationId || !action.batchId) {
      return {
        success: false,
        error: 'INVALID_ACTION: This recommendation type cannot be executed as an inventory transfer.',
      };
    }

    // 2. Execute movement through authoritative repository
    const moveRes = await inventoryRepo.executeMovement({
      type: 'TRANSFER',
      productId: action.productId,
      batchId: action.batchId,
      fromLocationId: action.fromLocationId,
      toLocationId: action.toLocationId,
      quantity: action.quantity,
      performedBy: user.fullName,
      reason: `Executed Approved Recommendation: ${action.reason}`,
      referenceDoc: `REC-${action.id.slice(0, 8).toUpperCase()}`,
    });

    if (!moveRes.success) {
      return { success: false, error: moveRes.error };
    }

    // 3. Mark Action COMPLETED
    await this.updateActionStatus(actionId, 'COMPLETED', user, 'Transfer executed and recorded in inventory ledger.');

    return { success: true };
  }
}

export const recommendationEngine = new RecommendationEngine();

onDataModeChange((mode) => {
  if (mode === 'SUPABASE') {
    recommendationEngine.clearForSupabase();
  } else {
    recommendationEngine.resetToCanonicalSeed();
  }
});

