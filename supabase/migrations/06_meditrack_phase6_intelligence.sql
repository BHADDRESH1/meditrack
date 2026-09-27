-- ==============================================================================
-- MEDiTRACK: Smart Medical Inventory, Expiry & Waste-Prevention System
-- Phase 6: Expiry & Waste Prevention Intelligence & Action Recommendations
-- ==============================================================================

-- 1. RECOMMENDATION ACTIONS TABLE
-- Actionable clinical supply chain recommendations derived dynamically from
-- authoritative batch balances and consumption velocity. Recommendations are
-- strictly advisory and require human review and approval.
CREATE TABLE IF NOT EXISTS public.recommendation_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recommendation_type VARCHAR(50) NOT NULL CHECK (recommendation_type IN (
        'FEFO_ISSUE',
        'INTER_DEPARTMENT_TRANSFER',
        'SUPPLIER_RETURN_REVIEW',
        'PURCHASE_ORDER_REVIEW',
        'STOCKOUT_ESCALATION',
        'QUARANTINE_DISPOSAL',
        'MONITOR'
    )),
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN (
        'CRITICAL',
        'HIGH',
        'MEDIUM',
        'LOW',
        'EXPIRED'
    )),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    from_location_id UUID REFERENCES public.hospital_locations(id) ON DELETE SET NULL,
    to_location_id UUID REFERENCES public.hospital_locations(id) ON DELETE SET NULL,
    quantity INT NOT NULL CHECK (quantity >= 0),
    potential_loss_exposure NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (potential_loss_exposure >= 0),
    reason TEXT NOT NULL,
    calculation_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN',
        'REVIEWED',
        'APPROVED',
        'REJECTED',
        'COMPLETED'
    )),
    reviewed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for high-performance dashboard queue filtering
CREATE INDEX IF NOT EXISTS idx_recommendation_status 
    ON public.recommendation_actions (status, risk_level);

CREATE INDEX IF NOT EXISTS idx_recommendation_product_batch 
    ON public.recommendation_actions (product_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_created 
    ON public.recommendation_actions (created_at DESC);

-- 2. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.recommendation_actions ENABLE ROW LEVEL SECURITY;

-- 2.1 All authenticated clinical and inventory staff can view recommendations
DROP POLICY IF EXISTS rls_recommendations_select ON public.recommendation_actions;
CREATE POLICY rls_recommendations_select ON public.recommendation_actions 
    FOR SELECT TO authenticated USING (TRUE);

-- 2.2 System / authenticated staff can insert generated recommendations
DROP POLICY IF EXISTS rls_recommendations_insert ON public.recommendation_actions;
CREATE POLICY rls_recommendations_insert ON public.recommendation_actions 
    FOR INSERT TO authenticated WITH CHECK (TRUE);

-- 2.3 Only ADMIN and INVENTORY_MANAGER can update status (Review, Approve, Reject, Complete)
DROP POLICY IF EXISTS rls_recommendations_update ON public.recommendation_actions;
CREATE POLICY rls_recommendations_update ON public.recommendation_actions 
    FOR UPDATE TO authenticated 
    USING (
        auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    )
    WITH CHECK (
        auth_user_role() IN ('ADMIN', 'INVENTORY_MANAGER')
    );

-- 3. FUNCTION TO AUDIT AND RECORD ACTION STATUS TRANSITION
CREATE OR REPLACE FUNCTION process_recommendation_action(
    p_recommendation_id UUID,
    p_new_status VARCHAR(20),
    p_reviewed_by UUID,
    p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_rec RECORD;
BEGIN
    -- Verify status parameter validity
    IF p_new_status NOT IN ('OPEN', 'REVIEWED', 'APPROVED', 'REJECTED', 'COMPLETED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Recommendation status must be OPEN, REVIEWED, APPROVED, REJECTED, or COMPLETED.';
    END IF;

    -- Verify recommendation existence
    SELECT * INTO v_rec FROM public.recommendation_actions WHERE id = p_recommendation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Recommendation action % not found.', p_recommendation_id;
    END IF;

    -- Update record
    UPDATE public.recommendation_actions
    SET status = p_new_status,
        reviewed_by = p_reviewed_by,
        reviewed_at = now(),
        review_notes = COALESCE(p_review_notes, review_notes),
        updated_at = now()
    WHERE id = p_recommendation_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'recommendation_id', p_recommendation_id,
        'previous_status', v_rec.status,
        'new_status', p_new_status,
        'reviewed_at', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
