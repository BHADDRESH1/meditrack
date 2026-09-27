import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ShoppingCart, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  HelpCircle, 
  Eye, 
  ShieldAlert, 
  FileText, 
  RefreshCw, 
  Building2, 
  Check, 
  X, 
  Download,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { procurementEngine } from '@/services/procurementEngine';
import { purchaseRequestService } from '@/services/purchaseRequestService';
import { 
  ProcurementRecommendation, 
  ProcurementKPIs, 
  PurchaseOrder
} from '@/types/procurement';
import { sanitizeSupabaseError } from '@/services/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { pdfReportService } from '@/services/pdfReportService';

interface Props {
  selectedLocationId: string;
}

export function ProcurementDashboardView({ selectedLocationId }: Props) {
  const { currentUser, hasPermission, dataMode } = useAuth();
  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState<ProcurementRecommendation[]>([]);
  const [kpis, setKpis] = useState<ProcurementKPIs | null>(null);
  const [pendingPOs, setPendingPOs] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals / Drawers
  const [selectedRec, setSelectedRec] = useState<ProcurementRecommendation | null>(null);
  const [reviewModalRec, setReviewModalRec] = useState<ProcurementRecommendation | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [showPendingPOsModal, setShowPendingPOsModal] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const canApprove = hasPermission('procurement:approve');
  const canRequest = hasPermission('procurement:request');

  // Load data
  const loadData = useCallback(async (_trigger?: unknown) => {
    try {
      const locId = selectedLocationId === 'ALL' ? undefined : selectedLocationId;
      const recRes = await procurementEngine.generateRecommendations(locId);
      if (!recRes.success) {
        setError(recRes.error || 'Failed to load procurement recommendations.');
      } else {
        setRecommendations(recRes.recommendations);
      }

      const kpiRes = await procurementEngine.getKPIs();
      if (kpiRes.success && kpiRes.kpis) {
        setKpis(kpiRes.kpis);
      }

      const poRes = await procurementEngine.getPendingPurchaseOrders();
      if (poRes.success) {
        setPendingPOs(poRes.orders);
      }
    } catch (err: any) {
      setError(err.message || 'Error initializing procurement data.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (isMounted) {
        await loadData();
      }
    };
    void run();
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  // Handle Review (Approve/Reject)
  const handleConfirmReview = async () => {
    if (!reviewModalRec || !currentUser) return;
    const res = await procurementEngine.reviewRecommendation(
      reviewModalRec.id,
      reviewAction,
      reviewNotes,
      currentUser
    );

    if (res.success) {
      setActionSuccessMessage(
        `Recommendation ${reviewModalRec.productSku} successfully marked as ${reviewAction}. Note: Internal Purchase Request must be generated separately.`
      );
      setReviewModalRec(null);
      setReviewNotes('');
      loadData();
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } else {
      alert(`Error updating recommendation: ${res.error}`);
    }
  };

  // Handle explicit Purchase Request generation from an Approved recommendation
  const handleCreatePurchaseRequestFromRec = async (rec: ProcurementRecommendation) => {
    if (!currentUser) return;
    const res = await purchaseRequestService.createPurchaseRequest({
      requestedLocationId: rec.locationBreakdown[0]?.locationId,
      requestedLocationName: rec.locationBreakdown[0]?.locationName,
      justification: `Replenishment requisition for ${rec.productName} (${rec.productSku}). ${rec.reason}`,
      recommendedSupplierId: undefined,
      recommendedSupplierName: undefined,
      estimatedCost: (rec.suggestedReplenishmentQuantity > 0 ? rec.suggestedReplenishmentQuantity : 10) * (rec.estimatedUnitCost || 25.0),
      items: [
        {
          productId: rec.productId,
          productName: rec.productName,
          productSku: rec.productSku,
          variantId: rec.variantId,
          variantName: rec.variantName,
          requestedQuantity: rec.suggestedReplenishmentQuantity > 0 ? rec.suggestedReplenishmentQuantity : 10,
          estimatedUnitCost: rec.estimatedUnitCost || 25.0,
        }
      ],
      user: currentUser
    });

    if (res.success) {
      setActionSuccessMessage(
        `Internal Purchase Request ${res.request?.requestNumber} drafted successfully! Navigating to Purchase Requests view...`
      );
      setTimeout(() => {
        navigate('/procurement/requests');
      }, 1500);
    } else {
      alert(`Error creating Purchase Request: ${res.error}`);
    }
  };

  // Filtered recommendations
  const filteredRecommendations = useMemo(() => {
    return recommendations.filter(r => {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      if (riskFilter !== 'ALL' && r.riskLevel !== riskFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSku = r.productSku.toLowerCase().includes(q);
        const matchName = r.productName.toLowerCase().includes(q);
        const matchBrand = r.brand.toLowerCase().includes(q);
        if (!matchSku && !matchName && !matchBrand) return false;
      }
      return true;
    });
  }, [recommendations, typeFilter, riskFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Title Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <ShoppingCart className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Smart Procurement &amp; Replenishment Planning
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Phase 7 Active
            </span>
          </div>
          <p className="text-sm text-slate-500 max-w-3xl">
            Decision support for hospital inventory replenishment. Calculates reorder points, safety stock, 
            and evaluates pending orders and near-expiry stock. Strictly non-autonomous: requires explicit human authorization.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPendingPOsModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-2xs"
          >
            <Clock className="w-4 h-4 text-cyan-600" />
            <span>Pending POs ({pendingPOs.length})</span>
          </button>
          <button
            onClick={() => navigate('/procurement/requests')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-teal-300 text-teal-800 bg-teal-50 hover:bg-teal-100 transition-all shadow-2xs"
          >
            <FileText className="w-4 h-4 text-teal-700" />
            <span>Purchase Requests</span>
          </button>
          <button
            onClick={() => {
              pdfReportService.generateProcurementReport(
                filteredRecommendations.map(r => ({
                  productName: r.productName,
                  productSku: r.productSku,
                  locationName: r.locationBreakdown?.[0]?.locationName || 'All Locations',
                  networkStock: r.currentNetworkStock,
                  adu: r.averageDailyUsage,
                  daysOfStock: r.daysOfStock ?? 0,
                  leadTimeDays: r.leadTimeDays,
                  safetyStockUnits: r.safetyStockUnits,
                  reorderPoint: r.reorderPoint,
                  targetStock: r.targetStockUnits,
                  pendingPOQty: r.pendingPoQuantity,
                  nearExpiryQty: r.nearExpiryQuantity,
                  suggestedQty: r.suggestedReplenishmentQuantity,
                  estimatedUnitCost: r.estimatedUnitCost || 0,
                  recommendation: r.reason,
                  status: r.status,
                })),
                {
                  userName: currentUser?.fullName || 'Authorized Staff',
                  userRole: currentUser?.role || '',
                  dataMode: 'DEMO',
                  appliedFilters: {
                    Type: typeFilter,
                    Risk: riskFilter,
                    Status: statusFilter,
                    Search: searchQuery || 'All',
                    Location: selectedLocationId,
                  },
                }
              );
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-2xs"
            title="Export procurement plan as PDF"
          >
            <Download className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
          <button
            onClick={loadData}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
            title="Refresh Analysis"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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
              <strong>Synthetic Training Environment:</strong> Displaying simulated procurement planning, demand telemetry, and canonical PO coverage. Zero live hospital records are modified.
            </span>
          </div>
          <span className="text-[11px] text-amber-800 shrink-0 font-mono hidden sm:inline-block">
            Canonical Procurement: Active
          </span>
        </div>
      )}

      {/* MODE / SUPABASE STATUS BANNER */}
      {dataMode === 'SUPABASE' && (
        <div className="p-3.5 rounded-xl bg-cyan-50/90 border border-cyan-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-900">
            <Sparkles className="w-4 h-4 text-cyan-700 shrink-0" />
            <span>
              <strong>Authoritative Supabase Mode:</strong> Reading directly from PostgreSQL tables (<code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">purchase_orders</code>, <code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">recommendation_actions</code>).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded border border-cyan-300">
              {isLoading ? 'Synchronizing...' : `${recommendations.length} Recommendations Loaded`}
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="px-2 py-1 text-[11px] font-bold bg-white text-cyan-800 hover:bg-cyan-100 rounded border border-cyan-300 transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* User-Friendly Database Error Banner (SUPABASE Mode with Retry) */}
      {error && dataMode === 'SUPABASE' && (
        <div 
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">Unable to load live procurement data.</div>
              <div className="text-xs text-amber-800 mt-0.5">
                {sanitizeSupabaseError(error, 'Database connection error. Honest empty states are maintained without fallback to mock records.')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Generic Error Notification for other issues */}
      {error && dataMode !== 'SUPABASE' && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between text-xs font-semibold">
          <span>{error}</span>
          <button 
            type="button"
            onClick={() => setError(null)} 
            aria-label="Dismiss error notification"
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Success Notification */}
      {actionSuccessMessage && (
        <div role="status" aria-live="polite" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button 
            type="button"
            onClick={() => setActionSuccessMessage(null)} 
            aria-label="Dismiss success notification"
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Executive KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Replenish Candidates
            </span>
            <div className="text-2xl font-black text-slate-900">{kpis.replenishmentCandidatesCount}</div>
            <span className="text-[10px] text-slate-400 font-medium">Flagged by engine</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
              Stockout Alerts
            </span>
            <div className="text-2xl font-black text-rose-700">{kpis.criticalStockoutCount}</div>
            <span className="text-[10px] text-slate-400 font-medium">Critical risk items</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
              Below Reorder Point
            </span>
            <div className="text-2xl font-black text-amber-700">{kpis.belowReorderPointCount}</div>
            <span className="text-[10px] text-slate-400 font-medium">Replenishment candidates</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider block mb-1">
              Actions Pending
            </span>
            <div className="text-2xl font-black text-teal-800">{kpis.recommendedActionsCount}</div>
            <span className="text-[10px] text-slate-400 font-medium">Require review</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Pending PO Units
            </span>
            <div className="text-2xl font-black text-slate-900">{kpis.pendingPoCoverageUnits}</div>
            <span className="text-[10px] text-slate-400 font-medium">In procurement pipeline</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Near Expiry Stock
            </span>
            <div className="text-2xl font-black text-slate-900">{kpis.nearExpiryStockCount}</div>
            <span className="text-[10px] text-slate-400 font-medium">At-risk batches</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-cyan-700 uppercase tracking-wider block mb-1">
            <span className="text-[11px] font-bold text-cyan-700 uppercase tracking-wider block mb-1">
              Excess Overstock
            </span>
            <div className="text-2xl font-black text-cyan-800">{kpis.excessOverstockCount}</div>
            <span className="text-[10px] text-slate-400 font-medium">Defer purchase</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search product SKU or name..."
            aria-label="Search procurement recommendations"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 w-48 sm:w-64"
          />

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            aria-label="Filter recommendation type"
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-700"
          >
            <option value="ALL">All Recommendation Types</option>
            <option value="URGENT_REPLENISHMENT">Urgent Replenishment</option>
            <option value="REPLENISH_STOCK">Normal Replenishment</option>
            <option value="REVIEW_EXISTING_STOCK">Review Existing Stock</option>
            <option value="REVIEW_PENDING_PO">Review Pending PO</option>
            <option value="DEFER_PURCHASE">Defer Purchase</option>
            <option value="MONITOR">Monitor Only</option>
          </select>

          <select
            value={riskFilter}
            onChange={e => setRiskFilter(e.target.value)}
            aria-label="Filter risk level"
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-700"
          >
            <option value="ALL">All Risk Levels</option>
            <option value="URGENT">Urgent Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="LOW">Low Risk</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter workflow status"
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-700"
          >
            <option value="ALL">All Workflow Statuses</option>
            <option value="OPEN">Open</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-800">{filteredRecommendations.length}</span> of {recommendations.length} recommendations
        </div>
      </div>

      {/* Main Recommendations Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <caption className="sr-only">Procurement replenishment recommendations table</caption>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th scope="col" className="py-3 px-4">Item &amp; Catalog</th>
                <th scope="col" className="py-3 px-4 text-right">Network Stock</th>
                <th scope="col" className="py-3 px-4 text-right">Reorder Point</th>
                <th scope="col" className="py-3 px-4">Demand Trend (ADU)</th>
                <th scope="col" className="py-3 px-4 text-right">Suggested Qty</th>
                <th scope="col" className="py-3 px-4">Recommendation</th>
                <th scope="col" className="py-3 px-4">Workflow Status</th>
                <th scope="col" className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecommendations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400" role="status" aria-label="Recommendation query results">
                    <p className="font-semibold text-sm">
                      {dataMode === 'SUPABASE' ? 'No procurement recommendations require review.' : 'No procurement recommendations found.'}
                    </p>
                    <p className="text-xs mt-1">
                      {dataMode === 'SUPABASE'
                        ? 'Live inventory balances do not currently trigger replenishment thresholds.'
                        : 'Adjust filters or search parameters to inspect items.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecommendations.map(rec => {
                  const isStockout = rec.currentNetworkStock === 0;
                  const isBelowRop = rec.currentNetworkStock <= rec.reorderPoint;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Product details */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">{rec.productName}</div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-mono font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200/50">
                            {rec.productSku}
                          </span>
                          <span>•</span>
                          <span>{rec.brand}</span>
                          <span>•</span>
                          <span className="text-slate-400">{rec.category}</span>
                        </div>
                      </td>

                      {/* Network stock */}
                      <td className="py-3.5 px-4 text-right">
                        <div className={`font-black text-sm ${isStockout ? 'text-rose-600' : isBelowRop ? 'text-amber-600' : 'text-slate-800'}`}>
                          {rec.currentNetworkStock} units
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {rec.daysOfStock !== null ? `${rec.daysOfStock.toFixed(1)} days stock` : 'No usage rate'}
                        </div>
                      </td>

                      {/* Reorder Point */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-semibold text-slate-800">{rec.reorderPoint.toFixed(1)} units</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Safety: {rec.safetyStockUnits.toFixed(1)}u ({rec.safetyStockDays}d)
                        </div>
                      </td>

                      {/* Demand Trend */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-bold">
                          {rec.demandTrend === 'INCREASING' && (
                            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm border border-emerald-200">
                              <TrendingUp className="w-3.5 h-3.5" /> Increasing
                            </span>
                          )}
                          {rec.demandTrend === 'STABLE' && (
                            <span className="flex items-center gap-1 text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-sm border border-slate-200">
                              <Minus className="w-3.5 h-3.5" /> Stable
                            </span>
                          )}
                          {rec.demandTrend === 'DECLINING' && (
                            <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-sm border border-amber-200">
                              <TrendingDown className="w-3.5 h-3.5" /> Declining
                            </span>
                          )}
                          {rec.demandTrend === 'INSUFFICIENT_HISTORY' && (
                            <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-sm border border-slate-200">
                              <HelpCircle className="w-3.5 h-3.5" /> &lt;3 Days Data
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          ADU: <span className="font-semibold text-slate-600">{rec.averageDailyUsage.toFixed(2)}/day</span>
                        </div>
                      </td>

                      {/* Suggested Quantity */}
                      <td className="py-3.5 px-4 text-right">
                        <div className={`font-black text-sm ${rec.suggestedReplenishmentQuantity > 0 ? 'text-teal-700' : 'text-slate-500'}`}>
                          {rec.suggestedReplenishmentQuantity} units
                        </div>
                        {rec.estimatedProcurementValue && rec.suggestedReplenishmentQuantity > 0 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Est: ${rec.estimatedProcurementValue.toFixed(2)}
                          </div>
                        )}
                        {rec.pendingPoQuantity > 0 && (
                          <div className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1 py-0.2 rounded border border-cyan-200/60 inline-block mt-0.5">
                            {rec.pendingPoQuantity}u pending PO
                          </div>
                        )}
                      </td>

                      {/* Recommendation Type */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md border ${
                          rec.riskLevel === 'URGENT' 
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : rec.riskLevel === 'HIGH'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : rec.riskLevel === 'MEDIUM'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {rec.type.replace(/_/g, ' ')}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1 font-medium max-w-xs line-clamp-1" title={rec.reason}>
                          {rec.reason}
                        </div>
                      </td>

                      {/* Workflow Status */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rec.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : rec.status === 'REVIEWED'
                            ? 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                            : rec.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {rec.status}
                        </span>
                        {rec.reviewedByName && (
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            by {rec.reviewedByName}
                          </div>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {/* Mathematical Proof Drawer trigger */}
                        <button
                          onClick={() => setSelectedRec(rec)}
                          className="px-2 py-1 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold transition-colors"
                          title="View mathematical proof & calculation breakdown"
                        >
                          <Eye className="w-3.5 h-3.5 inline mr-1" />
                          Proof
                        </button>

                        {/* Review / Approve / Reject modal trigger */}
                        {canApprove && (
                          <button
                            onClick={() => {
                              setReviewModalRec(rec);
                              setReviewAction('APPROVED');
                              setReviewNotes('');
                            }}
                            className="px-2 py-1 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-bold transition-colors"
                          >
                            Review
                          </button>
                        )}

                        {/* Explicit PR Creation: Enabled strictly as a separate action */}
                        {canRequest && (
                          <button
                            onClick={() => handleCreatePurchaseRequestFromRec(rec)}
                            className="px-2 py-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-bold transition-colors"
                            title="Draft internal Purchase Request based on this item"
                          >
                            Create PR
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MATHEMATICAL PROOF & TRANSPARENT CALCULATION DRAWER / MODAL              */}
      {/* ========================================================================= */}
      {selectedRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                  Mathematical Proof &amp; Replenishment Formula
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  {selectedRec.productName}
                </h3>
                <p className="text-xs text-slate-500">
                  SKU: <span className="font-mono font-semibold text-slate-700">{selectedRec.productSku}</span> | Category: {selectedRec.category}
                </p>
              </div>
              <button
                onClick={() => setSelectedRec(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs text-slate-700">
              {/* Step-by-Step Breakdown */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-600" />
                  Formula Breakdown &amp; Calculation Steps
                </h4>
                <div className="space-y-2.5">
                  {selectedRec.calculationDetails.stepByStep.map((step, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 text-[11px]">{step.step}: {step.label}</span>
                        <span className="font-mono font-black text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/50">
                          {step.value}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        Formula: {step.formula}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Near-Expiry Stock Intelligence Callout */}
              {selectedRec.nearExpiryQuantity > 0 && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <ShieldAlert className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>Near-Expiry Usable Stock Detected: {selectedRec.nearExpiryQuantity} units</span>
                  </div>
                  <p className="text-[11px] text-purple-800 leading-relaxed">
                    This product has existing stock nearing expiration. To prevent waste and over-procurement, 
                    the engine advises consuming or redistributing existing batches before procuring new inventory.
                  </p>
                </div>
              )}

              {/* Pending PO Callout */}
              {selectedRec.pendingPoQuantity > 0 && (
                <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-900">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <Clock className="w-4 h-4 text-cyan-700 shrink-0" />
                    <span>Pending Purchase Order Coverage: {selectedRec.pendingPoQuantity} units</span>
                  </div>
                  <p className="text-[11px] text-cyan-800 leading-relaxed">
                    Existing active purchase order(s) already cover upcoming hospital demand. Net replenishment 
                    quantity has been adjusted to prevent redundant purchase commitments.
                  </p>
                </div>
              )}

              {/* Location Breakdown */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  Current Hospital Distribution
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {selectedRec.locationBreakdown.map((loc, i) => (
                    <div key={i} className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                      <span className="font-medium text-slate-700">{loc.locationName}</span>
                      <span className="font-black text-slate-900">{loc.quantity} u</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit & Status Details */}
              <div className="p-3 rounded-xl bg-slate-100/70 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div>Workflow Status: <span className="font-bold text-slate-800">{selectedRec.status}</span></div>
                {selectedRec.reviewedByName && (
                  <div>Reviewed By: <span className="font-semibold text-slate-800">{selectedRec.reviewedByName}</span> ({selectedRec.reviewedAt})</div>
                )}
                {selectedRec.reviewNotes && (
                  <div>Notes: <span className="italic text-slate-700">"{selectedRec.reviewNotes}"</span></div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedRec(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 transition-all"
              >
                Close Proof
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HUMAN DECISION / REVIEW MODAL                                            */}
      {/* ========================================================================= */}
      {reviewModalRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">
                Review Procurement Recommendation
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {reviewModalRec.productName} ({reviewModalRec.productSku})
              </p>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <div>Recommendation: <span className="font-bold">{reviewModalRec.type.replace(/_/g, ' ')}</span></div>
                <div>Suggested Replenishment: <span className="font-black text-teal-800">{reviewModalRec.suggestedReplenishmentQuantity} units</span></div>
                <div className="text-slate-500 text-[11px] mt-1">{reviewModalRec.reason}</div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Decision Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction('APPROVED')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all ${
                      reviewAction === 'APPROVED'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Check className="w-4 h-4 text-emerald-600" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('REJECTED')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all ${
                      reviewAction === 'REJECTED'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <X className="w-4 h-4 text-rose-600" />
                    Reject
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Review Notes &amp; Justification</label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Enter clinical rationale or reason for approval/rejection..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="p-3 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-900 text-[11px]">
                <span className="font-bold">Strict Architecture Boundary: </span>
                Approving this recommendation records human clinical endorsement only. It will NOT automatically create a purchase order or draft a purchase request.
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setReviewModalRec(null)}
                className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReview}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-teal-700 text-white hover:bg-teal-800 shadow-2xs"
              >
                Confirm Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PENDING PURCHASE ORDERS MODAL                                             */}
      {/* ========================================================================= */}
      {showPendingPOsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Pending Active Purchase Orders
                </h3>
                <p className="text-xs text-slate-500">
                  On-order inventory currently in transit or awaiting receipt
                </p>
              </div>
              <button
                onClick={() => setShowPendingPOsModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2 px-3">PO Number</th>
                    <th className="py-2 px-3">Vendor</th>
                    <th className="py-2 px-3">Items &amp; Qty</th>
                    <th className="py-2 px-3">Expected Delivery</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingPOs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        No active purchase orders found.
                      </td>
                    </tr>
                  ) : (
                    pendingPOs.map(po => (
                      <tr key={po.id}>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{po.poNumber}</td>
                        <td className="py-2.5 px-3 text-slate-700">{po.supplierName}</td>
                        <td className="py-2.5 px-3">
                          {po.items.map(it => (
                            <div key={it.id} className="font-semibold text-slate-800">
                              {it.productName || it.productSku}: {it.orderedQuantity}u
                            </div>
                          ))}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-600">{po.expectedDeliveryDate}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                            {po.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowPendingPOsModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
