import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Permission } from '@/services/permissions';
import { UnauthorizedView } from '@/views/UnauthorizedView';

interface ProtectedRouteProps {
  requiredPermission?: Permission;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredPermission,
  children,
}) => {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-600 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-500">
            Resolving clinical security credentials...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <UnauthorizedView requiredPermission={requiredPermission} />;
  }

  return children ? <>{children}</> : <Outlet />;
};
