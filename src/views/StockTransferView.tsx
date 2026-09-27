import React, { useState } from 'react';
import { 
  ArrowLeftRight, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Card, CardHeader, CardContent } from '@/components/common/Card';
import { SectionHeader } from '@/components/common/SectionHeader';
import { 
  Product, 
  InventoryTransaction 
} from '@/types/inventory';
import { inventoryRepo } from '@/services/inventoryRepository';
import { productMasterService } from '@/services/productMasterService';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';
import { useAuth } from '@/context/AuthContext';

export const StockTransferView: React.FC = () => {
  const { currentUser, hasPermission, canAccessLocation } = useAuth();
  const canTransfer = hasPermission('inventory:transfer');

  // Multi-step transfer state
  const isDeptUser = currentUser?.role === 'DEPARTMENT_USER';
  const defaultSourceLoc = isDeptUser ? (currentUser?.assignedLocationId || 'loc-icu-01') : 'loc-cs-01';

  const [fromLocationId, setFromLocationId] = useState(defaultSourceLoc);
  const [selectedProductId, setSelectedProductId] = useState<string>('prod-scico-01');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [toLocationId, setToLocationId] = useState<string>('loc-icu-01');
  const [transferQuantity, setTransferQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('Urgent clinical ward replenishment');
  const [referenceDoc, setReferenceDoc] = useState('');

  // Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<InventoryTransaction | null>(null);

  // Available Locations
  const accessibleFromLocations = HOSPITAL_LOCATIONS.filter(loc => {
    if (!loc.isActive) return false;
    return canAccessLocation(loc.id);
  });

  const accessibleToLocations = HOSPITAL_LOCATIONS.filter(loc => {
    if (!loc.isActive) return false;
    return loc.id !== fromLocationId;
  });

  // Available products holding stock at fromLocationId
  const availableStockAtSource = inventoryRepo.getStockByLocation(fromLocationId).filter(s => s.quantity > 0);
  const productIdsWithStock = Array.from(new Set(availableStockAtSource.map(s => s.productId)));
  const productsWithStock = productIdsWithStock
    .map(id => productMasterService.getProductById(id))
    .filter((p): p is Product => Boolean(p && p.isActive));

  // Current active product
  const activeProduct = productMasterService.getProductById(selectedProductId);

  // Available batches for this product at fromLocationId
  const batchesForProductAtSource = availableStockAtSource
    .filter(s => s.productId === selectedProductId)
    .map(s => {
      const b = inventoryRepo.getBatchById(s.batchId);
      return {
        stock: s,
        batch: b,
        available: s.quantity - s.reservedQuantity,
      };
    })
    .filter(item => Boolean(item.batch));

  // Active batch selection
  const activeBatchRecord = batchesForProductAtSource.find(b => b.batch?.id === selectedBatchId) 
    || batchesForProductAtSource[0];

  const currentBatch = activeBatchRecord?.batch;
  const maxAvailable = activeBatchRecord?.available ?? 0;

  // Destination location current stock for this product
  const destStockRecords = inventoryRepo.getStockByLocation(toLocationId).filter(s => s.productId === selectedProductId);
  const destCurrentAvail = destStockRecords.reduce((acc, s) => acc + (s.quantity - s.reservedQuantity), 0);

  const transferQtyNum = typeof transferQuantity === 'number' && transferQuantity > 0 ? transferQuantity : 0;
  const sourceAfterTransfer = Math.max(0, maxAvailable - transferQtyNum);
  const destAfterTransfer = destCurrentAvail + transferQtyNum;

  const handleOpenReview = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!canTransfer) {
      setErrorMsg('Unauthorized: You do not have permission to execute inventory transfers.');
      return;
    }

    if (fromLocationId === toLocationId) {
      setErrorMsg('Source and Destination locations cannot be identical.');
      return;
    }

    if (!selectedProductId) {
      setErrorMsg('Please select a product to transfer.');
      return;
    }

    if (!currentBatch) {
      setErrorMsg('Please select a valid inventory batch with available stock.');
      return;
    }

    const qty = Number(transferQuantity);
    if (!qty || qty <= 0) {
      setErrorMsg('Transfer quantity must be greater than zero.');
      return;
    }

    if (qty > maxAvailable) {
      setErrorMsg(`Insufficient stock: Requested ${qty} units, but only ${maxAvailable} units are available.`);
      return;
    }

    // Expired stock guard
    const isExpired = new Date(currentBatch.expiryDate).getTime() < new Date().setHours(0, 0, 0, 0) || currentBatch.status === 'EXPIRED';
    if (isExpired) {
      const destLoc = HOSPITAL_LOCATIONS.find(l => l.id === toLocationId);
      if (destLoc?.type !== 'CENTRAL_STORE' && !/quarantine|disposal|waste|return/i.test(reason)) {
        setErrorMsg(`Cannot transfer expired batch ${currentBatch.batchNumber} to clinical unit "${destLoc?.name}". Must be routed to quarantine or central disposal.`);
        return;
      }
    }

    setIsConfirmModalOpen(true);
  };

  const handleExecuteTransfer = () => {
    if (!currentBatch || !activeProduct) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const result = inventoryRepo.transferStock({
      productId: activeProduct.id,
      batchId: currentBatch.id,
      fromLocationId,
      toLocationId,
      quantity: Number(transferQuantity),
      performedBy: currentUser?.fullName || 'Authorized Staff',
      reason,
      referenceDoc: referenceDoc || undefined,
      actor: currentUser || undefined,
    });

    setIsSubmitting(false);
    setIsConfirmModalOpen(false);

    if (result.success && result.data) {
      setSuccessResult(result.data);
      setTransferQuantity('');
    } else {
      setErrorMsg(result.error || 'Failed to execute stock transfer.');
    }
  };

  const sourceLocation = HOSPITAL_LOCATIONS.find(l => l.id === fromLocationId);
  const destinationLocation = HOSPITAL_LOCATIONS.find(l => l.id === toLocationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inter-Departmental Stock Transfer"
        subtitle="Atomic transfer of batch-tracked consumables between Central Supply and clinical departments."
        badge={
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
            <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-600" />
            Atomic Movement Engine
          </span>
        }
      />

      {/* Success Banner */}
      {successResult && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-300 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Stock Transfer Executed Successfully
                </h3>
                <p className="text-xs text-emerald-800 font-mono">
                  Tx #{successResult.transactionNumber} &bull; {successResult.quantity} units transferred atomically.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/stock"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-2xs"
              >
                Verify In Stock Balances
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSuccessResult(null)}
              >
                Perform Another Transfer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Form & Preview Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Linear Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleOpenReview} className="space-y-6">
                {/* Step 1: Location Route */}
                <div className="space-y-3">
                  <SectionHeader
                    title="Step 1: Movement Route"
                    subtitle="Select origin store and receiving clinical department."
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Source Location */}
                    <div>
                      <label htmlFor="xfer-from-location" className="block text-xs font-semibold text-slate-700 mb-1">
                        Source Location (From) <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id="xfer-from-location"
                        value={fromLocationId}
                        disabled={isDeptUser}
                        onChange={e => {
                          setFromLocationId(e.target.value);
                          setSelectedBatchId('');
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      >
                        {accessibleFromLocations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code} &bull; {loc.name}
                          </option>
                        ))}
                      </select>
                      {isDeptUser && (
                        <span className="text-[10px] text-purple-700 font-semibold mt-1 block">
                          Locked to your authorized clinical department.
                        </span>
                      )}
                    </div>

                    {/* Destination Location */}
                    <div>
                      <label htmlFor="xfer-to-location" className="block text-xs font-semibold text-slate-700 mb-1">
                        Destination Location (To) <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id="xfer-to-location"
                        value={toLocationId}
                        onChange={e => setToLocationId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      >
                        {accessibleToLocations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code} &bull; {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Step 2: Product & Batch Selection */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <SectionHeader
                    title="Step 2: Consumable &amp; Batch"
                    subtitle="Select registered medical supply and specific lot to transfer."
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Product Selector */}
                    <div>
                      <label htmlFor="xfer-product-select" className="block text-xs font-semibold text-slate-700 mb-1">
                        Medical Product <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id="xfer-product-select"
                        value={selectedProductId}
                        onChange={e => {
                          setSelectedProductId(e.target.value);
                          setSelectedBatchId('');
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      >
                        {productsWithStock.map(p => (
                          <option key={p.id} value={p.id}>
                            [{p.brand}] {p.sku} &bull; {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Batch Selector */}
                    <div>
                      <label htmlFor="xfer-batch-select" className="block text-xs font-semibold text-slate-700 mb-1">
                        Batch / Lot Number <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id="xfer-batch-select"
                        value={selectedBatchId || (currentBatch?.id ?? '')}
                        onChange={e => setSelectedBatchId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      >
                        {batchesForProductAtSource.map(item => (
                          <option key={item.batch!.id} value={item.batch!.id}>
                            Batch: {item.batch!.batchNumber} &bull; Avail: {item.available} &bull; Exp: {item.batch!.expiryDate}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Batch Details Card */}
                  {currentBatch && (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium">Source Available Balance</span>
                        <p className="font-mono font-bold text-sm text-slate-900">
                          {maxAvailable} Available Units
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium">Expiry Date</span>
                        <p className="font-semibold text-slate-800">
                          {currentBatch.expiryDate}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium">Batch Status</span>
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          currentBatch.status === 'EXPIRED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {currentBatch.status}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 3: Quantity & Rationale */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <SectionHeader
                    title="Step 3: Transfer Quantity &amp; Audit Reason"
                    subtitle="Specify units to decrement from source and add to destination."
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Quantity */}
                    <div>
                      <label htmlFor="xfer-quantity" className="block text-xs font-semibold text-slate-700 mb-1">
                        Units to Transfer <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="xfer-quantity"
                        type="number"
                        required
                        min={1}
                        max={maxAvailable}
                        value={transferQuantity}
                        onChange={e => setTransferQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder={`Max: ${maxAvailable}`}
                        aria-invalid={Boolean(errorMsg && errorMsg.includes('quantity'))}
                        aria-describedby={errorMsg ? 'xfer-error-msg' : undefined}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Max available in source: {maxAvailable} units
                      </span>
                    </div>

                    {/* Reference Doc */}
                    <div>
                      <label htmlFor="xfer-reference-doc" className="block text-xs font-semibold text-slate-700 mb-1">
                        Requisition / Work Order Ref
                      </label>
                      <input
                        id="xfer-reference-doc"
                        type="text"
                        value={referenceDoc}
                        onChange={e => setReferenceDoc(e.target.value)}
                        placeholder="e.g. REQ-ICU-2026-081"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                      />
                    </div>
                  </div>

                  {/* Rationale */}
                  <div>
                    <label htmlFor="xfer-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                      Transfer Clinical Rationale <span className="text-rose-600">*</span>
                    </label>
                    <input
                      id="xfer-reason"
                      type="text"
                      required
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Replenishing ICU buffer stock before scheduled surgical procedures"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                    />
                  </div>
                </div>

                {/* Error Message */}
                {errorMsg && (
                  <div 
                    id="xfer-error-msg"
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1 font-semibold">{errorMsg}</div>
                  </div>
                )}

                {/* Submit Action */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={!canTransfer || maxAvailable <= 0}
                    icon={<ArrowLeftRight className="w-4 h-4" />}
                  >
                    Review &amp; Execute Transfer
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Visual Before/After Preview & ACID Guarantee */}
        <div className="space-y-6">
          {/* VISUAL STOCK PREVIEW (BEFORE VS AFTER) */}
          <Card>
            <CardHeader
              title="Stock Balance Preview"
              subtitle="Projected balances after atomic commit"
              badge={<ArrowLeftRight className="w-3.5 h-3.5 text-cyan-600" />}
            />
            <CardContent className="space-y-4">
              {/* Source Location Balance Impact */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Source: {sourceLocation?.name || fromLocationId}</span>
                  <span className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    -{transferQtyNum} Units
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Current Avail</span>
                    <p className="text-sm font-extrabold text-slate-800">{maxAvailable}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">After Transfer</span>
                    <p className="text-sm font-extrabold text-slate-900">{sourceAfterTransfer}</p>
                  </div>
                </div>
              </div>

              {/* Destination Location Balance Impact */}
              <div className="p-3.5 rounded-xl bg-cyan-50/60 border border-cyan-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-950">Dest: {destinationLocation?.name || toLocationId}</span>
                  <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    +{transferQtyNum} Units
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-white p-2 rounded-lg border border-cyan-100">
                    <span className="text-[10px] text-cyan-700 font-semibold uppercase">Current Avail</span>
                    <p className="text-sm font-extrabold text-cyan-900">{destCurrentAvail}</p>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-cyan-100">
                    <span className="text-[10px] text-cyan-700 font-semibold uppercase">After Transfer</span>
                    <p className="text-sm font-extrabold text-emerald-700">{destAfterTransfer}</p>
                  </div>
                </div>
              </div>

              {/* Active Product & Batch Quick Info */}
              <div className="text-xs text-slate-500 space-y-1 pt-1">
                <div className="flex justify-between">
                  <span>Product:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[150px]">{activeProduct?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Batch Lot:</span>
                  <span className="font-mono font-semibold text-slate-800">{currentBatch?.batchNumber || '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expiry:</span>
                  <span className="font-semibold text-slate-800">{currentBatch?.expiryDate || '--'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ACID Safety Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Atomic Movement Guarantee
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              MediTrack enforces database-level ACID transactions. Stock is decremented at the source and incremented at the destination simultaneously. If any step fails, the entire transaction rolls back automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirm Atomic Stock Movement"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Please review the movement parameters before committing this transaction to the immutable ledger:
          </p>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Product:</span>
              <span className="font-bold text-slate-900">{activeProduct?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Batch Number:</span>
              <span className="font-mono font-bold text-slate-900">{currentBatch?.batchNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Expiry Date:</span>
              <span className="font-semibold text-slate-800">{currentBatch?.expiryDate}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-500">From Location:</span>
              <span className="font-semibold text-slate-900">{sourceLocation?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">To Location:</span>
              <span className="font-bold text-cyan-800">{destinationLocation?.name}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
              <span className="text-slate-700">Quantity to Transfer:</span>
              <span className="text-base text-cyan-700">{transferQuantity} Units</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Clinical Rationale:</span>
              <span className="italic max-w-[200px] truncate">&ldquo;{reason}&rdquo;</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExecuteTransfer}
              disabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Commit Atomic Movement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

