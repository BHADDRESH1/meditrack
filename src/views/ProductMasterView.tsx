import React, { useState } from 'react';
import { 
  Eye, 
  PlusCircle, 
  Edit3, 
  Check, 
  AlertCircle, 
  ExternalLink,
  Layers,
  Search,
  Package,
  AlertTriangle,
  FileText,
  Warehouse
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Modal } from '@/components/common/Modal';
import { 
  Product, 
  ProductVariant, 
  CatalogSource, 
  ProductCategory 
} from '@/types/inventory';
import { 
  productMasterService, 
  ProductInventorySummary 
} from '@/services/productMasterService';
import { inventoryRepo } from '@/services/inventoryRepository';
import { useAuth } from '@/context/AuthContext';
import { sanitizeSupabaseError } from '@/services/supabaseClient';

export const ProductMasterView: React.FC = () => {
  const { currentUser, hasPermission, dataMode } = useAuth();
  const canWrite = hasPermission('products:write');

  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [remoteFetchError, setRemoteFetchError] = useState<string | null>(null);
  const [, setRefreshCount] = useState(0);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoadingRemote(true);
      const res = await productMasterService.loadFromSupabase();
      if (isMounted) {
        setIsLoadingRemote(false);
        if (!res.success) {
          setRemoteFetchError(res.error);
        } else {
          setRemoteFetchError(null);
        }
        setRefreshCount(c => c + 1);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [dataMode]);

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modals & Drawers
  const [activeDetailsProduct, setActiveDetailsProduct] = useState<Product | null>(null);
  const [inventorySummary, setInventorySummary] = useState<ProductInventorySummary | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [variantParentProductId, setVariantParentProductId] = useState<string | null>(null);

  // Notifications
  const [toastSuccess, setToastSuccess] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  // Form State for Product Creation / Editing
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formProductCode, setFormProductCode] = useState('');
  const [formBrand, setFormBrand] = useState('SCICO Medical');
  const [formCategory, setFormCategory] = useState('Bandages & Dressings');
  const [formSource, setFormSource] = useState<CatalogSource>('SCICO_MEDICAL');
  const [formUom, setFormUom] = useState('Box of 12 Rolls');
  const [formUnitsPerPack, setFormUnitsPerPack] = useState(12);
  const [formMinSafety, setFormMinSafety] = useState(20);
  const [formReorderPoint, setFormReorderPoint] = useState(50);
  const [formStandardCost, setFormStandardCost] = useState(25.0);
  const [formStorageReq, setFormStorageReq] = useState('Room Temperature (15-25°C)');
  const [formIsSterile, setFormIsSterile] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formAuditReason, setFormAuditReason] = useState('');

  // Form State for Variant Creation / Editing
  const [varName, setVarName] = useState('');
  const [varSize, setVarSize] = useState('');
  const [varCapacity, setVarCapacity] = useState('');
  const [varMaterial, setVarMaterial] = useState('');
  const [varPackaging, setVarPackaging] = useState('');
  const [varAuditReason, setVarAuditReason] = useState('');

  // Products and Categories
  const allCategories = productMasterService.getCategories();
  const allBrands = productMasterService.getBrands();

  const filteredProducts = productMasterService.queryProducts({
    query: searchQuery,
    category: selectedCategory,
    brand: selectedBrand,
    catalogSource: selectedSource,
    status: selectedStatus,
  });

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setToastError(msg);
      setTimeout(() => setToastError(null), 6000);
    } else {
      setToastSuccess(msg);
      setTimeout(() => setToastSuccess(null), 5000);
    }
  };

  const handleOpenDetails = (prod: Product) => {
    setActiveDetailsProduct(prod);
    const summary = productMasterService.getProductInventorySummary(prod.id);
    setInventorySummary(summary);
  };

  const handleOpenCreateProduct = () => {
    setFormName('');
    setFormSku('');
    setFormProductCode('');
    setFormBrand('SCICO Medical');
    setFormCategory('Bandages & Dressings');
    setFormSource('SCICO_MEDICAL');
    setFormUom('Box of 12 Rolls');
    setFormUnitsPerPack(12);
    setFormMinSafety(20);
    setFormReorderPoint(50);
    setFormStandardCost(25.0);
    setFormStorageReq('Room Temperature (15-25°C)');
    setFormIsSterile(false);
    setFormDescription('');
    setFormAuditReason('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormSku(prod.sku);
    setFormProductCode(prod.productCode || '');
    setFormBrand(prod.brand);
    setFormCategory(prod.category as string);
    setFormSource(prod.catalogSource);
    setFormUom(prod.uom);
    setFormUnitsPerPack(prod.unitsPerPack);
    setFormMinSafety(prod.minSafetyStock);
    setFormReorderPoint(prod.reorderPoint);
    setFormStandardCost(prod.standardCost);
    setFormStorageReq(prod.storageRequirements);
    setFormIsSterile(prod.isSterile);
    setFormDescription(prod.description);
    setFormAuditReason('');
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (editingProduct) {
      const res = productMasterService.updateProduct({
        id: editingProduct.id,
        updates: {
          name: formName,
          sku: formSku,
          productCode: formProductCode || undefined,
          brand: formBrand,
          category: formCategory as ProductCategory,
          catalogSource: formSource,
          uom: formUom,
          unitsPerPack: Number(formUnitsPerPack),
          minSafetyStock: Number(formMinSafety),
          reorderPoint: Number(formReorderPoint),
          standardCost: Number(formStandardCost),
          storageRequirements: formStorageReq,
          isSterile: formIsSterile,
          description: formDescription,
        },
        actor: currentUser,
        reason: formAuditReason || 'Product reference specifications update',
      });

      if (!res.success) {
        showNotification(res.error || 'Failed to update product', true);
        return;
      }

      showNotification(`Product "${res.product?.name}" successfully updated.`);
      setEditingProduct(null);
      if (activeDetailsProduct?.id === editingProduct.id) {
        setActiveDetailsProduct(res.product || null);
      }
    } else {
      const res = productMasterService.createProduct({
        product: {
          name: formName,
          sku: formSku,
          productCode: formProductCode || undefined,
          brand: formBrand,
          category: formCategory as ProductCategory,
          catalogSource: formSource,
          uom: formUom,
          unitsPerPack: Number(formUnitsPerPack),
          minSafetyStock: Number(formMinSafety),
          reorderPoint: Number(formReorderPoint),
          standardCost: Number(formStandardCost),
          storageRequirements: formStorageReq,
          isSterile: formIsSterile,
          description: formDescription,
          specifications: {},
          isActive: true,
        },
        actor: currentUser,
        reason: formAuditReason || 'New medical catalog item onboarding',
      });

      if (!res.success) {
        showNotification(res.error || 'Failed to create product', true);
        return;
      }

      showNotification(`New product "${res.product?.name}" registered in Master Catalog.`);
      setIsCreateModalOpen(false);
    }
  };

  const handleToggleProductStatus = (prod: Product) => {
    if (!currentUser) return;
    const newStatus = !prod.isActive;
    const res = productMasterService.toggleProductStatus({
      id: prod.id,
      isActive: newStatus,
      actor: currentUser,
      reason: `Product ${newStatus ? 'activated' : 'deactivated'} via Product Master`,
    });

    if (res.success) {
      showNotification(`Product "${prod.name}" is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`);
      if (activeDetailsProduct?.id === prod.id) {
        setActiveDetailsProduct(res.product || null);
      }
    } else {
      showNotification(res.error || 'Status toggle failed', true);
    }
  };

  const handleOpenAddVariant = (productId: string) => {
    setVariantParentProductId(productId);
    setEditingVariant(null);
    setVarName('');
    setVarSize('');
    setVarCapacity('');
    setVarMaterial('');
    setVarPackaging('');
    setVarAuditReason('');
    setIsVariantModalOpen(true);
  };

  const handleOpenEditVariant = (variant: ProductVariant) => {
    setVariantParentProductId(variant.productId);
    setEditingVariant(variant);
    setVarName(variant.variantName);
    setVarSize(variant.size || '');
    setVarCapacity(variant.capacity || '');
    setVarMaterial(variant.material || '');
    setVarPackaging(variant.packaging || '');
    setVarAuditReason('');
    setIsVariantModalOpen(true);
  };

  const handleSaveVariant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !variantParentProductId) return;

    if (editingVariant) {
      const res = productMasterService.updateVariant({
        id: editingVariant.id,
        updates: {
          variantName: varName,
          size: varSize || undefined,
          capacity: varCapacity || undefined,
          material: varMaterial || undefined,
          packaging: varPackaging || undefined,
        },
        actor: currentUser,
        reason: varAuditReason || 'Variant configuration update',
      });

      if (!res.success) {
        showNotification(res.error || 'Variant update failed', true);
        return;
      }

      showNotification(`Variant "${res.variant?.variantName}" updated.`);
    } else {
      const res = productMasterService.createVariant({
        variant: {
          productId: variantParentProductId,
          variantName: varName,
          size: varSize || undefined,
          capacity: varCapacity || undefined,
          material: varMaterial || undefined,
          packaging: varPackaging || undefined,
          isActive: true,
        },
        actor: currentUser,
        reason: varAuditReason || 'New variant configuration created',
      });

      if (!res.success) {
        showNotification(res.error || 'Variant creation failed', true);
        return;
      }

      showNotification(`New variant "${res.variant?.variantName}" created.`);
    }

    setIsVariantModalOpen(false);
    if (activeDetailsProduct) {
      const updatedParent = productMasterService.getProductById(activeDetailsProduct.id);
      setActiveDetailsProduct(updatedParent || null);
    }
  };

  const handleToggleVariantStatus = (variant: ProductVariant) => {
    if (!currentUser) return;
    const newStatus = !variant.isActive;
    const res = productMasterService.toggleVariantStatus({
      id: variant.id,
      isActive: newStatus,
      actor: currentUser,
      reason: `Variant ${newStatus ? 'activated' : 'deactivated'}`,
    });

    if (res.success) {
      showNotification(`Variant "${variant.variantName}" is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`);
      if (activeDetailsProduct) {
        const updatedParent = productMasterService.getProductById(activeDetailsProduct.id);
        setActiveDetailsProduct(updatedParent || null);
      }
    } else {
      showNotification(res.error || 'Failed to toggle variant status', true);
    }
  };

  const renderSourceBadge = (source: CatalogSource) => {
    switch (source) {
      case 'SCICO_MEDICAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            SCICO Medical
          </span>
        );
      case 'PLASTI_MED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
            Plasti-med
          </span>
        );
      case 'MANUAL':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Manual Entry
          </span>
        );
    }
  };

  const columns: Column<Product>[] = [
    {
      header: 'Product',
      accessor: (p) => (
        <div className="max-w-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
            {p.name}
            {p.isSterile && (
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 bg-teal-50 text-teal-700 border border-teal-200 rounded">
                Sterile
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-0.5">
            {p.brand} &bull; <span className="text-slate-400">{p.uom}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Identifier',
      accessor: (p) => (
        <div>
          <div className="font-mono text-xs font-bold text-cyan-900">
            {p.sku}
          </div>
          {p.productCode ? (
            <div className="text-[10px] font-mono text-slate-400">
              Src: {p.productCode}
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic">Internal SKU</div>
          )}
        </div>
      ),
    },
    {
      header: 'Available Stock',
      accessor: (p) => {
        const availableStock = inventoryRepo.getLocationStock()
          .filter((s: { productId: string }) => s.productId === p.id)
          .reduce((sum: number, s: { quantity: number; reservedQuantity: number }) => sum + (s.quantity - s.reservedQuantity), 0);

        const isLow = availableStock <= p.minSafetyStock;
        return (
          <div>
            <div className={`text-xs font-bold ${isLow ? 'text-amber-700' : 'text-slate-900'}`}>
              {availableStock} units
            </div>
            <div className="text-[10px] text-slate-400">
              {p.unitsPerPack} / pack
            </div>
          </div>
        );
      },
    },
    {
      header: 'Reorder Point',
      accessor: (p) => (
        <div>
          <span className="font-bold text-slate-800 text-xs">
            {p.reorderPoint} units
          </span>
          <div className="text-[10px] text-slate-400">
            Min safety: {p.minSafetyStock}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (p) => (
        <StatusBadge
          label={p.isActive ? 'ACTIVE' : 'INACTIVE'}
          variant={p.isActive ? 'success' : 'neutral'}
          size="sm"
          dot={true}
        />
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      accessor: (p) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => handleOpenDetails(p)}
            title="View Product Details & Inventory Summary"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-cyan-50 hover:text-cyan-800 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            Details
          </button>
          {canWrite && (
            <button
              onClick={() => handleOpenEditProduct(p)}
              title="Edit Product Master Specifications"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Manage the hospital product catalog"
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {filteredProducts.length} Products
          </span>
        }
        actions={
          canWrite ? (
            <button
              onClick={handleOpenCreateProduct}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-700 hover:bg-cyan-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              + Add Product
            </button>
          ) : undefined
        }
      />

      {/* DEMO DATA TRANSPARENCY BANNER */}
      {dataMode === 'DEMO' && (
        <div 
          role="region"
          aria-label="Demo simulation data notice"
          className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-black tracking-wider text-[10px] uppercase bg-amber-600 text-white shrink-0">
              DEMO DATA
            </span>
            <span className="font-medium text-amber-950">
              <strong>Synthetic Training Environment:</strong> Displaying canonical demonstration product catalog. Zero live hospital records are modified.
            </span>
          </div>
          <span className="text-[11px] text-amber-800 shrink-0 font-mono hidden sm:inline-block">
            Canonical Catalog: Active
          </span>
        </div>
      )}

      {/* MODE / SUPABASE STATUS BANNER */}
      {dataMode === 'SUPABASE' && (
        <div className="p-3.5 rounded-xl bg-cyan-50/90 border border-cyan-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-900">
            <Warehouse className="w-4 h-4 text-cyan-700 shrink-0" />
            <span>
              <strong>Authoritative Supabase Mode:</strong> Reading directly from PostgreSQL tables (<code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">products</code>, <code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">product_variants</code>, <code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">product_categories</code>).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded border border-cyan-300">
              {isLoadingRemote ? 'Synchronizing...' : `${filteredProducts.length} Remote Products Loaded`}
            </span>
            <button
              type="button"
              onClick={async () => {
                setIsLoadingRemote(true);
                const res = await productMasterService.loadFromSupabase();
                setIsLoadingRemote(false);
                if (!res.success) setRemoteFetchError(res.error);
                else setRemoteFetchError(null);
                setRefreshCount(c => c + 1);
              }}
              className="px-2 py-1 text-[11px] font-bold bg-white text-cyan-800 hover:bg-cyan-100 rounded border border-cyan-300 transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* User-Friendly Database Error Banner (SUPABASE Mode with Retry) */}
      {remoteFetchError && dataMode === 'SUPABASE' && (
        <div 
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">Unable to load live catalog data.</div>
              <div className="text-xs text-amber-800 mt-0.5">
                {sanitizeSupabaseError(remoteFetchError, 'Database connection error. Honest empty states are maintained without fallback to mock records.')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsLoadingRemote(true);
              const res = await productMasterService.loadFromSupabase();
              setIsLoadingRemote(false);
              if (!res.success) setRemoteFetchError(res.error);
              else setRemoteFetchError(null);
              setRefreshCount(c => c + 1);
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {!isLoadingRemote && filteredProducts.length === 0 && dataMode === 'SUPABASE' && !remoteFetchError && (
        <div className="p-8 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-2">
          <Package className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No products found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No medical products found in the live Supabase catalog. Honest empty state is maintained without fallback to demo items.
          </p>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {toastSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastSuccess}</span>
        </div>
      )}

      {toastError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{toastError}</span>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products, SKU, barcode..."
              aria-label="Search product catalog"
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
            />
          </div>

          {/* Catalog Source Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="prod-source-filter" className="text-xs font-bold text-slate-500">Source:</label>
            <select
              id="prod-source-filter"
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              aria-label="Filter catalog source"
              className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 hover:border-cyan-600 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="ALL">All Catalog Sources</option>
              <option value="SCICO_MEDICAL">SCICO Medical</option>
              <option value="PLASTI_MED">Plasti-med</option>
              <option value="MANUAL">Manual Entry</option>
            </select>
          </div>

          {/* Brand Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="prod-brand-filter" className="text-xs font-bold text-slate-500">Brand:</label>
            <select
              id="prod-brand-filter"
              value={selectedBrand}
              onChange={e => setSelectedBrand(e.target.value)}
              aria-label="Filter brand"
              className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 hover:border-cyan-600 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="ALL">All Brands</option>
              {allBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="prod-category-filter" className="text-xs font-bold text-slate-500">Category:</label>
            <select
              id="prod-category-filter"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              aria-label="Filter category"
              className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 hover:border-cyan-600 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="ALL">All Categories</option>
              {allCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="prod-status-filter" className="text-xs font-bold text-slate-500">Status:</label>
            <select
              id="prod-status-filter"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              aria-label="Filter status"
              className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 hover:border-cyan-600 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* PRODUCTS TABLE */}
      <DataTable
        tableLabel="Authoritative medical product catalog"
        data={filteredProducts}
        columns={columns}
        keyExtractor={p => p.id}
        searchPlaceholder="Filter in-table..."
      />

      {/* ========================================================================= */}
      {/* PRODUCT DETAILS MODAL (WITH LIVE DYNAMIC INVENTORY SUMMARY) */}
      {/* ========================================================================= */}
      {activeDetailsProduct && (
        <Modal
          isOpen={true}
          onClose={() => setActiveDetailsProduct(null)}
          title={activeDetailsProduct.name}
          subtitle={`${activeDetailsProduct.brand} &bull; ${activeDetailsProduct.category}`}
          maxWidth="2xl"
        >
          <div className="space-y-6 text-xs text-slate-700">
            {/* Top Identity & Status Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    SKU: {activeDetailsProduct.sku}
                  </span>
                  {activeDetailsProduct.productCode && (
                    <span className="text-xs font-mono text-slate-500">
                      (Catalog Code: {activeDetailsProduct.productCode})
                    </span>
                  )}
                  {renderSourceBadge(activeDetailsProduct.catalogSource)}
                </div>
                <p className="text-slate-600 text-xs max-w-xl">
                  {activeDetailsProduct.description}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge
                  label={activeDetailsProduct.isActive ? 'Active Reference' : 'Deactivated'}
                  variant={activeDetailsProduct.isActive ? 'success' : 'neutral'}
                  size="sm"
                  dot={true}
                />
                {canWrite && (
                  <button
                    onClick={() => handleToggleProductStatus(activeDetailsProduct)}
                    className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    {activeDetailsProduct.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </div>

            {/* DYNAMIC REAL-TIME INVENTORY SUMMARY */}
            <div className="p-4 bg-linear-to-br from-cyan-900 via-slate-900 to-slate-800 rounded-xl text-white shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold uppercase tracking-wider text-[11px] text-cyan-200">
                    Live Operational Inventory Summary
                  </span>
                </div>
                <span className="text-[10px] text-slate-300 bg-white/10 px-2 py-0.5 rounded">
                  Authoritative Balances
                </span>
              </div>

              {inventorySummary && inventorySummary.hasInventory ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-2.5 bg-white/10 rounded-lg border border-white/10">
                      <div className="text-[10px] text-slate-300">Total Available</div>
                      <div className="text-xl font-extrabold text-cyan-300">
                        {inventorySummary.availableQuantity}
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {inventorySummary.totalReserved > 0 ? `(${inventorySummary.totalReserved} reserved)` : 'All available'}
                      </div>
                    </div>

                    <div className="p-2.5 bg-white/10 rounded-lg border border-white/10">
                      <div className="text-[10px] text-slate-300">Locations</div>
                      <div className="text-xl font-extrabold text-white">
                        {inventorySummary.locationCount}
                      </div>
                      <div className="text-[9px] text-slate-400">Hospital Departments</div>
                    </div>

                    <div className="p-2.5 bg-white/10 rounded-lg border border-white/10">
                      <div className="text-[10px] text-slate-300">Active Batches</div>
                      <div className="text-xl font-extrabold text-white">
                        {inventorySummary.batchCount}
                      </div>
                      <div className="text-[9px] text-slate-400">Lot Traceability</div>
                    </div>

                    <div className="p-2.5 bg-white/10 rounded-lg border border-white/10">
                      <div className="text-[10px] text-slate-300">Earliest Expiry</div>
                      <div className="text-sm font-bold font-mono text-amber-300 mt-1">
                        {inventorySummary.earliestExpiry || 'None'}
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {inventorySummary.daysToEarliestExpiry !== null
                          ? `${inventorySummary.daysToEarliestExpiry} days left`
                          : '-'}
                      </div>
                    </div>
                  </div>

                  {inventorySummary.potentialExpiryRiskUnits > 0 && (
                    <div className="p-2.5 bg-rose-500/20 border border-rose-400/30 rounded-lg text-rose-200 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>
                          <strong className="text-white">{inventorySummary.potentialExpiryRiskUnits} units</strong> potentially at risk of expiry before consumption.
                        </span>
                      </div>
                      <Link
                        to="/expiry-risk"
                        className="text-[11px] font-bold text-rose-300 hover:text-white underline flex items-center gap-1"
                      >
                        FEFO Prioritization &rarr;
                      </Link>
                    </div>
                  )}

                  {/* Location Balances Preview */}
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Balances Across Hospital Locations:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {inventorySummary.locations.map(loc => (
                        <span 
                          key={loc.locationId}
                          className="px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-200 text-[11px]"
                        >
                          {loc.locationName}: <strong>{loc.quantity} units</strong>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Operational Navigation Deep Links */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Link
                      to="/stock"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold transition-colors"
                    >
                      <Warehouse className="w-3 h-3" />
                      View Multi-Location Balances
                    </Link>
                    <Link
                      to="/movements"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View Audit Ledger Movements
                    </Link>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center text-slate-300">
                  <p className="font-semibold">No operational inventory currently in hospital storage.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Receive deliveries under this product SKU in the Movements Ledger to establish batch balances.
                  </p>
                </div>
              )}
            </div>

            {/* PRODUCT SPECIFICATIONS & PACKAGING */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5 border-b pb-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-600" />
                  Product Specifications
                </div>
                <div className="space-y-1.5">
                  {Object.entries(activeDetailsProduct.specifications || {}).map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between text-xs">
                      <span className="text-slate-500">{key}:</span>
                      <span className="font-semibold text-slate-800 text-right">{value}</span>
                    </div>
                  ))}
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-500">Storage:</span>
                    <span className="font-semibold text-slate-800 text-right">{activeDetailsProduct.storageRequirements}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5 border-b pb-1.5">
                  <Package className="w-3.5 h-3.5 text-cyan-600" />
                  Packaging & Unit Accounting
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-500">Unit of Measure:</span>
                    <span className="font-semibold text-slate-800">{activeDetailsProduct.uom}</span>
                  </div>
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-500">Units per Pack:</span>
                    <span className="font-semibold text-slate-800">{activeDetailsProduct.unitsPerPack}</span>
                  </div>
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-500">Min Safety Stock:</span>
                    <span className="font-mono font-bold text-amber-700">{activeDetailsProduct.minSafetyStock} units</span>
                  </div>
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-500">Reorder Threshold:</span>
                    <span className="font-mono font-bold text-slate-800">{activeDetailsProduct.reorderPoint} units</span>
                  </div>
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-500">Standard Cost:</span>
                    <span className="font-mono font-bold text-slate-900">${activeDetailsProduct.standardCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PRODUCT VARIANTS SECTION */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-700" />
                  <span className="font-bold text-slate-800 text-xs">
                    Configured Product Variants ({activeDetailsProduct.variants?.length || 0})
                  </span>
                </div>
                {canWrite && (
                  <button
                    onClick={() => handleOpenAddVariant(activeDetailsProduct.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-cyan-50 hover:text-cyan-800 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add Variant
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeDetailsProduct.variants && activeDetailsProduct.variants.length > 0 ? (
                  activeDetailsProduct.variants.map(v => (
                    <div 
                      key={v.id} 
                      className={`p-3 rounded-lg border text-xs space-y-1.5 transition-all ${
                        v.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{v.variantName}</span>
                        <StatusBadge
                          label={v.isActive ? 'Active' : 'Inactive'}
                          variant={v.isActive ? 'success' : 'neutral'}
                          size="sm"
                        />
                      </div>
                      {v.size && (
                        <div className="text-slate-600">
                          <span className="text-slate-400">Size:</span> {v.size}
                        </div>
                      )}
                      {v.capacity && (
                        <div className="text-slate-600">
                          <span className="text-slate-400">Capacity:</span> {v.capacity}
                        </div>
                      )}
                      {v.material && (
                        <div className="text-slate-600">
                          <span className="text-slate-400">Material:</span> {v.material}
                        </div>
                      )}
                      {v.packaging && (
                        <div className="text-slate-600">
                          <span className="text-slate-400">Packaging:</span> {v.packaging}
                        </div>
                      )}
                      {canWrite && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleOpenEditVariant(v)}
                            className="text-[11px] font-semibold text-slate-600 hover:text-cyan-700 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleVariantStatus(v)}
                            className="text-[11px] font-semibold text-slate-600 hover:text-rose-700 cursor-pointer"
                          >
                            {v.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 p-4 text-center bg-slate-50 rounded-lg text-slate-500">
                    No discrete variants configured. Standard configuration applies.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* CREATE PRODUCT MODAL */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateModalOpen(false)}
          title="Register New Medical Product in Master Catalog"
          subtitle="Define authoritative reference specifications. Inventory quantities are recorded separately via movements."
          maxWidth="lg"
        >
          <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  Product Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  placeholder="e.g. Scico-Plast High Elastic Compression Bandage"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Internal MediTrack SKU <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={formSku}
                  onChange={e => setFormSku(e.target.value)}
                  required
                  placeholder="e.g. SC-EAB-075"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Catalog Source Product Code (Optional)
                </label>
                <input
                  type="text"
                  value={formProductCode}
                  onChange={e => setFormProductCode(e.target.value)}
                  placeholder="e.g. SC-7545 or PM-1500L"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Brand / Manufacturer <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={formBrand}
                  onChange={e => setFormBrand(e.target.value)}
                  required
                  placeholder="e.g. SCICO Medical or Plasti-med"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Catalog Source <span className="text-rose-600">*</span>
                </label>
                <select
                  value={formSource}
                  onChange={e => setFormSource(e.target.value as CatalogSource)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                >
                  <option value="SCICO_MEDICAL">SCICO Medical Reference Catalog</option>
                  <option value="PLASTI_MED">Plasti-med Reference Catalog</option>
                  <option value="MANUAL">Manual Hospital Catalog Entry</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Category <span className="text-rose-600">*</span>
                </label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                >
                  <option value="Bandages & Dressings">Bandages & Dressings</option>
                  <option value="Tapes & Strapping">Tapes & Strapping</option>
                  <option value="Orthopedics & Padding">Orthopedics & Padding</option>
                  <option value="Suction Liners & Bags">Suction Liners & Bags</option>
                  <option value="Canisters & Hardware">Canisters & Hardware</option>
                  <option value="Wound Drainage">Wound Drainage</option>
                  <option value="Tubing & Connectors">Tubing & Connectors</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Unit of Measure (UOM) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={formUom}
                  onChange={e => setFormUom(e.target.value)}
                  required
                  placeholder="e.g. Box of 12 Rolls"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Units per Pack</label>
                <input
                  type="number"
                  min="1"
                  value={formUnitsPerPack}
                  onChange={e => setFormUnitsPerPack(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Standard Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formStandardCost}
                  onChange={e => setFormStandardCost(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Min Safety Stock</label>
                <input
                  type="number"
                  min="0"
                  value={formMinSafety}
                  onChange={e => setFormMinSafety(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reorder Point</label>
                <input
                  type="number"
                  min="0"
                  value={formReorderPoint}
                  onChange={e => setFormReorderPoint(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Description & Clinical Usage</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Clinical indication, material properties, and packaging specifications..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Audit Justification Notes</label>
                <input
                  type="text"
                  value={formAuditReason}
                  onChange={e => setFormAuditReason(e.target.value)}
                  placeholder="Rationale for onboarding this catalog entry..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold transition-colors cursor-pointer"
              >
                Onboard Product
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* EDIT PRODUCT MODAL */}
      {/* ========================================================================= */}
      {editingProduct && (
        <Modal
          isOpen={true}
          onClose={() => setEditingProduct(null)}
          title={`Edit Product: ${editingProduct.name}`}
          subtitle={`SKU: ${editingProduct.sku} &bull; Maintain historical integrity`}
          maxWidth="lg"
        >
          <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Product Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Internal SKU</label>
                <input
                  type="text"
                  value={formSku}
                  onChange={e => setFormSku(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Source Product Code</label>
                <input
                  type="text"
                  value={formProductCode}
                  onChange={e => setFormProductCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Standard Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formStandardCost}
                  onChange={e => setFormStandardCost(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reorder Point</label>
                <input
                  type="number"
                  min="0"
                  value={formReorderPoint}
                  onChange={e => setFormReorderPoint(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Audit Modification Reason</label>
                <input
                  type="text"
                  value={formAuditReason}
                  onChange={e => setFormAuditReason(e.target.value)}
                  required
                  placeholder="Clinical or administrative justification for this specification update..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold transition-colors cursor-pointer"
              >
                Commit Product Updates
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT VARIANT MODAL */}
      {/* ========================================================================= */}
      {isVariantModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsVariantModalOpen(false)}
          title={editingVariant ? 'Edit Variant Configuration' : 'Add Product Variant Configuration'}
          subtitle="Configure size, capacity, materials, and clinical packaging configurations."
          maxWidth="md"
        >
          <form onSubmit={handleSaveVariant} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Variant Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={varName}
                onChange={e => setVarName(e.target.value)}
                required
                placeholder="e.g. 7.5 cm × 4.5 m (Standard)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Size / Dimensions</label>
                <input
                  type="text"
                  value={varSize}
                  onChange={e => setVarSize(e.target.value)}
                  placeholder="e.g. 7.5 cm × 4.5 m"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Capacity / Volume</label>
                <input
                  type="text"
                  value={varCapacity}
                  onChange={e => setVarCapacity(e.target.value)}
                  placeholder="e.g. 1.5 L (1500 ml)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Material Composition</label>
                <input
                  type="text"
                  value={varMaterial}
                  onChange={e => setVarMaterial(e.target.value)}
                  placeholder="e.g. 100% Woven Cotton"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Packaging Specification</label>
                <input
                  type="text"
                  value={varPackaging}
                  onChange={e => setVarPackaging(e.target.value)}
                  placeholder="e.g. 12 Rolls / Box"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Audit Justification Notes</label>
              <input
                type="text"
                value={varAuditReason}
                onChange={e => setVarAuditReason(e.target.value)}
                placeholder="Reason for adding/modifying this variant..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsVariantModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold transition-colors cursor-pointer"
              >
                {editingVariant ? 'Save Variant Updates' : 'Add Variant'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
