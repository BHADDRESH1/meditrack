import React, { useState } from 'react';
import { 
  ArrowLeftRight, 
  ShieldCheck, 
  X, 
  ArrowRight, 
  Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { inventoryRepo } from '@/services/inventoryRepository';
import { TransferRecommendation } from '@/types/inventory';

export const TransferRecommendationsView: React.FC = () => {
  const navigate = useNavigate();
  const [recommendations] = useState<TransferRecommendation[]>(() => 
    inventoryRepo.getTransferRecommendations()
  );

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [selectedReviewRec, setSelectedReviewRec] = useState<TransferRecommendation | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const activeRecommendations = recommendations.filter(r => !dismissedIds.includes(r.id));

  const handleDismiss = (id: string, reason: string) => {
    setDismissedIds(prev => [...prev, id]);
    setFeedbackNotice(`Proposal dismissed: "${reason}". Recommendation removed from active queue.`);
    setTimeout(() => setFeedbackNotice(null), 5000);
  };

  const handleAccept = (_rec: TransferRecommendation) => {
    // Navigate to transfer screen with recommendation context
    navigate('/transfers');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inter-Departmental Transfer Recommendations"
        subtitle="Automated inventory balancing recommendations to redistribute at-risk stock to high-velocity clinical points of care."
        badge={
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
            <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
            {activeRecommendations.length} Balancing Proposals
          </span>
        }
      />

      {/* HUMAN-IN-THE-LOOP PROMINENT ADVISORY BANNER */}
      <div 
        role="region"
        aria-label="Human-in-the-loop decision support advisory"
        className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950 text-white shadow-sm space-y-3"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                  Strictly Non-Autonomous
                </span>
                <span className="text-xs text-slate-300 font-medium hidden sm:inline-block">
                  Human-in-the-Loop Enforced
                </span>
              </div>
              <h3 className="text-sm font-bold text-white mt-1">
                Clinical Decision-Support Engine
              </h3>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
          The redistribution algorithm analyzes batch shelf-lives, consumption velocity (ADU), and ward stockouts to suggest optimal balancing transfers. <strong>Zero automated movements occur.</strong> All transfers require explicit review, physical inspection, and staff sign-off.
        </p>
      </div>

      {feedbackNotice && (
        <div 
          role="status"
          aria-live="polite"
          className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-cyan-900 text-xs font-semibold flex items-center justify-between animate-in fade-in"
        >
          <span>{feedbackNotice}</span>
          <button 
            type="button" 
            onClick={() => setFeedbackNotice(null)} 
            className="text-cyan-700 hover:text-cyan-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* RECOMMENDATIONS LIST */}
      <div className="space-y-4">
        {activeRecommendations.length === 0 ? (
          <EmptyState
            title="No Transfer Recommendations"
            description="Current inventory distribution across hospital locations is well-balanced. No urgent redistribution is required."
          />
        ) : (
          activeRecommendations.map(rec => {
            const prod = inventoryRepo.getProductById(rec.productId);
            const batch = inventoryRepo.getBatchById(rec.batchId);
            const fromLoc = inventoryRepo.getLocationById(rec.fromLocationId);
            const toLoc = inventoryRepo.getLocationById(rec.toLocationId);

            return (
              <div
                key={rec.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                <div className="space-y-2.5 max-w-2xl flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge
                      label={rec.urgency}
                      variant={rec.urgency === 'CRITICAL' ? 'danger' : rec.urgency === 'HIGH' ? 'warning' : 'info'}
                      size="sm"
                      dot
                    />
                    <span className="font-mono text-xs font-bold text-slate-800">
                      Lot: {batch?.batchNumber || rec.batchId}
                    </span>
                    <span className="text-xs text-slate-300">&bull;</span>
                    <span className="text-xs text-slate-500 font-medium">Exp: {batch?.expiryDate || '--'}</span>
                    <span className="text-xs text-slate-300">&bull;</span>
                    <span className="text-xs text-slate-700 font-semibold">{prod?.brand}</span>
                  </div>

                  <h4 className="text-base font-bold text-slate-900">
                    {prod?.name || rec.productId}
                  </h4>

                  {/* Route Visual Flow */}
                  <div className="flex items-center gap-3 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 w-fit">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Source:</span>
                      <span className="font-semibold text-slate-800">{fromLoc?.name || rec.fromLocationId}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-cyan-700">Destination:</span>
                      <span className="font-bold text-cyan-900">{toLoc?.name || rec.toLocationId}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                    <strong className="text-slate-700">Clinical Rationale:</strong> {rec.reason}
                  </p>
                </div>

                {/* Right Side: Units & Actions */}
                <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 gap-3 shrink-0">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Recommended Movement
                    </span>
                    <span className="text-2xl font-black text-cyan-900 font-mono">
                      {rec.recommendedQuantity} <span className="text-xs font-normal text-slate-500">units</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedReviewRec(rec)}
                    >
                      Review
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(rec.id, 'Manually dismissed by staff')}
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAccept(rec)}
                      icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
                    >
                      Accept &amp; Pre-fill
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* REVIEW DETAILS MODAL */}
      {selectedReviewRec && (() => {
        const prod = inventoryRepo.getProductById(selectedReviewRec.productId);
        const batch = inventoryRepo.getBatchById(selectedReviewRec.batchId);
        const fromLoc = inventoryRepo.getLocationById(selectedReviewRec.fromLocationId);
        const toLoc = inventoryRepo.getLocationById(selectedReviewRec.toLocationId);

        return (
          <Modal
            isOpen={Boolean(selectedReviewRec)}
            onClose={() => setSelectedReviewRec(null)}
            title="Review Transfer Recommendation"
            subtitle="Evaluate the algorithmic proposal against current floor conditions."
            maxWidth="md"
          >
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product:</span>
                  <span className="font-bold text-slate-900">{prod?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Lot Number:</span>
                  <span className="font-mono font-bold text-slate-900">{batch?.batchNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expiry Date:</span>
                  <span className="font-semibold text-slate-800">{batch?.expiryDate}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-500">Source:</span>
                  <span className="font-semibold text-slate-900">{fromLoc?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Destination:</span>
                  <span className="font-bold text-cyan-800">{toLoc?.name}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-700 font-bold">Suggested Qty:</span>
                  <span className="text-base font-extrabold text-cyan-700">{selectedReviewRec.recommendedQuantity} Units</span>
                </div>
              </div>

              <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-200 text-cyan-950">
                <span className="font-bold block mb-0.5">Algorithm Rationale:</span>
                <p className="text-xs text-cyan-900">{selectedReviewRec.reason}</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleDismiss(selectedReviewRec.id, 'Rejected after review');
                    setSelectedReviewRec(null);
                  }}
                >
                  Reject &amp; Dismiss
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    handleAccept(selectedReviewRec);
                    setSelectedReviewRec(null);
                  }}
                  icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
                >
                  Accept Proposal
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

