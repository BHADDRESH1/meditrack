import { 
  Product, 
  ProductVariant, 
  ProductAuditLog, 
  UserProfile, 
  CatalogSource 
} from '@/types/inventory';
import { MASTER_PRODUCTS, INITIAL_PRODUCT_AUDIT_LOGS } from '@/data/productCatalogs';
import { inventoryRepo } from './inventoryRepository';
import { hasPermission } from './permissions';
import { getDataMode, supabaseRest, onDataModeChange } from './supabaseClient';

export interface ProductFilterCriteria {
  query?: string;
  category?: string;
  brand?: string;
  catalogSource?: string;
  status?: string; // 'ALL' | 'ACTIVE' | 'INACTIVE'
}

export interface ProductInventorySummary {
  productId: string;
  totalQuantity: number;
  totalReserved: number;
  availableQuantity: number;
  locationCount: number;
  batchCount: number;
  earliestExpiry: string | null;
  daysToEarliestExpiry: number | null;
  potentialExpiryRiskUnits: number;
  hasInventory: boolean;
  locations: {
    locationId: string;
    locationName: string;
    locationCode: string;
    quantity: number;
    reservedQuantity: number;
  }[];
  batches: {
    batchId: string;
    batchNumber: string;
    expiryDate: string;
    status: string;
    quantity: number;
  }[];
}

class ProductMasterService {
  private products: Product[] = [];
  private auditLogs: ProductAuditLog[] = [...INITIAL_PRODUCT_AUDIT_LOGS];
  private remoteError: string | null = null;
  private isRemoteLoadedFlag: boolean = false;

  constructor() {
    if (getDataMode() === 'DEMO') {
      this.products = [...MASTER_PRODUCTS];
      this.isRemoteLoadedFlag = true;
      inventoryRepo.syncProducts(this.products);
    } else {
      this.products = [];
      this.isRemoteLoadedFlag = false;
      inventoryRepo.syncProducts([]);
    }
  }

  public getRemoteError(): string | null {
    return this.remoteError;
  }

  public isRemoteLoaded(): boolean {
    return this.isRemoteLoadedFlag;
  }

  public clearForSupabase(): void {
    this.products = [];
    this.remoteError = null;
    this.isRemoteLoadedFlag = false;
    inventoryRepo.syncProducts([]);
  }

  public resetToCanonicalSeed(): void {
    this.products = [...MASTER_PRODUCTS];
    this.auditLogs = [...INITIAL_PRODUCT_AUDIT_LOGS];
    this.remoteError = null;
    this.isRemoteLoadedFlag = true;
    inventoryRepo.syncProducts(this.products);
  }

  /**
   * Loads products, categories, variants, and identifiers authoritatively from Supabase.
   * In SUPABASE mode, never silently falls back to local data on failure or empty sets.
   */
  public async loadFromSupabase(): Promise<{ success: boolean; error: string | null; count: number }> {
    if (getDataMode() !== 'SUPABASE') {
      this.resetToCanonicalSeed();
      return { success: true, error: null, count: this.products.length };
    }

    const res = await supabaseRest<any[]>('products?select=*,category:product_categories(*),variants:product_variants(*)');
    if (res.error) {
      this.remoteError = res.error;
      this.products = [];
      this.isRemoteLoadedFlag = true;
      inventoryRepo.syncProducts([]);
      return { success: false, error: res.error, count: 0 };
    }

    const rawRows = res.data || [];
    const mapped: Product[] = rawRows.map(row => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      productCode: row.product_code || row.sku,
      brand: row.brand || 'Generic',
      category: row.category?.name || row.category || 'Bandages & Dressings',
      catalogSource: (row.catalog_source as CatalogSource) || 'MANUAL',
      description: row.description || '',
      specifications: (row.specifications && typeof row.specifications === 'object') ? row.specifications : {},
      uom: row.uom || row.unit || 'Unit',
      unitsPerPack: row.units_per_pack ?? 1,
      minSafetyStock: row.min_safety_stock ?? 10,
      reorderPoint: row.reorder_point ?? 25,
      standardCost: typeof row.standard_cost === 'number' ? row.standard_cost : parseFloat(row.standard_cost) || 0,
      isSterile: row.is_sterile ?? false,
      storageRequirements: row.storage_requirements || 'Room Temperature (15-25°C)',
      isActive: row.is_active ?? true,
      variants: Array.isArray(row.variants) ? row.variants.map((v: any) => ({
        id: v.id,
        productId: v.product_id,
        variantName: v.variant_name || v.name || 'Standard',
        size: v.size || undefined,
        capacity: v.capacity || undefined,
        material: v.material || undefined,
        specifications: (v.specifications && typeof v.specifications === 'object') ? v.specifications : undefined,
        packaging: v.packaging || undefined,
        isActive: v.is_active ?? true,
        createdAt: v.created_at || new Date().toISOString(),
        updatedAt: v.updated_at || new Date().toISOString(),
      })) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    this.products = mapped;
    this.remoteError = null;
    this.isRemoteLoadedFlag = true;
    inventoryRepo.syncProducts(this.products);
    return { success: true, error: null, count: mapped.length };
  }

  // --- QUERY APIS ---
  public getProducts(): Product[] {
    if (getDataMode() === 'SUPABASE' && !this.isRemoteLoadedFlag) {
      return [];
    }
    return this.products.map(p => ({
      ...p,
      variants: p.variants ? p.variants.map(v => ({ ...v })) : [],
    }));
  }

  public getProductById(id: string): Product | undefined {
    if (getDataMode() === 'SUPABASE' && !this.isRemoteLoadedFlag) {
      return undefined;
    }
    const product = this.products.find(p => p.id === id);
    if (!product) return undefined;
    return {
      ...product,
      variants: product.variants ? product.variants.map(v => ({ ...v })) : [],
    };
  }

  public getProductBySku(sku: string): Product | undefined {
    const cleanSku = sku.trim().toLowerCase();
    return this.products.find(p => p.sku.toLowerCase() === cleanSku);
  }

  public getCategories(): string[] {
    const cats = new Set<string>();
    for (const p of this.products) {
      if (p.category) cats.add(p.category);
    }
    return Array.from(cats).sort();
  }

  public getBrands(): string[] {
    const brands = new Set<string>();
    for (const p of this.products) {
      if (p.brand) brands.add(p.brand);
    }
    return Array.from(brands).sort();
  }

  public queryProducts(criteria: ProductFilterCriteria): Product[] {
    let list = this.getProducts();

    if (criteria.category && criteria.category !== 'ALL') {
      list = list.filter(p => p.category === criteria.category);
    }

    if (criteria.brand && criteria.brand !== 'ALL') {
      list = list.filter(p => p.brand === criteria.brand);
    }

    if (criteria.catalogSource && criteria.catalogSource !== 'ALL') {
      list = list.filter(p => p.catalogSource === criteria.catalogSource);
    }

    if (criteria.status && criteria.status !== 'ALL') {
      const wantActive = criteria.status === 'ACTIVE';
      list = list.filter(p => p.isActive === wantActive);
    }

    if (criteria.query && criteria.query.trim()) {
      const q = criteria.query.toLowerCase().trim();
      list = list.filter(p => {
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku.toLowerCase().includes(q);
        const matchesCode = p.productCode ? p.productCode.toLowerCase().includes(q) : false;
        const matchesBrand = p.brand.toLowerCase().includes(q);
        const matchesCat = p.category.toLowerCase().includes(q);
        const matchesVariant = p.variants?.some(v => 
          v.variantName.toLowerCase().includes(q) ||
          (v.size && v.size.toLowerCase().includes(q)) ||
          (v.material && v.material.toLowerCase().includes(q))
        ) ?? false;

        return matchesName || matchesSku || matchesCode || matchesBrand || matchesCat || matchesVariant;
      });
    }

    return list;
  }

  // --- DYNAMIC INVENTORY SUMMARY CALCULATION ---
  // Connects Product Master with real-time operational inventory from inventoryRepo
  public getProductInventorySummary(productId: string): ProductInventorySummary {
    const stockItems = inventoryRepo.getStockByProduct(productId);
    const batches = inventoryRepo.getBatches().filter(b => b.productId === productId);
    const riskAnalyses = inventoryRepo.calculateExpiryRisks().filter(r => r.productId === productId);

    const totalQuantity = stockItems.reduce((sum, s) => sum + s.quantity, 0);
    const totalReserved = stockItems.reduce((sum, s) => sum + s.reservedQuantity, 0);
    const availableQuantity = Math.max(0, totalQuantity - totalReserved);

    // Filter locations with active stock
    const activeLocationsMap = new Map<string, { quantity: number; reservedQuantity: number }>();
    for (const s of stockItems) {
      if (s.quantity > 0 || s.reservedQuantity > 0) {
        const current = activeLocationsMap.get(s.locationId) || { quantity: 0, reservedQuantity: 0 };
        current.quantity += s.quantity;
        current.reservedQuantity += s.reservedQuantity;
        activeLocationsMap.set(s.locationId, current);
      }
    }

    const locations = Array.from(activeLocationsMap.entries()).map(([locId, balance]) => {
      const loc = inventoryRepo.getLocationById(locId);
      return {
        locationId: locId,
        locationName: loc?.name || locId,
        locationCode: loc?.code || locId,
        quantity: balance.quantity,
        reservedQuantity: balance.reservedQuantity,
      };
    });

    // Batches with stock and status
    const batchList = batches.map(b => {
      const batchStock = stockItems
        .filter(s => s.batchId === b.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        status: b.status,
        quantity: batchStock,
      };
    });

    // Earliest expiry date from active batches that have quantity > 0
    const activeBatchesWithStock = batchList.filter(b => b.quantity > 0);
    let earliestExpiry: string | null = null;
    let daysToEarliestExpiry: number | null = null;

    if (activeBatchesWithStock.length > 0) {
      const sorted = [...activeBatchesWithStock].sort(
        (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      );
      earliestExpiry = sorted[0].expiryDate;
      const today = new Date().setHours(0, 0, 0, 0);
      const target = new Date(earliestExpiry).getTime();
      daysToEarliestExpiry = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    }

    const potentialExpiryRiskUnits = riskAnalyses.reduce(
      (sum, r) => sum + r.potentialRiskUnits, 
      0
    );

    return {
      productId,
      totalQuantity,
      totalReserved,
      availableQuantity,
      locationCount: locations.length,
      batchCount: batches.length,
      earliestExpiry,
      daysToEarliestExpiry,
      potentialExpiryRiskUnits,
      hasInventory: totalQuantity > 0 || batches.length > 0,
      locations,
      batches: batchList,
    };
  }

  // --- PRODUCT MASTER MUTATIONS (RBAC & AUDIT PROTECTED) ---
  public createProduct(params: {
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
    actor: UserProfile;
    reason?: string;
  }): { success: boolean; error?: string; product?: Product } {
    const { product, actor, reason } = params;

    // 1. RBAC authorization check
    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only authorized administrators and inventory managers may create products.',
      };
    }

    // 2. Validate required fields
    if (!product.name?.trim()) {
      return { success: false, error: 'Product name is strictly mandatory.' };
    }
    if (!product.sku?.trim()) {
      return { success: false, error: 'Internal MediTrack SKU is strictly mandatory.' };
    }
    if (!product.brand?.trim()) {
      return { success: false, error: 'Product brand is required.' };
    }
    if (!product.category?.trim()) {
      return { success: false, error: 'Product category is required.' };
    }
    if (!product.uom?.trim()) {
      return { success: false, error: 'Unit of measure is required.' };
    }

    // 3. Validate catalogSource controlled enum
    const validSources: CatalogSource[] = ['SCICO_MEDICAL', 'PLASTI_MED', 'MANUAL'];
    if (!validSources.includes(product.catalogSource)) {
      return {
        success: false,
        error: `Invalid catalog source "${product.catalogSource}". Must be one of: SCICO_MEDICAL, PLASTI_MED, or MANUAL.`,
      };
    }

    // 4. Validate duplicate SKU prevention
    const cleanSku = product.sku.trim().toLowerCase();
    if (this.products.some(p => p.sku.toLowerCase() === cleanSku)) {
      return {
        success: false,
        error: `DUPLICATE_SKU: A product with SKU "${product.sku}" already exists in the master catalog.`,
      };
    }

    // 5. Validate duplicate productCode if supplied
    if (product.productCode?.trim()) {
      const cleanCode = product.productCode.trim().toLowerCase();
      if (this.products.some(p => p.productCode && p.productCode.toLowerCase() === cleanCode)) {
        return {
          success: false,
          error: `DUPLICATE_PRODUCT_CODE: A product with source code "${product.productCode}" already exists.`,
        };
      }
    }

    // 6. Create product with immutable timestamp
    const now = new Date().toISOString();
    const newId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newProduct: Product = {
      ...product,
      id: newId,
      sku: product.sku.trim(),
      productCode: product.productCode?.trim() || undefined,
      unitsPerPack: product.unitsPerPack || 1,
      minSafetyStock: product.minSafetyStock || 10,
      reorderPoint: product.reorderPoint || 25,
      standardCost: product.standardCost || 0,
      storageRequirements: product.storageRequirements || 'Room Temperature (15-25°C)',
      isSterile: product.isSterile ?? false,
      isActive: product.isActive ?? true,
      variants: product.variants || [],
      createdAt: now,
      updatedAt: now,
    };

    // If no variant was passed, generate a baseline default variant
    if (!newProduct.variants || newProduct.variants.length === 0) {
      newProduct.variants = [
        {
          id: `var-${Date.now()}-std`,
          productId: newId,
          variantName: 'Standard Configuration',
          packaging: newProduct.uom,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }

    this.products.unshift(newProduct);
    inventoryRepo.syncProducts(this.products);

    // 7. Record immutable audit log
    this.recordAuditLog({
      performedBy: actor.id,
      performedByName: actor.fullName,
      entityType: 'PRODUCT',
      entityId: newId,
      entityName: newProduct.name,
      action: 'PRODUCT_CREATED',
      newValue: `SKU: ${newProduct.sku} | Source: ${newProduct.catalogSource}`,
      reason: reason || 'New medical product onboarding into Product Master',
    });

    return { success: true, product: { ...newProduct } };
  }

  public updateProduct(params: {
    id: string;
    updates: Partial<Product>;
    actor: UserProfile;
    reason?: string;
  }): { success: boolean; error?: string; product?: Product } {
    const { id, updates, actor, reason } = params;

    // 1. RBAC check
    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only authorized administrators and inventory managers may edit products.',
      };
    }

    const product = this.products.find(p => p.id === id);
    if (!product) {
      return { success: false, error: `Product with ID "${id}" not found.` };
    }

    // 2. Prevent SKU collision if changing SKU
    if (updates.sku && updates.sku.trim().toLowerCase() !== product.sku.toLowerCase()) {
      const cleanSku = updates.sku.trim().toLowerCase();
      if (this.products.some(p => p.id !== id && p.sku.toLowerCase() === cleanSku)) {
        return {
          success: false,
          error: `DUPLICATE_SKU: Another product already uses SKU "${updates.sku}".`,
        };
      }
    }

    // 3. Prevent catalogSource invalid values
    if (updates.catalogSource) {
      const validSources: CatalogSource[] = ['SCICO_MEDICAL', 'PLASTI_MED', 'MANUAL'];
      if (!validSources.includes(updates.catalogSource)) {
        return {
          success: false,
          error: `Invalid catalog source "${updates.catalogSource}". Must be one of: SCICO_MEDICAL, PLASTI_MED, or MANUAL.`,
        };
      }
    }

    const oldName = product.name;
    const oldActive = product.isActive;

    // Apply safe reference attribute updates
    if (updates.name !== undefined) product.name = updates.name.trim();
    if (updates.sku !== undefined) product.sku = updates.sku.trim();
    if (updates.productCode !== undefined) product.productCode = updates.productCode.trim();
    if (updates.brand !== undefined) product.brand = updates.brand;
    if (updates.category !== undefined) product.category = updates.category;
    if (updates.description !== undefined) product.description = updates.description;
    if (updates.uom !== undefined) product.uom = updates.uom;
    if (updates.unitsPerPack !== undefined) product.unitsPerPack = updates.unitsPerPack;
    if (updates.minSafetyStock !== undefined) product.minSafetyStock = updates.minSafetyStock;
    if (updates.reorderPoint !== undefined) product.reorderPoint = updates.reorderPoint;
    if (updates.standardCost !== undefined) product.standardCost = updates.standardCost;
    if (updates.storageRequirements !== undefined) product.storageRequirements = updates.storageRequirements;
    if (updates.isSterile !== undefined) product.isSterile = updates.isSterile;
    if (updates.catalogSource !== undefined) product.catalogSource = updates.catalogSource;
    if (updates.specifications !== undefined) product.specifications = { ...updates.specifications };

    product.updatedAt = new Date().toISOString();
    inventoryRepo.syncProducts(this.products);

    // Audit action
    let action: ProductAuditLog['action'] = 'PRODUCT_UPDATED';
    if (updates.isActive !== undefined && updates.isActive !== oldActive) {
      product.isActive = updates.isActive;
      action = updates.isActive ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED';
    }

    this.recordAuditLog({
      performedBy: actor.id,
      performedByName: actor.fullName,
      entityType: 'PRODUCT',
      entityId: product.id,
      entityName: product.name,
      action,
      oldValue: oldName,
      newValue: product.name,
      reason: reason || 'Product master reference metadata update',
    });

    return { success: true, product: { ...product } };
  }

  public toggleProductStatus(params: {
    id: string;
    isActive: boolean;
    actor: UserProfile;
    reason?: string;
  }): { success: boolean; error?: string; product?: Product } {
    const { id, isActive, actor, reason } = params;

    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only authorized administrators and inventory managers may modify product status.',
      };
    }

    const product = this.products.find(p => p.id === id);
    if (!product) {
      return { success: false, error: `Product with ID "${id}" not found.` };
    }

    const oldStatus = product.isActive;
    product.isActive = isActive;
    product.updatedAt = new Date().toISOString();
    inventoryRepo.syncProducts(this.products);

    this.recordAuditLog({
      performedBy: actor.id,
      performedByName: actor.fullName,
      entityType: 'PRODUCT',
      entityId: product.id,
      entityName: product.name,
      action: isActive ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
      oldValue: String(oldStatus),
      newValue: String(isActive),
      reason: reason || `Product ${isActive ? 'activated' : 'deactivated'} by clinical inventory staff`,
    });

    return { success: true, product: { ...product } };
  }

  public deleteProductSafely(params: {
    id: string;
    actor: UserProfile;
  }): { success: boolean; error?: string } {
    const { id, actor } = params;

    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only authorized administrators and inventory managers may delete products.',
      };
    }

    const product = this.products.find(p => p.id === id);
    if (!product) {
      return { success: false, error: `Product with ID "${id}" not found.` };
    }

    // Historical integrity check:
    // A product cannot be destructively deleted if it has batches, stock balances, or movement transactions!
    const batches = inventoryRepo.getBatches().filter(b => b.productId === id);
    const stock = inventoryRepo.getStockByProduct(id);
    const transactions = inventoryRepo.getTransactions().filter(t => t.productId === id);

    if (batches.length > 0 || stock.some(s => s.quantity > 0) || transactions.length > 0) {
      return {
        success: false,
        error: `HISTORICAL_INTEGRITY_VIOLATION: Cannot destructively delete "${product.name}". It is associated with ${batches.length} batch(es), ${stock.length} stock record(s), and ${transactions.length} movement transaction(s). Please deactivate the product instead.`,
      };
    }

    // If completely unreferenced, allow clean removal
    this.products = this.products.filter(p => p.id !== id);
    inventoryRepo.syncProducts(this.products);

    this.recordAuditLog({
      performedBy: actor.id,
      performedByName: actor.fullName,
      entityType: 'PRODUCT',
      entityId: id,
      entityName: product.name,
      action: 'PRODUCT_DEACTIVATED',
      oldValue: product.name,
      newValue: 'DELETED',
      reason: 'Unreferenced product master entry permanently purged',
    });

    return { success: true };
  }

  // --- VARIANT MANAGEMENT (RBAC & AUDIT PROTECTED) ---
  public getVariants(productId?: string): ProductVariant[] {
    const allVariants: ProductVariant[] = [];
    for (const p of this.products) {
      if (p.variants) {
        if (!productId || p.id === productId) {
          allVariants.push(...p.variants.map(v => ({ ...v })));
        }
      }
    }
    return allVariants;
  }

  public getVariantById(id: string): ProductVariant | undefined {
    for (const p of this.products) {
      if (p.variants) {
        const v = p.variants.find(item => item.id === id);
        if (v) return { ...v };
      }
    }
    return undefined;
  }

  public createVariant(params: {
    variant: Omit<ProductVariant, 'id' | 'createdAt' | 'updatedAt'>;
    actor: UserProfile;
    reason?: string;
  }): { success: boolean; error?: string; variant?: ProductVariant } {
    const { variant, actor, reason } = params;

    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only authorized staff may create product variants.',
      };
    }

    const product = this.products.find(p => p.id === variant.productId);
    if (!product) {
      return { success: false, error: `Parent product with ID "${variant.productId}" not found.` };
    }

    if (!variant.variantName?.trim()) {
      return { success: false, error: 'Variant name is required.' };
    }

    // Check duplicate variant name within product
    if (product.variants?.some(v => v.variantName.toLowerCase() === variant.variantName.trim().toLowerCase())) {
      return {
        success: false,
        error: `A variant named "${variant.variantName}" already exists for product "${product.name}".`,
      };
    }

    const now = new Date().toISOString();
    const newVariant: ProductVariant = {
      ...variant,
      id: `var-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      variantName: variant.variantName.trim(),
      isActive: variant.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    if (!product.variants) {
      product.variants = [];
    }
    product.variants.push(newVariant);
    product.updatedAt = now;
    inventoryRepo.syncProducts(this.products);

    this.recordAuditLog({
      performedBy: actor.id,
      performedByName: actor.fullName,
      entityType: 'VARIANT',
      entityId: newVariant.id,
      entityName: `${product.name} - ${newVariant.variantName}`,
      action: 'VARIANT_CREATED',
      newValue: newVariant.variantName,
      reason: reason || 'New product variant configuration added',
    });

    return { success: true, variant: { ...newVariant } };
  }

  public updateVariant(params: {
    id: string;
    updates: Partial<ProductVariant>;
    actor: UserProfile;
    reason?: string;
  }): { success: boolean; error?: string; variant?: ProductVariant } {
    const { id, updates, actor, reason } = params;

    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Only authorized staff may edit product variants.',
      };
    }

    for (const product of this.products) {
      if (product.variants) {
        const variant = product.variants.find(v => v.id === id);
        if (variant) {
          const oldName = variant.variantName;
          const oldActive = variant.isActive;

          if (updates.variantName !== undefined) variant.variantName = updates.variantName.trim();
          if (updates.size !== undefined) variant.size = updates.size;
          if (updates.capacity !== undefined) variant.capacity = updates.capacity;
          if (updates.material !== undefined) variant.material = updates.material;
          if (updates.packaging !== undefined) variant.packaging = updates.packaging;
          if (updates.specifications !== undefined) variant.specifications = { ...updates.specifications };

          variant.updatedAt = new Date().toISOString();
          product.updatedAt = variant.updatedAt;
          inventoryRepo.syncProducts(this.products);

          let action: ProductAuditLog['action'] = 'VARIANT_UPDATED';
          if (updates.isActive !== undefined && updates.isActive !== oldActive) {
            variant.isActive = updates.isActive;
            action = updates.isActive ? 'VARIANT_ACTIVATED' : 'VARIANT_DEACTIVATED';
          }

          this.recordAuditLog({
            performedBy: actor.id,
            performedByName: actor.fullName,
            entityType: 'VARIANT',
            entityId: variant.id,
            entityName: `${product.name} - ${variant.variantName}`,
            action,
            oldValue: oldName,
            newValue: variant.variantName,
            reason: reason || 'Product variant specifications update',
          });

          return { success: true, variant: { ...variant } };
        }
      }
    }

    return { success: false, error: `Variant with ID "${id}" not found.` };
  }

  public toggleVariantStatus(params: {
    id: string;
    isActive: boolean;
    actor: UserProfile;
    reason?: string;
  }): { success: boolean; error?: string; variant?: ProductVariant } {
    return this.updateVariant({
      id: params.id,
      updates: { isActive: params.isActive },
      actor: params.actor,
      reason: params.reason || `Variant ${params.isActive ? 'activated' : 'deactivated'}`,
    });
  }

  // --- IMMUTABLE AUDIT LOGGING ---
  public getProductAuditLogs(entityId?: string): ProductAuditLog[] {
    const list = entityId 
      ? this.auditLogs.filter(l => l.entityId === entityId)
      : this.auditLogs;
    return list
      .map(l => ({ ...l }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private recordAuditLog(log: Omit<ProductAuditLog, 'id' | 'timestamp'>): void {
    this.auditLogs.unshift({
      ...log,
      id: `pa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
    });
  }
}

export const productMasterService = new ProductMasterService();

onDataModeChange((mode) => {
  if (mode === 'SUPABASE') {
    productMasterService.clearForSupabase();
  } else {
    productMasterService.resetToCanonicalSeed();
  }
});

