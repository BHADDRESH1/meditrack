import React from 'react';

export const PageLoadingFallback: React.FC = () => (
  <div 
    role="status"
    aria-live="polite"
    className="flex flex-col items-center justify-center min-h-[360px] p-8 space-y-3 bg-white/60 rounded-2xl border border-slate-200/70 shadow-xs animate-in fade-in duration-150"
  >
    <div className="relative w-10 h-10">
      <div className="absolute inset-0 rounded-full border-3 border-cyan-100" />
      <div className="absolute inset-0 rounded-full border-3 border-cyan-700 border-t-transparent animate-spin" />
    </div>
    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
      Loading Hospital System Module…
    </span>
    <span className="text-[11px] text-slate-400 font-medium">
      Authoritative Medical Ledger &bull; Deterministic Security
    </span>
  </div>
);
