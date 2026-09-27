// ==============================================================================
// MEDiTRACK: Phase 7 Smart Procurement & Replenishment Planning Types
// ==============================================================================

export type ProcurementRecommendationType = 
  | 'REPLENISH_STOCK'
  | 'URGENT_REPLENISHMENT'
  | 'REVIEW_EXISTING_STOCK'
  | 'REVIEW_PENDING_PO'
  | 'REDISTRIBUTION_BEFORE_PURCHASE'
  | 'DEFER_PURCHASE'
  | 'MONITOR';

export type ProcurementRiskLevel = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export type PurchaseOrderStatus = 
  | 'ORDERED' 
  | 'PARTIALLY_RECEIVED' 
  | 'RECEIVED' 
  | 'CANCELLED';

export type PurchaseRequestStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'UNDER_REVIEW' 
  | 'APPROVED' 
  | 'REJECTED';

export type DemandTrend = 'INCREASING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_HISTORY';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  isSyntheticDemo: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface SupplierProduct {
  id: string;
  supplierId: string;
  supplierName?: string;
  productId: string;
  variantId?: string;
  supplierSku?: string;
  leadTimeDays: number;
  minimumOrderQuantity: number;
  unitPrice: number;
  isPreferred: boolean;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  productName?: string;
  productSku?: string;
  variantId?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName?: string;
  orderDate: string;
  expectedDeliveryDate: string;
  status: PurchaseOrderStatus;
  destinationLocationId: string;
  destinationLocationName?: string;
  totalAmount: number;
  notes?: string;
  items: PurchaseOrderItem[];
  createdAt: string;
}

export interface PurchaseRequestItem {
  id?: string;
  purchaseRequestId?: string;
  productId: string;
  productName?: string;
  productSku?: string;
  variantId?: string;
  variantName?: string;
  requestedQuantity: number;
  estimatedUnitCost: number;
}

export interface PurchaseRequest {
  id: string;
  requestNumber: string;
  status: PurchaseRequestStatus;
  requestedLocationId?: string;
  requestedLocationName?: string;
  justification: string;
  recommendedSupplierId?: string;
  recommendedSupplierName?: string;
  estimatedCost: number;
  requestedBy?: string;
  requestedByName: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  items: PurchaseRequestItem[];
  createdAt: string;
  updatedAt?: string;
}

export interface ProcurementRecommendation {
  id: string;
  type: ProcurementRecommendationType;
  riskLevel: ProcurementRiskLevel;
  productId: string;
  productName: string;
  productSku: string;
  brand: string;
  category: string;
  variantId?: string;
  variantName?: string;
  currentNetworkStock: number;
  locationBreakdown: {
    locationId: string;
    locationName: string;
    locationCode: string;
    quantity: number;
  }[];
  averageDailyUsage: number;
  usage7Day: number;
  usage30Day: number;
  demandTrend: DemandTrend;
  daysOfStock: number | null;
  hasSufficientHistory: boolean;
  leadTimeDays: number;
  safetyStockDays: number;
  safetyStockUnits: number;
  reorderPoint: number;
  targetCoverageDays: number;
  targetStockUnits: number;
  suggestedReplenishmentQuantity: number;
  pendingPoQuantity: number;
  nearExpiryQuantity: number;
  estimatedUnitCost: number | null;
  estimatedProcurementValue: number | null;
  reason: string;
  recommendedAction: string;
  calculationDetails: {
    aduFormula: string;
    ropFormula: string;
    replenishmentFormula: string;
    stockBreakdown: string;
    stepByStep: { step: string; label: string; formula: string; value: string }[];
  };
  status: 'OPEN' | 'REVIEWED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProcurementKPIs {
  replenishmentCandidatesCount: number;
  criticalStockoutCount: number;
  belowReorderPointCount: number;
  excessOverstockCount: number;
  nearExpiryStockCount: number;
  pendingPoCoverageUnits: number;
  recommendedActionsCount: number;
}
