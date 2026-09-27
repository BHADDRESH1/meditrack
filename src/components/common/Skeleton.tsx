import React from 'react';

export const Skeleton: React.FC<{
  className?: string;
}> = ({ className = 'h-4 w-full' }) => {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-slate-200/80 rounded ${className}`}
    />
  );
};

export const SkeletonCard: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`bg-white rounded-xl border border-slate-200/80 p-5 shadow-2xs space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
};

export const SkeletonTable: React.FC<{
  rows?: number;
  columns?: number;
}> = ({ rows = 5, columns = 5 }) => {
  return (
    <div aria-hidden="true" className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 py-2 border-b border-slate-100 last:border-0">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-1/3' : 'w-1/6'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
