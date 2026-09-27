// ==============================================================================
// MEDiTRACK: Internal Purchase Request Planning Workflow Service
// Internal Hospital Requisitions — Non-Committal / Human Approval Enforced
// ==============================================================================

import { getDataMode, supabaseRest, onDataModeChange } from './supabaseClient';
import { hasPermission } from './permissions';
import { 
  PurchaseRequest, 
  PurchaseRequestStatus 
} from '@/types/procurement';
import { UserProfile } from '@/types/inventory';

// SYNTHETIC DEMO INITIAL PURCHASE REQUESTS
const INITIAL_DEMO_REQUESTS: PurchaseRequest[] = [
  {
    id: 'pr-demo-01',
    requestNumber: 'PR-2026-0001',
    status: 'UNDER_REVIEW',
    requestedLocationId: 'loc-cs-01',
    requestedLocationName: 'Central Medical Supply Depot',
    justification: 'Quarterly safety stock replenishment for heavy-duty cotton elastic bandages.',
    recommendedSupplierId: 'supp-scico-demo',
    recommendedSupplierName: 'SCICO Medical Supplies Ltd (Synthetic Demo Partner)',
    estimatedCost: 770.00,
    requestedBy: 'user-mgr-01',
    requestedByName: 'Elena Rostova (Inventory Lead)',
    items: [
      {
        id: 'pri-01',
        purchaseRequestId: 'pr-demo-01',
        productId: 'prod-scico-01',
        productName: 'Scico-Plast Elastic Adhesive Bandage (Heavy Duty)',
        productSku: 'SC-EAB-75',
        requestedQuantity: 20,
        estimatedUnitCost: 38.50,
      },
    ],
    createdAt: '2026-09-08T10:30:00Z',
  },
];

export class PurchaseRequestService {
  private inMemoryRequests: PurchaseRequest[] = [];

  constructor() {
    if (getDataMode() === 'DEMO') {
      this.inMemoryRequests = JSON.parse(JSON.stringify(INITIAL_DEMO_REQUESTS));
    }
  }

  public clearForSupabase(): void {
    this.inMemoryRequests = [];
  }

  public resetToCanonicalSeed(): void {
    this.inMemoryRequests = JSON.parse(JSON.stringify(INITIAL_DEMO_REQUESTS));
  }

  /**
   * Retrieves all purchase requests.
   */
  public async getPurchaseRequests(): Promise<{
    success: boolean;
    requests: PurchaseRequest[];
    error: string | null;
  }> {
    if (getDataMode() === 'SUPABASE') {
      const res = await supabaseRest<any[]>('purchase_requests?select=*,items:purchase_request_items(*)&order=created_at.desc');
      if (res.error) {
        return { success: false, requests: [], error: res.error };
      }
      const mapped: PurchaseRequest[] = (res.data || []).map(r => ({
        id: r.id,
        requestNumber: r.request_number,
        status: r.status,
        requestedLocationId: r.requested_location_id,
        justification: r.justification,
        recommendedSupplierId: r.recommended_supplier_id,
        estimatedCost: parseFloat(r.estimated_cost) || 0,
        requestedBy: r.requested_by,
        requestedByName: r.requested_by_name || 'Staff Member',
        reviewedBy: r.reviewed_by,
        reviewedByName: r.reviewed_by_name,
        reviewedAt: r.reviewed_at,
        reviewNotes: r.review_notes,
        items: Array.isArray(r.items) ? r.items.map((it: any) => ({
          id: it.id,
          purchaseRequestId: it.purchase_request_id,
          productId: it.product_id,
          requestedQuantity: it.requested_quantity,
          estimatedUnitCost: parseFloat(it.estimated_unit_cost) || 0,
        })) : [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      return { success: true, requests: mapped, error: null };
    }

    return {
      success: true,
      requests: [...this.inMemoryRequests],
      error: null,
    };
  }

  /**
   * Explicit creation of an internal Purchase Request.
   * Only called upon deliberate user initiation.
   */
  public async createPurchaseRequest(params: {
    requestedLocationId?: string;
    requestedLocationName?: string;
    justification: string;
    recommendedSupplierId?: string;
    recommendedSupplierName?: string;
    estimatedCost?: number;
    items: {
      productId: string;
      productName?: string;
      productSku?: string;
      variantId?: string;
      variantName?: string;
      requestedQuantity: number;
      estimatedUnitCost: number;
    }[];
    user: UserProfile;
  }): Promise<{ success: boolean; request?: PurchaseRequest; error?: string }> {
    if (!hasPermission(params.user, 'procurement:request')) {
      return {
        success: false,
        error: `UNAUTHORIZED: Role "${params.user.role}" does not have permission "procurement:request".`,
      };
    }

    if (!params.items || params.items.length === 0) {
      return { success: false, error: 'Cannot create empty purchase request.' };
    }

    const calculatedCost = params.estimatedCost ?? params.items.reduce(
      (sum, it) => sum + (it.requestedQuantity * it.estimatedUnitCost),
      0
    );

    const newNumber = `PR-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    if (getDataMode() === 'SUPABASE') {
      const res = await supabaseRest<any>('purchase_requests', {
        method: 'POST',
        body: JSON.stringify({
          request_number: newNumber,
          status: 'DRAFT',
          requested_location_id: params.requestedLocationId || null,
          justification: params.justification,
          recommended_supplier_id: params.recommendedSupplierId || null,
          estimated_cost: calculatedCost,
          requested_by: params.user.id,
          requested_by_name: params.user.fullName,
        }),
      });

      if (res.error) {
        return { success: false, error: res.error };
      }
      return { success: true };
    }

    // In-memory DEMO mode
    const newReq: PurchaseRequest = {
      id: `pr-${Date.now()}`,
      requestNumber: newNumber,
      status: 'DRAFT',
      requestedLocationId: params.requestedLocationId,
      requestedLocationName: params.requestedLocationName,
      justification: params.justification,
      recommendedSupplierId: params.recommendedSupplierId,
      recommendedSupplierName: params.recommendedSupplierName,
      estimatedCost: calculatedCost,
      requestedBy: params.user.id,
      requestedByName: params.user.fullName,
      items: params.items.map(it => ({
        id: `pri-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productId: it.productId,
        productName: it.productName,
        productSku: it.productSku,
        variantId: it.variantId,
        variantName: it.variantName,
        requestedQuantity: it.requestedQuantity,
        estimatedUnitCost: it.estimatedUnitCost,
      })),
      createdAt: new Date().toISOString(),
    };

    this.inMemoryRequests.unshift(newReq);
    return { success: true, request: newReq };
  }

  /**
   * Reviews or updates a purchase request status (SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED).
   * Strict RBAC: Only ADMIN and INVENTORY_MANAGER can approve/reject.
   * Requesters can transition DRAFT -> SUBMITTED.
   */
  public async updateRequestStatus(
    requestId: string,
    newStatus: PurchaseRequestStatus,
    user: UserProfile,
    reviewNotes?: string
  ): Promise<{ success: boolean; request?: PurchaseRequest; error?: string }> {
    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      if (!hasPermission(user, 'procurement:approve')) {
        return {
          success: false,
          error: `UNAUTHORIZED: Role "${user.role}" does not have permission "procurement:approve". Only ADMIN or INVENTORY_MANAGER may approve purchase requests.`,
        };
      }
    } else {
      if (!hasPermission(user, 'procurement:request') && !hasPermission(user, 'procurement:approve')) {
        return {
          success: false,
          error: `UNAUTHORIZED: Role "${user.role}" does not have permission "procurement:request".`,
        };
      }
    }

    if (getDataMode() === 'SUPABASE') {
      const res = await supabaseRest<any>(`purchase_requests?id=eq.${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          reviewed_by: (newStatus === 'APPROVED' || newStatus === 'REJECTED') ? user.id : undefined,
          reviewed_at: (newStatus === 'APPROVED' || newStatus === 'REJECTED') ? new Date().toISOString() : undefined,
          review_notes: reviewNotes || null,
          updated_at: new Date().toISOString(),
        }),
      });

      if (res.error) {
        return { success: false, error: res.error };
      }
      return { success: true };
    }

    const req = this.inMemoryRequests.find(r => r.id === requestId);
    if (!req) {
      return { success: false, error: 'Purchase request not found.' };
    }

    req.status = newStatus;
    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      req.reviewedBy = user.id;
      req.reviewedByName = user.fullName;
      req.reviewedAt = new Date().toISOString();
      req.reviewNotes = reviewNotes || req.reviewNotes;
    }

    return { success: true, request: req };
  }

  public updatePurchaseRequestStatus = this.updateRequestStatus;

  /**
   * Reviews and finalizes a purchase request.
   */
  public async reviewPurchaseRequest(
    requestId: string,
    newStatus: 'APPROVED' | 'REJECTED',
    user: UserProfile,
    reviewNotes?: string
  ): Promise<{ success: boolean; request?: PurchaseRequest; error?: string }> {
    return this.updateRequestStatus(requestId, newStatus, user, reviewNotes);
  }
}

export const purchaseRequestService = new PurchaseRequestService();

onDataModeChange((mode) => {
  if (mode === 'SUPABASE') {
    purchaseRequestService.clearForSupabase();
  } else {
    purchaseRequestService.resetToCanonicalSeed();
  }
});

