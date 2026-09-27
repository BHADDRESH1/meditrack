import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FileText, 
  Plus, 
  ArrowLeft, 
  RefreshCw, 
  Check, 
  X, 
  Eye, 
  Info,
  Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { sanitizeSupabaseError } from '@/services/supabaseClient';
import { purchaseRequestService } from '@/services/purchaseRequestService';
import { procurementEngine } from '@/services/procurementEngine';
import { inventoryRepo } from '@/services/inventoryRepository';
import { 
  PurchaseRequest, 
  PurchaseRequestStatus,
  Supplier 
} from '@/types/procurement';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';
import { pdfReportService } from '@/services/pdfReportService';

export function PurchaseRequestsView() {
  const { currentUser, hasPermission, dataMode } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [reviewModalRequest, setReviewModalRequest] = useState<PurchaseRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [viewDetailsRequest, setViewDetailsRequest] = useState<PurchaseRequest | null>(null);

  // New Request Form State
  const [newLocationId, setNewLocationId] = useState<string>('loc-cs-01');
  const [newJustification, setNewJustification] = useState<string>('');
  const [newSupplierId, setNewSupplierId] = useState<string>('');
  const [newItemProductId, setNewItemProductId] = useState<string>('prod-scico-01');
  const [newItemQuantity, setNewItemQuantity] = useState<number>(20);
  const [newItemUnitCost, setNewItemUnitCost] = useState<number>(38.50);
  const [formError, setFormError] = useState<string | null>(null);

  const canApprove = hasPermission('procurement:approve');
  const canRequest = hasPermission('procurement:request');

  const loadData = useCallback(async (_trigger?: unknown) => {
    try {
      const prRes = await purchaseRequestService.getPurchaseRequests();
      if (!prRes.success) {
        setError(prRes.error || 'Failed to load purchase requests.');
      } else {
        setRequests(prRes.requests);
      }

      const suppRes = await procurementEngine.getSuppliers();
      if (suppRes.success) {
        setSuppliers(suppRes.suppliers);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching purchase requests.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  // Handle Review Modal submission
  const handleConfirmReview = async () => {
    if (!reviewModalRequest || !currentUser) return;
    const res = await purchaseRequestService.reviewPurchaseRequest(
      reviewModalRequest.id,
      reviewStatus,
      currentUser,
      reviewNotes
    );

    if (res.success) {
      setReviewModalRequest(null);
      setReviewNotes('');
      loadData();
    } else {
      alert(`Error reviewing request: ${res.error}`);
    }
  };

  // Handle Status Update (e.g. submit draft)
  const handleUpdateStatus = async (requestId: string, nextStatus: PurchaseRequestStatus) => {
    if (!currentUser) return;
    const res = await purchaseRequestService.updatePurchaseRequestStatus(requestId, nextStatus, currentUser);
    if (res.success) {
      loadData();
    } else {
      alert(`Error updating status: ${res.error}`);
    }
  };

  // Handle Create New Request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!newJustification.trim()) {
      setFormError('Clinical justification is required.');
      return;
    }
    if (newItemQuantity <= 0) {
      setFormError('Quantity must be greater than 0.');
      return;
    }

    const loc = HOSPITAL_LOCATIONS.find((l: any) => l.id === newLocationId);
    const supp = suppliers.find(s => s.id === newSupplierId);
    const prod = inventoryRepo.getProducts().find(p => p.id === newItemProductId);

    const res = await purchaseRequestService.createPurchaseRequest({
      requestedLocationId: newLocationId,
      requestedLocationName: loc?.name || 'Central Medical Supply Depot',
      justification: newJustification,
      recommendedSupplierId: supp?.id,
      recommendedSupplierName: supp?.name,
      estimatedCost: newItemQuantity * newItemUnitCost,
      items: [
        {
          productId: newItemProductId,
          productName: prod?.name || 'Product',
          productSku: prod?.sku || 'SKU',
          requestedQuantity: newItemQuantity,
          estimatedUnitCost: newItemUnitCost,
        }
      ],
      user: currentUser
    });

    if (res.success) {
      setIsNewModalOpen(false);
      setNewJustification('');
      setFormError(null);
      loadData();
    } else {
      setFormError(res.error || 'Failed to create request.');
    }
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = requests.length;
    const underReview = requests.filter(r => r.status === 'UNDER_REVIEW' || r.status === 'SUBMITTED').length;
    const approved = requests.filter(r => r.status === 'APPROVED').length;
    const totalValue = requests.reduce((sum, r) => sum + (r.estimatedCost || 0), 0);
    return { total, underReview, approved, totalValue };
  }, [requests]);

  const productsList = inventoryRepo.getProducts();

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => navigate('/procurement')}
              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors mr-1"
              title="Return to Procurement Planning"
              aria-label="Return to Procurement Planning"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <FileText className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Hospital Purchase Requests
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
              Requisition Planning
            </span>
          </div>
          <p className="text-sm text-slate-500 max-w-3xl">
            Internal procurement requisitions and department demand approvals. 
            Does not place vendor purchase orders or mutate inventory balances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canRequest && (
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-teal-700 text-white hover:bg-teal-800 transition-all shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Draft Purchase Request</span>
            </button>
          )}
          <button
            onClick={() => {
              pdfReportService.generatePurchaseRequestsReport(
                requests.map(r => ({
                  requestNumber: r.requestNumber,
                  productName: r.items?.[0]?.productName || 'Multiple Items',
                  productSku: r.items?.[0]?.productSku || '',
                  variantName: r.items?.[0]?.variantName || '',
                  requestedQty: r.items?.[0]?.requestedQuantity || 0,
                  locationName: r.requestedLocationName || r.requestedLocationId || '',
                  justification: r.justification,
                  estimatedCost: r.estimatedCost || 0,
                  requestedBy: r.requestedByName || r.requestedBy || '',
                  status: r.status,
                  reviewedBy: r.reviewedByName || r.reviewedBy || '',
                  createdAt: r.createdAt,
                })),
                {
                  userName: currentUser?.fullName || 'Authorized Staff',
                  userRole: currentUser?.role || '',
                  dataMode: 'DEMO',
                  appliedFilters: {},
                }
              );
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-2xs"
            title="Export purchase requests as PDF"
            aria-label="Export purchase requests as PDF"
          >
            <Download className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
          <button
            onClick={loadData}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
            title="Refresh Requests"
            aria-label="Refresh purchase requests"
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
              <strong>Synthetic Training Environment:</strong> Displaying simulated purchase requisitions and canonical budget approvals. Zero live hospital orders are placed.
            </span>
          </div>
          <span className="text-[11px] text-amber-800 shrink-0 font-mono hidden sm:inline-block">
            Canonical Requisitions: Active
          </span>
        </div>
      )}

      {/* MODE / SUPABASE STATUS BANNER */}
      {dataMode === 'SUPABASE' && (
        <div className="p-3.5 rounded-xl bg-cyan-50/90 border border-cyan-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-900">
            <FileText className="w-4 h-4 text-cyan-700 shrink-0" />
            <span>
              <strong>Authoritative Supabase Mode:</strong> Reading directly from PostgreSQL tables (<code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">purchase_requests</code>, <code className="font-mono text-[11px] bg-cyan-100/80 px-1 py-0.5 rounded">purchase_request_items</code>).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded border border-cyan-300">
              {isLoading ? 'Synchronizing...' : `${requests.length} Requisitions Loaded`}
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
            <Info className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">Unable to load live purchase requests.</div>
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

      {/* Error Notification for non-database issues */}
      {error && dataMode !== 'SUPABASE' && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between text-xs font-semibold">
          <span>{error}</span>
          <button 
            type="button" 
            onClick={() => setError(null)} 
            className="text-rose-700 hover:text-rose-900"
            aria-label="Dismiss error notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Total Requests
          </span>
          <div className="text-2xl font-black text-slate-900">{metrics.total}</div>
          <span className="text-[10px] text-slate-400 font-medium">Requisitions logged</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-amber-200/80 shadow-2xs bg-amber-50/20">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block mb-1">
            Under Review
          </span>
          <div className="text-2xl font-black text-amber-600">{metrics.underReview}</div>
          <span className="text-[10px] text-amber-600/80 font-medium">Awaiting endorsement</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-emerald-200/80 shadow-2xs bg-emerald-50/20">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
            Approved Requisitions
          </span>
          <div className="text-2xl font-black text-emerald-600">{metrics.approved}</div>
          <span className="text-[10px] text-emerald-600/80 font-medium">Ready for procurement review</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-teal-200/80 shadow-2xs bg-teal-50/20">
          <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider block mb-1">
            Estimated Total
          </span>
          <div className="text-2xl font-black text-teal-700">${metrics.totalValue.toFixed(2)}</div>
          <span className="text-[10px] text-teal-600/80 font-medium">Cumulative planning value</span>
        </div>
      </div>

      {/* Purchase Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <caption className="sr-only">Hospital Purchase Requests</caption>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th scope="col" className="py-3 px-4">Request #</th>
                <th scope="col" className="py-3 px-4">Status</th>
                <th scope="col" className="py-3 px-4">Destination Location</th>
                <th scope="col" className="py-3 px-4">Items &amp; Quantities</th>
                <th scope="col" className="py-3 px-4 text-right">Est. Value</th>
                <th scope="col" className="py-3 px-4">Requested By</th>
                <th scope="col" className="py-3 px-4">Review Details</th>
                <th scope="col" className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={8} role="status" className="py-12 text-center text-slate-400">
                    <p className="font-semibold text-sm">
                      {dataMode === 'SUPABASE' ? 'No purchase requests found' : 'No purchase requests logged yet.'}
                    </p>
                    <p className="text-xs mt-1">
                      {dataMode === 'SUPABASE'
                        ? 'No purchase requests found in the live Supabase database. Honest empty state maintained.'
                        : 'Draft a new request or generate one from Approved Recommendations.'}
                    </p>
                  </td>
                </tr>
              ) : (
                requests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Request Number */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {req.requestNumber}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                        req.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : req.status === 'UNDER_REVIEW' || req.status === 'SUBMITTED'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : req.status === 'REJECTED'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-500'
                            : req.status === 'UNDER_REVIEW' || req.status === 'SUBMITTED'
                            ? 'bg-amber-500'
                            : req.status === 'REJECTED'
                            ? 'bg-rose-500'
                            : 'bg-slate-400'
                        }`} />
                        {req.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Location */}
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {req.requestedLocationName || 'Central Store'}
                    </td>

                    {/* Items */}
                    <td className="py-3.5 px-4">
                      {req.items.map((it, idx) => (
                        <div key={idx} className="font-semibold text-slate-800">
                          {it.productName || it.productSku}: <span className="font-mono text-teal-700">{it.requestedQuantity}u</span>
                        </div>
                      ))}
                    </td>

                    {/* Est. Value */}
                    <td className="py-3.5 px-4 text-right font-black text-slate-900">
                      ${req.estimatedCost.toFixed(2)}
                    </td>

                    {/* Requested By */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{req.requestedByName}</div>
                      <div className="text-[10px] text-slate-400">{new Date(req.createdAt).toLocaleDateString()}</div>
                    </td>

                    {/* Review Details */}
                    <td className="py-3.5 px-4">
                      {req.reviewedByName ? (
                        <div>
                          <div className="font-semibold text-slate-800">{req.reviewedByName}</div>
                          <div className="text-[10px] text-slate-500 italic max-w-xs truncate">"{req.reviewNotes}"</div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Pending review</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => setViewDetailsRequest(req)}
                        className="px-2 py-1 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold"
                        title="View Full Request Details"
                      >
                        <Eye className="w-3.5 h-3.5 inline mr-1" />
                        Details
                      </button>

                      {req.status === 'DRAFT' && canRequest && (
                        <button
                          onClick={() => handleUpdateStatus(req.id, 'SUBMITTED')}
                          className="px-2 py-1 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg text-xs font-bold"
                        >
                          Submit
                        </button>
                      )}

                      {(req.status === 'SUBMITTED' || req.status === 'UNDER_REVIEW') && canApprove && (
                        <button
                          onClick={() => {
                            setReviewModalRequest(req);
                            setReviewStatus('APPROVED');
                            setReviewNotes('');
                          }}
                          className="px-2 py-1 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-bold"
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CREATE NEW PURCHASE REQUEST MODAL                                         */}
      {/* ========================================================================= */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-pr-modal-title"
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 id="draft-pr-modal-title" className="text-base font-black text-slate-900">
                  Draft Internal Purchase Request
                </h3>
                <p className="text-xs text-slate-500">
                  Hospital departmental planning requisition
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close draft request dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="p-5 space-y-4 text-xs">
              {formError && (
                <div id="pr-form-error" role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="pr-new-location" className="block font-bold text-slate-700 mb-1">Destination Location</label>
                <select
                  id="pr-new-location"
                  value={newLocationId}
                  onChange={e => setNewLocationId(e.target.value)}
                  className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-slate-50"
                >
                  {HOSPITAL_LOCATIONS.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.code} - {l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pr-new-product" className="block font-bold text-slate-700 mb-1">Product</label>
                <select
                  id="pr-new-product"
                  value={newItemProductId}
                  onChange={e => {
                    setNewItemProductId(e.target.value);
                    const p = productsList.find(pr => pr.id === e.target.value);
                    if (p) setNewItemUnitCost(p.standardCost || 30);
                  }}
                  className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-slate-50"
                >
                  {productsList.map(p => (
                    <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pr-new-qty" className="block font-bold text-slate-700 mb-1">Requested Quantity</label>
                  <input
                    id="pr-new-qty"
                    type="number"
                    min={1}
                    value={newItemQuantity}
                    onChange={e => setNewItemQuantity(parseInt(e.target.value) || 1)}
                    className="w-full p-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label htmlFor="pr-new-unitcost" className="block font-bold text-slate-700 mb-1">Est. Unit Cost ($)</label>
                  <input
                    id="pr-new-unitcost"
                    type="number"
                    step="0.01"
                    min={0}
                    value={newItemUnitCost}
                    onChange={e => setNewItemUnitCost(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pr-new-vendor" className="block font-bold text-slate-700 mb-1">Recommended Synthetic Demo Vendor</label>
                <select
                  id="pr-new-vendor"
                  value={newSupplierId}
                  onChange={e => setNewSupplierId(e.target.value)}
                  className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-slate-50"
                >
                  <option value="">-- Optional / Generic --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pr-new-justification" className="block font-bold text-slate-700 mb-1">Clinical Justification</label>
                <textarea
                  id="pr-new-justification"
                  rows={3}
                  value={newJustification}
                  onChange={e => setNewJustification(e.target.value)}
                  placeholder="Explain why this replenishment is necessary..."
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'pr-form-error' : undefined}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-[11px] flex justify-between items-center">
                <span>Calculated Total Requisition Value:</span>
                <span className="font-mono font-black text-sm">${(newItemQuantity * newItemUnitCost).toFixed(2)}</span>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 -mx-5 -mb-5 mt-4">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-teal-700 text-white hover:bg-teal-800 shadow-2xs"
                >
                  Create Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REVIEW PURCHASE REQUEST MODAL                                             */}
      {/* ========================================================================= */}
      {reviewModalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-pr-modal-title"
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100">
              <h3 id="review-pr-modal-title" className="text-base font-black text-slate-900">
                Review Purchase Request: {reviewModalRequest.requestNumber}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Requested by: {reviewModalRequest.requestedByName}
              </p>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <div>Justification: <span className="italic">"{reviewModalRequest.justification}"</span></div>
                <div className="mt-1">Estimated Cost: <span className="font-bold text-teal-800">${reviewModalRequest.estimatedCost.toFixed(2)}</span></div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Decision Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewStatus('APPROVED')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all ${
                      reviewStatus === 'APPROVED'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Check className="w-4 h-4 text-emerald-600" />
                    Approve Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewStatus('REJECTED')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all ${
                      reviewStatus === 'REJECTED'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <X className="w-4 h-4 text-rose-600" />
                    Reject Request
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="pr-review-notes" className="block font-bold text-slate-700 mb-1">Review Notes</label>
                <textarea
                  id="pr-review-notes"
                  rows={3}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Provide clinical budget rationale..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewModalRequest(null)}
                className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
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
      {/* VIEW DETAILS MODAL                                                        */}
      {/* ========================================================================= */}
      {viewDetailsRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-details-pr-modal-title"
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 id="view-details-pr-modal-title" className="text-base font-black text-slate-900">
                  Request {viewDetailsRequest.requestNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Authoritative Hospital Requisition Pipeline
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewDetailsRequest(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close request details dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* STAGE TRACKER */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Procurement Lifecycle Pipeline
                </span>
                <div className="grid grid-cols-6 gap-1 text-center text-[10px]">
                  {[
                    { key: 'DRAFT', label: '1. Draft' },
                    { key: 'SUBMITTED', label: '2. Submitted' },
                    { key: 'UNDER_REVIEW', label: '3. In Review' },
                    { key: viewDetailsRequest.status === 'REJECTED' ? 'REJECTED' : 'APPROVED', label: viewDetailsRequest.status === 'REJECTED' ? '4. Rejected' : '4. Approved' },
                    { key: 'ORDERED', label: '5. Ordered' },
                    { key: 'COMPLETED', label: '6. Completed' },
                  ].map((stage, idx) => {
                    const activeIdx = (() => {
                      switch (viewDetailsRequest.status) {
                        case 'DRAFT': return 0;
                        case 'SUBMITTED': return 1;
                        case 'UNDER_REVIEW': return 2;
                        case 'APPROVED': return 3;
                        case 'REJECTED': return 3;
                        default: return 0;
                      }
                    })();

                    const isPast = idx < activeIdx;
                    const isCurrent = idx === activeIdx;
                    const isRejected = viewDetailsRequest.status === 'REJECTED' && isCurrent;

                    return (
                      <div
                        key={stage.key}
                        className={`p-1.5 rounded-lg font-semibold transition-all truncate ${
                          isRejected
                            ? 'bg-rose-100 text-rose-800 font-bold border border-rose-300'
                            : isCurrent
                            ? 'bg-teal-100 text-teal-900 font-bold border border-teal-300 ring-1 ring-teal-400'
                            : isPast
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        {stage.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div><span className="font-bold text-slate-700">Destination:</span> <span className="text-slate-900">{viewDetailsRequest.requestedLocationName}</span></div>
                <div><span className="font-bold text-slate-700">Clinical Justification:</span> <span className="text-slate-900">{viewDetailsRequest.justification}</span></div>
                {viewDetailsRequest.recommendedSupplierName && (
                  <div><span className="font-bold text-slate-700">Recommended Vendor:</span> <span className="text-slate-900">{viewDetailsRequest.recommendedSupplierName}</span></div>
                )}
                <div><span className="font-bold text-slate-700">Estimated Total Value:</span> <span className="font-bold text-teal-800">${viewDetailsRequest.estimatedCost.toFixed(2)}</span></div>
                <div><span className="font-bold text-slate-700">Requested By:</span> <span className="text-slate-900">{viewDetailsRequest.requestedByName}</span> on <span className="font-mono text-slate-600">{new Date(viewDetailsRequest.createdAt).toLocaleDateString()}</span></div>
                {viewDetailsRequest.reviewedByName && (
                  <div className="border-t border-slate-200 pt-1.5 mt-1.5">
                    <span className="font-bold text-slate-700">Reviewed By:</span> <span className="text-slate-900">{viewDetailsRequest.reviewedByName}</span> on <span className="font-mono text-slate-600">{viewDetailsRequest.reviewedAt ? new Date(viewDetailsRequest.reviewedAt).toLocaleDateString() : 'N/A'}</span>
                    <div className="italic text-slate-600 mt-0.5">&ldquo;{viewDetailsRequest.reviewNotes}&rdquo;</div>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-2">Requested Item Lines</h4>
                <div className="space-y-1.5">
                  {viewDetailsRequest.items.map((it, i) => (
                    <div key={i} className="p-2.5 rounded-xl border border-slate-200 bg-white flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-800">{it.productName || it.productSku}</div>
                        <div className="text-[10px] text-slate-400">Est. Unit: ${it.estimatedUnitCost.toFixed(2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-teal-800">{it.requestedQuantity} units</div>
                        <div className="font-bold text-slate-700">${(it.requestedQuantity * it.estimatedUnitCost).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setViewDetailsRequest(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 cursor-pointer"
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
