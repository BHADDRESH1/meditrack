import React, { useState, useEffect } from 'react';
import { 
  PackagePlus, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  Layers, 
  Clock, 
  Check, 
  Printer, 
  ArrowRight,
  ClipboardList,
  Building2,
  ShieldCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductScanInput } from '@/components/common/ProductScanInput';
import { Button } from '@/components/common/Button';
import { Card, CardHeader, CardContent } from '@/components/common/Card';
import { SectionHeader } from '@/components/common/SectionHeader';
import { 
  Product, 
  ProductVariant, 
  IdentifierResolutionResult, 
  InventoryTransaction 
} from '@/types/inventory';
import { PurchaseOrder } from '@/types/procurement';
import { inventoryRepo } from '@/services/inventoryRepository';
import { productMasterService } from '@/services/productMasterService';
import { procurementEngine } from '@/services/procurementEngine';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';
import { useAuth } from '@/context/AuthContext';

export const GoodsReceivingView: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const canReceive = hasPermission('inventory:receive');

  // Purchase Order & Source Linkage
  const [pendingPOs, setPendingPOs] = useState<PurchaseOrder[]>([]);
  const [selectedPOId, setSelectedPOId] = useState<string>('');

  // Product Selection State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  // Batch & Receiving Form State
  const [batchNumber, setBatchNumber] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [receivingLocationId, setReceivingLocationId] = useState('loc-cs-01');
  const [supplier, setSupplier] = useState('SCICO Medical Distribution Ltd.');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [notes, setNotes] = useState('');

  // Status & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<{
    transaction: InventoryTransaction;
    productName: string;
    variantName?: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    locationName: string;
  } | null>(null);

  const allProducts = productMasterService.getProducts().filter(p => p.isActive);
  const receivingLocations = HOSPITAL_LOCATIONS.filter(l => l.isActive);

  // Load pending POs
  useEffect(() => {
    let isMounted = true;
    const loadPOs = async () => {
      try {
        const res = await procurementEngine.getPendingPurchaseOrders();
        if (isMounted && res.success && res.orders) {
          setPendingPOs(res.orders);
        }
      } catch {
        // Fallback gracefully
      }
    };
    loadPOs();
    return () => { isMounted = false; };
  }, []);

  const selectedPO = pendingPOs.find(p => p.id === selectedPOId);

  // Handle PO selection
  const handleSelectPO = (poId: string) => {
    setSelectedPOId(poId);
    setErrorMessage(null);
    if (!poId) return;

    const po = pendingPOs.find(p => p.id === poId);
    if (po) {
      if (po.supplierName) setSupplier(po.supplierName);
      if (po.destinationLocationId) setReceivingLocationId(po.destinationLocationId);
      if (po.poNumber && !deliveryNote) setDeliveryNote(`DN-FOR-${po.poNumber}`);

      // Auto-select first item if available
      if (po.items && po.items.length > 0) {
        const firstItem = po.items[0];
        const prod = allProducts.find(p => p.id === firstItem.productId);
        if (prod) {
          setSelectedProduct(prod);
          setSelectedVariant(prod.variants?.[0] || null);
          const remaining = Math.max(0, firstItem.orderedQuantity - (firstItem.receivedQuantity || 0));
          setQuantity(remaining || firstItem.orderedQuantity);
        }
      }
    }
  };

  // Quick helper to fill supplier based on product brand
  const handleProductResolved = (result: IdentifierResolutionResult) => {
    if (result.success && result.product) {
      setSelectedProduct(result.product);
      setSelectedVariant(result.variant || result.product.variants?.[0] || null);
      if (!selectedPOId) {
        if (result.product.brand === 'Plasti-med') {
          setSupplier('Plasti-med Healthcare Global');
        } else if (result.product.brand === 'SCICO Medical') {
          setSupplier('SCICO Medical Distribution Ltd.');
        }
      }
      setErrorMessage(null);
    }
  };

  const handleManualProductSelect = (productId: string) => {
    const prod = allProducts.find(p => p.id === productId);
    if (prod) {
      setSelectedProduct(prod);
      setSelectedVariant(prod.variants?.[0] || null);
      if (!selectedPOId) {
        if (prod.brand === 'Plasti-med') {
          setSupplier('Plasti-med Healthcare Global');
        } else {
          setSupplier('SCICO Medical Distribution Ltd.');
        }
      }
      setErrorMessage(null);
    }
  };

  const handleResetForm = () => {
    setSelectedPOId('');
    setSelectedProduct(null);
    setSelectedVariant(null);
    setBatchNumber('');
    setMfgDate('');
    setExpiryDate('');
    setQuantity('');
    setDeliveryNote('');
    setNotes('');
    setErrorMessage(null);
    setSuccessReceipt(null);
  };

  const handleSubmitReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!canReceive) {
      setErrorMessage('Unauthorized: Your role does not have permission to receive stock.');
      return;
    }

    if (!selectedProduct) {
      setErrorMessage('Please select or scan a medical product to receive.');
      return;
    }

    if (!batchNumber.trim()) {
      setErrorMessage('Batch/Lot number is required.');
      return;
    }

    if (!expiryDate) {
      setErrorMessage('Expiry date is mandatory for medical stock receipt.');
      return;
    }

    if (mfgDate && new Date(expiryDate).getTime() <= new Date(mfgDate).getTime()) {
      setErrorMessage('Validation Error: Expiry date must be strictly after the manufacture date.');
      return;
    }

    const today = new Date().setHours(0, 0, 0, 0);
    if (new Date(expiryDate).getTime() < today) {
      setErrorMessage('Validation Error: Cannot receive expired stock into hospital inventory.');
      return;
    }

    const qtyNum = Number(quantity);
    if (!qtyNum || qtyNum <= 0) {
      setErrorMessage('Received quantity must be a positive integer greater than zero.');
      return;
    }

    setIsSubmitting(true);

    const result = inventoryRepo.receiveStock({
      productId: selectedProduct.id,
      variantId: selectedVariant?.id,
      batchNumber: batchNumber.trim().toUpperCase(),
      mfgDate: mfgDate || undefined,
      expiryDate,
      supplier: supplier.trim(),
      deliveryNote: deliveryNote.trim() || undefined,
      toLocationId: receivingLocationId,
      quantity: qtyNum,
      performedBy: currentUser?.fullName || 'Authorized Storekeeper',
      referenceDoc: deliveryNote.trim() || selectedPO?.poNumber || undefined,
      notes: notes.trim() || undefined,
      actor: currentUser || undefined,
    });

    setIsSubmitting(false);

    if (result.success && result.data) {
      const targetLoc = HOSPITAL_LOCATIONS.find(l => l.id === receivingLocationId);
      setSuccessReceipt({
        transaction: result.data,
        productName: selectedProduct.name,
        variantName: selectedVariant?.variantName,
        batchNumber: batchNumber.trim().toUpperCase(),
        expiryDate,
        quantity: qtyNum,
        locationName: targetLoc?.name || receivingLocationId,
      });
    } else {
      setErrorMessage(result.error || 'Failed to process goods receipt.');
    }
  };

  // Recent Inward Receipts
  const recentReceipts = inventoryRepo
    .getTransactions()
    .filter(t => t.type === 'RECEIVE')
    .slice(0, 8);

  // Calculate Expected vs Received vs Remaining
  const poItem = selectedPO?.items?.find(i => i.productId === selectedProduct?.id);
  const expectedQty = poItem ? poItem.orderedQuantity : (typeof quantity === 'number' ? quantity : 0);
  const previouslyReceived = poItem ? (poItem.receivedQuantity || 0) : 0;
  const currentReceivingQty = typeof quantity === 'number' && quantity > 0 ? quantity : 0;
  const remainingQty = poItem 
    ? Math.max(0, expectedQty - previouslyReceived - currentReceivingQty)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Physical Goods Receiving & Intake"
        subtitle="Controlled physical intake of medical consumables with batch registration, expiry verification, and put-away."
        badge={
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
            <Truck className="w-3.5 h-3.5 text-cyan-600" />
            Central Depot Intake
          </span>
        }
      />

      {/* Success Confirmation Receipt Banner */}
      {successReceipt && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-300 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-950">
                  Goods Receipt Recorded Successfully
                </h3>
                <p className="text-xs text-emerald-800 font-mono">
                  Transaction #{successReceipt.transaction.transactionNumber} &bull; Authoritative Ledger Updated
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                icon={<Printer className="w-3.5 h-3.5" />}
              >
                Print Receipt
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleResetForm}
                icon={<PackagePlus className="w-3.5 h-3.5" />}
              >
                Receive Another Item
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/80 p-3.5 rounded-xl border border-emerald-200/80 text-xs">
            <div>
              <span className="text-[11px] text-slate-500 font-medium">Product</span>
              <p className="font-bold text-slate-900 truncate">{successReceipt.productName}</p>
              {successReceipt.variantName && (
                <p className="text-[11px] text-cyan-800 font-semibold">{successReceipt.variantName}</p>
              )}
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium">Batch / Expiry</span>
              <p className="font-mono font-bold text-slate-900">{successReceipt.batchNumber}</p>
              <p className="text-[11px] text-emerald-700 font-semibold">Exp: {successReceipt.expiryDate}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium">Quantity Put-Away</span>
              <p className="font-bold text-lg text-emerald-800">+{successReceipt.quantity} Units</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium">Assigned Location</span>
              <p className="font-bold text-slate-900">{successReceipt.locationName}</p>
              <Link
                to="/stock"
                className="text-[11px] text-cyan-700 hover:text-cyan-800 font-semibold inline-flex items-center gap-1 mt-0.5"
              >
                <span>View in Stock</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 5-Step Visual Progress Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3 sm:p-4">
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <div className={`p-2 rounded-lg transition-all ${selectedPOId ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-200' : 'bg-slate-50 text-slate-600'}`}>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 1</div>
            <div className="truncate">PO / Shipment</div>
          </div>
          <div className={`p-2 rounded-lg transition-all ${selectedProduct ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-200' : 'bg-slate-50 text-slate-600'}`}>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 2</div>
            <div className="truncate">Product &amp; SKU</div>
          </div>
          <div className={`p-2 rounded-lg transition-all ${quantity ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-200' : 'bg-slate-50 text-slate-600'}`}>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 3</div>
            <div className="truncate">Intake Qty</div>
          </div>
          <div className={`p-2 rounded-lg transition-all ${batchNumber && expiryDate ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-200' : 'bg-slate-50 text-slate-600'}`}>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 4</div>
            <div className="truncate">Batch &amp; Expiry</div>
          </div>
          <div className={`p-2 rounded-lg transition-all ${selectedProduct && batchNumber && expiryDate && quantity ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 5</div>
            <div className="truncate">Complete</div>
          </div>
        </div>
      </div>

      {/* Main Receiving Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: 5-Step Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 sm:p-6 space-y-6">
              <form onSubmit={handleSubmitReceipt} className="space-y-6">
                
                {/* STEP 1: PO / SHIPMENT SELECTION */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <SectionHeader 
                      title="Step 1: Select Purchase Order or Direct Shipment" 
                      subtitle="Optionally link intake to an authorized procurement order."
                      badge={selectedPO ? selectedPO.poNumber : 'Direct Intake'}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="rcv-po-select" className="block text-xs font-semibold text-slate-700 mb-1">
                        Active Purchase Order (PO)
                      </label>
                      <select
                        id="rcv-po-select"
                        value={selectedPOId}
                        onChange={e => handleSelectPO(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      >
                        <option value="">-- Direct Intake (No Linked PO) --</option>
                        {pendingPOs.map(po => (
                          <option key={po.id} value={po.id}>
                            {po.poNumber} &bull; {po.supplierName || 'Vendor'} (${po.totalAmount.toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="rcv-delivery-note" className="block text-xs font-semibold text-slate-700 mb-1">
                        Delivery Note / Waybill Ref #
                      </label>
                      <input
                        id="rcv-delivery-note"
                        type="text"
                        value={deliveryNote}
                        onChange={e => setDeliveryNote(e.target.value)}
                        placeholder="e.g. DN-2026-9812"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                    </div>
                  </div>

                  {selectedPO && (
                    <div className="p-3 bg-cyan-50/70 rounded-xl border border-cyan-200 text-xs flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-cyan-700 shrink-0" />
                        <div>
                          <span className="font-semibold text-cyan-950">{selectedPO.supplierName}</span>
                          <span className="text-cyan-700 text-[11px] block">Order Date: {selectedPO.orderDate} &bull; Total: ${selectedPO.totalAmount.toFixed(2)}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 border border-cyan-200">
                        {selectedPO.status}
                      </span>
                    </div>
                  )}
                </div>

                {/* STEP 2: PRODUCT IDENTIFICATION & SELECTION */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <SectionHeader 
                      title="Step 2: Select or Scan Medical Product" 
                      subtitle="Lookup item via barcode scanner, SKU, or registered catalog."
                    />
                  </div>

                  <div className="space-y-3">
                    <ProductScanInput
                      onProductResolved={handleProductResolved}
                      selectedProduct={selectedProduct}
                      selectedVariant={selectedVariant}
                      onClear={() => {
                        setSelectedProduct(null);
                        setSelectedVariant(null);
                      }}
                      autoFocus
                    />

                    {/* Catalog Dropdown Fallback */}
                    {!selectedProduct && (
                      <div className="pt-1">
                        <label className="block text-[11px] text-slate-500 font-medium mb-1">
                          Or select directly from registered Medical Catalog:
                        </label>
                        <select
                          onChange={e => handleManualProductSelect(e.target.value)}
                          defaultValue=""
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                        >
                          <option value="" disabled>-- Select a catalog medical product --</option>
                          {allProducts.map(p => (
                            <option key={p.id} value={p.id}>
                              [{p.brand}] {p.sku} &bull; {p.name} ({p.category})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Variant Selector */}
                    {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-cyan-700" />
                          Select Product Variant:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedProduct.variants.map(v => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setSelectedVariant(v)}
                              className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                                selectedVariant?.id === v.id
                                  ? 'bg-cyan-50 border-cyan-600 text-cyan-900 font-bold shadow-2xs ring-1 ring-cyan-600'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 font-medium'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{v.variantName}</span>
                                {selectedVariant?.id === v.id && <Check className="w-3.5 h-3.5 text-cyan-700" />}
                              </div>
                              {(v.size || v.capacity) && (
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {v.size && `Size: ${v.size}`} {v.capacity && `Capacity: ${v.capacity}`}
                                </p>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* STEP 3 & 4: QUANTITY, BATCH & EXPIRY */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <SectionHeader 
                      title="Step 3 &amp; 4: Quantity, Batch &amp; Expiry Confirmation" 
                      subtitle="Enter physical count and lot details strictly from packaging."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Quantity */}
                    <div>
                      <label htmlFor="rcv-quantity" className="block text-xs font-semibold text-slate-700 mb-1">
                        Intake Quantity ({selectedProduct?.uom || 'Units'}) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="rcv-quantity"
                        type="number"
                        required
                        min={1}
                        value={quantity}
                        onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 50"
                        aria-invalid={Boolean(errorMessage && errorMessage.includes('quantity'))}
                        aria-describedby={errorMessage ? 'rcv-form-error' : undefined}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                    </div>

                    {/* Batch / Lot Number */}
                    <div>
                      <label htmlFor="rcv-batch-number" className="block text-xs font-semibold text-slate-700 mb-1">
                        Batch / Lot Number <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="rcv-batch-number"
                        type="text"
                        required
                        value={batchNumber}
                        onChange={e => setBatchNumber(e.target.value)}
                        placeholder="e.g. EB-2026-009"
                        aria-invalid={Boolean(errorMessage && errorMessage.includes('Batch'))}
                        aria-describedby={errorMessage ? 'rcv-form-error' : undefined}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                    </div>

                    {/* Expiry Date */}
                    <div>
                      <label htmlFor="rcv-expiry-date" className="block text-xs font-semibold text-slate-700 mb-1">
                        Expiry Date <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="rcv-expiry-date"
                        type="date"
                        required
                        value={expiryDate}
                        onChange={e => setExpiryDate(e.target.value)}
                        aria-invalid={Boolean(errorMessage && errorMessage.includes('Expiry'))}
                        aria-describedby={errorMessage ? 'rcv-form-error' : undefined}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                    </div>

                    {/* Manufacture Date */}
                    <div>
                      <label htmlFor="rcv-mfg-date" className="block text-xs font-semibold text-slate-700 mb-1">
                        Manufacture Date <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        id="rcv-mfg-date"
                        type="date"
                        value={mfgDate}
                        onChange={e => setMfgDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                    </div>

                    {/* Receiving Location */}
                    <div>
                      <label htmlFor="rcv-location-select" className="block text-xs font-semibold text-slate-700 mb-1">
                        Put-Away Hospital Location <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id="rcv-location-select"
                        value={receivingLocationId}
                        onChange={e => setReceivingLocationId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      >
                        {receivingLocations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code} &bull; {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Supplier */}
                    <div>
                      <label htmlFor="rcv-supplier" className="block text-xs font-semibold text-slate-700 mb-1">
                        Supplier / Distributor
                      </label>
                      <input
                        id="rcv-supplier"
                        type="text"
                        value={supplier}
                        onChange={e => setSupplier(e.target.value)}
                        placeholder="e.g. SCICO Medical Distribution Ltd."
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                    </div>
                  </div>

                  {/* Inspection Notes */}
                  <div>
                    <label htmlFor="rcv-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                      Inspection Notes / Cold Chain Verification
                    </label>
                    <textarea
                      id="rcv-notes"
                      rows={2}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="e.g. Packaging intact, seal verified unbroken, temperature strip normal."
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div 
                    id="rcv-form-error"
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-in fade-in duration-150"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1">
                      <span className="font-bold">Cannot Complete Intake: </span>
                      <span>{errorMessage}</span>
                    </div>
                  </div>
                )}

                {/* STEP 5: FINAL COMPLETE RECEIVING ACTION */}
                <div className="border-t border-slate-100 pt-4 flex items-center justify-between flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Clear Form
                  </button>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={isSubmitting || !selectedProduct || !canReceive}
                    isLoading={isSubmitting}
                    icon={<PackagePlus className="w-4 h-4" />}
                  >
                    Complete Receiving
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Receiving Summary Card & Recent Receipts */}
        <div className="space-y-6">
          {/* RECEIVING SUMMARY CARD */}
          <Card>
            <CardHeader 
              title="Receiving Summary" 
              subtitle="Intake verification metrics"
              badge={<ClipboardList className="w-3.5 h-3.5 text-cyan-600" />}
            />
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Expected</div>
                  <div className="text-base font-extrabold text-slate-800 mt-0.5">
                    {expectedQty > 0 ? expectedQty : '--'}
                  </div>
                </div>
                <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-100">
                  <div className="text-[10px] uppercase font-bold text-cyan-700">Receiving</div>
                  <div className="text-base font-extrabold text-cyan-900 mt-0.5">
                    {currentReceivingQty > 0 ? `+${currentReceivingQty}` : '--'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Remaining</div>
                  <div className="text-base font-extrabold text-slate-800 mt-0.5">
                    {selectedPO ? remainingQty : '--'}
                  </div>
                </div>
              </div>

              {selectedProduct ? (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Selected Product:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[140px]">{selectedProduct.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Batch Number:</span>
                    <span className="font-mono font-bold text-slate-900">{batchNumber || 'Pending'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expiry Date:</span>
                    <span className="font-semibold text-slate-800">{expiryDate || 'Pending'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Destination:</span>
                    <span className="font-medium text-slate-800">
                      {receivingLocations.find(l => l.id === receivingLocationId)?.code || 'Central Store'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                  Select a product to view summary details.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Standard Intake SOP Guidelines */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Standard Intake Protocol
            </h3>
            <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
              <li>Inspect outer tamper-evident seals before acceptance.</li>
              <li>Scan product barcode or enter internal SKU to match catalog.</li>
              <li>Record lot and expiry date directly from primary packaging.</li>
              <li>Expired stock is rejected by database integrity checks.</li>
            </ul>
          </div>

          {/* Recent Inward Receipts Log */}
          <Card>
            <CardHeader
              title="Recent Receipts"
              subtitle="Latest inward stock entries"
              badge={<Clock className="w-3.5 h-3.5 text-cyan-600" />}
              action={
                <Link
                  to="/movements"
                  className="text-[11px] font-semibold text-cyan-700 hover:underline"
                >
                  Full Ledger
                </Link>
              }
            />
            <CardContent>
              {recentReceipts.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">No recent goods receipts.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {recentReceipts.map(rcpt => {
                    const prod = productMasterService.getProductById(rcpt.productId);
                    const loc = HOSPITAL_LOCATIONS.find(l => l.id === rcpt.toLocationId);
                    const batch = inventoryRepo.getBatchById(rcpt.batchId);
                    return (
                      <div
                        key={rcpt.id}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 truncate max-w-[170px]">
                            {prod?.name || rcpt.productId}
                          </span>
                          <span className="font-bold text-emerald-700">+{rcpt.quantity}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                          <span>Batch: {batch?.batchNumber || rcpt.batchId}</span>
                          <span>{loc?.code || 'Central Store'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

