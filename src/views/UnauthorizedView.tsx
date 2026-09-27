import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface UnauthorizedViewProps {
  requiredPermission?: string;
  moduleName?: string;
}

export const UnauthorizedView: React.FC<UnauthorizedViewProps> = ({
  requiredPermission,
  moduleName = 'this clinical module',
}) => {
  const { currentUser } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/90 shadow-md p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
            Access Restricted
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-2">
            Unauthorized Departmental Action
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Your current clinical duty role is not authorized to access {moduleName}.
          </p>
        </div>

        {currentUser && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-600">
              <span>Authenticated User:</span>
              <strong className="text-slate-900">{currentUser.fullName}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Assigned Role:</span>
              <span className="font-mono font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                {currentUser.role}
              </span>
            </div>
            {requiredPermission && (
              <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200">
                <span>Required Permission:</span>
                <span className="font-mono text-[11px] text-slate-700">
                  {requiredPermission}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Command Center
          </Link>
        </div>
      </div>
    </div>
  );
};
