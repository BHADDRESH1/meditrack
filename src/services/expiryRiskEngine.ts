// ==============================================================================
// MEDiTRACK: Transparent Expiry & Waste Prevention Calculation Engine
// 100% Deterministic Mathematical Formulations (No Black-Box / No AI)
// ==============================================================================

import { inventoryRepo } from './inventoryRepository';
import { riskEngineConfig } from './riskEngineConfig';
import { 
  BatchExpiryCalculation, 
  ProductStockoutCalculation, 
  OverstockCalculation, 
  SlowMovingCalculation, 
  CommandCenterKPIs,
  ExpiryRiskLevel,
  StockoutRiskLevel
} from '@/types/riskIntelligence';

export class ExpiryRiskEngine {
  /**
   * Computes Average Daily Usage (ADU) strictly from actual daily_consumption records.
   * Never fabricates usage values or forecasts.
   */
  public calculateConsumptionVelocity(productId: string, locationId: string): {
    averageDailyUsage: number;
    daysRecorded: number;
    totalConsumed: number;
    hasSufficientHistory: boolean;
    lastConsumptionDate: string | null;
  } {
    const config = riskEngineConfig.getConfig();
    const allConsumption = inventoryRepo.getDailyConsumption();
    
    // Filter records matching product and location
    const matched = allConsumption.filter(
      c => c.productId === productId && c.locationId === locationId
    );

    if (matched.length === 0) {
      return {
        averageDailyUsage: 0,
        daysRecorded: 0,
        totalConsumed: 0,
        hasSufficientHistory: false,
        lastConsumptionDate: null,
      };
    }

    // Sort by date descending
    const sorted = [...matched].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastDate = sorted[0].date;

    // Distinct dates
    const distinctDates = new Set(matched.map(c => c.date));
    const daysRecorded = distinctDates.size;
    const totalConsumed = matched.reduce((sum, c) => sum + c.consumedUnits, 0);

    const hasSufficientHistory = daysRecorded >= config.consumption.minDistinctDaysRequired;
    const averageDailyUsage = daysRecorded > 0 ? Number((totalConsumed / daysRecorded).toFixed(2)) : 0;

    return {
      averageDailyUsage,
      daysRecorded,
      totalConsumed,
      hasSufficientHistory,
      lastConsumptionDate: lastDate,
    };
  }

  /**
   * Deterministic Expiry-Risk Calculation for Every Active Batch in Every Location.
   * 
   * Formula:
   *   days_to_expiry = ceil((expiry_date - today) / 1_day)
   *   expected_usage = average_daily_usage * days_to_expiry
   *   potential_at_risk = max(0, current_quantity - expected_usage)
   *   potential_loss_exposure = potential_at_risk * unit_cost
   */
  public calculateBatchExpiryRisks(filterLocationId?: string): BatchExpiryCalculation[] {
    const config = riskEngineConfig.getConfig();
    const batches = inventoryRepo.getBatches();
    const locationStocks = inventoryRepo.getLocationStock();
    const results: BatchExpiryCalculation[] = [];
    const today = new Date();

    for (const stock of locationStocks) {
      if (filterLocationId && filterLocationId !== 'ALL' && stock.locationId !== filterLocationId) {
        continue;
      }
      if (stock.quantity <= 0) continue;

      const batch = batches.find(b => b.id === stock.batchId);
      if (!batch) continue;

      const product = inventoryRepo.getProductById(stock.productId);
      if (!product) continue;

      const location = inventoryRepo.getLocationById(stock.locationId);
      const locName = location?.name || stock.locationId;
      const locCode = location?.code || 'LOC';

      const expiryDate = new Date(batch.expiryDate);
      const diffTime = expiryDate.getTime() - today.getTime();
      const daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const velocity = this.calculateConsumptionVelocity(stock.productId, stock.locationId);
      const adu = velocity.averageDailyUsage;

      const expectedUsage = daysToExpiry > 0 ? Math.round(adu * daysToExpiry) : 0;
      const potentialAtRisk = daysToExpiry < 0 
        ? stock.quantity 
        : Math.max(0, stock.quantity - expectedUsage);

      const unitCost = product.standardCost || 0;
      const potentialLoss = Number((potentialAtRisk * unitCost).toFixed(2));

      // Determine Risk Level
      let riskLevel: ExpiryRiskLevel = 'LOW';
      if (daysToExpiry < 0) {
        riskLevel = 'EXPIRED';
      } else if (daysToExpiry <= config.expiry.criticalDays) {
        riskLevel = 'CRITICAL';
      } else if (daysToExpiry <= config.expiry.highDays) {
        riskLevel = 'HIGH';
      } else if (daysToExpiry <= config.expiry.mediumDays) {
        riskLevel = 'MEDIUM';
      } else {
        riskLevel = 'LOW';
      }

      // If stock has zero potential risk and isn't expired, lower severity
      if (potentialAtRisk === 0 && daysToExpiry > config.expiry.criticalDays) {
        riskLevel = 'LOW';
      }

      const formulaText = daysToExpiry < 0
        ? `Expired batch: full quantity (${stock.quantity} units) at risk.`
        : velocity.hasSufficientHistory
          ? `max(0, ${stock.quantity} stock - (${adu} ADU × ${daysToExpiry} days)) = ${potentialAtRisk} units potentially at risk.`
          : `Insufficient consumption history: projected risk based on current balance (${stock.quantity} units) with ${daysToExpiry} days remaining.`;

      const stepByStep = [
        {
          step: '1. Current Balance',
          description: 'Physical inventory units recorded in location',
          calculation: `${stock.quantity} units at ${locName}`,
          result: `${stock.quantity} units`,
        },
        {
          step: '2. Shelf-Life Remaining',
          description: 'Calendar days until expiry date',
          calculation: `${batch.expiryDate} - ${today.toISOString().split('T')[0]}`,
          result: `${daysToExpiry} days`,
        },
        {
          step: '3. Daily Consumption Velocity',
          description: 'Calculated from recorded daily_consumption events',
          calculation: velocity.hasSufficientHistory 
            ? `${velocity.totalConsumed} units / ${velocity.daysRecorded} recorded days`
            : 'Insufficient historical consumption data',
          result: `${adu} units/day`,
        },
        {
          step: '4. Expected Demand before Expiry',
          description: 'Projected utilization during remaining shelf-life',
          calculation: `${adu} units/day × ${Math.max(0, daysToExpiry)} days`,
          result: `${expectedUsage} units expected`,
        },
        {
          step: '5. Potential Quantity at Risk',
          description: 'Unutilized excess inventory before expiry',
          calculation: `max(0, ${stock.quantity} - ${expectedUsage})`,
          result: `${potentialAtRisk} units potentially at risk`,
        },
        {
          step: '6. Potential Loss Exposure',
          description: 'Estimated financial impact at standard product cost',
          calculation: `${potentialAtRisk} units × $${unitCost.toFixed(2)}`,
          result: `$${potentialLoss.toFixed(2)}`,
        },
      ];

      results.push({
        productId: stock.productId,
        productName: product.name,
        productSku: product.sku,
        brand: product.brand,
        category: product.category,
        batchId: stock.batchId,
        batchNumber: batch.batchNumber,
        locationId: stock.locationId,
        locationName: locName,
        locationCode: locCode,
        currentQuantity: stock.quantity,
        expiryDate: batch.expiryDate,
        daysToExpiry,
        averageDailyUsage: adu,
        daysRecorded: velocity.daysRecorded,
        hasSufficientHistory: velocity.hasSufficientHistory,
        expectedUsageBeforeExpiry: expectedUsage,
        potentialAtRiskUnits: potentialAtRisk,
        unitCost,
        potentialLossExposure: potentialLoss,
        riskLevel,
        formulaExplanation: formulaText,
        stepByStep,
      });
    }

    // Sort by Risk Severity then Days to Expiry ascending
    const priorityOrder: Record<ExpiryRiskLevel, number> = {
      'EXPIRED': 5,
      'CRITICAL': 4,
      'HIGH': 3,
      'MEDIUM': 2,
      'LOW': 1,
    };

    return results.sort((a, b) => {
      const pDiff = priorityOrder[b.riskLevel] - priorityOrder[a.riskLevel];
      if (pDiff !== 0) return pDiff;
      return a.daysToExpiry - b.daysToExpiry;
    });
  }

  /**
   * Rule-Based Stockout Risk Calculation.
   * 
   * Formula:
   *   days_of_stock = available_quantity / average_daily_usage
   */
  public calculateStockoutRisks(filterLocationId?: string): ProductStockoutCalculation[] {
    const config = riskEngineConfig.getConfig();
    const products = inventoryRepo.getProducts();
    const locationStocks = inventoryRepo.getLocationStock();
    const results: ProductStockoutCalculation[] = [];

    // Group available quantities by product and location
    const map = new Map<string, { quantity: number; productId: string; locationId: string }>();
    for (const stock of locationStocks) {
      if (filterLocationId && filterLocationId !== 'ALL' && stock.locationId !== filterLocationId) {
        continue;
      }
      const key = `${stock.productId}:${stock.locationId}`;
      const existing = map.get(key) || { quantity: 0, productId: stock.productId, locationId: stock.locationId };
      existing.quantity += (stock.quantity - stock.reservedQuantity);
      map.set(key, existing);
    }

    for (const entry of map.values()) {
      const product = products.find(p => p.id === entry.productId);
      if (!product) continue;

      const location = inventoryRepo.getLocationById(entry.locationId);
      const locName = location?.name || entry.locationId;
      const locCode = location?.code || 'LOC';

      const velocity = this.calculateConsumptionVelocity(entry.productId, entry.locationId);
      const adu = velocity.averageDailyUsage;

      if (!velocity.hasSufficientHistory || adu === 0) {
        // Zero forecast fabrication
        results.push({
          productId: entry.productId,
          productName: product.name,
          productSku: product.sku,
          locationId: entry.locationId,
          locationName: locName,
          locationCode: locCode,
          availableQuantity: entry.quantity,
          averageDailyUsage: 0,
          daysOfStockRemaining: null,
          hasSufficientHistory: false,
          reorderPoint: product.reorderPoint,
          minSafetyStock: product.minSafetyStock,
          riskLevel: 'LOW',
          explanation: 'Insufficient consumption history: cannot reliably project stockout timeline without recorded usage.',
        });
        continue;
      }

      const daysRemaining = Number((entry.quantity / adu).toFixed(1));
      let riskLevel: StockoutRiskLevel = 'LOW';

      if (daysRemaining < config.stockout.criticalDays) {
        riskLevel = 'CRITICAL';
      } else if (daysRemaining <= config.stockout.highDays) {
        riskLevel = 'HIGH';
      } else if (daysRemaining <= config.stockout.mediumDays) {
        riskLevel = 'MEDIUM';
      } else {
        riskLevel = 'LOW';
      }

      results.push({
        productId: entry.productId,
        productName: product.name,
        productSku: product.sku,
        locationId: entry.locationId,
        locationName: locName,
        locationCode: locCode,
        availableQuantity: entry.quantity,
        averageDailyUsage: adu,
        daysOfStockRemaining: daysRemaining,
        hasSufficientHistory: true,
        reorderPoint: product.reorderPoint,
        minSafetyStock: product.minSafetyStock,
        riskLevel,
        explanation: `${entry.quantity} units available ÷ ${adu} ADU = ${daysRemaining} days coverage remaining.`,
      });
    }

    const priorityOrder: Record<StockoutRiskLevel, number> = {
      'CRITICAL': 4,
      'HIGH': 3,
      'MEDIUM': 2,
      'LOW': 1,
    };

    return results.sort((a, b) => {
      const pDiff = priorityOrder[b.riskLevel] - priorityOrder[a.riskLevel];
      if (pDiff !== 0) return pDiff;
      if (a.daysOfStockRemaining !== null && b.daysOfStockRemaining !== null) {
        return a.daysOfStockRemaining - b.daysOfStockRemaining;
      }
      return 0;
    });
  }

  /**
   * Rule-Based Overstock Risk Calculation.
   * Identifies stock where coverage substantially exceeds configured policy targets.
   */
  public calculateOverstockRisks(filterLocationId?: string): OverstockCalculation[] {
    const config = riskEngineConfig.getConfig();
    const products = inventoryRepo.getProducts();
    const locationStocks = inventoryRepo.getLocationStock();
    const results: OverstockCalculation[] = [];

    // Aggregate by product and location
    const map = new Map<string, { quantity: number; productId: string; locationId: string }>();
    for (const s of locationStocks) {
      if (filterLocationId && filterLocationId !== 'ALL' && s.locationId !== filterLocationId) {
        continue;
      }
      const key = `${s.productId}:${s.locationId}`;
      const existing = map.get(key) || { quantity: 0, productId: s.productId, locationId: s.locationId };
      existing.quantity += s.quantity;
      map.set(key, existing);
    }

    for (const item of map.values()) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;

      const location = inventoryRepo.getLocationById(item.locationId);
      const locName = location?.name || item.locationId;

      const velocity = this.calculateConsumptionVelocity(item.productId, item.locationId);
      const adu = velocity.averageDailyUsage;

      if (!velocity.hasSufficientHistory || adu === 0) {
        results.push({
          productId: item.productId,
          productName: product.name,
          productSku: product.sku,
          locationId: item.locationId,
          locationName: locName,
          currentQuantity: item.quantity,
          averageDailyUsage: 0,
          coverageDays: null,
          targetCoverageDays: config.overstock.targetCoverageDays,
          excessQuantity: 0,
          isOverstocked: false,
          hasSufficientHistory: false,
          explanation: 'Insufficient consumption history: cannot compute overstock without recorded consumption velocity.',
        });
        continue;
      }

      const coverageDays = Number((item.quantity / adu).toFixed(1));
      const isOverstocked = coverageDays > config.overstock.overstockThresholdDays;
      const targetStockUnits = Math.round(adu * config.overstock.targetCoverageDays);
      const excessQuantity = Math.max(0, item.quantity - targetStockUnits);

      results.push({
        productId: item.productId,
        productName: product.name,
        productSku: product.sku,
        locationId: item.locationId,
        locationName: locName,
        currentQuantity: item.quantity,
        averageDailyUsage: adu,
        coverageDays,
        targetCoverageDays: config.overstock.targetCoverageDays,
        excessQuantity,
        isOverstocked,
        hasSufficientHistory: true,
        explanation: isOverstocked
          ? `Stock provides ${coverageDays} days coverage, exceeding the configured policy threshold of ${config.overstock.overstockThresholdDays} days (${excessQuantity} excess units above target).`
          : `Stock coverage of ${coverageDays} days is within normal policy limits (target: ${config.overstock.targetCoverageDays} days).`,
      });
    }

    return results.sort((a, b) => (b.coverageDays || 0) - (a.coverageDays || 0));
  }

  /**
   * Slow-Moving Inventory Detection.
   */
  public calculateSlowMovingInventory(filterLocationId?: string): SlowMovingCalculation[] {
    const products = inventoryRepo.getProducts();
    const locationStocks = inventoryRepo.getLocationStock();
    const batches = inventoryRepo.getBatches();
    const results: SlowMovingCalculation[] = [];

    for (const stock of locationStocks) {
      if (filterLocationId && filterLocationId !== 'ALL' && stock.locationId !== filterLocationId) {
        continue;
      }
      if (stock.quantity <= 0) continue;

      const product = products.find(p => p.id === stock.productId);
      if (!product) continue;

      const batch = batches.find(b => b.id === stock.batchId);
      const location = inventoryRepo.getLocationById(stock.locationId);
      const locName = location?.name || stock.locationId;

      const velocity = this.calculateConsumptionVelocity(stock.productId, stock.locationId);

      if (!velocity.hasSufficientHistory) {
        results.push({
          productId: stock.productId,
          productName: product.name,
          productSku: product.sku,
          batchId: stock.batchId,
          batchNumber: batch?.batchNumber,
          locationId: stock.locationId,
          locationName: locName,
          quantity: stock.quantity,
          lastConsumptionDate: null,
          averageDailyUsage: 0,
          coverageDays: null,
          hasSufficientHistory: false,
          riskLevel: 'LOW',
          explanation: 'Insufficient consumption history: zero consumption events recorded.',
        });
        continue;
      }

      const adu = velocity.averageDailyUsage;
      const coverageDays = adu > 0 ? Number((stock.quantity / adu).toFixed(1)) : null;

      let riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (adu < 0.5 && stock.quantity > 50) {
        riskLevel = 'HIGH';
      } else if (adu < 1.0 && stock.quantity > 30) {
        riskLevel = 'MEDIUM';
      }

      results.push({
        productId: stock.productId,
        productName: product.name,
        productSku: product.sku,
        batchId: stock.batchId,
        batchNumber: batch?.batchNumber,
        locationId: stock.locationId,
        locationName: locName,
        quantity: stock.quantity,
        lastConsumptionDate: velocity.lastConsumptionDate,
        averageDailyUsage: adu,
        coverageDays,
        hasSufficientHistory: true,
        riskLevel,
        explanation: `Low daily burn rate of ${adu} units/day against ${stock.quantity} units in stock.`,
      });
    }

    return results.sort((a, b) => {
      const pMap = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      return pMap[b.riskLevel] - pMap[a.riskLevel];
    });
  }

  /**
   * Computes Executive Command Center KPIs from Live Data.
   */
  public calculateKPIs(filterLocationId?: string): CommandCenterKPIs {
    const expiryRisks = this.calculateBatchExpiryRisks(filterLocationId);
    const stockoutRisks = this.calculateStockoutRisks(filterLocationId);
    const overstockRisks = this.calculateOverstockRisks(filterLocationId);
    const slowMoving = this.calculateSlowMovingInventory(filterLocationId);

    const expiringSoon = expiryRisks.filter(r => r.daysToExpiry <= 30 && r.daysToExpiry >= 0).length;
    const potentialWasteUnits = expiryRisks.reduce((sum, r) => sum + r.potentialAtRiskUnits, 0);
    const potentialLossValue = expiryRisks.reduce((sum, r) => sum + r.potentialLossExposure, 0);

    const stockoutCount = stockoutRisks.filter(r => r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH').length;
    const overstockCount = overstockRisks.filter(r => r.isOverstocked).length;
    const slowMovingCount = slowMoving.filter(r => r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM').length;

    // Confirmed wastage from immutable transaction ledger
    const transactions = inventoryRepo.getTransactions();
    const confirmedWastageUnits = transactions
      .filter(t => t.type === 'WASTAGE')
      .reduce((sum, t) => sum + t.quantity, 0);

    return {
      expiringSoonCount: expiringSoon,
      potentialWasteRiskUnits: potentialWasteUnits,
      potentialLossExposureValue: Number(potentialLossValue.toFixed(2)),
      stockoutRiskCount: stockoutCount,
      overstockRiskCount: overstockCount,
      slowMovingCount: slowMovingCount,
      openRecommendationsCount: 0, // Injected by RecommendationEngine
      confirmedWastageUnits,
      wastageAvoidedUnits: 0,      // Injected by RecommendationEngine
    };
  }
}

export const expiryRiskEngine = new ExpiryRiskEngine();
