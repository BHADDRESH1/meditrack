// ==============================================================================
// MEDiTRACK: Phase 6 Risk Intelligence & Waste Prevention Types
// ==============================================================================

export type ExpiryRiskLevel = 'EXPIRED' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type StockoutRiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type RecommendationType = 
  | 'FEFO_ISSUE'
  | 'INTER_DEPARTMENT_TRANSFER'
  | 'SUPPLIER_RETURN_REVIEW'
  | 'PURCHASE_ORDER_REVIEW'
  | 'STOCKOUT_ESCALATION'
  | 'QUARANTINE_DISPOSAL'
  | 'MONITOR';

export type RecommendationStatus = 
  | 'OPEN'
  | 'REVIEWED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export interface BatchExpiryCalculation {
  productId: string;
  productName: string;
  productSku: string;
  brand: string;
  category: string;
  batchId: string;
  batchNumber: string;
  locationId: string;
  locationName: string;
  locationCode: string;
  currentQuantity: number;
  expiryDate: string;
  daysToExpiry: number;
  averageDailyUsage: number;
  daysRecorded: number;
  hasSufficientHistory: boolean;
  expectedUsageBeforeExpiry: number;
  potentialAtRiskUnits: number;
  unitCost: number;
  potentialLossExposure: number;
  riskLevel: ExpiryRiskLevel;
  formulaExplanation: string;
  stepByStep: {
    step: string;
    description: string;
    calculation: string;
    result: string;
  }[];
}

export interface ProductStockoutCalculation {
  productId: string;
  productName: string;
  productSku: string;
  locationId: string;
  locationName: string;
  locationCode: string;
  availableQuantity: number;
  averageDailyUsage: number;
  daysOfStockRemaining: number | null;
  hasSufficientHistory: boolean;
  reorderPoint?: number;
  minSafetyStock?: number;
  riskLevel: StockoutRiskLevel;
  explanation: string;
}

export interface OverstockCalculation {
  productId: string;
  productName: string;
  productSku: string;
  locationId: string;
  locationName: string;
  currentQuantity: number;
  averageDailyUsage: number;
  coverageDays: number | null;
  targetCoverageDays: number;
  excessQuantity: number;
  isOverstocked: boolean;
  hasSufficientHistory: boolean;
  explanation: string;
}

export interface SlowMovingCalculation {
  productId: string;
  productName: string;
  productSku: string;
  batchId?: string;
  batchNumber?: string;
  locationId: string;
  locationName: string;
  quantity: number;
  lastConsumptionDate: string | null;
  averageDailyUsage: number;
  coverageDays: number | null;
  hasSufficientHistory: boolean;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
}

export interface RecommendationAction {
  id: string;
  type: RecommendationType;
  riskLevel: ExpiryRiskLevel | StockoutRiskLevel;
  productId: string;
  productName: string;
  productSku: string;
  batchId?: string;
  batchNumber?: string;
  fromLocationId?: string;
  fromLocationName?: string;
  toLocationId?: string;
  toLocationName?: string;
  quantity: number;
  potentialLossExposure: number;
  reason: string;
  supportingData: {
    currentStock?: number;
    daysToExpiry?: number;
    adu?: number;
    expectedUsage?: number;
    potentialRiskUnits?: number;
    destinationAdu?: number;
    destinationCoverageDays?: number;
    [key: string]: any;
  };
  recommendedAction: string;
  status: RecommendationStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CommandCenterKPIs {
  expiringSoonCount: number;
  potentialWasteRiskUnits: number;
  potentialLossExposureValue: number;
  stockoutRiskCount: number;
  overstockRiskCount: number;
  slowMovingCount: number;
  openRecommendationsCount: number;
  confirmedWastageUnits: number;
  wastageAvoidedUnits: number;
}
