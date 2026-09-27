// ==============================================================================
// MEDiTRACK: Core Domain Types & Data Contracts (Phase 2 Hardened)
// ==============================================================================

export type LocationType = 
  | 'CENTRAL_STORE' 
  | 'CLINICAL_DEPARTMENT' 
  | 'OPERATING_THEATRE' 
  | 'INPATIENT_WARD' 
  | 'SPECIALTY_UNIT';

export interface HospitalLocation {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  building: string;
  floor: string;
  headOfDepartment?: string;
  isActive: boolean;
}

export type ProductBrand = 'SCICO Medical' | 'Plasti-med' | string;

export type ProductCategory = 
  | 'Bandages & Dressings' 
  | 'Tapes & Strapping' 
  | 'Orthopedics & Padding' 
  | 'Suction Liners & Bags' 
  | 'Canisters & Hardware' 
  | 'Wound Drainage' 
  | 'Tubing & Connectors'
  | string;

export type CatalogSource = 'SCICO_MEDICAL' | 'PLASTI_MED' | 'MANUAL';

export interface ProductVariant {
  id: string;
  productId: string;
  variantName: string;
  size?: string;
  capacity?: string;
  material?: string;
  specifications?: Record<string, string>;
  packaging?: string;
  barcode?: string;
  gtin?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string; // Internal MediTrack SKU
  productCode?: string; // Source catalog product code (if provided by SCICO or Plasti-med)
  barcode?: string; // Machine-readable EAN/UPC/Code128 barcode
  gtin?: string; // Global Trade Item Number / GS1 identifier
  name: string;
  brand: ProductBrand;
  category: ProductCategory;
  description: string;
  specifications: Record<string, string>;
  uom: string; // e.g. Box, Pack, Canister, Roll, Case
  unitsPerPack: number;
  minSafetyStock: number;
  reorderPoint: number;
  standardCost: number;
  isSterile: boolean;
  storageRequirements: string;
  catalogSource: CatalogSource;
  variants?: ProductVariant[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductAuditAction =
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_ACTIVATED'
  | 'PRODUCT_DEACTIVATED'
  | 'VARIANT_CREATED'
  | 'VARIANT_UPDATED'
  | 'VARIANT_ACTIVATED'
  | 'VARIANT_DEACTIVATED';

export interface ProductAuditLog {
  id: string;
  timestamp: string;
  performedBy: string;
  performedByName: string;
  entityType: 'PRODUCT' | 'VARIANT';
  entityId: string;
  entityName: string;
  action: ProductAuditAction;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
}

export type BatchStatus = 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRING' | 'EXPIRED' | 'QUARANTINE';

export interface InventoryBatch {
  id: string;
  productId: string;
  variantId?: string;
  batchNumber: string;
  mfgDate?: string; // ISO YYYY-MM-DD
  expiryDate: string; // ISO YYYY-MM-DD
  initialQuantity: number;
  status: BatchStatus;
  supplier?: string;
  deliveryNote?: string;
  sterilizationLot?: string;
}

// CRITICAL DATA MODEL:
// Inventory must be tracked using PRODUCT + BATCH + LOCATION + QUANTITY
// The same batch can exist in multiple locations.
export interface LocationStock {
  id: string;
  productId: string;
  variantId?: string;
  batchId: string;
  locationId: string;
  quantity: number;
  reservedQuantity: number;
  lastAuditedAt: string;
}

export type MovementType = 
  | 'RECEIVE'      // Inward delivery from supplier into Central Store
  | 'TRANSFER'     // Movement between locations (Central Store -> ICU)
  | 'ISSUE'        // Direct departmental issuance for procedures
  | 'CONSUME'      // Consumed during patient care/procedure
  | 'RETURN'       // Unopened returns back to Central Store
  | 'WASTAGE'      // Expired, damaged, or contaminated disposal
  | 'ADJUSTMENT';  // Physical cycle count adjustment with audit rationale

export interface InventoryTransaction {
  id: string;
  transactionNumber: string;
  timestamp: string;
  type: MovementType;
  productId: string;
  variantId?: string;
  batchId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: number;
  performedBy: string;
  reason?: string;
  referenceDoc?: string;
  notes?: string;
}

// IDENTIFIER & SCANNING ARCHITECTURE TYPES
export type IdentifierType = 'SKU' | 'PRODUCT_CODE' | 'BARCODE' | 'QR';
export type ScannedIdentifierType = IdentifierType | 'GTIN';

export interface ProductIdentifier {
  id: string;
  identifierValue: string;
  normalizedValue: string;
  identifierType: IdentifierType;
  productId: string;
  variantId?: string | null;
  isActive: boolean;
  isSyntheticDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IdentifierResolutionResult {
  success: boolean;
  product?: Product;
  variant?: ProductVariant;
  identifier?: ProductIdentifier;
  matchedBy?: IdentifierType | 'GTIN';
  matchedValue?: string;
  isSyntheticDemo?: boolean;
  error?: string;
}

// DAILY CONSUMPTION MODEL
export interface DailyConsumption {
  id: string;
  date: string; // YYYY-MM-DD
  productId: string;
  batchId?: string; // Optional batch linkage where available
  locationId: string;
  consumedUnits: number;
  recordedBy?: string;
}

// DETERMINISTIC EXPIRY RISK MODEL
// Current stock = 240, Days to expiry = 45, Average daily usage = 3.4
// Expected usage before expiry: 3.4 × 45 = 153
// Potential excess: 240 - 153 = 87
// Display: "87 units potentially at risk of expiry"
export interface ExpiryRiskAnalysis {
  productId: string;
  batchId: string;
  locationId: string;
  currentStock: number;
  daysToExpiry: number;
  avgDailyUsage: number; // calculated over rolling 30 days
  expectedUsageBeforeExpiry: number;
  potentialRiskUnits: number;
  riskFormattedText: string;
  severity: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface TransferRecommendation {
  id: string;
  productId: string;
  batchId: string;
  fromLocationId: string;
  toLocationId: string;
  recommendedQuantity: number;
  reason: string;
  urgency: 'ROUTINE' | 'HIGH' | 'CRITICAL';
  projectedWasteSavingsUnits: number;
}

// FEFO (First-Expired, First-Out) ALLOCATION MODEL
export interface FEFOAllocationItem {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  allocatedQuantity: number;
  availableInBatch: number;
}

export interface FEFOAllocationPlan {
  productId: string;
  locationId: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  allocations: FEFOAllocationItem[];
  isFullyFulfilled: boolean;
}

// STANDARDIZED INVENTORY OPERATION RESULTS & ERROR CODES
export type InventoryErrorCode = 
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_LOCATION'
  | 'INACTIVE_LOCATION'
  | 'INACTIVE_PRODUCT'
  | 'EXPIRED_STOCK'
  | 'INVALID_QUANTITY'
  | 'SAME_LOCATION'
  | 'INVALID_BATCH'
  | 'UNAUTHORIZED';

export interface InventoryOperationResult<T = InventoryTransaction> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: InventoryErrorCode;
}

export type UserRole = 
  | 'ADMIN' 
  | 'INVENTORY_MANAGER' 
  | 'STOREKEEPER' 
  | 'DEPARTMENT_USER';

export interface UserProfile {
  id: string;
  authUserId?: string;
  email: string;
  fullName: string;
  role: UserRole;
  facility: string;
  assignedLocationId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserAuditLog {
  id: string;
  timestamp: string;
  performedBy: string;
  performedByName: string;
  targetUserId: string;
  targetUserName: string;
  action: 'ROLE_CHANGE' | 'LOCATION_REASSIGNMENT' | 'STATUS_TOGGLE' | 'PROFILE_UPDATE';
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  notes?: string;
}

export interface UserContext {
  id: string;
  name: string;
  role: UserRole;
  assignedLocationId?: string; // e.g. ICU or Central Store
}
