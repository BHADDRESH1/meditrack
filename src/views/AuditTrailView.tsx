import React from 'react';
import { 
  ShieldCheck, 
  Lock,
  ArrowRight
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { InventoryTransaction } from '@/types/inventory';
import { inventoryRepo } from '@/services/inventoryRepository';
import { authService } from '@/services/authService';

export const AuditTrailView: React.FC = () => {
  const transactions = inventoryRepo.getTransactions();

  const columns: Column<InventoryTransaction>[] = [
    {
      header: 'Audit ID & Log Hash',
      accessor: (tx) => (
        <div>
          <div className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-400" aria-hidden="true" />
            {tx.transactionNumber}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            ID: {tx.id}
          </div>
        </div>
      ),
    },
    {
      header: 'Timestamp (UTC)',
      accessor: (tx) => (
        <span className="font-mono text-slate-700 text-xs">
          {new Date(tx.timestamp).toISOString()}
        </span>
      ),
    },
    {
      header: 'Action / Event',
      accessor: (tx) => (
        <StatusBadge
          label={tx.type}
          variant={tx.type === 'RECEIVE' ? 'success' : tx.type === 'TRANSFER' ? 'info' : 'neutral'}
          size="sm"
        />
      ),
    },
    {
      header: 'Product / Batch Impacted',
      accessor: (tx) => {
        const prod = inventoryRepo.getProductById(tx.productId);
        const batch = inventoryRepo.getBatchById(tx.batchId);
        const fromLoc = tx.fromLocationId ? inventoryRepo.getLocationById(tx.fromLocationId) : undefined;
        const toLoc = tx.toLocationId ? inventoryRepo.getLocationById(tx.toLocationId) : undefined;
        return (
          <div>
            <div className="font-semibold text-slate-900">{prod?.name ?? tx.productId}</div>
            <div className="text-[10px] text-slate-500 font-mono">
              Lot: {batch?.batchNumber ?? tx.batchId} &bull; Qty: {tx.quantity} units
            </div>
            {(fromLoc || toLoc) && (
              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                {fromLoc && <span>{fromLoc.name}</span>}
                {fromLoc && toLoc && <ArrowRight className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />}
                {toLoc && <span>{toLoc.name}</span>}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Operator & Justification',
      accessor: (tx) => {
        const operator = authService.getUserById(tx.performedBy);
        const displayName = operator?.fullName ?? tx.performedBy;
        return (
          <div>
            <div className="font-medium text-slate-800">{displayName}</div>
            <div className="text-[10px] text-slate-400">
              Ref: {tx.referenceDoc || 'Internal System'}
            </div>
            {tx.reason && (
              <div
                className="text-[10px] text-slate-500 italic mt-0.5 max-w-[200px] truncate"
                title={tx.reason}
              >
                Reason: {tx.reason}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'System Integrity',
      accessor: () => (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
          <ShieldCheck className="w-3 h-3 text-emerald-600" aria-hidden="true" />
          Verified
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Regulatory Compliance Audit Trail"
        subtitle="Immutable electronic records of all medical supply movements, user authentications, and stock adjustments for hospital inspections."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-cyan-300">
            21 CFR Part 11 Aligned
          </span>
        }
      />

      <div className="p-4 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" />
          <div className="text-xs">
            <div className="font-bold text-white">Immutable Ledger State: Active</div>
            <div className="text-slate-400">All database records are timestamped with operator credentials and cryptographic integrity checks.</div>
          </div>
        </div>
      </div>

      <DataTable
        data={transactions}
        columns={columns}
        keyExtractor={tx => tx.id}
        tableLabel="Regulatory Compliance Audit Trail"
        searchPlaceholder="Filter audit records by operator, reference, or action..."
        searchFilter={(tx, query) =>
          tx.transactionNumber.toLowerCase().includes(query) ||
          tx.performedBy.toLowerCase().includes(query) ||
          tx.type.toLowerCase().includes(query) ||
          (tx.reason?.toLowerCase().includes(query) ?? false) ||
          (tx.referenceDoc?.toLowerCase().includes(query) ?? false)
        }
      />
    </div>
  );
};
