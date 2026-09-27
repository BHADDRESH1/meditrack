import React, { useState } from 'react';
import { 
  Warehouse, 
  PackagePlus, 
  ArrowLeftRight, 
  Send, 
  Trash2, 
  RotateCcw, 
  Filter, 
  Clock,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Download,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { LocationPill } from '@/components/common/LocationPill';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Modal } from '@/components/common/Modal';
import { LocationStock } from '@/types/inventory';
import { inventoryRepo } from '@/services/inventoryRepository';
import { productMasterService } from '@/services/productMasterService';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';
import { useAuth } from '@/context/AuthContext';
import { sanitizeSupabaseError } from '@/services/supabaseClient';
import { pdfReportService } from '@/services/pdfReportService';

interface StockBalancesViewProps {
  selectedLocationId: string;
}

export const StockBalancesView: React.FC<StockBalancesViewProps> = ({
  selectedLocationId,
}) => {
  const { currentUser, hasPermission, dataMode } = useAuth();
  const isDeptUser = currentUser?.role === 'DEPARTMENT_USER';

  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [remoteFetchError, setRemoteFetchError] = useState<string | null>(null);
  const [, setRefreshCount] = useState(0);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoadingRemote(true);
      const res = await inventoryRepo.loadFromSupabase();
      if (isMounted) {
        setIsLoadingRemote(false);
        if (!res.success) setRemoteFetchError(res.error);
        else setRemoteFetchError(null);
        setRefreshCount(c => c + 1);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [dataMode]);

  // Permission flags
  const canReceive = hasPermission('inventory:receive');
  const canTransfer = hasPermission('inventory:transfer');
  const canIssue = hasPermission('inventory:issue');
  const canConsume = hasPermission('inventory:consume');
  const canWaste = hasPermission('inventory:waste');

  // Filter State
  const [selectedFilterOverride, setSelectedFilterOverride] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [onlyLowStock, setOnlyLowStock] = useState<boolean>(false);

  // Quick Action Modals
  const [activeStockAction, setActiveStockAction] = useState<{
    stock: LocationStock;
    action: 'ISSUE' | 'CONSUME' | 'WASTE' | 'RETURN';
  } | null>(null);

  // Form State for Modals
  const [actionQuantity, setActionQuantity] = useState<number | ''>(1);
  const [actionReason, setActionReason] = useState<string>('');
  const [wasteReason, setWasteReason] = useState<string>('EXPIRY');
  const [issueDestLocationId, setIssueDestLocationId] = useState<string>('loc-icu-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filterLocation = isDeptUser
    ? (currentUser.assignedLocationId || 'loc-icu-01')
    : (selectedFilterOverride ?? selectedLocationId);

  const stockRecords = inventoryRepo.getLocationStock();
  const allCategories = productMasterService.getCategories();

  // Apply filters
  const filteredStock = stockRecords.filter(s => {
    // Location scope
    if (filterLocation !== 'ALL' && s.locationId !== filterLocation) {
      return false;
    }

    const prod = productMasterService.getProductById(s.productId);
    const batch = inventoryRepo.getBatchById(s.batchId);

    // Category filter
    if (filterCategory !== 'ALL' && prod?.category !== filterCategory) {
      return false;
    }

    // Status filter
    if (filterStatus !== 'ALL') {
      const bStatus = batch?.status || 'ACTIVE';
      if (filterStatus === 'EXPIRED') {
        const isExp = new Date(batch?.expiryDate || '').getTime() < new Date().setHours(0, 0, 0, 0);
        if (!isExp && bStatus !== 'EXPIRED') return false;
      } else if (filterStatus === 'QUARANTINE') {
        if (bStatus !== 'QUARANTINE') return false;
      } else if (bStatus !== filterStatus) {
        return false;
      }
    }

    // Low stock filter (available <= 20)
    if (onlyLowStock) {
      const available = s.quantity - s.reservedQuantity;
      if (available > 20) return false;
    }

    return true;
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleExecuteStockAction = () => {
    if (!activeStockAction) return;

    const { stock, action } = activeStockAction;
    const qty = Number(actionQuantity);
    const available = stock.quantity - stock.reservedQuantity;

    if (!qty || qty <= 0) {
      setActionError('Quantity must be greater than zero.');
      return;
    }

    if (qty > available) {
      setActionError(`Requested quantity (${qty}) exceeds available stock (${available}).`);
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    let result;
    const performer = currentUser?.fullName || 'Authorized Staff';

    switch (action) {
      case 'ISSUE':
        result = inventoryRepo.issueStock({
          productId: stock.productId,
          variantId: stock.variantId,
          batchId: stock.batchId,
          fromLocationId: stock.locationId,
          toLocationId: issueDestLocationId,
          quantity: qty,
          performedBy: performer,
          reason: actionReason || 'Clinical ward stock issuance',
          actor: currentUser || undefined,
        });
        break;

      case 'CONSUME':
        result = inventoryRepo.consumeStock({
          productId: stock.productId,
          variantId: stock.variantId,
          batchId: stock.batchId,
          fromLocationId: stock.locationId,
          quantity: qty,
          performedBy: performer,
          reason: actionReason || 'Consumed in patient clinical care',
          actor: currentUser || undefined,
        });
        break;

      case 'WASTE':
        result = inventoryRepo.wasteStock({
          productId: stock.productId,
          variantId: stock.variantId,
          batchId: stock.batchId,
          fromLocationId: stock.locationId,
          quantity: qty,
          performedBy: performer,
          reason: `${wasteReason}: ${actionReason || 'Controlled disposal'}`,
          actor: currentUser || undefined,
        });
        break;

      case 'RETURN':
        result = inventoryRepo.returnStock({
          productId: stock.productId,
          variantId: stock.variantId,
          batchId: stock.batchId,
          fromLocationId: stock.locationId,
          toLocationId: 'loc-cs-01', // Central Store
          quantity: qty,
          performedBy: performer,
          reason: actionReason || 'Surplus unused return to Central Store',
          actor: currentUser || undefined,
        });
        break;
    }

    setIsSubmitting(false);

    if (result.success && result.data) {
      showToast(`Success: Transaction ${result.data.transactionNumber} recorded.`);
      setActiveStockAction(null);
      setActionQuantity(1);
      setActionReason('');
    } else {
      setActionError(result.error || 'Operation failed.');
    }
  };

  // Helper for FEFO preview when issuing
  const fefoPlan = activeStockAction?.action === 'ISSUE'
    ? inventoryRepo.getFEFOAllocation(
        activeStockAction.stock.productId,
        activeStockAction.stock.locationId,
        Number(actionQuantity) || 1
      )
    : null;

  const columns: Column<LocationStock>[] = [
    {
      header: 'Product & Variant',
      accessor: (s) => {
        const prod = productMasterService.getProductById(s.productId);
        const variant = s.variantId
          ? prod?.variants?.find(v => v.id === s.variantId)
          : prod?.variants?.[0];

        return (
          <div>
            <div className="font-bold text-slate-900">{prod?.name}</div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
              <span>SKU: {prod?.sku}</span>
              <span>&bull;</span>
              <span className="text-slate-700">{prod?.brand}</span>
            </div>
            {variant && (
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-800 bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-200">
                <Layers className="w-2.5 h-2.5" />
                <span>{variant.variantName}</span>
                {variant.size && <span>({variant.size})</span>}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Batch / Lot #',
      accessor: (s) => {
        const batch = inventoryRepo.getBatchById(s.batchId);
        return (
          <div>
            <span className="font-mono font-bold text-cyan-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
              {batch?.batchNumber}
            </span>
            {batch?.supplier && (
              <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[140px]">
                {batch.supplier}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Location',
      accessor: (s) => {
        const loc = inventoryRepo.getLocationById(s.locationId);
        return <LocationPill location={loc} />;
      },
    },
    {
      header: 'Batch',
      accessor: (s) => {
        const batch = inventoryRepo.getBatchById(s.batchId);
        return (
          <div>
            <span className="font-mono font-bold text-cyan-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
              {batch?.batchNumber}
            </span>
            {batch?.supplier && (
              <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[140px]">
                {batch.supplier}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Quantity',
      accessor: (s) => (
        <span className="text-xs font-bold text-slate-900">{s.quantity}</span>
      ),
    },
    {
      header: 'Reserved',
      accessor: (s) => (
        <span className={`text-xs ${s.reservedQuantity > 0 ? 'font-bold text-amber-700' : 'text-slate-400'}`}>
          {s.reservedQuantity}
        </span>
      ),
    },
    {
      header: 'Available',
      accessor: (s) => {
        const available = s.quantity - s.reservedQuantity;
        return (
          <span className={`text-xs font-bold ${available <= 20 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {available}
          </span>
        );
      },
    },
    {
      header: 'Expiry',
      accessor: (s) => {
        const batch = inventoryRepo.getBatchById(s.batchId);
        if (!batch) return '-';
        const today = new Date();
        const expiry = new Date(batch.expiryDate);
        const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const isExpired = days <= 0;

        return (
          <div>
            <div className="font-mono text-slate-800 font-medium">{batch.expiryDate}</div>
            <span
              className={`text-[10px] font-bold ${
                isExpired
                  ? 'text-rose-700 font-black'
                  : days <= 30
                  ? 'text-rose-600'
                  : days <= 60
                  ? 'text-amber-600'
                  : 'text-slate-500'
              }`}
            >
              {isExpired ? 'EXPIRED' : `${days} days left`}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Status',
      accessor: (s) => {
        const batch = inventoryRepo.getBatchById(s.batchId);
        const available = s.quantity - s.reservedQuantity;
        const today = new Date();
        const expiry = new Date(batch?.expiryDate || '');
        const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        let statusText = 'IN STOCK';
        let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'success';

        if (batch?.status === 'QUARANTINE') {
          statusText = 'QUARANTINED';
          variant = 'danger';
        } else if (days <= 0 || batch?.status === 'EXPIRED') {
          statusText = 'EXPIRED';
          variant = 'danger';
        } else if (days <= 30) {
          statusText = 'EXPIRING';
          variant = 'danger';
        } else if (available <= 20) {
          statusText = 'LOW STOCK';
          variant = 'warning';
        } else if (days <= 60) {
          statusText = 'EXPIRING';
          variant = 'warning';
        }

        return (
          <StatusBadge
            label={statusText}
            variant={variant}
            size="sm"
            dot={true}
          />
        );
      },
    },
    {
      header: 'Operations',
      accessor: (s) => {
        const batch = inventoryRepo.getBatchById(s.batchId);
        const isExpired = new Date(batch?.expiryDate || '').getTime() < new Date().setHours(0, 0, 0, 0);

        return (
          <div className="flex items-center gap-1">
            {/* Issue (FEFO) */}
            {canIssue && !isExpired && (
              <button
                onClick={() => {
                  setActiveStockAction({ stock: s, action: 'ISSUE' });
                  setActionQuantity(Math.min(10, s.quantity));
                  setActionError(null);
                }}
                title="Issue stock to clinical ward (FEFO guidance)"
                className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-700 hover:bg-cyan-50 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Consume */}
            {canConsume && !isExpired && (
              <button
                onClick={() => {
                  setActiveStockAction({ stock: s, action: 'CONSUME' });
                  setActionQuantity(1);
                  setActionError(null);
                }}
                title="Record direct patient clinical consumption"
                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Wastage */}
            {canWaste && (
              <button
                onClick={() => {
                  setActiveStockAction({ stock: s, action: 'WASTE' });
                  setActionQuantity(isExpired ? s.quantity : 1);
                  setWasteReason(isExpired ? 'EXPIRY' : 'DAMAGE');
                  setActionError(null);
                }}
                title="Record controlled stock wastage"
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Return */}
            {canTransfer && s.locationId !== 'loc-cs-01' && (
              <button
                onClick={() => {
                  setActiveStockAction({ stock: s, action: 'RETURN' });
                  setActionQuantity(1);
                  setActionError(null);
                }}
                title="Return unused stock to Central Depot"
                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        subtitle="View current inventory across hospital locations"
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {filteredStock.length} Active Records
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {canReceive && (
              <Link
                to="/receiving"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-700 hover:bg-cyan-800 text-white shadow-xs transition-colors"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                Receive Goods
              </Link>
            )}
            {canTransfer && (
              <Link
                to="/stock/transfer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
                Inter-Store Transfer
              </Link>
            )}
            <button
              onClick={() => {
                pdfReportService.generateStockReport(
                  filteredStock.map(s => {
                    const prod = productMasterService.getProductById(s.productId);
                    const batch = inventoryRepo.getBatchById(s.batchId);
                    const variant = s.variantId
                      ? prod?.variants?.find(v => v.id === s.variantId)
                      : prod?.variants?.[0];
                    const loc = HOSPITAL_LOCATIONS.find(l => l.id === s.locationId);
                    return {
                      productName: prod?.name || s.productId,
                      variantName: variant?.variantName || '',
                      batchNumber: batch?.batchNumber || s.batchId,
                      locationName: loc?.name || s.locationId,
                      category: prod?.category || '—',
                      quantity: s.quantity,
                      reservedQuantity: s.reservedQuantity,
                      availableQuantity: s.quantity - s.reservedQuantity,
                      expiryDate: batch?.expiryDate || '',
                      status: batch?.status || 'ACTIVE',
                    };
                  }),
                  {
                    userName: currentUser?.fullName || 'Authorized Staff',
                    userRole: currentUser?.role || '',
                    dataMode: dataMode as 'SUPABASE' | 'DEMO',
                    appliedFilters: {
                      Location: filterLocation,
                      Category: filterCategory,
                      Status: filterStatus,
                      'Low Stock Only': onlyLowStock ? 'Yes' : 'No',
                    },
                  }
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              title="Export current stock view as PDF"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>
          </div>
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
              <strong>Synthetic Training Environment:</strong> Displaying simulated location stock balances and canonical batches. Zero live hospital records are modified.
            </span>
          </div>
          <span className="text-[11px] text-amber-800 shrink-0 font-mono hidden sm:inline-block">
            Canonical Stock: Active
          </span>
        </div>
      )}

      {/* MODE / SUPABASE STATUS BANNER */}
      {dataMode === 'SUPABASE' && (
        <div className="p-3.5 rounded-xl bg-cyan-50/90 border border-cyan-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-900">
            <Warehouse className="w-4 h-4 text-cyan-700 shrink-0" />
            <span>
              <strong>Authoritative Supabase Mode:</strong> Reading directly from PostgreSQL tables (<code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">inventory_batches</code>, <code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">location_stock</code>).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded border border-cyan-300">
              {isLoadingRemote ? 'Synchronizing...' : `${filteredStock.length} Stock Balances`}
            </span>
            <button
              type="button"
              onClick={async () => {
                setIsLoadingRemote(true);
                const res = await inventoryRepo.loadFromSupabase();
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
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">Unable to load live inventory data.</div>
              <div className="text-xs text-amber-800 mt-0.5">
                {sanitizeSupabaseError(remoteFetchError, 'Database connection error. Honest empty states are maintained without fallback to mock records.')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsLoadingRemote(true);
              const res = await inventoryRepo.loadFromSupabase();
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

      {!isLoadingRemote && filteredStock.length === 0 && dataMode === 'SUPABASE' && !remoteFetchError && (
        <div 
          role="status"
          aria-label="No inventory records found"
          className="p-8 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-2"
        >
          <Warehouse className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-800">No inventory records found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No physical stock records found in the live Supabase database. Honest empty state is maintained without fallback to demo stock.
          </p>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div 
          role="status"
          aria-live="polite"
          className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 4 SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total Stock
          </span>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900">
              {filteredStock.reduce((acc, s) => acc + s.quantity, 0)}
            </span>
            <span className="text-xs font-semibold text-slate-500">units</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Available
          </span>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-800">
              {filteredStock.reduce((acc, s) => acc + (s.quantity - s.reservedQuantity), 0)}
            </span>
            <span className="text-xs font-semibold text-emerald-700">units</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Reserved
          </span>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900">
              {filteredStock.reduce((acc, s) => acc + s.reservedQuantity, 0)}
            </span>
            <span className="text-xs font-semibold text-slate-500">units</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Low Stock
          </span>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-amber-900">
              {filteredStock.filter(s => (s.quantity - s.reservedQuantity) <= 20).length}
            </span>
            <span className="text-xs font-semibold text-amber-700">records</span>
          </div>
        </div>
      </div>

      {/* MULTI-CRITERIA FILTER BAR */}
      <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Location Filter */}
            <div className="flex items-center gap-1.5">
              <Warehouse className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <label htmlFor="stock-location-filter" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Location:
              </label>
              <select
                id="stock-location-filter"
                value={filterLocation}
                disabled={isDeptUser}
                onChange={e => setSelectedFilterOverride(e.target.value)}
                aria-label="Filter by hospital location"
                className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-all ${
                  isDeptUser
                    ? 'bg-purple-50 border-purple-200 text-purple-900 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-cyan-600'
                }`}
              >
                {isDeptUser ? (
                  <option value={filterLocation}>
                    {HOSPITAL_LOCATIONS.find(l => l.id === filterLocation)?.name || 'Department'} (Isolated)
                  </option>
                ) : (
                  <>
                    <option value="ALL">All Hospital Locations ({stockRecords.length})</option>
                    {HOSPITAL_LOCATIONS.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} &bull; {loc.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <label htmlFor="stock-category-filter" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Category:
              </label>
              <select
                id="stock-category-filter"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                aria-label="Filter by medical category"
                className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 hover:border-cyan-600"
              >
                <option value="ALL">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <label htmlFor="stock-status-filter" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Status:
              </label>
              <select
                id="stock-status-filter"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                aria-label="Filter by stock balance status"
                className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 hover:border-cyan-600"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Stock</option>
                <option value="NEAR_EXPIRY">Near Expiry (&le;60d)</option>
                <option value="EXPIRING">Expiring (&le;30d)</option>
                <option value="EXPIRED">Expired Only</option>
                <option value="QUARANTINE">Quarantine</option>
              </select>
            </div>
          </div>

          {/* Quick Toggle */}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyLowStock}
              onChange={e => setOnlyLowStock(e.target.checked)}
              aria-label="Filter low stock only (less than or equal to 20 units)"
              className="rounded text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
            />
            <span>Low Stock Only (&le; 20 units)</span>
          </label>
        </div>
      </div>

      {/* DATA TABLE */}
      <DataTable
        tableLabel="Current hospital stock balances"
        data={filteredStock}
        columns={columns}
        keyExtractor={s => s.id}
        searchPlaceholder="Search product, SKU, batch, or location..."
        searchFilter={(s, query) => {
          const prod = productMasterService.getProductById(s.productId);
          const batch = inventoryRepo.getBatchById(s.batchId);
          const loc = inventoryRepo.getLocationById(s.locationId);
          return (
            (prod?.name.toLowerCase().includes(query) ?? false) ||
            (prod?.sku.toLowerCase().includes(query) ?? false) ||
            (batch?.batchNumber.toLowerCase().includes(query) ?? false) ||
            (loc?.name.toLowerCase().includes(query) ?? false)
          );
        }}
        emptyTitle={dataMode === 'SUPABASE' ? 'No inventory records found' : 'No stock records found'}
        emptyDescription={dataMode === 'SUPABASE' ? 'No physical stock records found in the live Supabase inventory.' : 'Try adjusting your search query or filter parameters.'}
      />

      {/* QUICK ACTION MODAL (ISSUE / CONSUME / WASTE / RETURN) */}
      {activeStockAction && (
        <Modal
          isOpen={true}
          onClose={() => setActiveStockAction(null)}
          title={`Execute Inventory Movement: ${activeStockAction.action}`}
        >
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <p className="font-bold text-slate-900 text-sm">
                {productMasterService.getProductById(activeStockAction.stock.productId)?.name}
              </p>
              <div className="flex items-center gap-3 text-slate-500 font-mono">
                <span>Batch: {inventoryRepo.getBatchById(activeStockAction.stock.batchId)?.batchNumber}</span>
                <span>Available: {activeStockAction.stock.quantity - activeStockAction.stock.reservedQuantity}</span>
              </div>
            </div>

            {/* FEFO Recommendation Alert when Issuing */}
            {activeStockAction.action === 'ISSUE' && fefoPlan && (
              <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-cyan-900">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                  <span>FEFO (First-Expired, First-Out) Recommendation</span>
                </div>
                <div className="text-[11px] text-cyan-800 space-y-1">
                  {fefoPlan.allocations.map(a => (
                    <div key={a.batchId} className="flex justify-between font-mono">
                      <span>Batch {a.batchNumber} (Exp: {a.expiryDate})</span>
                      <span className="font-bold">Recommend: {a.allocatedQuantity} units</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Destination Location for ISSUE */}
            {activeStockAction.action === 'ISSUE' && (
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Issuing To Department:
                </label>
                <select
                  value={issueDestLocationId}
                  onChange={e => setIssueDestLocationId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {HOSPITAL_LOCATIONS.filter(l => l.id !== activeStockAction.stock.locationId && l.isActive).map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} &bull; {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Wastage Reason selector */}
            {activeStockAction.action === 'WASTE' && (
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Wastage Category:
                </label>
                <select
                  value={wasteReason}
                  onChange={e => setWasteReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  <option value="EXPIRY">EXPIRY - Passed usable shelf life</option>
                  <option value="DAMAGE">DAMAGE - Compromised physical integrity</option>
                  <option value="CONTAMINATION">CONTAMINATION - Sterility breach</option>
                  <option value="HANDLING_LOSS">HANDLING_LOSS - Procedural dropped / opened unused</option>
                  <option value="OTHER">OTHER - Clinical disposal</option>
                </select>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Quantity to {activeStockAction.action.toLowerCase()}:
              </label>
              <input
                type="number"
                min={1}
                max={activeStockAction.stock.quantity - activeStockAction.stock.reservedQuantity}
                value={actionQuantity}
                onChange={e => setActionQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Clinical / Operational Rationale:
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder={`Reason for ${activeStockAction.action.toLowerCase()}...`}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
              />
            </div>

            {/* Error Message */}
            {actionError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveStockAction(null)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteStockAction}
                className="px-4 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold shadow-xs cursor-pointer"
              >
                {isSubmitting ? 'Processing...' : `Confirm ${activeStockAction.action}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
