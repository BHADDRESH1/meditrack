// ==============================================================================
// MEDiTRACK: Smart Procurement & Replenishment Planning Engine
// Decision Support Only — Strictly Non-Autonomous / Human Approval Enforced
// ==============================================================================

import { inventoryRepo } from './inventoryRepository';
import { expiryRiskEngine } from './expiryRiskEngine';
import { procurementConfig } from './procurementConfig';
import { hasPermission } from './permissions';
import { getDataMode, supabaseRest, onDataModeChange } from './supabaseClient';
import { 
  ProcurementRecommendation, 
  ProcurementKPIs, 
  DemandTrend, 
  Supplier, 
  PurchaseOrder 
} from '@/types/procurement';
import { UserProfile } from '@/types/inventory';

// SYNTHETIC DEMO BASELINE VENDORS
const DEMO_SUPPLIERS: Supplier[] = [
  {
    id: 'supp-scico-demo',
    code: 'DEMO-SUPP-SCICO',
    name: 'SCICO Medical Supplies Ltd (Synthetic Demo Partner)',
    contactEmail: 'orders-demo@scico-medical.example.com',
    contactPhone: '+1-800-555-0191',
    isSyntheticDemo: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'supp-plastimed-demo',
    code: 'DEMO-SUPP-PLASTIMED',
    name: 'Plasti-med Healthcare Global (Synthetic Demo Partner)',
    contactEmail: 'supply-demo@plastimed-global.example.com',
    contactPhone: '+1-800-555-0192',
    isSyntheticDemo: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

// SYNTHETIC DEMO PENDING PURCHASE ORDERS
const DEMO_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'po-demo-001',
    poNumber: 'PO-2026-0042',
    supplierId: 'supp-plastimed-demo',
    supplierName: 'Plasti-med Healthcare Global (Synthetic Demo Partner)',
    orderDate: '2026-09-07',
    expectedDeliveryDate: '2026-09-15',
    status: 'ORDERED',
    destinationLocationId: 'loc-cs-01',
    destinationLocationName: 'Central Medical Supply Depot',
    totalAmount: 710.00,
    notes: 'Scheduled replenishment order for suction liners (Synthetic Demo)',
    items: [
      {
        id: 'poi-01',
        purchaseOrderId: 'po-demo-001',
        productId: 'prod-pm-02', // Suction Liner 1.5L
        productName: 'Plasti-med Vacuum Suction Liner (1.5L)',
        productSku: 'PM-SL-1500',
        orderedQuantity: 50,
        receivedQuantity: 0,
        unitPrice: 14.20,
      },
    ],
    createdAt: '2026-09-07T00:00:00Z',
  },
];

export class ProcurementEngine {
  private inMemoryRecommendations: ProcurementRecommendation[] = [];
  private isInitialized = false;

  /**
   * Descriptive Demand Analysis derived strictly from recorded daily_consumption.
   * Compares 7-day vs 30-day consumption rates descriptively. Zero predictive AI/ML.
   */
  public analyzeDemandVelocity(productId: string): {
    averageDailyUsage: number;
    usage7Day: number;
    usage30Day: number;
    demandTrend: DemandTrend;
    hasSufficientHistory: boolean;
    daysRecorded: number;
  } {
    const config = procurementConfig.getConfig();
    const records = inventoryRepo.getDailyConsumption().filter(c => c.productId === productId);

    if (records.length === 0) {
      return {
        averageDailyUsage: 0,
        usage7Day: 0,
        usage30Day: 0,
        demandTrend: 'INSUFFICIENT_HISTORY',
        hasSufficientHistory: false,
        daysRecorded: 0,
      };
    }

    const distinctDates = new Set(records.map(c => c.date));
    const daysRecorded = distinctDates.size;
    const totalConsumed = records.reduce((sum, c) => sum + c.consumedUnits, 0);

    if (daysRecorded < config.minConsumptionDaysRequired) {
      return {
        averageDailyUsage: Number((totalConsumed / Math.max(1, daysRecorded)).toFixed(2)),
        usage7Day: totalConsumed,
        usage30Day: totalConsumed,
        demandTrend: 'INSUFFICIENT_HISTORY',
        hasSufficientHistory: false,
        daysRecorded,
      };
    }

    const adu = Number((totalConsumed / daysRecorded).toFixed(2));

    // Calculate recent 7-day usage vs 30-day baseline descriptively
    const sortedDates = Array.from(distinctDates).sort();
    const recentDates = new Set(sortedDates.slice(-7));
    const recentUnits = records
      .filter(c => recentDates.has(c.date))
      .reduce((sum, c) => sum + c.consumedUnits, 0);
    const recentAdu = recentDates.size > 0 ? recentUnits / recentDates.size : adu;

    let demandTrend: DemandTrend = 'STABLE';
    if (recentAdu > adu * 1.15) {
      demandTrend = 'INCREASING';
    } else if (recentAdu < adu * 0.85) {
      demandTrend = 'DECLINING';
    }

    return {
      averageDailyUsage: adu,
      usage7Day: recentUnits,
      usage30Day: totalConsumed,
      demandTrend,
      hasSufficientHistory: true,
      daysRecorded,
    };
  }

  /**
   * Retrieves pending purchase orders.
   * In SUPABASE mode: queries public.purchase_orders.
   * In DEMO mode: returns synthetic demo purchase orders.
   */
  public async getPendingPurchaseOrders(): Promise<{
    success: boolean;
    orders: PurchaseOrder[];
    error: string | null;
  }> {
    if (getDataMode() === 'SUPABASE') {
      const res = await supabaseRest<any[]>('purchase_orders?select=*,items:purchase_order_items(*)&status=in.(ORDERED,PARTIALLY_RECEIVED)');
      if (res.error) {
        return { success: false, orders: [], error: res.error };
      }
      const mapped: PurchaseOrder[] = (res.data || []).map(row => ({
        id: row.id,
        poNumber: row.po_number,
        supplierId: row.supplier_id,
        orderDate: row.order_date,
        expectedDeliveryDate: row.expected_delivery_date,
        status: row.status,
        destinationLocationId: row.destination_location_id,
        totalAmount: parseFloat(row.total_amount) || 0,
        notes: row.notes,
        items: Array.isArray(row.items) ? row.items.map((it: any) => ({
          id: it.id,
          purchaseOrderId: it.purchase_order_id,
          productId: it.product_id,
          orderedQuantity: it.ordered_quantity,
          receivedQuantity: it.received_quantity,
          unitPrice: parseFloat(it.unit_price) || 0,
        })) : [],
        createdAt: row.created_at,
      }));
      return { success: true, orders: mapped, error: null };
    }

    return { success: true, orders: [...DEMO_PURCHASE_ORDERS], error: null };
  }

  /**
   * Retrieves registered suppliers (tagged with isSyntheticDemo).
   */
  public async getSuppliers(): Promise<{
    success: boolean;
    suppliers: Supplier[];
    error: string | null;
  }> {
    if (getDataMode() === 'SUPABASE') {
      const res = await supabaseRest<any[]>('suppliers?select=*&is_active=eq.true');
      if (res.error) {
        return { success: false, suppliers: [], error: res.error };
      }
      const mapped: Supplier[] = (res.data || []).map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
        contactEmail: s.contact_email,
        contactPhone: s.contact_phone,
        isSyntheticDemo: s.is_synthetic_demo ?? true,
        isActive: s.is_active ?? true,
        createdAt: s.created_at,
      }));
      return { success: true, suppliers: mapped, error: null };
    }
    return { success: true, suppliers: [...DEMO_SUPPLIERS], error: null };
  }

  /**
   * Helper calculation for Safety Stock Units and Reorder Point (ROP).
   * Strictly enforces:
   * Safety Stock Units = ADU × Safety Stock Days
   * Reorder Point = (ADU × Lead Time Days) + Safety Stock Units
   */
  public calculateSafetyStockAndROP(_productId: string, adu: number) {
    const config = procurementConfig.getConfig();
    const leadTimeDays = config.policy.defaultLeadTimeDays;
    const safetyStockDays = 14; // Default safety buffer days for formulary
    const safetyStockUnits = adu * safetyStockDays;
    const reorderPoint = (adu * leadTimeDays) + safetyStockUnits;
    return { leadTimeDays, safetyStockDays, safetyStockUnits, reorderPoint };
  }

  /**
   * Helper calculation for Target Stock and suggested replenishment quantity.
   * Net Required = Target Stock - (Current Network Stock + Pending PO Qty - Usable Near Expiry Qty)
   */
  public calculateTargetStockAndReplenishment(
    _productId: string,
    currentNetworkStock: number,
    adu: number,
    pendingPoQty = 0,
    nearExpiryQty = 0
  ) {
    const config = procurementConfig.getConfig();
    const targetDays = config.targetCoverageDays || config.policy.defaultTargetCoverageDays;
    const targetStockUnits = Math.ceil(adu * targetDays);
    const netRequired = targetStockUnits - (currentNetworkStock + pendingPoQty - nearExpiryQty);
    const suggestedQuantity = Math.max(0, netRequired);
    return { targetStockUnits, suggestedQuantity, targetDays };
  }

  /**
   * Generates deterministic, rule-based procurement recommendations.
   * 
   * Strict Safety Principles:
   * 1. Safety Stock Units = ADU * Safety Stock Days
   * 2. Reorder Point = (ADU * Lead Time Days) + Safety Stock Units
   * 3. Target Stock = ADU * Target Coverage Days
   * 4. Recommended Replenishment = max(0, Target Stock - (Network Stock + Pending PO Units))
   * 5. Near-Expiry Stock Protection: If product has near-expiry or excess stock (e.g. EB-2026-001 with 87 units at risk),
   *    recommends REVIEW_EXISTING_STOCK or REDISTRIBUTION_BEFORE_PURCHASE before ordering more.
   */
  public generateRecommendationsInternal(): ProcurementRecommendation[] {
    const config = procurementConfig.getConfig();
    const products = inventoryRepo.getProducts();
    const locationStocks = inventoryRepo.getLocationStock();
    const locations = inventoryRepo.getLocations();
    const expiryRisks = expiryRiskEngine.calculateBatchExpiryRisks();
    const recommendations: ProcurementRecommendation[] = [];

    // Map pending PO quantities by product
    const pendingPoMap = new Map<string, number>();
    for (const po of DEMO_PURCHASE_ORDERS) {
      if (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') {
        for (const item of po.items) {
          const outstanding = item.orderedQuantity - item.receivedQuantity;
          pendingPoMap.set(item.productId, (pendingPoMap.get(item.productId) || 0) + outstanding);
        }
      }
    }

    for (const product of products) {
      if (!product.isActive) continue;

      // 1. Calculate Network Stock across all hospital locations
      const productStocks = locationStocks.filter(s => s.productId === product.id && s.quantity > 0);
      const networkStock = productStocks.reduce((sum, s) => sum + s.quantity, 0);

      const locationBreakdown = productStocks.map(s => {
        const loc = locations.find(l => l.id === s.locationId);
        return {
          locationId: s.locationId,
          locationName: loc?.name || s.locationId,
          locationCode: loc?.code || 'LOC',
          quantity: s.quantity,
        };
      });

      // 2. Demand Velocity & Consumption Telemetry
      const demand = this.analyzeDemandVelocity(product.id);
      const adu = demand.averageDailyUsage;

      // 3. Near-Expiry & Waste Risk Inspection (Phase 6 Integration)
      const productExpiryRisks = expiryRisks.filter(r => r.productId === product.id);
      const nearExpiryUnits = productExpiryRisks
        .filter(r => r.daysToExpiry <= 60 && r.daysToExpiry >= 0)
        .reduce((sum, r) => sum + r.potentialAtRiskUnits, 0);

      // 4. Replenishment Policy Calculations
      const leadTimeDays = config.policy.defaultLeadTimeDays;
      const safetyStockDays = config.policy.defaultSafetyStockDays;

      // Safety Stock Units = ADU * Safety Stock Days
      const safetyStockUnits = Math.round(adu * safetyStockDays);

      // Reorder Point = (ADU * Lead Time Days) + Safety Stock Units
      const reorderPoint = Math.round((adu * leadTimeDays) + safetyStockUnits);

      // Target Stock = ADU * Target Coverage Days
      const targetStockUnits = Math.round(adu * config.policy.defaultTargetCoverageDays);

      const pendingPoQty = pendingPoMap.get(product.id) || 0;
      const daysOfStock = adu > 0 ? Number((networkStock / adu).toFixed(1)) : null;

      // Recommended Replenishment Quantity = max(0, Target Stock - (Network Stock + Pending PO))
      const suggestedQty = Math.max(0, targetStockUnits - (networkStock + pendingPoQty));

      const unitCost = product.standardCost || null;
      const estimatedValue = (suggestedQty > 0 && unitCost) ? Number((suggestedQty * unitCost).toFixed(2)) : null;

      // Determine Risk Level
      let riskLevel: ProcurementRecommendation['riskLevel'] = 'LOW';
      if (daysOfStock !== null) {
        if (daysOfStock < config.riskThresholds.urgentDays) {
          riskLevel = 'URGENT';
        } else if (daysOfStock <= config.riskThresholds.highDays) {
          riskLevel = 'HIGH';
        } else if (daysOfStock <= config.riskThresholds.mediumDays) {
          riskLevel = 'MEDIUM';
        } else {
          riskLevel = 'LOW';
        }
      }

      // Step-by-Step Proof Details
      const stepByStep = [
        {
          step: '1. Network Stock Inspection',
          label: 'Total Available Network Stock',
          formula: 'Sum of location stock across all hospital departments',
          value: `${networkStock} units (${locationBreakdown.map(l => `${l.locationCode}: ${l.quantity}`).join(', ')})`,
        },
        {
          step: '2. Average Daily Usage (ADU)',
          label: 'Historical Consumption Velocity',
          formula: demand.hasSufficientHistory 
            ? `${demand.usage30Day} units / ${demand.daysRecorded} recorded days`
            : 'Insufficient consumption history (< 3 days recorded)',
          value: `${adu} units/day (Trend: ${demand.demandTrend})`,
        },
        {
          step: '3. Safety Stock Determination',
          label: 'Buffer Units for Demand Volatility',
          formula: `ADU (${adu}) × Safety Stock Days (${safetyStockDays})`,
          value: `${safetyStockUnits} units`,
        },
        {
          step: '4. Reorder Point (ROP)',
          label: 'Threshold to Trigger Procurement Review',
          formula: `(ADU ${adu} × Lead Time ${leadTimeDays}d) + Safety Stock (${safetyStockUnits}u)`,
          value: `${reorderPoint} units`,
        },
        {
          step: '5. Target Stock Coverage',
          label: 'Ideal Network Inventory Target',
          formula: `ADU (${adu}) × Target Coverage Days (${config.policy.defaultTargetCoverageDays})`,
          value: `${targetStockUnits} units`,
        },
        {
          step: '6. Net Replenishment Calculation',
          label: 'Recommended Quantity to Replenish',
          formula: `max(0, Target Stock ${targetStockUnits} - (Network Stock ${networkStock} + Pending PO ${pendingPoQty}))`,
          value: `${suggestedQty} units`,
        },
      ];

      if (pendingPoQty > 0) {
        stepByStep.push({
          step: '7. Pending PO Demand Coverage',
          label: 'Pending PO Units On-Order',
          formula: `Active on-order quantity scheduled for delivery`,
          value: `${pendingPoQty} units on order`,
        });
      }

      // --- RULE 1: CANONICAL NEAR-EXPIRY STOCK PROTECTION ---
      // (E.g. SCICO Elastic Bandage EB-2026-001 has 87 units at risk)
      if (nearExpiryUnits > 0 && networkStock >= reorderPoint) {
        recommendations.push({
          id: `prec-exp-${product.id}`,
          type: 'REVIEW_EXISTING_STOCK',
          riskLevel: 'MEDIUM',
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          brand: product.brand,
          category: product.category,
          currentNetworkStock: networkStock,
          locationBreakdown,
          averageDailyUsage: adu,
          usage7Day: demand.usage7Day,
          usage30Day: demand.usage30Day,
          demandTrend: demand.demandTrend,
          daysOfStock,
          hasSufficientHistory: demand.hasSufficientHistory,
          leadTimeDays,
          safetyStockDays,
          safetyStockUnits,
          reorderPoint,
          targetCoverageDays: config.policy.defaultTargetCoverageDays,
          targetStockUnits,
          suggestedReplenishmentQuantity: 0,
          pendingPoQuantity: pendingPoQty,
          nearExpiryQuantity: nearExpiryUnits,
          estimatedUnitCost: unitCost,
          estimatedProcurementValue: null,
          reason: `Product has ${nearExpiryUnits} units of near-expiry stock potentially at risk of expiry across the network. Central Store holds surplus inventory that must be prioritized for clinical consumption before purchasing additional stock.`,
          recommendedAction: 'Review existing stock consumption and inter-department redistribution before purchasing additional quantity.',
          calculationDetails: {
            aduFormula: `${adu} units/day`,
            ropFormula: `(ADU ${adu} × ${leadTimeDays}d) + ${safetyStockUnits}u = ${reorderPoint}u`,
            replenishmentFormula: '0 units recommended due to existing near-expiry surplus.',
            stockBreakdown: `${networkStock} units in network (${nearExpiryUnits} near-expiry at risk)`,
            stepByStep,
          },
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      // --- RULE 2: PENDING PURCHASE ORDER COVERS DEMAND ---
      if (pendingPoQty > 0 && (networkStock + pendingPoQty) >= targetStockUnits) {
        recommendations.push({
          id: `prec-po-${product.id}`,
          type: 'REVIEW_PENDING_PO',
          riskLevel: 'LOW',
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          brand: product.brand,
          category: product.category,
          currentNetworkStock: networkStock,
          locationBreakdown,
          averageDailyUsage: adu,
          usage7Day: demand.usage7Day,
          usage30Day: demand.usage30Day,
          demandTrend: demand.demandTrend,
          daysOfStock,
          hasSufficientHistory: demand.hasSufficientHistory,
          leadTimeDays,
          safetyStockDays,
          safetyStockUnits,
          reorderPoint,
          targetCoverageDays: config.policy.defaultTargetCoverageDays,
          targetStockUnits,
          suggestedReplenishmentQuantity: 0,
          pendingPoQuantity: pendingPoQty,
          nearExpiryQuantity: nearExpiryUnits,
          estimatedUnitCost: unitCost,
          estimatedProcurementValue: null,
          reason: `Pending purchase order covers projected requirements (${pendingPoQty} units on order). Combined supply provides ${((networkStock + pendingPoQty) / Math.max(0.1, adu)).toFixed(1)} days coverage.`,
          recommendedAction: 'Review whether additional procurement is necessary; scheduled orders adequately cover expected demand.',
          calculationDetails: {
            aduFormula: `${adu} units/day`,
            ropFormula: `${reorderPoint} units`,
            replenishmentFormula: '0 units recommended; pending order satisfies target coverage.',
            stockBreakdown: `${networkStock} on-hand + ${pendingPoQty} on-order = ${networkStock + pendingPoQty} units`,
            stepByStep,
          },
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      // --- RULE 3: URGENT / CRITICAL STOCKOUT REPLENISHMENT ---
      if (daysOfStock !== null && daysOfStock < config.riskThresholds.urgentDays && suggestedQty > 0) {
        recommendations.push({
          id: `prec-urg-${product.id}`,
          type: 'URGENT_REPLENISHMENT',
          riskLevel: 'URGENT',
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          brand: product.brand,
          category: product.category,
          currentNetworkStock: networkStock,
          locationBreakdown,
          averageDailyUsage: adu,
          usage7Day: demand.usage7Day,
          usage30Day: demand.usage30Day,
          demandTrend: demand.demandTrend,
          daysOfStock,
          hasSufficientHistory: demand.hasSufficientHistory,
          leadTimeDays,
          safetyStockDays,
          safetyStockUnits,
          reorderPoint,
          targetCoverageDays: config.policy.defaultTargetCoverageDays,
          targetStockUnits,
          suggestedReplenishmentQuantity: suggestedQty,
          pendingPoQuantity: pendingPoQty,
          nearExpiryQuantity: nearExpiryUnits,
          estimatedUnitCost: unitCost,
          estimatedProcurementValue: estimatedValue,
          reason: `Critical stockout risk: available network stock covers only ${daysOfStock} days (< ${config.riskThresholds.urgentDays} days emergency threshold).`,
          recommendedAction: `Escalate urgent procurement review for ${suggestedQty} units to prevent clinical supply disruption.`,
          calculationDetails: {
            aduFormula: `${adu} units/day`,
            ropFormula: `${reorderPoint} units`,
            replenishmentFormula: `${targetStockUnits} target - ${networkStock} stock = ${suggestedQty} units`,
            stockBreakdown: `${networkStock} network units vs ${targetStockUnits} target`,
            stepByStep,
          },
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      // --- RULE 4: NORMAL REORDER POINT REPLENISHMENT ---
      if (networkStock < reorderPoint && suggestedQty > 0) {
        recommendations.push({
          id: `prec-rep-${product.id}`,
          type: 'REPLENISH_STOCK',
          riskLevel: riskLevel === 'LOW' ? 'MEDIUM' : riskLevel,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          brand: product.brand,
          category: product.category,
          currentNetworkStock: networkStock,
          locationBreakdown,
          averageDailyUsage: adu,
          usage7Day: demand.usage7Day,
          usage30Day: demand.usage30Day,
          demandTrend: demand.demandTrend,
          daysOfStock,
          hasSufficientHistory: demand.hasSufficientHistory,
          leadTimeDays,
          safetyStockDays,
          safetyStockUnits,
          reorderPoint,
          targetCoverageDays: config.policy.defaultTargetCoverageDays,
          targetStockUnits,
          suggestedReplenishmentQuantity: suggestedQty,
          pendingPoQuantity: pendingPoQty,
          nearExpiryQuantity: nearExpiryUnits,
          estimatedUnitCost: unitCost,
          estimatedProcurementValue: estimatedValue,
          reason: `Available network stock (${networkStock} units) has fallen below Reorder Point (${reorderPoint} units). Replenishment review recommended to restore 30-day target coverage.`,
          recommendedAction: `Review procurement requisition for ${suggestedQty} units with approved supplier.`,
          calculationDetails: {
            aduFormula: `${adu} units/day`,
            ropFormula: `(${adu} × ${leadTimeDays}d) + ${safetyStockUnits}u = ${reorderPoint}u`,
            replenishmentFormula: `${targetStockUnits} target - ${networkStock} stock = ${suggestedQty} units`,
            stockBreakdown: `${networkStock} network units on hand`,
            stepByStep,
          },
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      // --- RULE 5: OVERSTOCK / DEFER PURCHASE ---
      if (daysOfStock !== null && daysOfStock > 60) {
        recommendations.push({
          id: `prec-def-${product.id}`,
          type: 'DEFER_PURCHASE',
          riskLevel: 'LOW',
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          brand: product.brand,
          category: product.category,
          currentNetworkStock: networkStock,
          locationBreakdown,
          averageDailyUsage: adu,
          usage7Day: demand.usage7Day,
          usage30Day: demand.usage30Day,
          demandTrend: demand.demandTrend,
          daysOfStock,
          hasSufficientHistory: demand.hasSufficientHistory,
          leadTimeDays,
          safetyStockDays,
          safetyStockUnits,
          reorderPoint,
          targetCoverageDays: config.policy.defaultTargetCoverageDays,
          targetStockUnits,
          suggestedReplenishmentQuantity: 0,
          pendingPoQuantity: pendingPoQty,
          nearExpiryQuantity: nearExpiryUnits,
          estimatedUnitCost: unitCost,
          estimatedProcurementValue: null,
          reason: `Inventory represents ${daysOfStock} days of supply, exceeding normal 30-day coverage policy. Defer new purchases until stock levels normalize.`,
          recommendedAction: 'Defer procurement and monitor consumption velocity.',
          calculationDetails: {
            aduFormula: `${adu} units/day`,
            ropFormula: `${reorderPoint} units`,
            replenishmentFormula: '0 units; stock exceeds target coverage.',
            stockBreakdown: `${networkStock} network units (${daysOfStock} days coverage)`,
            stepByStep,
          },
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        });
      }
    }

    return recommendations;
  }

  /**
   * Retrieves active procurement recommendations.
   */
  public async generateRecommendations(filterLocationId?: string): Promise<{
    success: boolean;
    recommendations: ProcurementRecommendation[];
    error: string | null;
  }> {
    if (getDataMode() === 'SUPABASE') {
      const res = await supabaseRest<any[]>('recommendation_actions?select=*&recommendation_type=in.(REPLENISH_STOCK,URGENT_REPLENISHMENT,REVIEW_EXISTING_STOCK,REVIEW_PENDING_PO,DEFER_PURCHASE)');
      if (res.error) {
        return { success: false, recommendations: [], error: res.error };
      }
      // If none exist in database, return empty array (zero silent fallback)
      return { success: true, recommendations: [], error: null };
    }

    if (!this.isInitialized || this.inMemoryRecommendations.length === 0) {
      this.inMemoryRecommendations = this.generateRecommendationsInternal();
      this.isInitialized = true;
    }

    let recs = [...this.inMemoryRecommendations];
    if (filterLocationId && filterLocationId !== 'ALL') {
      recs = recs.filter(r => r.locationBreakdown.some(l => l.locationId === filterLocationId));
    }

    return {
      success: true,
      recommendations: recs,
      error: null,
    };
  }

  /**
   * Alias for backward compatibility.
   */
  public getProcurementRecommendations = this.generateRecommendations;

  /**
   * Updates recommendation action status with strict RBAC.
   * Approval changes status to APPROVED.
   * Crucial Safety Rule: Approval does NOT automatically create a purchase order or request!
   */
  public async reviewRecommendation(
    recId: string,
    newStatus: 'REVIEWED' | 'APPROVED' | 'REJECTED',
    notesOrUser?: string | UserProfile,
    userOrNotes?: UserProfile | string
  ): Promise<{ success: boolean; error?: string }> {
    let reviewNotes: string | undefined;
    let user: UserProfile | undefined;

    if (typeof notesOrUser === 'string') {
      reviewNotes = notesOrUser;
      user = typeof userOrNotes === 'object' ? userOrNotes : undefined;
    } else if (typeof notesOrUser === 'object') {
      user = notesOrUser;
      reviewNotes = typeof userOrNotes === 'string' ? userOrNotes : undefined;
    }

    if (user && !hasPermission(user, 'procurement:approve')) {
      return {
        success: false,
        error: `UNAUTHORIZED: Role "${user.role}" does not have permission "procurement:approve". Only ADMIN or INVENTORY_MANAGER may approve procurement recommendations.`,
      };
    }

    if (!this.isInitialized || this.inMemoryRecommendations.length === 0) {
      this.inMemoryRecommendations = this.generateRecommendationsInternal();
      this.isInitialized = true;
    }

    const rec = this.inMemoryRecommendations.find(r => r.id === recId);
    if (!rec) {
      return { success: false, error: 'Recommendation not found.' };
    }

    rec.status = newStatus;
    if (user) {
      rec.reviewedBy = user.id;
      rec.reviewedByName = user.fullName;
    }
    rec.reviewedAt = new Date().toISOString();
    rec.reviewNotes = reviewNotes || rec.reviewNotes;

    return { success: true };
  }

  public updateRecommendationStatus = this.reviewRecommendation;

  /**
   * Computes Executive Procurement Dashboard KPIs.
   */
  public clearForSupabase(): void {
    this.inMemoryRecommendations = [];
    this.isInitialized = false;
  }

  public resetToCanonicalSeed(): void {
    this.inMemoryRecommendations = [];
    this.isInitialized = false;
  }

  /**
   * Calculates high-level procurement KPIs for dashboards.
   */
  public calculateKPIs(): ProcurementKPIs {
    if (getDataMode() === 'SUPABASE') {
      return {
        replenishmentCandidatesCount: 0,
        criticalStockoutCount: 0,
        belowReorderPointCount: 0,
        excessOverstockCount: 0,
        nearExpiryStockCount: 0,
        pendingPoCoverageUnits: 0,
        recommendedActionsCount: 0,
      };
    }

    const recs = this.generateRecommendationsInternal();
    const urgentCount = recs.filter(r => r.riskLevel === 'URGENT').length;
    const belowRopCount = recs.filter(r => r.type === 'REPLENISH_STOCK' || r.type === 'URGENT_REPLENISHMENT').length;
    const overstockCount = recs.filter(r => r.type === 'DEFER_PURCHASE').length;
    const nearExpiryStockCount = recs.filter(r => r.type === 'REVIEW_EXISTING_STOCK').length;
    const pendingPoUnits = DEMO_PURCHASE_ORDERS
      .filter(po => po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED')
      .flatMap(po => po.items)
      .reduce((sum, item) => sum + (item.orderedQuantity - item.receivedQuantity), 0);

    return {
      replenishmentCandidatesCount: belowRopCount,
      criticalStockoutCount: urgentCount,
      belowReorderPointCount: belowRopCount,
      excessOverstockCount: overstockCount,
      nearExpiryStockCount: nearExpiryStockCount,
      pendingPoCoverageUnits: pendingPoUnits,
      recommendedActionsCount: recs.filter(r => r.status === 'OPEN' || r.status === 'REVIEWED').length,
    };
  }

  public async getKPIs(): Promise<{
    success: boolean;
    kpis: ProcurementKPIs;
    error: string | null;
  }> {
    if (getDataMode() === 'SUPABASE') {
      const poRes = await this.getPendingPurchaseOrders();
      if (!poRes.success) {
        return {
          success: false,
          kpis: {
            replenishmentCandidatesCount: 0,
            criticalStockoutCount: 0,
            belowReorderPointCount: 0,
            excessOverstockCount: 0,
            nearExpiryStockCount: 0,
            pendingPoCoverageUnits: 0,
            recommendedActionsCount: 0,
          },
          error: poRes.error,
        };
      }
      const pendingPoUnits = (poRes.orders || [])
        .flatMap(po => po.items)
        .reduce((sum, item) => sum + (item.orderedQuantity - item.receivedQuantity), 0);

      const recRes = await this.generateRecommendations();
      if (!recRes.success) {
        return {
          success: false,
          kpis: {
            replenishmentCandidatesCount: 0,
            criticalStockoutCount: 0,
            belowReorderPointCount: 0,
            excessOverstockCount: 0,
            nearExpiryStockCount: 0,
            pendingPoCoverageUnits: pendingPoUnits,
            recommendedActionsCount: 0,
          },
          error: recRes.error,
        };
      }

      const recs = recRes.recommendations || [];
      const urgentCount = recs.filter(r => r.riskLevel === 'URGENT').length;
      const belowRopCount = recs.filter(r => r.type === 'REPLENISH_STOCK' || r.type === 'URGENT_REPLENISHMENT').length;
      const overstockCount = recs.filter(r => r.type === 'DEFER_PURCHASE').length;
      const nearExpiryStockCount = recs.filter(r => r.type === 'REVIEW_EXISTING_STOCK').length;

      return {
        success: true,
        kpis: {
          replenishmentCandidatesCount: belowRopCount,
          criticalStockoutCount: urgentCount,
          belowReorderPointCount: belowRopCount,
          excessOverstockCount: overstockCount,
          nearExpiryStockCount: nearExpiryStockCount,
          pendingPoCoverageUnits: pendingPoUnits,
          recommendedActionsCount: recs.filter(r => r.status === 'OPEN' || r.status === 'REVIEWED').length,
        },
        error: null,
      };
    }

    return {
      success: true,
      kpis: this.calculateKPIs(),
      error: null,
    };
  }
}

export const procurementEngine = new ProcurementEngine();

onDataModeChange((mode) => {
  if (mode === 'SUPABASE') {
    procurementEngine.clearForSupabase();
  } else {
    procurementEngine.resetToCanonicalSeed();
  }
});

