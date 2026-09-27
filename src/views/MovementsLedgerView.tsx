import React, { useState, useMemo } from 'react';
import { 
  PlusCircle, 
  Check,
  AlertCircle,
  Lock,
  Download,
  Eye,
  Copy,
  CheckCircle2,
  FileCode
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { LocationPill } from '@/components/common/LocationPill';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { InventoryTransaction, MovementType } from '@/types/inventory';
import { inventoryRepo } from '@/services/inventoryRepository';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';
import { useAuth } from '@/context/AuthContext';
import { sanitizeSupabaseError } from '@/services/supabaseClient';
import { pdfReportService } from '@/services/pdfReportService';

export const MovementsLedgerView: React.FC = () => {
  const { currentUser, hasPermission, dataMode } = useAuth();
  const isDeptUser = currentUser?.role === 'DEPARTMENT_USER';

  const [transactions, setTransactions] = useState<InventoryTransaction[]>(() => 
    inventoryRepo.getTransactions()
  );
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterLocation, setFilterLocation] = useState<string>('ALL');
  const [filterDateRange, setFilterDateRange] = useState<string>('ALL');

  const [selectedTxForDetails, setSelectedTxForDetails] = useState<InventoryTransaction | null>(null);
  const [copiedRawJson, setCopiedRawJson] = useState(false);

  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [remoteFetchError, setRemoteFetchError] = useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoadingRemote(true);
      const res = await inventoryRepo.loadFromSupabase();
      if (isMounted) {
        setIsLoadingRemote(false);
        if (!res.success) setRemoteFetchError(res.error);
        else setRemoteFetchError(null);
        setTransactions(inventoryRepo.getTransactions());
      }
    };
    load();
    return () => { isMounted = false; };
  }, [dataMode]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Form State
  const [formType, setFormType] = useState<MovementType>(isDeptUser ? 'CONSUME' : 'TRANSFER');
  const [formProduct, setFormProduct] = useState('prod-scico-01');
  const [formBatch, setFormBatch] = useState('batch-eb-2026-001');
  const [formFromLoc, setFormFromLoc] = useState(isDeptUser ? (currentUser?.assignedLocationId || 'loc-icu-01') : 'loc-cs-01');
  const [formToLoc, setFormToLoc] = useState('loc-icu-01');
  const [formQuantity, setFormQuantity] = useState<number>(10);
  const [formReason, setFormReason] = useState(isDeptUser ? 'Clinical procedure patient administration' : 'Urgent clinical replenishment request');
  const [formPerformer, setFormPerformer] = useState(currentUser?.fullName || 'Dr. Arthur Vance (Chief Pharmacist)');

  const openMovementModal = () => {
    setErrorNotice(null);
    if (currentUser) {
      setFormPerformer(currentUser.fullName);
      if (currentUser.role === 'DEPARTMENT_USER') {
        setFormType('CONSUME');
        setFormFromLoc(currentUser.assignedLocationId || 'loc-icu-01');
        setFormReason('Patient clinical administration in department');
      } else {
        setFormType('TRANSFER');
        setFormFromLoc('loc-cs-01');
        setFormReason('Urgent clinical replenishment request');
      }
    }
    setIsModalOpen(true);
  };

  const products = inventoryRepo.getProducts();
  const batches = inventoryRepo.getBatches();

  const handleCreateMovement = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);

    let result;
    const qty = Number(formQuantity);

    switch (formType) {
      case 'TRANSFER':
        result = inventoryRepo.transferStock({
          productId: formProduct,
          batchId: formBatch,
          fromLocationId: formFromLoc,
          toLocationId: formToLoc,
          quantity: qty,
          performedBy: formPerformer,
          reason: formReason,
          referenceDoc: `TRF-${Date.now().toString().slice(-4)}`,
          actor: currentUser || undefined,
        });
        break;
      case 'RECEIVE':
        result = inventoryRepo.receiveStock({
          productId: formProduct,
          batchId: formBatch,
          toLocationId: formToLoc,
          quantity: qty,
          performedBy: formPerformer,
          referenceDoc: `PO-${Date.now().toString().slice(-4)}`,
          notes: formReason,
          actor: currentUser || undefined,
        });
        break;
      case 'ISSUE':
        result = inventoryRepo.issueStock({
          productId: formProduct,
          batchId: formBatch,
          fromLocationId: formFromLoc,
          toLocationId: formToLoc,
          quantity: qty,
          performedBy: formPerformer,
          reason: formReason,
          actor: currentUser || undefined,
        });
        break;
      case 'CONSUME':
        result = inventoryRepo.consumeStock({
          productId: formProduct,
          batchId: formBatch,
          fromLocationId: formFromLoc,
          quantity: qty,
          performedBy: formPerformer,
          reason: formReason,
          actor: currentUser || undefined,
        });
        break;
      case 'RETURN':
        result = inventoryRepo.returnStock({
          productId: formProduct,
          batchId: formBatch,
          fromLocationId: formFromLoc,
          toLocationId: formToLoc,
          quantity: qty,
          performedBy: formPerformer,
          reason: formReason,
          actor: currentUser || undefined,
        });
        break;
      case 'WASTAGE':
        result = inventoryRepo.wasteStock({
          productId: formProduct,
          batchId: formBatch,
          fromLocationId: formFromLoc,
          quantity: qty,
          performedBy: formPerformer,
          reason: formReason,
          actor: currentUser || undefined,
        });
        break;
      case 'ADJUSTMENT':
        result = inventoryRepo.adjustStock({
          productId: formProduct,
          batchId: formBatch,
          locationId: formFromLoc,
          quantity: qty,
          performedBy: formPerformer,
          reason: formReason,
          referenceDoc: `ADJ-${Date.now().toString().slice(-4)}`,
          actor: currentUser || undefined,
        });
        break;
      default:
        setErrorNotice('Unsupported movement type.');
        return;
    }

    if (!result.success) {
      setErrorNotice(result.error || 'Inventory transaction failed validation.');
      return;
    }

    setTransactions(inventoryRepo.getTransactions());
    setIsModalOpen(false);
    setSuccessNotice(`Transaction ${result.data?.transactionNumber} successfully committed to authoritative ledger.`);
    setTimeout(() => setSuccessNotice(null), 6000);
  };

  const columns: Column<InventoryTransaction>[] = [
    {
      header: 'Transaction Ref #',
      accessor: (tx) => (
        <div>
          <span className="font-mono font-bold text-slate-800">
            {tx.transactionNumber}
          </span>
          <div className="text-[10px] text-slate-400">
            Doc: {tx.referenceDoc || 'Internal System'}
          </div>
        </div>
      ),
    },
    {
      header: 'Timestamp',
      accessor: (tx) => (
        <div className="font-mono text-slate-600">
          <div>{new Date(tx.timestamp).toLocaleDateString()}</div>
          <div className="text-[10px] text-slate-400">
            {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Movement Type',
      accessor: (tx) => {
        const variantMap: Record<MovementType, 'success' | 'info' | 'neutral' | 'warning' | 'danger'> = {
          RECEIVE: 'success',
          TRANSFER: 'info',
          ISSUE: 'purple' as any,
          CONSUME: 'neutral',
          RETURN: 'info',
          WASTAGE: 'danger',
          ADJUSTMENT: 'warning',
        };
        return <StatusBadge label={tx.type} variant={variantMap[tx.type] || 'neutral'} size="sm" />;
      },
    },
    {
      header: 'Product & Batch',
      accessor: (tx) => {
        const prod = inventoryRepo.getProductById(tx.productId);
        const batch = inventoryRepo.getBatchById(tx.batchId);
        return (
          <div>
            <div className="font-bold text-slate-900">{prod?.name}</div>
            <div className="text-[11px] text-slate-500 font-mono">
              Lot: {batch?.batchNumber}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Movement Route',
      accessor: (tx) => {
        const fromLoc = tx.fromLocationId ? inventoryRepo.getLocationById(tx.fromLocationId) : null;
        const toLoc = tx.toLocationId ? inventoryRepo.getLocationById(tx.toLocationId) : null;

        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {fromLoc ? <LocationPill location={fromLoc} showIcon={false} /> : <span className="text-slate-400 font-medium">Supplier / Vendor</span>}
            <span className="text-slate-400 font-bold">&rarr;</span>
            {toLoc ? <LocationPill location={toLoc} showIcon={false} /> : <span className="text-rose-600 font-medium">Point of Care / Discarded</span>}
          </div>
        );
      },
    },
    {
      header: 'Quantity',
      accessor: (tx) => (
        <span className="font-extrabold text-slate-900 font-mono text-sm">
          {tx.quantity} <span className="text-xs font-normal text-slate-500">units</span>
        </span>
      ),
    },
    {
      header: 'Authorized By & Reason',
      accessor: (tx) => (
        <div>
          <div className="font-medium text-slate-800">{tx.performedBy}</div>
          <div className="text-[10px] text-slate-500 italic mt-0.5 truncate max-w-xs">
            &ldquo;{tx.reason || 'Routine movement'}&rdquo;
          </div>
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: (tx) => (
        <button
          type="button"
          onClick={() => setSelectedTxForDetails(tx)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-colors border border-cyan-200 cursor-pointer"
        >
          <Eye className="w-3 h-3" />
          <span>Details</span>
        </button>
      ),
    },
  ];

  const canRecordMovement = 
    hasPermission('inventory:transfer') ||
    hasPermission('inventory:consume') ||
    hasPermission('inventory:receive') ||
    hasPermission('inventory:issue') ||
    hasPermission('inventory:waste') ||
    hasPermission('inventory:adjust');

  const [currentReferenceTime] = useState(() => Date.now());

  const displayedTransactions = useMemo(() => {
    const todayStart = new Date(currentReferenceTime);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTime = todayStart.getTime();

    return transactions.filter(t => {
      // Department role isolation
      if (isDeptUser) {
        if (t.fromLocationId !== currentUser?.assignedLocationId && t.toLocationId !== currentUser?.assignedLocationId) {
          return false;
        }
      }

      // Movement type filter
      if (filterType !== 'ALL' && t.type !== filterType) {
        return false;
      }

      // Location filter
      if (filterLocation !== 'ALL') {
        if (t.fromLocationId !== filterLocation && t.toLocationId !== filterLocation) {
          return false;
        }
      }

      // Date range filter
      if (filterDateRange !== 'ALL') {
        const txTime = new Date(t.timestamp).getTime();
        if (filterDateRange === 'TODAY') {
          if (txTime < todayStartTime) return false;
        } else if (filterDateRange === 'WEEK') {
          if (currentReferenceTime - txTime > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (filterDateRange === 'MONTH') {
          if (currentReferenceTime - txTime > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      return true;
    });
  }, [transactions, isDeptUser, currentUser?.assignedLocationId, filterType, filterLocation, filterDateRange, currentReferenceTime]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditable Movements Ledger"
        subtitle="Complete chronological transaction log of all hospital inventory movements: Receive, Transfer, Issue, Consume, and Wastage."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {displayedTransactions.length} Audited Logs {isDeptUser ? '(Department Scoped)' : ''}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {canRecordMovement ? (
              <button
                onClick={openMovementModal}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-700 hover:bg-cyan-800 text-white shadow-xs transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Record Movement Transaction
              </button>
            ) : null}
            <button
              onClick={() => {
                pdfReportService.generateMovementsReport(
                  displayedTransactions.map(t => {
                    const prod = inventoryRepo.getProductById(t.productId);
                    const batch = inventoryRepo.getBatchById(t.batchId);
                    const fromLoc = t.fromLocationId
                      ? HOSPITAL_LOCATIONS.find(l => l.id === t.fromLocationId)
                      : null;
                    const toLoc = t.toLocationId
                      ? HOSPITAL_LOCATIONS.find(l => l.id === t.toLocationId)
                      : null;
                    return {
                      transactionNumber: t.transactionNumber,
                      timestamp: t.timestamp,
                      type: t.type,
                      productName: prod?.name || t.productId,
                      batchNumber: batch?.batchNumber || t.batchId,
                      fromLocation: fromLoc?.name || '',
                      toLocation: toLoc?.name || '',
                      quantity: t.quantity,
                      referenceDoc: t.referenceDoc || '',
                      reason: t.reason || '',
                      performedBy: t.performedBy,
                    };
                  }),
                  {
                    userName: currentUser?.fullName || 'Authorized Staff',
                    userRole: currentUser?.role || '',
                    dataMode: dataMode as 'SUPABASE' | 'DEMO',
                    appliedFilters: {
                      Type: filterType,
                      Location: filterLocation,
                      'Date Range': filterDateRange,
                      Scope: isDeptUser ? 'Department' : 'All',
                    },
                  }
                );
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
              title="Export filtered movements as PDF"
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
              <strong>Synthetic Training Environment:</strong> Displaying simulated movements ledger and canonical stock transactions. Zero live hospital records are modified.
            </span>
          </div>
          <span className="text-[11px] text-amber-800 shrink-0 font-mono hidden sm:inline-block">
            Canonical Audit Trail: Active
          </span>
        </div>
      )}

      {/* MODE / SUPABASE STATUS BANNER */}
      {dataMode === 'SUPABASE' && (
        <div className="p-3.5 rounded-xl bg-cyan-50/90 border border-cyan-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-900">
            <Lock className="w-4 h-4 text-cyan-700 shrink-0" />
            <span>
              <strong>Authoritative Supabase Mode:</strong> Reading directly from immutable PostgreSQL table (<code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">inventory_transactions</code>).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded border border-cyan-300">
              {isLoadingRemote ? 'Synchronizing...' : `${displayedTransactions.length} Audited Movements`}
            </span>
            <button
              type="button"
              onClick={async () => {
                setIsLoadingRemote(true);
                const res = await inventoryRepo.loadFromSupabase();
                setIsLoadingRemote(false);
                if (!res.success) setRemoteFetchError(res.error);
                else setRemoteFetchError(null);
                setTransactions(inventoryRepo.getTransactions());
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
              setTransactions(inventoryRepo.getTransactions());
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {!isLoadingRemote && displayedTransactions.length === 0 && dataMode === 'SUPABASE' && !remoteFetchError && (
        <div 
          role="status"
          aria-label="No stock movements found"
          className="p-8 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-2"
        >
          <Lock className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-800">No stock movements found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No stock movements found in the live Supabase transaction ledger. Honest empty state is maintained without fallback to demo transactions.
          </p>
        </div>
      )}

      {successNotice && (
        <div 
          role="status"
          aria-live="polite"
          className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in"
        >
          <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* FILTER CONTROLS BAR */}
      <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Movement Type Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="mvt-type-filter" className="font-bold text-slate-600 uppercase tracking-wider">Type:</label>
            <select
              id="mvt-type-filter"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              aria-label="Filter movement type"
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 hover:border-cyan-600"
            >
              <option value="ALL">All Types ({transactions.length})</option>
              <option value="RECEIVE">RECEIVE (Intake)</option>
              <option value="TRANSFER">TRANSFER (Inter-store)</option>
              <option value="ISSUE">ISSUE (Departmental)</option>
              <option value="CONSUME">CONSUME (Clinical care)</option>
              <option value="RETURN">RETURN (To Store)</option>
              <option value="WASTAGE">WASTAGE (Disposal)</option>
              <option value="ADJUSTMENT">ADJUSTMENT (Audit)</option>
            </select>
          </div>

          {/* Location Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="mvt-location-filter" className="font-bold text-slate-600 uppercase tracking-wider">Location:</label>
            <select
              id="mvt-location-filter"
              value={filterLocation}
              disabled={isDeptUser}
              onChange={e => setFilterLocation(e.target.value)}
              aria-label="Filter movement location"
              className={`border rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 ${
                isDeptUser ? 'bg-purple-50 border-purple-200 cursor-not-allowed' : 'bg-slate-50 border-slate-300 hover:border-cyan-600'
              }`}
            >
              <option value="ALL">All Hospital Locations</option>
              {HOSPITAL_LOCATIONS.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} &bull; {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="mvt-date-filter" className="font-bold text-slate-600 uppercase tracking-wider">Time:</label>
            <select
              id="mvt-date-filter"
              value={filterDateRange}
              onChange={e => setFilterDateRange(e.target.value)}
              aria-label="Filter movement time range"
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 hover:border-cyan-600"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">Last 30 Days</option>
            </select>
          </div>
        </div>

        <span className="text-[11px] text-slate-400 font-medium">
          Showing {displayedTransactions.length} auditable records
        </span>
      </div>

      {/* DATA TABLE */}
      <DataTable
        data={displayedTransactions}
        columns={columns}
        keyExtractor={t => t.id}
        searchPlaceholder="Search by transaction number, product, SKU, lot, or staff..."
        searchFilter={(t, query) => {
          const prod = inventoryRepo.getProductById(t.productId);
          const batch = inventoryRepo.getBatchById(t.batchId);
          const fromLoc = t.fromLocationId ? inventoryRepo.getLocationById(t.fromLocationId) : null;
          const toLoc = t.toLocationId ? inventoryRepo.getLocationById(t.toLocationId) : null;
          return (
            t.transactionNumber.toLowerCase().includes(query) ||
            t.type.toLowerCase().includes(query) ||
            t.performedBy.toLowerCase().includes(query) ||
            (t.referenceDoc?.toLowerCase().includes(query) ?? false) ||
            (prod?.name.toLowerCase().includes(query) ?? false) ||
            (prod?.sku.toLowerCase().includes(query) ?? false) ||
            (batch?.batchNumber.toLowerCase().includes(query) ?? false) ||
            (fromLoc?.name.toLowerCase().includes(query) ?? false) ||
            (toLoc?.name.toLowerCase().includes(query) ?? false)
          );
        }}
        emptyTitle={dataMode === 'SUPABASE' ? 'No stock movements found' : 'No movements recorded'}
        emptyDescription={dataMode === 'SUPABASE' ? 'No stock movements found in the live Supabase transaction ledger.' : 'Try adjusting your search query or filter parameters.'}
      />

      {/* RECORD MOVEMENT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Auditable Inventory Movement"
        subtitle="Authoritative transaction validation guarantees atomic balance updates and immutable audit logging."
        maxWidth="lg"
      >
        {errorNotice && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Transaction Validation Rejected:</span>
              <p className="font-normal mt-0.5">{errorNotice}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleCreateMovement} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Movement Type</label>
            <select
              value={formType}
              onChange={e => setFormType(e.target.value as MovementType)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
            >
              {hasPermission('inventory:transfer') && (
                <option value="TRANSFER">TRANSFER (Between Hospital Locations)</option>
              )}
              {hasPermission('inventory:consume') && (
                <option value="CONSUME">CONSUME (Used in Patient Procedure)</option>
              )}
              {hasPermission('inventory:receive') && (
                <option value="RECEIVE">RECEIVE (Inward from Vendor to Central Store)</option>
              )}
              {hasPermission('inventory:issue') && (
                <option value="ISSUE">ISSUE (Direct Floor Issuance)</option>
              )}
              {hasPermission('inventory:transfer') && (
                <option value="RETURN">RETURN (Return to Central Store)</option>
              )}
              {hasPermission('inventory:waste') && (
                <option value="WASTAGE">WASTAGE (Disposed due to Expiry/Contamination)</option>
              )}
              {hasPermission('inventory:adjust') && (
                <option value="ADJUSTMENT">ADJUSTMENT (Audit Reconciliation)</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Select Product</label>
              <select
                value={formProduct}
                onChange={e => setFormProduct(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Active Batch Lot</label>
              <select
                value={formBatch}
                onChange={e => setFormBatch(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              >
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} (Exp: {b.expiryDate}) {b.status === 'EXPIRED' ? '[EXPIRED]' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 block">Source Location</label>
                {isDeptUser && (
                  <span className="text-[10px] text-purple-700 font-bold flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Department Locked
                  </span>
                )}
              </div>
              <select
                value={formFromLoc}
                disabled={formType === 'RECEIVE' || isDeptUser}
                onChange={e => setFormFromLoc(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                {isDeptUser ? (
                  <option value={formFromLoc}>
                    {HOSPITAL_LOCATIONS.find(l => l.id === formFromLoc)?.name || 'Assigned Department'} (Isolated)
                  </option>
                ) : (
                  HOSPITAL_LOCATIONS.map(l => (
                    <option key={l.id} value={l.id}>{l.name} {!l.isActive ? '(Decommissioned)' : ''}</option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Destination Location</label>
              <select
                value={formToLoc}
                disabled={formType === 'CONSUME' || formType === 'WASTAGE' || formType === 'ADJUSTMENT' || isDeptUser}
                onChange={e => setFormToLoc(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                {HOSPITAL_LOCATIONS.map(l => (
                  <option key={l.id} value={l.id}>{l.name} {!l.isActive ? '(Decommissioned)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Quantity (Units)</label>
              <input
                type="number"
                min="1"
                value={formQuantity}
                onChange={e => setFormQuantity(Number(e.target.value))}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Authorizing Staff</label>
              <input
                type="text"
                value={formPerformer}
                onChange={e => setFormPerformer(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Clinical Reason / Audit Notes {formType === 'WASTAGE' || formType === 'ADJUSTMENT' ? '(Mandatory)' : ''}
            </label>
            <input
              type="text"
              value={formReason}
              onChange={e => setFormReason(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold transition-colors"
            >
              Commit Transaction to Ledger
            </button>
          </div>
        </form>
      </Modal>

      {/* TRANSACTION RAW METADATA DETAILS MODAL */}
      <Modal
        isOpen={Boolean(selectedTxForDetails)}
        onClose={() => {
          setSelectedTxForDetails(null);
          setCopiedRawJson(false);
        }}
        title={`Transaction Details: ${selectedTxForDetails?.transactionNumber || ''}`}
        subtitle="Authoritative transaction entry & immutable audit metadata."
        maxWidth="lg"
      >
        {selectedTxForDetails && (() => {
          const prod = inventoryRepo.getProductById(selectedTxForDetails.productId);
          const batch = inventoryRepo.getBatchById(selectedTxForDetails.batchId);
          const fromLoc = selectedTxForDetails.fromLocationId ? inventoryRepo.getLocationById(selectedTxForDetails.fromLocationId) : null;
          const toLoc = selectedTxForDetails.toLocationId ? inventoryRepo.getLocationById(selectedTxForDetails.toLocationId) : null;

          return (
            <div className="space-y-4 text-xs">
              {/* Top Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Movement Type</span>
                  <div className="mt-1">
                    <StatusBadge label={selectedTxForDetails.type} variant="info" size="sm" />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Quantity</span>
                  <p className="text-base font-extrabold text-slate-900 mt-0.5">
                    {selectedTxForDetails.quantity} Units
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Recorded Time</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {new Date(selectedTxForDetails.timestamp).toLocaleDateString()}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {new Date(selectedTxForDetails.timestamp).toLocaleTimeString()}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Authorized By</span>
                  <p className="font-semibold text-slate-800 truncate mt-0.5">
                    {selectedTxForDetails.performedBy}
                  </p>
                </div>
              </div>

              {/* Product & Route Details */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Product</span>
                    <p className="font-bold text-slate-900 mt-0.5">{prod?.name || selectedTxForDetails.productId}</p>
                    <p className="text-[11px] text-slate-500 font-mono">SKU: {prod?.sku || '--'} &bull; Brand: {prod?.brand || '--'}</p>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Batch / Lot &amp; Expiry</span>
                    <p className="font-mono font-bold text-slate-900 mt-0.5">{batch?.batchNumber || selectedTxForDetails.batchId}</p>
                    <p className="text-[11px] text-slate-600">Expiry: {batch?.expiryDate || '--'}</p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Movement Route</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="font-semibold text-slate-700">{fromLoc?.name || 'External / Vendor'}</span>
                      <span className="text-slate-400 font-bold">&rarr;</span>
                      <span className="font-semibold text-cyan-800">{toLoc?.name || 'Care Unit / Consumption'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Doc Ref &amp; Reason</span>
                    <p className="font-mono text-slate-800 mt-0.5">Doc: {selectedTxForDetails.referenceDoc || 'Internal'}</p>
                    <p className="text-[11px] text-slate-600 italic">&ldquo;{selectedTxForDetails.reason || 'Routine'}&rdquo;</p>
                  </div>
                </div>
              </div>

              {/* Raw Metadata JSON Inspector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <FileCode className="w-3 h-3 text-slate-500" />
                    Authoritative Raw Transaction Payload (JSON)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedTxForDetails, null, 2));
                      setCopiedRawJson(true);
                      setTimeout(() => setCopiedRawJson(false), 2000);
                    }}
                    className="text-[11px] font-semibold text-cyan-700 hover:text-cyan-800 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedRawJson ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedRawJson ? 'Copied!' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-200 p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
                  {JSON.stringify(selectedTxForDetails, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTxForDetails(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};
