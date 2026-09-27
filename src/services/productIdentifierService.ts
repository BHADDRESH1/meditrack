import { 
  ProductIdentifier,
  IdentifierType,
  IdentifierResolutionResult, 
  UserProfile,
  Product,
  ProductVariant,
  CatalogSource 
} from '@/types/inventory';
import { productMasterService } from '@/services/productMasterService';
import { MASTER_PRODUCTS } from '@/data/productCatalogs';
import { hasPermission } from '@/services/permissions';
import { getDataMode, supabaseRest } from '@/services/supabaseClient';

export class ProductIdentifierService {
  // Authoritative Centralized Product Identifier Registry
  // Key: normalizedValue (VARCHAR UNIQUE) -> Value: ProductIdentifier
  private identifierRegistry = new Map<string, ProductIdentifier>();

  constructor() {
    this.seedAuthoritativeRegistry();
  }

  /**
   * Normalizes an identifier string for deterministic, case-insensitive, unique resolution.
   */
  public normalize(raw: string): string {
    return raw.trim().toUpperCase();
  }

  public clearForSupabase(): void {
    // Keep synthetic demo identifiers available for scan detection and isSyntheticDemo flagging
  }

  /**
   * Resets and populates the authoritative identifier registry.
   */
  public resetToCanonicalSeed(): void {
    this.identifierRegistry.clear();
    this.seedAuthoritativeRegistry();
  }

  private seedAuthoritativeRegistry(): void {
    const now = new Date('2026-09-01T00:00:00Z').toISOString();
    const allProducts = MASTER_PRODUCTS;

    // 1. Register canonical SKUs from Product Master
    for (const prod of allProducts) {
      if (prod.sku) {
        const normSku = this.normalize(prod.sku);
        this.identifierRegistry.set(normSku, {
          id: `ident-sku-${prod.id}`,
          identifierValue: prod.sku,
          normalizedValue: normSku,
          identifierType: 'SKU',
          productId: prod.id,
          variantId: prod.variants?.[0]?.id || null,
          isActive: true,
          isSyntheticDemo: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      // 2. Register canonical Supplier Product Codes
      if (prod.productCode) {
        const normCode = this.normalize(prod.productCode);
        if (!this.identifierRegistry.has(normCode)) {
          this.identifierRegistry.set(normCode, {
            id: `ident-code-${prod.id}`,
            identifierValue: prod.productCode,
            normalizedValue: normCode,
            identifierType: 'PRODUCT_CODE',
            productId: prod.id,
            variantId: prod.variants?.[0]?.id || null,
            isActive: true,
            isSyntheticDemo: false,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Supplier prefix alias (e.g. SRC-SC-EAB-75)
        const prefixedCode = `SRC-${normCode}`;
        if (!this.identifierRegistry.has(prefixedCode)) {
          this.identifierRegistry.set(prefixedCode, {
            id: `ident-src-${prod.id}`,
            identifierValue: `SRC-${prod.productCode}`,
            normalizedValue: prefixedCode,
            identifierType: 'PRODUCT_CODE',
            productId: prod.id,
            variantId: prod.variants?.[0]?.id || null,
            isActive: true,
            isSyntheticDemo: false,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // 3. Register Explicit Synthetic Demo Identifiers
    // NOTE: Values such as '8901234567890' are synthetic demonstration identifiers for clinical testing.
    // They must NEVER be described or represented as verified or genuine GS1/EAN-13 supplier barcodes.
    // While scanner libraries or cameras may support the EAN-13 decoding format, that does NOT mean
    // these specific demo values are genuine GS1/EAN supplier identifiers. They are strictly Synthetic Demo Identifiers.
    const syntheticDemoIdentifiers: Array<{
      value: string;
      productId: string;
      variantId?: string;
      type: IdentifierType;
    }> = [
      // Primary Synthetic Demo Identifiers
      { value: 'DEMO-SCICO-EB-001', productId: 'prod-scico-01', variantId: 'var-scico-01-75', type: 'BARCODE' },
      { value: 'DEMO-SCICO-EB-002', productId: 'prod-scico-01', variantId: 'var-scico-01-100', type: 'BARCODE' },
      { value: 'DEMO-PLASTIMED-SLB-15', productId: 'prod-pm-01', variantId: 'var-pm-01-15', type: 'BARCODE' },
      { value: 'DEMO-PLASTIMED-SLB-20', productId: 'prod-pm-02', variantId: 'var-pm-02-20', type: 'BARCODE' },

      // Illustrative demo barcode numbers (tracked explicitly with isSyntheticDemo: true)
      { value: '8901234567890', productId: 'prod-scico-01', variantId: 'var-scico-01-75', type: 'BARCODE' },
      { value: '8901234567891', productId: 'prod-scico-01', variantId: 'var-scico-01-100', type: 'BARCODE' },
      { value: '8901234567801', productId: 'prod-scico-02', variantId: 'var-scico-02-100', type: 'BARCODE' },
      { value: '8901234567802', productId: 'prod-scico-03', variantId: 'var-scico-03-75', type: 'BARCODE' },
      { value: '8901234567803', productId: 'prod-scico-04', variantId: 'var-scico-04-50', type: 'BARCODE' },
      { value: '8901234567804', productId: 'prod-scico-05', variantId: 'var-scico-05-25', type: 'BARCODE' },
      { value: '8901234567805', productId: 'prod-scico-06', variantId: 'var-scico-06-100', type: 'BARCODE' },
      { value: '8901234567806', productId: 'prod-scico-07', variantId: 'var-scico-07-150', type: 'BARCODE' },
      { value: '8901234567807', productId: 'prod-scico-08', variantId: 'var-scico-08-50', type: 'BARCODE' },
      { value: '8901234567808', productId: 'prod-scico-09', variantId: 'var-scico-09-10', type: 'BARCODE' },
      { value: '8901234567809', productId: 'prod-scico-10', variantId: 'var-scico-10-std', type: 'BARCODE' },

      { value: '7909876543210', productId: 'prod-pm-01', variantId: 'var-pm-01-15', type: 'BARCODE' },
      { value: 'PM-SUC-15L', productId: 'prod-pm-01', variantId: 'var-pm-01-15', type: 'SKU' },
      { value: 'PM-SUC-15', productId: 'prod-pm-01', variantId: 'var-pm-01-15', type: 'SKU' },
      { value: '7909876543211', productId: 'prod-pm-02', variantId: 'var-pm-02-20', type: 'BARCODE' },
      { value: '7909876543212', productId: 'prod-pm-03', variantId: 'var-pm-03-30', type: 'BARCODE' },
      { value: '7909876543201', productId: 'prod-pm-02', type: 'BARCODE' },
      { value: '7909876543202', productId: 'prod-pm-03', type: 'BARCODE' },
      { value: '7909876543203', productId: 'prod-pm-04', type: 'BARCODE' },
      { value: '7909876543204', productId: 'prod-pm-05', type: 'BARCODE' },
      { value: '7909876543205', productId: 'prod-pm-06', type: 'BARCODE' },
      { value: '7909876543206', productId: 'prod-pm-07', type: 'BARCODE' },
      { value: '7909876543207', productId: 'prod-pm-08', type: 'BARCODE' },
      { value: '7909876543208', productId: 'prod-pm-09', type: 'BARCODE' },
      { value: '7909876543209', productId: 'prod-pm-10', type: 'BARCODE' },
    ];

    for (const demo of syntheticDemoIdentifiers) {
      const norm = this.normalize(demo.value);
      if (!this.identifierRegistry.has(norm)) {
        this.identifierRegistry.set(norm, {
          id: `ident-demo-${demo.value.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          identifierValue: demo.value,
          normalizedValue: norm,
          identifierType: demo.type,
          productId: demo.productId,
          variantId: demo.variantId || null,
          isActive: true,
          isSyntheticDemo: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  /**
   * Resolves a raw machine-readable or entered identifier string against the centralized registry.
   *
   * SECURITY & DATA INTEGRITY:
   * QR payloads (JSON, URL) are used ONLY to extract the identifier token.
   * Arbitrary QR JSON attributes are strictly NOT trusted as medical metadata.
   * All product & variant attributes are resolved authoritatively from the database.
   */
  public resolveIdentifier(rawInput: string): IdentifierResolutionResult {
    if (!rawInput || !rawInput.trim()) {
      return {
        success: false,
        error: 'Identifier input cannot be empty.',
      };
    }

    const trimmed = rawInput.trim();

    // 1. Extract identifier token from QR payload (JSON, URL, or plain string)
    let extractedToken = trimmed;
    let isQr = false;

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed);
        // Only extract the identifier key; do not trust arbitrary medical metadata in QR payload
        if (json.sku || json.code || json.barcode || json.id || json.identifier) {
          extractedToken = (json.sku || json.code || json.barcode || json.id || json.identifier).toString().trim();
          isQr = true;
        }
      } catch {
        // Fall back to plain string
      }
    } else if (trimmed.includes('meditrack://') || trimmed.includes('/products/')) {
      const urlMatch = trimmed.match(/(?:meditrack:\/\/product\/|\/products\/)([A-Za-z0-9-_]+)/);
      if (urlMatch && urlMatch[1]) {
        extractedToken = urlMatch[1].trim();
        isQr = true;
      }
    }

    const normalizedToken = this.normalize(extractedToken);

    // 2. Authoritative lookup in Centralized Identifier Registry
    const matchedIdentifier = this.identifierRegistry.get(normalizedToken);

    if (matchedIdentifier && matchedIdentifier.isActive) {
      const product = productMasterService.getProductById(matchedIdentifier.productId) || (matchedIdentifier.isSyntheticDemo ? MASTER_PRODUCTS.find(p => p.id === matchedIdentifier.productId) : undefined);
      if (product) {
        const variant = matchedIdentifier.variantId
          ? product.variants?.find(v => v.id === matchedIdentifier.variantId)
          : product.variants?.[0];

        return {
          success: true,
          product,
          variant,
          identifier: matchedIdentifier,
          matchedBy: isQr ? 'QR' : matchedIdentifier.identifierType,
          matchedValue: trimmed,
          isSyntheticDemo: matchedIdentifier.isSyntheticDemo,
        };
      }
    }

    return {
      success: false,
      error: `Unknown identifier "${trimmed}". No medical product found matching this barcode, SKU, or QR code.`,
    };
  }

  /**
   * Resolves an identifier string authoritatively from the Supabase product_identifiers table.
   * In SUPABASE mode, never trusts local in-memory dictionaries.
   */
  public async resolveIdentifierRemote(rawInput: string): Promise<IdentifierResolutionResult> {
    if (!rawInput || !rawInput.trim()) {
      return {
        success: false,
        error: 'Identifier input cannot be empty.',
      };
    }

    const trimmed = rawInput.trim();
    let extractedToken = trimmed;
    let isQr = false;

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed);
        if (json.sku || json.code || json.barcode || json.id || json.identifier) {
          extractedToken = (json.sku || json.code || json.barcode || json.id || json.identifier).toString().trim();
          isQr = true;
        }
      } catch {}
    } else if (trimmed.includes('meditrack://') || trimmed.includes('/products/')) {
      const urlMatch = trimmed.match(/(?:meditrack:\/\/product\/|\/products\/)([A-Za-z0-9-_]+)/);
      if (urlMatch && urlMatch[1]) {
        extractedToken = urlMatch[1].trim();
        isQr = true;
      }
    }

    const normalizedToken = this.normalize(extractedToken);

    if (getDataMode() !== 'SUPABASE') {
      return this.resolveIdentifier(rawInput);
    }

    const res = await supabaseRest<any[]>(
      `product_identifiers?normalized_value=eq.${encodeURIComponent(normalizedToken)}&select=*,product:products(*),variant:product_variants(*)`
    );

    if (res.error) {
      return {
        success: false,
        error: `Supabase identifier query failed: ${res.error}`,
      };
    }

    if (!res.data || res.data.length === 0) {
      return {
        success: false,
        error: `Unknown identifier "${trimmed}". No medical product found matching this identifier in Supabase product_identifiers.`,
      };
    }

    const row = res.data[0];
    const identifier: ProductIdentifier = {
      id: row.id,
      identifierValue: row.identifier_value,
      normalizedValue: row.normalized_value,
      identifierType: row.identifier_type,
      productId: row.product_id,
      variantId: row.variant_id || null,
      isActive: row.is_active,
      isSyntheticDemo: row.identifier_type === 'SYNTHETIC_DEMO',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const rawProd = row.product;
    const rawVar = row.variant;

    let product: Product | undefined = productMasterService.getProductById(row.product_id);
    let variant: ProductVariant | undefined = product?.variants?.find((v: ProductVariant) => v.id === row.variant_id) || product?.variants?.[0];

    if (!product && rawProd) {
      variant = rawVar ? {
        id: rawVar.id,
        productId: rawVar.product_id,
        variantName: rawVar.variant_name || rawVar.name || 'Standard',
        size: rawVar.size || undefined,
        capacity: rawVar.capacity || undefined,
        material: rawVar.material || undefined,
        specifications: rawVar.specifications || {},
        packaging: rawVar.packaging || undefined,
        isActive: rawVar.is_active ?? true,
        createdAt: rawVar.created_at || new Date().toISOString(),
        updatedAt: rawVar.updated_at || new Date().toISOString(),
      } : undefined;

      product = {
        id: rawProd.id,
        name: rawProd.name,
        sku: rawProd.sku,
        productCode: rawProd.product_code || rawProd.sku,
        brand: rawProd.brand || 'SCICO Medical',
        category: rawProd.category?.name || rawProd.category || 'Bandages & Dressings',
        catalogSource: (rawProd.catalog_source as CatalogSource) || 'MANUAL',
        description: rawProd.description || '',
        specifications: rawProd.specifications || {},
        uom: rawProd.uom || rawProd.unit || 'Unit',
        unitsPerPack: rawProd.units_per_pack ?? 1,
        minSafetyStock: rawProd.min_safety_stock ?? 10,
        reorderPoint: rawProd.reorder_point ?? 25,
        standardCost: parseFloat(rawProd.standard_cost) || 0,
        isSterile: rawProd.is_sterile ?? false,
        storageRequirements: rawProd.storage_requirements || 'Room Temperature (15-25°C)',
        isActive: rawProd.is_active ?? true,
        variants: variant ? [variant] : [],
        createdAt: rawProd.created_at,
        updatedAt: rawProd.updated_at,
      };
    }

    return {
      success: true,
      product,
      variant,
      identifier,
      matchedBy: isQr ? 'QR' : identifier.identifierType,
      matchedValue: trimmed,
      isSyntheticDemo: identifier.isSyntheticDemo,
    };
  }

  /**
   * Registers a new identifier in the centralized registry.
   * Enforces global uniqueness on normalized_value across the entire registry.
   * Enforces Product -> Variant consistency.
   */
  public registerIdentifier(params: {
    identifierValue: string;
    identifierType?: IdentifierType;
    productId: string;
    variantId?: string | null;
    actor: UserProfile;
    isSyntheticDemo?: boolean;
    barcode?: string; // backwards compatibility alias for identifierValue
  }): { success: boolean; error?: string; identifier?: ProductIdentifier } {
    const { 
      productId, 
      variantId, 
      actor, 
      identifierType = 'BARCODE', 
      isSyntheticDemo = false 
    } = params;

    const rawValue = params.identifierValue || params.barcode;

    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'Unauthorized: You do not have permission to register product identifiers.',
      };
    }

    if (!rawValue || !rawValue.trim()) {
      return {
        success: false,
        error: 'Identifier value cannot be empty.',
      };
    }

    const normalizedValue = this.normalize(rawValue);

    // 1. Verify Global Uniqueness across the Centralized Registry
    const existing = this.identifierRegistry.get(normalizedValue);
    if (existing && existing.isActive) {
      if (existing.productId !== productId || existing.variantId !== (variantId || null)) {
        const conflictProd = productMasterService.getProductById(existing.productId);
        return {
          success: false,
          error: `Identifier conflict: "${rawValue}" is already registered to "${conflictProd?.name || existing.productId}".`,
        };
      }
    }

    // 2. Validate Product exists in Product Master
    const product = productMasterService.getProductById(productId);
    if (!product) {
      return {
        success: false,
        error: `Product with ID "${productId}" does not exist in Product Master.`,
      };
    }

    // 3. Enforce Product -> Variant consistency
    if (variantId) {
      const variantExists = product.variants?.some(v => v.id === variantId);
      if (!variantExists) {
        return {
          success: false,
          error: `Variant consistency violation: Variant ID "${variantId}" does not belong to product "${product.name}".`,
        };
      }
    }

    // 4. Register into authoritative registry
    const newIdentifier: ProductIdentifier = {
      id: `ident-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      identifierValue: rawValue.trim(),
      normalizedValue,
      identifierType,
      productId,
      variantId: variantId || null,
      isActive: true,
      isSyntheticDemo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.identifierRegistry.set(normalizedValue, newIdentifier);

    return { 
      success: true, 
      identifier: newIdentifier 
    };
  }

  /**
   * Deactivates an identifier in the registry.
   */
  public deactivateIdentifier(
    rawIdentifier: string, 
    actor: UserProfile
  ): { success: boolean; error?: string } {
    if (!hasPermission(actor, 'products:write')) {
      return {
        success: false,
        error: 'Unauthorized: You do not have permission to deactivate product identifiers.',
      };
    }

    const normalized = this.normalize(rawIdentifier);
    const existing = this.identifierRegistry.get(normalized);
    if (!existing) {
      return {
        success: false,
        error: `Identifier "${rawIdentifier}" not found.`,
      };
    }

    existing.isActive = false;
    existing.updatedAt = new Date().toISOString();
    return { success: true };
  }

  /**
   * Returns all active identifiers for a product.
   */
  public getIdentifiersForProduct(productId: string): ProductIdentifier[] {
    const list: ProductIdentifier[] = [];
    for (const item of this.identifierRegistry.values()) {
      if (item.productId === productId && item.isActive) {
        list.push({ ...item });
      }
    }
    return list;
  }

  /**
   * Returns all registered identifiers.
   */
  public getAllIdentifiers(): ProductIdentifier[] {
    return Array.from(this.identifierRegistry.values()).map(item => ({ ...item }));
  }

  /**
   * Backward-compatibility helper for legacy callers.
   */
  public getAllRegisteredBarcodes(): Array<{ barcode: string; productId: string; variantId?: string }> {
    return this.getAllIdentifiers()
      .filter(i => i.identifierType === 'BARCODE')
      .map(i => ({
        barcode: i.identifierValue,
        productId: i.productId,
        variantId: i.variantId || undefined,
      }));
  }
}

export const productIdentifierService = new ProductIdentifierService();



